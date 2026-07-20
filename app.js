const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const defaults = {
  model: 'herschelBulkley',
  radius: 0.05,
  pressureGradient: 12000,
  viscosityLog: -1,
  consistencyLog: -0.3,
  flowIndex: 0.65,
  yieldStress: 45
};

const modelInfo = {
  newtonian: {
    name: 'Newtoniano', tag: 'N',
    description: 'Viscosidade constante e relação linear entre tensão e taxa de cisalhamento.'
  },
  powerLaw: {
    name: 'Lei de Potência', tag: 'PL',
    description: 'A viscosidade aparente varia com a taxa de cisalhamento segundo os parâmetros H e n.'
  },
  bingham: {
    name: 'Bingham', tag: 'B',
    description: 'Apresenta tensão limite e comportamento linear depois do início do escoamento.'
  },
  herschelBulkley: {
    name: 'Herschel–Bulkley', tag: 'HB',
    description: 'Combina tensão limite com uma resposta não linear do tipo lei de potência.'
  }
};

const els = {
  model: $('#modelSelect'), radius: $('#radius'), pressureGradientInput: $('#pressureGradientInput'),
  viscosity: $('#viscosity'), consistency: $('#consistency'), flowIndex: $('#flowIndex'), yieldStress: $('#yieldStress'),
  viscosityOutput: $('#viscosityOutput'), consistencyOutput: $('#consistencyOutput'), flowIndexOutput: $('#flowIndexOutput'), yieldStressOutput: $('#yieldStressOutput'), yieldStressMax: $('#yieldStressMax'),
  modelDescription: $('#modelDescription'), resultTitle: $('#resultTitle'), flowState: $('#flowState'),
  maxVelocity: $('#maxVelocity'), meanVelocity: $('#meanVelocity'), flowRate: $('#flowRate'), wallStress: $('#wallStress'),
  pressureGradient: $('#pressureGradient'), plasticityIndex: $('#plasticityIndex'), plugRadius: $('#plugRadius'), plugArea: $('#plugArea'), wallShearRate: $('#wallShearRate'),
  equation: $('#equation'), wallStressEquation: $('#wallStressEquation'), flowRateEquation: $('#flowRateEquation'), equationVars: $('#equationVars'), equationTag: $('#equationTag'), legendMax: $('#legendMax'),
  profileCanvas: $('#profileCanvas'), flowCanvas: $('#flowCanvas'), chartReadout: $('#chartReadout'),
  showVelocity: $('#showVelocity'), showStress: $('#showStress'), showPlug: $('#showPlug'), showParticles: $('#showParticles'),
  pauseButton: $('#pauseButton'), animationLabel: $('#animationLabel'), themeButton: $('#themeButton'), resetButton: $('#resetButton'), exportButton: $('#exportButton')
};

let result = null;
let animationFrame = 0;
let animationTime = 0;
let animationPaused = false;
let particles = [];
let hoveredIndex = -1;

function readPositive(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function syncYieldStressRange(R, G) {
  const tauW = G * R / 2;
  const maximum = Math.max(1, 1.5 * tauW);
  els.yieldStress.max = String(maximum);
  els.yieldStress.step = String(maximum / 200);
  if (Number(els.yieldStress.value) > maximum) els.yieldStress.value = String(maximum);
  els.yieldStressMax.textContent = `${formatValue(maximum, 2)} Pa (1,5 τw)`;
}

function getParameters() {
  const R = readPositive(els.radius, defaults.radius);
  const G = Math.max(0, Number(els.pressureGradientInput.value) || 0);
  syncYieldStressRange(R, G);
  return {
    model: els.model.value,
    R,
    G,
    mu: 10 ** Number(els.viscosity.value),
    H: 10 ** Number(els.consistency.value),
    n: Math.max(0.05, Number(els.flowIndex.value)),
    tau0: Math.max(0, Number(els.yieldStress.value) || 0)
  };
}

function calculate(params) {
  const { model, R, G } = params;
  const tauW = G * R / 2;
  const hasYield = model === 'bingham' || model === 'herschelBulkley';
  const tau0 = hasYield ? params.tau0 : 0;
  const flowing = !hasYield || tauW > tau0;
  const Pl = flowing && tauW > 0 ? Math.min(1, tau0 / tauW) : hasYield ? 1 : 0;
  const Rp = Pl * R;
  const samples = [];
  const count = 201;
  let maxVelocity = 0;

  for (let i = 0; i < count; i += 1) {
    const x = i / (count - 1);
    const r = x * R;
    let velocity = 0;
    let shearRate = 0;
    const stress = tauW * x;

    if (flowing && G > 0) {
      if (model === 'newtonian') {
        velocity = G * (R * R - r * r) / (4 * params.mu);
        shearRate = G * r / (2 * params.mu);
      } else if (model === 'powerLaw') {
        const exponent = (params.n + 1) / params.n;
        velocity = params.n * R / (params.n + 1) * (tauW / params.H) ** (1 / params.n) * (1 - x ** exponent);
        shearRate = (stress / params.H) ** (1 / params.n);
      } else if (model === 'bingham') {
        if (x <= Pl) {
          velocity = R * tauW / (2 * params.mu) * (1 - Pl) ** 2;
        } else {
          velocity = R * tauW / (2 * params.mu) * ((1 - Pl) ** 2 - (x - Pl) ** 2);
          shearRate = (stress - tau0) / params.mu;
        }
      } else {
        const exponent = (params.n + 1) / params.n;
        const factor = params.n * R / (params.n + 1) * (tauW / params.H) ** (1 / params.n);
        if (x <= Pl) {
          velocity = factor * (1 - Pl) ** exponent;
        } else {
          velocity = factor * ((1 - Pl) ** exponent - (x - Pl) ** exponent);
          shearRate = ((stress - tau0) / params.H) ** (1 / params.n);
        }
      }
    }
    velocity = Number.isFinite(velocity) ? Math.max(0, velocity) : 0;
    shearRate = Number.isFinite(shearRate) ? Math.max(0, shearRate) : 0;
    maxVelocity = Math.max(maxVelocity, velocity);
    samples.push({ x, r, velocity, stress, shearRate });
  }

  let areaIntegral = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const p0 = samples[i - 1];
    const p1 = samples[i];
    areaIntegral += 0.5 * (p0.velocity * p0.r + p1.velocity * p1.r) * (p1.r - p0.r);
  }
  const flowRate = 2 * Math.PI * areaIntegral;
  const meanVelocity = flowRate / (Math.PI * R * R);
  const wallShearRate = samples.at(-1).shearRate;

  return { params, G, tauW, tau0, flowing, Pl, Rp, samples, maxVelocity, meanVelocity, flowRate, wallShearRate };
}

function formatValue(value, digits = 3) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 10000 || abs < 0.001)) return value.toExponential(2).replace('.', ',');
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

function updateRange(input) {
  const progress = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
  input.style.setProperty('--range-progress', `${progress}%`);
}

function updateControls(params) {
  const info = modelInfo[params.model];
  els.modelDescription.textContent = info.description;
  els.resultTitle.textContent = `${info.name} em duto circular`;
  els.equationTag.textContent = info.tag;
  $$('[data-models]').forEach((field) => {
    field.hidden = !field.dataset.models.split(',').includes(params.model);
  });
  $('#viscositySymbol').textContent = params.model === 'bingham' ? 'μₚ' : 'μ';
  els.viscosityOutput.textContent = `${formatValue(params.mu, 4)} Pa·s`;
  els.consistencyOutput.textContent = `${formatValue(params.H, 4)} Pa·sⁿ`;
  els.flowIndexOutput.textContent = formatValue(params.n, 2);
  els.yieldStressOutput.textContent = `${formatValue(params.tau0, 1)} Pa`;
  [els.viscosity, els.consistency, els.flowIndex, els.yieldStress].forEach(updateRange);
}

function updateMetrics(data) {
  els.maxVelocity.textContent = formatValue(data.maxVelocity);
  els.meanVelocity.textContent = formatValue(data.meanVelocity);
  els.flowRate.textContent = formatValue(data.flowRate);
  els.wallStress.textContent = formatValue(data.tauW, 2);
  els.pressureGradient.textContent = `${formatValue(data.G, 2)} Pa/m`;
  els.plasticityIndex.textContent = data.tau0 > 0 ? formatValue(data.Pl, 4) : '0';
  els.plugRadius.textContent = data.tau0 > 0 ? `${formatValue(data.Rp * 1000, 2)} mm` : 'Não se aplica';
  els.plugArea.textContent = data.tau0 > 0 ? `${formatValue(data.Pl * data.Pl * 100, 1)} %` : '0 %';
  els.wallShearRate.textContent = `${formatValue(data.wallShearRate, 3)} s⁻¹`;
  els.legendMax.textContent = `${formatValue(data.maxVelocity)} m/s`;
  els.flowState.classList.toggle('stopped', !data.flowing || data.maxVelocity === 0);
  els.flowState.innerHTML = `<span></span>${data.flowing && data.maxVelocity > 0 ? 'Escoando' : 'Sem escoamento'}`;
}

function typesetEquations() {
  if (!window.MathJax || !window.MathJax.typesetPromise) return;
  const nodes = [els.equation, els.wallStressEquation, els.flowRateEquation, els.equationVars];
  if (window.MathJax.typesetClear) window.MathJax.typesetClear(nodes);
  window.MathJax.typesetPromise(nodes).catch(() => {});
}

function updateEquation(data) {
  const { model, R, mu, H, n, G } = data.params;
  const commonWallStress = String.raw`\[G\equiv-\frac{dp}{dz}>0,\qquad \tau_w=\tau(R)=-\frac{R}{2}\frac{dp}{dz}=\frac{G R}{2}=\frac{${formatValue(G, 2)}\,${formatValue(R, 4)}}{2}=${formatValue(data.tauW, 3)}\ \mathrm{Pa}\]`;
  els.wallStressEquation.textContent = commonWallStress;

  if (model === 'newtonian') {
    els.equation.textContent = String.raw`\[\tau_{rz}=\mu\frac{dU_z}{dr},\qquad U_z(r)=\frac{G}{4\mu}\left(R^2-r^2\right),\quad 0\le r\le R\]`;
    els.flowRateEquation.textContent = String.raw`\[Q=2\pi\int_0^R U_z(r)\,r\,dr=\frac{\pi G R^4}{8\mu}\]`;
    els.equationVars.textContent = String.raw`\(\mu=${formatValue(mu, 4)}\ \mathrm{Pa\,s},\quad G=${formatValue(G, 2)}\ \mathrm{Pa\,m^{-1}},\quad R=${formatValue(R, 4)}\ \mathrm{m},\quad Q=${formatValue(data.flowRate, 4)}\ \mathrm{m^3\,s^{-1}}\)`;
  } else if (model === 'powerLaw') {
    els.equation.textContent = String.raw`\[\tau_{rz}=-H\left(-\frac{dU_z}{dr}\right)^n,\qquad U_z(r)=\frac{nR}{n+1}\left(\frac{\tau_w}{H}\right)^{1/n}\left[1-\left(\frac rR\right)^{(n+1)/n}\right]\]`;
    els.flowRateEquation.textContent = String.raw`\[Q=2\pi\int_0^R U_z(r)\,r\,dr=\frac{\pi nR^3}{3n+1}\left(\frac{\tau_w}{H}\right)^{1/n}\]`;
    els.equationVars.textContent = String.raw`\(H=${formatValue(H, 4)}\ \mathrm{Pa\,s^n},\quad n=${formatValue(n, 2)},\quad G=${formatValue(G, 2)}\ \mathrm{Pa\,m^{-1}},\quad R=${formatValue(R, 4)}\ \mathrm{m},\quad Q=${formatValue(data.flowRate, 4)}\ \mathrm{m^3\,s^{-1}}\)`;
  } else if (model === 'bingham') {
    els.equation.textContent = String.raw`\[U_z(r)=\begin{cases}\displaystyle \frac{R\tau_w}{2\mu_p}(1-\mathrm{Pl})^2,&0\le r\le R_p,\\[6pt]\displaystyle \frac{R\tau_w}{2\mu_p}\left[(1-\mathrm{Pl})^2-\left(\frac rR-\mathrm{Pl}\right)^2\right],&R_p<r\le R,\end{cases}\quad \underbrace{\mathrm{Pl}=\frac{R_p}{R}=\frac{\tau_0}{\tau_w}}_{\text{índice de plasticidade}}\]`;
    els.flowRateEquation.textContent = String.raw`\[Q=2\pi\left[\int_0^{R_p}U_p r\,dr+\int_{R_p}^{R}U_z(r)r\,dr\right]=\frac{\pi G R^4}{8\mu_p}\left(1-\frac{4\mathrm{Pl}}{3}+\frac{\mathrm{Pl}^4}{3}\right)\]`;
    els.equationVars.textContent = String.raw`\(\mu_p=${formatValue(mu, 4)}\ \mathrm{Pa\,s},\quad \tau_0=${formatValue(data.tau0, 3)}\ \mathrm{Pa},\quad \mathrm{Pl}=${formatValue(data.Pl, 4)},\quad R_p=${formatValue(data.Rp, 5)}\ \mathrm{m},\quad Q=${formatValue(data.flowRate, 4)}\ \mathrm{m^3\,s^{-1}}\)`;
  } else {
    els.equation.textContent = String.raw`\[U_z(r)=\begin{cases}\displaystyle \frac{nR}{n+1}\left(\frac{\tau_w}{H}\right)^{1/n}(1-\mathrm{Pl})^{(n+1)/n},&0\le r\le R_p,\\[6pt]\displaystyle \frac{nR}{n+1}\left(\frac{\tau_w}{H}\right)^{1/n}\left[(1-\mathrm{Pl})^{(n+1)/n}-\left(\frac rR-\mathrm{Pl}\right)^{(n+1)/n}\right],&R_p<r\le R,\end{cases}\quad \underbrace{\mathrm{Pl}=\frac{R_p}{R}=\frac{\tau_0}{\tau_w}}_{\text{índice de plasticidade}}\]`;
    els.flowRateEquation.textContent = String.raw`\[Q=\pi R^3\left(\frac{\tau_w}{H}\right)^{1/n}\left[\frac{(1-\mathrm{Pl})^{1/n+3}}{1/n+3}+\frac{2\mathrm{Pl}(1-\mathrm{Pl})^{1/n+2}}{1/n+2}+\frac{\mathrm{Pl}^2(1-\mathrm{Pl})^{1/n+1}}{1/n+1}\right]\]`;
    els.equationVars.textContent = String.raw`\(H=${formatValue(H, 4)}\ \mathrm{Pa\,s^n},\quad n=${formatValue(n, 2)},\quad \tau_0=${formatValue(data.tau0, 3)}\ \mathrm{Pa},\quad \mathrm{Pl}=${formatValue(data.Pl, 4)},\quad R_p=${formatValue(data.Rp, 5)}\ \mathrm{m},\quad Q=${formatValue(data.flowRate, 4)}\ \mathrm{m^3\,s^{-1}}\)`;
  }
  typesetEquations();
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawProfileChart() {
  if (!result) return;
  const { ctx, width, height } = setupCanvas(els.profileCanvas);
  const margin = { top: 18, right: 48, bottom: 42, left: 52 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;
  ctx.clearRect(0, 0, width, height);

  if (els.showPlug.checked && result.tau0 > 0) {
    ctx.fillStyle = 'rgba(168, 137, 255, .08)';
    ctx.fillRect(margin.left + w * (1 - result.Pl) / 2, margin.top, w * result.Pl, h);
    ctx.fillStyle = css('--violet');
    ctx.font = '8px Manrope';
    ctx.textAlign = 'center';
    ctx.fillText('PLUGUE', margin.left + w / 2, margin.top + 12);
  }

  ctx.strokeStyle = css('--border-soft');
  ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted-2');
  ctx.font = '8px DM Mono';
  for (let i = 0; i <= 4; i += 1) {
    const y = margin.top + h * i / 4;
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + w, y); ctx.stroke();
    const v = result.maxVelocity * (1 - i / 4);
    ctx.textAlign = 'right'; ctx.fillText(formatValue(v, 2), margin.left - 7, y + 3);
  }
  for (let i = 0; i <= 4; i += 1) {
    const x = margin.left + w * i / 4;
    ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + h); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText(formatValue(-1 + i / 2, 1), x, margin.top + h + 17);
  }
  ctx.fillStyle = css('--muted');
  ctx.textAlign = 'center';
  ctx.fillText('r / R', margin.left + w / 2, height - 8);
  ctx.save(); ctx.translate(11, margin.top + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('U (m/s)', 0, 0); ctx.restore();
  ctx.save(); ctx.translate(width - 8, margin.top + h / 2); ctx.rotate(Math.PI / 2); ctx.fillStyle = css('--amber'); ctx.fillText('τ (Pa)', 0, 0); ctx.restore();

  const points = [];
  for (let i = result.samples.length - 1; i >= 0; i -= 2) points.push({ ...result.samples[i], signedX: -result.samples[i].x });
  for (let i = 1; i < result.samples.length; i += 2) points.push({ ...result.samples[i], signedX: result.samples[i].x });
  const maxU = Math.max(result.maxVelocity, 1e-12);
  const maxTau = Math.max(result.tauW, 1e-12);

  if (els.showVelocity.checked) {
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = margin.left + (p.signedX + 1) / 2 * w;
      const y = margin.top + h * (1 - p.velocity / maxU);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = css('--cyan'); ctx.lineWidth = 2.2; ctx.stroke();
  }
  if (els.showStress.checked) {
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = margin.left + (p.signedX + 1) / 2 * w;
      const y = margin.top + h * (1 - p.stress / maxTau);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.setLineDash([5, 4]); ctx.strokeStyle = css('--amber'); ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
  }

  if (hoveredIndex >= 0) {
    const signed = hoveredIndex / 100 - 1;
    const x = margin.left + (signed + 1) / 2 * w;
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + h); ctx.stroke();
  }
}

function velocityAt(normalizedRadius) {
  if (!result) return 0;
  const index = Math.min(result.samples.length - 1, Math.round(Math.abs(normalizedRadius) * (result.samples.length - 1)));
  return result.samples[index].velocity;
}

function resetParticles(count = 90) {
  particles = Array.from({ length: count }, (_, i) => ({
    x: Math.random(),
    y: Math.random() * 2 - 1,
    size: 0.7 + Math.random() * 1.5,
    alpha: 0.25 + Math.random() * 0.65,
    phase: i * 0.13
  }));
}

function drawFlow(delta = 0) {
  if (!result) return;
  const { ctx, width, height } = setupCanvas(els.flowCanvas);
  ctx.clearRect(0, 0, width, height);
  const left = 28, right = width - 20;
  const centerY = height / 2;
  const pipeRadius = Math.min(92, height * .34);
  const top = centerY - pipeRadius, bottom = centerY + pipeRadius;

  const image = ctx.createLinearGradient(left, top, left, bottom);
  image.addColorStop(0, '#0b2430'); image.addColorStop(.5, '#176f72'); image.addColorStop(1, '#0b2430');
  ctx.fillStyle = image;
  ctx.fillRect(left, top, right - left, pipeRadius * 2);

  const bands = 70;
  for (let i = 0; i < bands; i += 1) {
    const yNorm = i / (bands - 1) * 2 - 1;
    const velocityRatio = result.maxVelocity > 0 ? velocityAt(yNorm) / result.maxVelocity : 0;
    const hue = 184 - velocityRatio * 12;
    const light = 14 + velocityRatio * 31;
    ctx.fillStyle = `hsla(${hue}, 72%, ${light}%, .74)`;
    const y = top + i / bands * pipeRadius * 2;
    ctx.fillRect(left, y, right - left, pipeRadius * 2 / bands + 1);
  }

  if (els.showPlug.checked && result.tau0 > 0 && result.Pl > 0) {
    ctx.fillStyle = 'rgba(168, 137, 255, .12)';
    ctx.fillRect(left, centerY - pipeRadius * result.Pl, right - left, pipeRadius * result.Pl * 2);
    ctx.strokeStyle = 'rgba(168, 137, 255, .48)'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(left, centerY - pipeRadius * result.Pl); ctx.lineTo(right, centerY - pipeRadius * result.Pl); ctx.moveTo(left, centerY + pipeRadius * result.Pl); ctx.lineTo(right, centerY + pipeRadius * result.Pl); ctx.stroke(); ctx.setLineDash([]);
  }

  ctx.strokeStyle = css('--border'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(left - 8, top); ctx.lineTo(right + 8, top); ctx.moveTo(left - 8, bottom); ctx.lineTo(right + 8, bottom); ctx.stroke();
  ctx.strokeStyle = 'rgba(38,224,197,.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(left, centerY); ctx.lineTo(right, centerY); ctx.stroke();

  if (els.showParticles.checked) {
    const speedScale = result.maxVelocity > 0 ? Math.min(2.2, .25 + Math.log10(1 + result.maxVelocity) * .35) : 0;
    particles.forEach((particle) => {
      const local = result.maxVelocity > 0 ? velocityAt(particle.y) / result.maxVelocity : 0;
      if (!animationPaused) particle.x = (particle.x + delta * .00008 * speedScale * (.08 + local)) % 1;
      const x = left + particle.x * (right - left);
      const y = centerY + particle.y * pipeRadius;
      ctx.fillStyle = `rgba(218, 255, 250, ${particle.alpha * (.25 + local * .75)})`;
      ctx.beginPath(); ctx.arc(x, y, particle.size, 0, Math.PI * 2); ctx.fill();
      if (local > .15) {
        ctx.strokeStyle = `rgba(38, 224, 197, ${particle.alpha * .32})`;
        ctx.beginPath(); ctx.moveTo(x - 5 * local, y); ctx.lineTo(x, y); ctx.stroke();
      }
    });
  }

  ctx.fillStyle = css('--muted'); ctx.font = '8px Manrope'; ctx.textAlign = 'left'; ctx.fillText('ENTRADA', left, top - 12); ctx.textAlign = 'right'; ctx.fillText('SAÍDA', right, top - 12);
  ctx.strokeStyle = css('--cyan'); ctx.beginPath(); ctx.moveTo(right - 28, top - 14); ctx.lineTo(right - 4, top - 14); ctx.lineTo(right - 10, top - 18); ctx.moveTo(right - 4, top - 14); ctx.lineTo(right - 10, top - 10); ctx.stroke();
}

function animate(timestamp) {
  const delta = Math.min(40, timestamp - animationTime || 16);
  animationTime = timestamp;
  drawFlow(delta);
  animationFrame = requestAnimationFrame(animate);
}

function refresh() {
  const params = getParameters();
  updateControls(params);
  result = calculate(params);
  updateMetrics(result);
  updateEquation(result);
  drawProfileChart();
  drawFlow();
}

function exportCsv() {
  if (!result) return;
  const rows = ['r_m,r_over_R,velocity_m_per_s,shear_stress_Pa,shear_rate_per_s'];
  result.samples.forEach((p) => rows.push([p.r, p.x, p.velocity, p.stress, p.shearRate].join(',')));
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `rheoflow-${result.params.model}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function reset() {
  els.model.value = defaults.model;
  els.radius.value = defaults.radius;
  els.pressureGradientInput.value = defaults.pressureGradient;
  els.viscosity.value = defaults.viscosityLog;
  els.consistency.value = defaults.consistencyLog;
  els.flowIndex.value = defaults.flowIndex;
  els.yieldStress.value = defaults.yieldStress;
  [els.showVelocity, els.showStress, els.showPlug, els.showParticles].forEach((input) => { input.checked = true; });
  refresh();
}

function handleProfilePointer(event) {
  const rect = els.profileCanvas.getBoundingClientRect();
  const marginLeft = 52, marginRight = 48;
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left - marginLeft) / (rect.width - marginLeft - marginRight)));
  const signed = x * 2 - 1;
  const index = Math.min(result.samples.length - 1, Math.round(Math.abs(signed) * (result.samples.length - 1)));
  const point = result.samples[index];
  hoveredIndex = Math.round(x * 200);
  els.chartReadout.textContent = `r/R ${signed.toFixed(2)}  ·  U ${formatValue(point.velocity, 4)} m/s  ·  τ ${formatValue(point.stress, 3)} Pa  ·  γ̇ ${formatValue(point.shearRate, 3)} s⁻¹`;
  drawProfileChart();
}

$$('input, select').forEach((input) => input.addEventListener('input', refresh));
window.addEventListener('resize', () => { drawProfileChart(); drawFlow(); });
els.profileCanvas.addEventListener('pointermove', handleProfilePointer);
els.profileCanvas.addEventListener('pointerleave', () => { hoveredIndex = -1; els.chartReadout.textContent = 'Mova o cursor sobre o gráfico para inspecionar valores.'; drawProfileChart(); });
els.pauseButton.addEventListener('click', () => {
  animationPaused = !animationPaused;
  els.pauseButton.classList.toggle('paused', animationPaused);
  els.animationLabel.textContent = animationPaused ? 'Animação pausada' : 'Animação ativa';
});
els.themeButton.addEventListener('click', () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
  drawProfileChart(); drawFlow();
});
els.resetButton.addEventListener('click', reset);
els.exportButton.addEventListener('click', exportCsv);

resetParticles();
refresh();
window.addEventListener('load', () => updateEquation(result));
cancelAnimationFrame(animationFrame);
animationFrame = requestAnimationFrame(animate);
