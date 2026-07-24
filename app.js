const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const defaults = {
  model: 'herschelBulkley',
  radius: 0.05,
  pressureGradient: 12000,
  viscosity: 0.1,
  consistency: 0.5012,
  flowIndex: 0.65,
  yieldStress: 45,
  flowMode: 'pressureGradient',
  pressureSpecMode: 'gradient',
  pressureDifference: 6000,
  tubeLength: 0.5,
  flowRate: 0.001,
  density: 1000,
  soundSpeed: 1500
};

const units = {
  pressure: 'Pa',
  length: 'm',
  flowRate: 'm3/d',
  density: 'kg/m3'
};

const unitOptions = {
  pressure: [
    { value: 'Pa', label: 'Pa', toBase: 1 },
    { value: 'kPa', label: 'kPa', toBase: 1000 },
    { value: 'psi', label: 'psi', toBase: 6894.757293168 }
  ],
  length: [
    { value: 'm', label: 'm', toBase: 1 },
    { value: 'ft', label: 'ft', toBase: 0.3048 },
    { value: 'in', label: 'in', toBase: 0.0254 }
  ],
  flowRate: [
    { value: 'm3/d', label: 'm³/d', toBase: 1 / 86400 },
    { value: 'bbl/d', label: 'bbl/d', toBase: 0.158987294928 / 86400 },
    { value: 'MMSCFD', label: 'MMSCFD', toBase: 1e6 * 0.028316846592 / 86400 },
    { value: 'GPM', label: 'GPM', toBase: 0.003785411784 / 60 }
  ],
  density: [
    { value: 'kg/m3', label: 'kg/m³', toBase: 1, fromBase: (x) => x },
    { value: 'ppg', label: 'ppg', toBase: 119.826427, fromBase: (x) => x / 119.826427 },
    { value: 'api', label: '°API', toBase: (api) => 141.5 / (api + 131.5) * 1000, fromBase: (rho) => 141.5 / (rho / 1000) - 131.5 }
  ]
};

function getUnitDef(dimension, unitValue) {
  const option = unitOptions[dimension]?.find((u) => u.value === unitValue);
  return option || unitOptions[dimension]?.[0];
}

function toSI(value, dimension, unitValue) {
  if (dimension === 'pressureGradient') {
    const pDef = getUnitDef('pressure', unitValue || units.pressure);
    const lDef = getUnitDef('length', units.length);
    return value * (pDef.toBase / lDef.toBase);
  }
  if (dimension === 'velocity') {
    const lDef = getUnitDef('length', unitValue || units.length);
    return value * lDef.toBase;
  }
  const def = getUnitDef(dimension, unitValue || units[dimension]);
  if (typeof def.toBase === 'function') return def.toBase(value);
  return value * def.toBase;
}

function fromSI(value, dimension, unitValue) {
  if (dimension === 'pressureGradient') {
    const pDef = getUnitDef('pressure', unitValue || units.pressure);
    const lDef = getUnitDef('length', units.length);
    return value * (lDef.toBase / pDef.toBase);
  }
  if (dimension === 'velocity') {
    const lDef = getUnitDef('length', unitValue || units.length);
    return value / lDef.toBase;
  }
  const def = getUnitDef(dimension, unitValue || units[dimension]);
  if (typeof def.fromBase === 'function') return def.fromBase(value);
  return value / def.toBase;
}

function getUnitLabel(dimension, unitValue) {
  if (dimension === 'pressureGradient') {
    const pDef = getUnitDef('pressure', unitValue || units.pressure);
    const lDef = getUnitDef('length', units.length);
    return `${pDef.label}/${lDef.label}`;
  }
  if (dimension === 'velocity') {
    const lDef = getUnitDef('length', unitValue || units.length);
    return `${lDef.label}/s`;
  }
  return getUnitDef(dimension, unitValue || units[dimension]).label;
}

function readDisplay(input, dimension, fallbackSI) {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) return fallbackSI;
  return toSI(value, dimension);
}

function readNonNegativeDisplay(input, dimension, fallbackSI) {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) return fallbackSI;
  return toSI(value, dimension);
}

const modelInfo = {
  newtonian: {
    name: 'Newtoniano', tag: 'N',
    description: 'Viscosidade μ constante e relação linear entre tensão τ e taxa de cisalhamento γ̇.'
  },
  powerLaw: {
    name: 'Lei de Potência', tag: 'PL',
    description: 'A viscosidade aparente varia com a taxa de cisalhamento γ̇ segundo os parâmetros H e n.'
  },
  bingham: {
    name: 'Bingham', tag: 'B',
    description: 'Apresenta tensão limite τ₀ e comportamento linear depois do início do escoamento.'
  },
  herschelBulkley: {
    name: 'Herschel–Bulkley', tag: 'HB',
    description: 'Combina tensão limite τ₀ com resposta não linear do tipo lei de potência (H, n).'
  }
};

const els = {
  model: $('#modelSelect'),
  radius: $('#radius'),
  flowMode: $('#flowMode'),
  pressureSpecMode: $('#pressureSpecMode'),
  pressureSpecModeWrap: $('#pressureSpecModeWrap'),
  pressureGradientInput: $('#pressureGradientInput'),
  pressureGradientField: $('#pressureGradientField'),
  pressureDifference: $('#pressureDifference'),
  pressureDifferenceField: $('#pressureDifferenceField'),
  tubeLength: $('#tubeLength'),
  flowRateInput: $('#flowRateInput'),
  flowRateField: $('#flowRateField'),
  density: $('#density'),
  soundSpeed: $('#soundSpeed'),
  soundSpeedUnit: $('#soundSpeedUnit'),
  maxVelocityUnit: $('#maxVelocityUnit'),
  meanVelocityUnit: $('#meanVelocityUnit'),
  flowRateUnit: $('#flowRateUnit'),
  wallStressUnit: $('#wallStressUnit'),
  pressureGradientUnitDenominator: $('#pressureGradientUnitDenominator'),
  viscosity: $('#viscosity'),
  viscosityNumber: $('#viscosityNumber'),
  viscosityOutput: $('#viscosityOutput'),
  consistency: $('#consistency'),
  consistencyNumber: $('#consistencyNumber'),
  consistencyOutput: $('#consistencyOutput'),
  flowIndex: $('#flowIndex'),
  flowIndexNumber: $('#flowIndexNumber'),
  flowIndexOutput: $('#flowIndexOutput'),
  yieldStress: $('#yieldStress'),
  yieldStressNumber: $('#yieldStressNumber'),
  yieldStressOutput: $('#yieldStressOutput'),
  yieldStressMax: $('#yieldStressMax'),
  modelDescription: $('#modelDescription'),
  resultTitle: $('#resultTitle'),
  flowState: $('#flowState'),
  maxVelocity: $('#maxVelocity'),
  meanVelocity: $('#meanVelocity'),
  flowRate: $('#flowRate'),
  wallStress: $('#wallStress'),
  pressureGradient: $('#pressureGradient'),
  pressureDifferenceOutput: $('#pressureDifferenceOutput'),
  reynoldsNumber: $('#reynoldsNumber'),
  localGradient: $('#localGradient'),
  reynoldsHbeNumber: $('#reynoldsHbeNumber'),
  darcyFriction: $('#darcyFriction'),
  darcyWeisbachPressure: $('#darcyWeisbachPressure'),
  machNumber: $('#machNumber'),
  plasticityIndex: $('#plasticityIndex'),
  plugRadius: $('#plugRadius'),
  plugRadiusUnit: $('#plugRadiusUnit'),
  plugArea: $('#plugArea'),
  wallShearRate: $('#wallShearRate'),
  equation: $('#equation'),
  wallStressEquation: $('#wallStressEquation'),
  flowRateEquation: $('#flowRateEquation'),
  reynoldsEquation: $('#reynoldsEquation'),
  localGradientEquation: $('#localGradientEquation'),
  reynoldsHbeEquation: $('#reynoldsHbeEquation'),
  darcyFrictionEquation: $('#darcyFrictionEquation'),
  darcyWeisbachEquation: $('#darcyWeisbachEquation'),
  equationVars: $('#equationVars'),
  equationTag: $('#equationTag'),
  legendMax: $('#legendMax'),
  profileCanvas: $('#profileCanvas'),
  flowCanvas: $('#flowCanvas'),
  chartReadout: $('#chartReadout'),
  showVelocity: $('#showVelocity'),
  showStress: $('#showStress'),
  showPlug: $('#showPlug'),
  showParticles: $('#showParticles'),
  pauseButton: $('#pauseButton'),
  animationLabel: $('#animationLabel'),
  themeButton: $('#themeButton'),
  resetButton: $('#resetButton'),
  exportButton: $('#exportButton'),
  accessibilityButton: $('#accessibilityButton'),
  accessibilityPopover: $('#accessibilityPopover'),
  showControls: $('#showControlsPanel'),
  showDashboard: $('#showDashboardPanel'),
  workspace: $('.workspace')
};

let result = null;
let animationFrame = 0;
let animationTime = 0;
let animationPaused = false;
let particles = [];
let hoveredIndex = -1;
let fontScale = 1;
let lineWidthScale = 1;

function readPositive(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function syncYieldStressRange(R, G) {
  const tauW = (G * R) / 2;
  const maximum = Math.max(1, 1.5 * tauW);
  els.yieldStress.max = String(maximum);
  els.yieldStress.step = 'any';
  els.yieldStressNumber.max = String(maximum);
  els.yieldStressNumber.step = 'any';
  if (Number(els.yieldStress.value) > maximum) els.yieldStress.value = String(maximum);
  if (document.activeElement !== els.yieldStressNumber && Number(els.yieldStressNumber.value) > maximum) {
    els.yieldStressNumber.value = String(maximum);
  }
  els.yieldStressMax.textContent = `${formatValue(maximum, 2)} Pa (1,5 τw)`;
}

function readYieldStress() {
  const raw = Math.max(0, Number(els.yieldStressNumber.value) || 0);
  const maxAttr = els.yieldStressNumber.max;
  const max = maxAttr === '' ? Infinity : Number(maxAttr);
  return Number.isFinite(max) ? Math.min(raw, max) : raw;
}

function getParameters() {
  const densityRaw = Number(els.density.value);
  const densitySI = Number.isFinite(densityRaw) ? toSI(densityRaw, 'density') : NaN;
  return {
    model: els.model.value,
    R: readDisplay(els.radius, 'length', defaults.radius),
    pressureGradient: readNonNegativeDisplay(els.pressureGradientInput, 'pressureGradient', defaults.pressureGradient),
    pressureDifference: readNonNegativeDisplay(els.pressureDifference, 'pressure', defaults.pressureDifference),
    tubeLength: readDisplay(els.tubeLength, 'length', defaults.tubeLength),
    flowRate: readNonNegativeDisplay(els.flowRateInput, 'flowRate', defaults.flowRate),
    density: Number.isFinite(densitySI) && densitySI > 0 ? densitySI : defaults.density,
    soundSpeed: readDisplay(els.soundSpeed, 'velocity', defaults.soundSpeed),
    mu: readPositive(els.viscosityNumber, defaults.viscosity),
    H: readPositive(els.consistencyNumber, defaults.consistency),
    n: Math.max(0.2, Number(els.flowIndexNumber.value) || defaults.flowIndex),
    tau0: Math.max(0, Number(els.yieldStressNumber.value) || 0)
  };
}

function flowRateAtG(G, params) {
  return calculate({ ...params, G }).flowRate;
}

function solveForG(targetQ, params) {
  if (!Number.isFinite(targetQ) || targetQ <= 0) return 0;
  const hasYield = params.model === 'bingham' || params.model === 'herschelBulkley';
  const minG = hasYield && params.tau0 > 0 ? (2 * params.tau0) / params.R : 0;
  if (flowRateAtG(minG, params) >= targetQ) return minG;

  let lo = minG;
  let hi = Math.max(minG + 1, Number(params.G) || defaults.pressureGradient);
  for (let safety = 0; safety < 30; safety += 1) {
    const qHi = flowRateAtG(hi, params);
    if (qHi >= targetQ || hi > 1e12) break;
    hi *= 2;
  }

  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    const qMid = flowRateAtG(mid, params);
    if (qMid < targetQ) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-6 * hi) break;
  }
  return (lo + hi) / 2;
}

function calculate(params) {
  const { model, R, G } = params;
  const tauW = (G * R) / 2;
  const hasYield = model === 'bingham' || model === 'herschelBulkley';
  const tau0 = hasYield ? params.tau0 : 0;
  const flowing = !hasYield || tauW > tau0;
  const Pl = flowing && tauW > 0 ? Math.min(1, tau0 / tauW) : (hasYield ? 1 : 0);
  const Rp = Pl * R;
  const samples = [];
  const count = 201;
  let maxVelocity = 0;

  const n = Math.max(0.2, Number(params.n) || 1);
  const modelN = model === 'powerLaw' || model === 'herschelBulkley' ? n : 1;

  for (let i = 0; i < count; i += 1) {
    const x = i / (count - 1);
    const r = x * R;
    let velocity = 0;
    let shearRate = 0;
    const stress = tauW * x;

    if (flowing && G > 0) {
      if (model === 'newtonian') {
        velocity = (G * (R * R - r * r)) / (4 * params.mu);
        shearRate = (G * r) / (2 * params.mu);
      } else if (model === 'powerLaw') {
        const exponent = (params.n + 1) / params.n;
        velocity = (params.n * R / (params.n + 1)) * (tauW / params.H) ** (1 / params.n) * (1 - x ** exponent);
        shearRate = (stress / params.H) ** (1 / params.n);
      } else if (model === 'bingham') {
        if (x <= Pl) {
          velocity = (R * tauW / (2 * params.mu)) * (1 - Pl) ** 2;
        } else {
          velocity = (R * tauW / (2 * params.mu)) * ((1 - Pl) ** 2 - (x - Pl) ** 2);
          shearRate = (stress - tau0) / params.mu;
        }
      } else {
        const exponent = (params.n + 1) / params.n;
        const factor = (params.n * R / (params.n + 1)) * (tauW / params.H) ** (1 / params.n);
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
  const D = 2 * R;
  const wallShearRate = meanVelocity > 0
    ? ((3 * modelN + 1) / (4 * modelN)) * (8 * meanVelocity / D)
    : 0;

  return { params, G, tauW, tau0, flowing, Pl, Rp, samples, maxVelocity, meanVelocity, flowRate, wallShearRate };
}

// Darcy friction factor from Madlener et al. (2009): laminar f_D = 64/Re,
// turbulent via the Dodge–Metzner (1959) correlation (converted from Fanning
// to Darcy form) using the local flow-behavior index m. The implicit equation
//   1/sqrt(f_D) = (2/m^0.75) * log10[ Re * (f_D/4)^(1 - m/2) ] - 0.2/m^1.2
// is solved by fixed-point iteration on y = 1/sqrt(f_D). For m = 1 the
// expression reduces to the Prandtl–Nikuradse smooth-pipe equation.
function darcyFrictionFactor(re, m) {
  if (!Number.isFinite(re) || re <= 0) return 0;
  if (re <= 2100) return 64 / re;
  const mClamped = Math.min(Math.max(m, 0.1), 1);
  const a = 2 / Math.pow(mClamped, 0.75);
  const b = 0.2 / Math.pow(mClamped, 1.2);
  const log10Re = Math.log10(re);
  const log10Four = Math.log10(4);
  const oneMinusHalfM = 1 - mClamped / 2;
  let y = Math.sqrt(re / 64);
  for (let i = 0; i < 100; i += 1) {
    const yNext = a * (log10Re - oneMinusHalfM * log10Four - 2 * oneMinusHalfM * Math.log10(y)) - b;
    if (Number.isFinite(yNext) && Math.abs(yNext - y) < 1e-12) { y = yNext; break; }
    y = Number.isFinite(yNext) && yNext > 0 ? yNext : y;
  }
  const f = 1 / (y * y);
  return Number.isFinite(f) && f > 0 ? f : 0;
}

function formatValue(value, digits = 3) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 10000 || abs < 0.001)) return value.toExponential(2).replace('.', ',');
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

function formatNumeric(value) {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(10)));
}

function formatDisplay(value, dimension, digits = 3) {
  return `${formatValue(fromSI(value, dimension), digits)} ${getUnitLabel(dimension)}`;
}

function updateRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const progress = (value - min) / (max - min) * 100;
  input.style.setProperty('--range-progress', `${progress}%`);
}

function setInputValue(input, value) {
  if (document.activeElement === input) return;
  input.value = formatNumeric(value);
}

function syncSliderAndNumber(numberInput, slider, isLog) {
  numberInput.addEventListener('input', () => {
    const v = Number(numberInput.value);
    if (!Number.isFinite(v)) return;
    const min = Number(slider.min);
    const max = Number(slider.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return;
    if (isLog) {
      if (v <= 0) return;
      slider.value = String(Math.max(min, Math.min(max, Math.log10(v))));
    } else {
      slider.value = String(Math.max(min, Math.min(max, v)));
    }
  });
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    if (!Number.isFinite(v)) return;
    numberInput.value = String(isLog ? 10 ** v : v);
  });
}

function updateControls(params, mode = {}) {
  const flowMode = els.flowMode.value;
  const pressureSpecMode = els.pressureSpecMode.value;
  const info = modelInfo[params.model];
  els.modelDescription.textContent = info.description;
  els.resultTitle.textContent = `${info.name} em duto circular`;
  els.equationTag.textContent = info.tag;

  $$('[data-models]').forEach((field) => {
    field.hidden = !field.dataset.models.split(',').includes(params.model);
  });

  $('#viscositySymbol').textContent = 'μ';

  els.pressureSpecModeWrap.hidden = flowMode !== 'pressureGradient';
  els.pressureGradientField.hidden = flowMode !== 'pressureGradient' || pressureSpecMode !== 'gradient';
  els.pressureDifferenceField.hidden = flowMode !== 'pressureGradient' || pressureSpecMode !== 'differential';
  els.flowRateField.hidden = flowMode !== 'flowRate';

  setInputValue(els.viscosityNumber, params.mu);
  els.viscosity.value = String(Math.max(Number(els.viscosity.min), Math.min(Number(els.viscosity.max), Math.log10(params.mu))));
  setInputValue(els.consistencyNumber, params.H);
  els.consistency.value = String(Math.max(Number(els.consistency.min), Math.min(Number(els.consistency.max), Math.log10(params.H))));
  setInputValue(els.flowIndexNumber, params.n);
  els.flowIndex.value = String(Math.max(Number(els.flowIndex.min), Math.min(Number(els.flowIndex.max), params.n)));
  setInputValue(els.yieldStressNumber, params.tau0);
  els.yieldStress.value = String(Math.max(Number(els.yieldStress.min), Math.min(Number(els.yieldStress.max), params.tau0)));
  [els.viscosity, els.consistency, els.flowIndex, els.yieldStress].forEach(updateRange);

  els.viscosityOutput.textContent = `${formatValue(params.mu, 4)} Pa·s`;
  els.consistencyOutput.textContent = `${formatValue(params.H, 4)} Pa·sⁿ`;
  els.flowIndexOutput.textContent = formatValue(params.n, 2);
  els.yieldStressOutput.textContent = `${formatValue(params.tau0, 1)} Pa`;

  setInputValue(els.radius, fromSI(params.R, 'length'));
  setInputValue(els.tubeLength, fromSI(params.tubeLength, 'length'));
  setInputValue(els.density, fromSI(params.density, 'density'));
  setInputValue(els.soundSpeed, fromSI(params.soundSpeed, 'velocity'));

  const pressureDifference = mode.pressureDifference ?? (params.G * params.tubeLength);
  if (flowMode === 'pressureGradient' && pressureSpecMode === 'differential') {
    setInputValue(els.pressureGradientInput, fromSI(params.G, 'pressureGradient'));
  } else {
    setInputValue(els.pressureDifference, fromSI(pressureDifference, 'pressure'));
  }
  if (flowMode === 'flowRate') {
    setInputValue(els.pressureGradientInput, fromSI(params.G, 'pressureGradient'));
  }
}

function updateMetrics(data, mode = {}) {
  const params = data.params;
  const V = data.meanVelocity;
  const D = 2 * params.R;
  const n = params.model === 'powerLaw' || params.model === 'herschelBulkley' ? params.n : 1;
  const K = params.model === 'newtonian' || params.model === 'bingham' ? params.mu : params.H;
  const tau0 = params.model === 'bingham' || params.model === 'herschelBulkley' ? params.tau0 : 0;
  const factor = n > 0 ? (3 * n + 1) / (4 * n) : 1;
  const shearRateWall = V > 0 ? 8 * V / D : 0;
  const denom = tau0 + K * (factor ** n) * (shearRateWall ** n);
  const re = V > 0 && denom > 0 ? (8 * params.density * V * V * factor) / denom : 0;
  const mach = params.soundSpeed > 0 ? V / params.soundSpeed : 0;

  // Madlener et al. (2009) HBE generalized Reynolds with eta_infinity = 0.
  const gammaAppw = V > 0 ? 8 * V / D : 0;
  const tauW = data.tauW;
  const mLocal = (V > 0 && tauW > 0) ? (n * K * (gammaAppw ** n)) / tauW : (n > 0 ? n : 1);
  const mClamped = Number.isFinite(mLocal) && mLocal > 0 ? mLocal : (n > 0 ? n : 1);
  const mFactor = (3 * mClamped + 1) / (4 * mClamped);
  let reHbe = 0;
  if (V > 0 && D > 0) {
    const denomHbe = (tau0 / 8) * ((D / V) ** n) + K * (mFactor ** n) * (8 ** (n - 1));
    if (denomHbe > 0) reHbe = (params.density * (V ** (2 - n)) * (D ** n)) / denomHbe;
  }
  const fDarcy = darcyFrictionFactor(reHbe, mClamped);
  const darcyWeisbachDp = (fDarcy > 0 && D > 0) ? fDarcy * (params.tubeLength / D) * (params.density * V * V / 2) : 0;

  els.maxVelocity.textContent = formatValue(fromSI(data.maxVelocity, 'velocity'));
  els.maxVelocityUnit.textContent = getUnitLabel('velocity');
  els.meanVelocity.textContent = formatValue(fromSI(data.meanVelocity, 'velocity'));
  els.meanVelocityUnit.textContent = getUnitLabel('velocity');
  els.flowRate.textContent = formatValue(fromSI(data.flowRate, 'flowRate'));
  els.flowRateUnit.textContent = getUnitLabel('flowRate');
  els.wallStress.textContent = formatValue(fromSI(data.tauW, 'pressure'));
  els.wallStressUnit.textContent = getUnitLabel('pressure');
  els.pressureGradient.textContent = formatValue(fromSI(params.G, 'pressureGradient'), 3);
  els.plasticityIndex.textContent = data.tau0 > 0 ? formatValue(data.Pl, 4) : '0';
  if (data.tau0 > 0) {
    els.plugRadius.textContent = formatValue(fromSI(data.Rp, 'length'), 4);
    if (els.plugRadiusUnit) els.plugRadiusUnit.hidden = false;
  } else {
    els.plugRadius.textContent = 'Não se aplica';
    if (els.plugRadiusUnit) els.plugRadiusUnit.hidden = true;
  }
  els.plugArea.textContent = data.tau0 > 0 ? `${formatValue(data.Pl * data.Pl * 100, 1)} %` : '0 %';
  els.wallShearRate.textContent = `${formatValue(data.wallShearRate, 3)} s⁻¹`;
  els.pressureDifferenceOutput.textContent = formatValue(fromSI(mode.pressureDifference ?? (params.G * params.tubeLength), 'pressure'), 3);
  els.reynoldsNumber.textContent = formatValue(re, 2);
  els.localGradient.textContent = formatValue(mClamped, 4);
  els.reynoldsHbeNumber.textContent = formatValue(reHbe, 2);
  els.darcyFriction.textContent = formatValue(fDarcy, 5);
  els.darcyWeisbachPressure.textContent = formatValue(fromSI(darcyWeisbachDp, 'pressure'), 3);
  els.machNumber.textContent = formatValue(mach, 3);
  els.legendMax.innerHTML = `<span class="math">U<sub>max</sub></span> = ${formatValue(fromSI(data.maxVelocity, 'velocity'))} ${getUnitLabel('velocity')}`;

  const flowing = data.flowing && data.maxVelocity > 0;
  const turbulent = reHbe > 2100;
  const supersonic = mach > 1;
  els.flowState.classList.toggle('stopped', !flowing);
  els.flowState.classList.toggle('turbulent', flowing && turbulent);
  els.flowState.classList.toggle('supersonic', flowing && supersonic);

  if (!flowing) {
    els.flowState.innerHTML = '<span></span>Sem escoamento';
  } else if (turbulent && supersonic) {
    els.flowState.innerHTML = '<span></span>Turbulento / Supersônico';
  } else if (turbulent) {
    els.flowState.innerHTML = '<span></span>Turbulento';
  } else if (supersonic) {
    els.flowState.innerHTML = '<span></span>Supersônico';
  } else {
    els.flowState.innerHTML = '<span></span>Escoando';
  }
}

function typesetEquations() {
  if (!window.MathJax || !window.MathJax.typesetPromise) return;
  const nodes = [els.equation, els.wallStressEquation, els.flowRateEquation, els.reynoldsEquation, els.localGradientEquation, els.reynoldsHbeEquation, els.darcyFrictionEquation, els.darcyWeisbachEquation, els.equationVars];
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
    els.equation.textContent = String.raw`\[U_z(r)=\begin{cases}\displaystyle \frac{R\tau_w}{2\mu}(1-\mathrm{Pl})^2,&0\le r\le R_p,\\[6pt]\displaystyle \frac{R\tau_w}{2\mu}\left[(1-\mathrm{Pl})^2-\left(\frac rR-\mathrm{Pl}\right)^2\right],&R_p<r\le R,\end{cases}\quad \underbrace{\mathrm{Pl}=\frac{R_p}{R}=\frac{\tau_0}{\tau_w}}_{\text{índice de plasticidade}}\]`;
    els.flowRateEquation.textContent = String.raw`\[Q=2\pi\left[\int_0^{R_p}U_p r\,dr+\int_{R_p}^{R}U_z(r)r\,dr\right]=\frac{\pi G R^4}{8\mu}\left(1-\frac{4\mathrm{Pl}}{3}+\frac{\mathrm{Pl}^4}{3}\right)\]`;
    els.equationVars.textContent = String.raw`\(\mu=${formatValue(mu, 4)}\ \mathrm{Pa\,s},\quad \tau_0=${formatValue(data.tau0, 3)}\ \mathrm{Pa},\quad \mathrm{Pl}=${formatValue(data.Pl, 4)},\quad R_p=${formatValue(data.Rp, 5)}\ \mathrm{m},\quad Q=${formatValue(data.flowRate, 4)}\ \mathrm{m^3\,s^{-1}}\)`;
  } else {
    els.equation.textContent = String.raw`\[U_z(r)=\begin{cases}\displaystyle \frac{nR}{n+1}\left(\frac{\tau_w}{H}\right)^{1/n}(1-\mathrm{Pl})^{(n+1)/n},&0\le r\le R_p,\\[6pt]\displaystyle \frac{nR}{n+1}\left(\frac{\tau_w}{H}\right)^{1/n}\left[(1-\mathrm{Pl})^{(n+1)/n}-\left(\frac rR-\mathrm{Pl}\right)^{(n+1)/n}\right],&R_p<r\le R,\end{cases}\quad \underbrace{\mathrm{Pl}=\frac{R_p}{R}=\frac{\tau_0}{\tau_w}}_{\text{índice de plasticidade}}\]`;
    els.flowRateEquation.textContent = String.raw`\[Q=\pi R^3\left(\frac{\tau_w}{H}\right)^{1/n}\left[\frac{(1-\mathrm{Pl})^{1/n+3}}{1/n+3}+\frac{2\mathrm{Pl}(1-\mathrm{Pl})^{1/n+2}}{1/n+2}+\frac{\mathrm{Pl}^2(1-\mathrm{Pl})^{1/n+1}}{1/n+1}\right]\]`;
    els.equationVars.textContent = String.raw`\(H=${formatValue(H, 4)}\ \mathrm{Pa\,s^n},\quad n=${formatValue(n, 2)},\quad \tau_0=${formatValue(data.tau0, 3)}\ \mathrm{Pa},\quad \mathrm{Pl}=${formatValue(data.Pl, 4)},\quad R_p=${formatValue(data.Rp, 5)}\ \mathrm{m},\quad Q=${formatValue(data.flowRate, 4)}\ \mathrm{m^3\,s^{-1}}\)`;
  }
  els.reynoldsEquation.textContent = String.raw`\[\mathrm{Re}=\frac{8\rho V^2\left(\frac{3n+1}{4n}\right)}{\tau_0+K\left(\frac{3n+1}{4n}\right)^n\left(\frac{8V}{D}\right)^n}\]`;
  els.localGradientEquation.textContent = String.raw`\[\dot{\gamma}_{\mathrm{appw}}=\frac{8\bar{u}}{D},\qquad m=\frac{nK\left(\frac{8\bar{u}}{D}\right)^n+\eta_\infty\left(\frac{8\bar{u}}{D}\right)}{\tau_0+K\left(\frac{8\bar{u}}{D}\right)^n+\eta_\infty\left(\frac{8\bar{u}}{D}\right)}\quad\Rightarrow\quad \eta_\infty=0:\ m=\frac{nK\left(\frac{8\bar{u}}{D}\right)^n}{\tau_0+K\left(\frac{8\bar{u}}{D}\right)^n}\]`;
  els.reynoldsHbeEquation.textContent = String.raw`\[\mathrm{Re}_{\mathrm{gen\,HBE}}=\frac{\rho\bar{u}^{2-n}D^n}{\frac{\tau_0}{8}\left(\frac{D}{\bar{u}}\right)^n+K\left(\frac{3m+1}{4m}\right)^n8^{n-1}+\eta_\infty\left(\frac{3m+1}{4m}\right)\left(\frac{D}{\bar{u}}\right)^{n-1}}\quad(\eta_\infty=0)\]`;
  els.darcyFrictionEquation.textContent = String.raw`\[f_{\mathrm{Darcy}}=\begin{cases}\displaystyle\frac{64}{\mathrm{Re}_{\mathrm{gen\,HBE}}},&\mathrm{Re}_{\mathrm{gen\,HBE}}\le 2100\quad(\text{laminar})\\[6pt]\displaystyle\frac{1}{\sqrt{f_{\mathrm{Darcy}}}}=\frac{2}{m^{0{,}75}}\log_{10}\!\left[\mathrm{Re}_{\mathrm{gen\,HBE}}\left(\frac{f_{\mathrm{Darcy}}}{4}\right)^{1-m/2}\right]-\frac{0{,}2}{m^{1{,}2}},&\mathrm{Re}_{\mathrm{gen\,HBE}}>2100\quad(\text{Dodge--Metzner})\end{cases}\]`;
  els.darcyWeisbachEquation.textContent = String.raw`\[\Delta p_{\mathrm{DW}}=f_{\mathrm{Darcy}}\,\frac{L}{D}\,\frac{\rho\bar{u}^2}{2}\]`;
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

function scaledFont(size, family) {
  return `${Math.round(size * fontScale)}px ${family}`;
}

function scaledLineWidth(base) {
  return base * lineWidthScale;
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
    ctx.font = scaledFont(8, 'Manrope');
    ctx.textAlign = 'center';
    ctx.fillText('PLUGUE', margin.left + w / 2, margin.top + 12);
  }

  ctx.strokeStyle = css('--border-soft');
  ctx.lineWidth = scaledLineWidth(1);
  ctx.fillStyle = css('--muted-2');
  ctx.font = scaledFont(8, 'DM Mono');
  for (let i = 0; i <= 4; i += 1) {
    const y = margin.top + h * i / 4;
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + w, y); ctx.stroke();
    const v = fromSI(result.maxVelocity * (1 - i / 4), 'velocity');
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
  ctx.save(); ctx.translate(11, margin.top + h / 2); ctx.rotate(-Math.PI / 2); ctx.font = scaledFont(8, 'Manrope'); ctx.fillText(`U (${getUnitLabel('velocity')})`, 0, 0); ctx.restore();
  ctx.save(); ctx.translate(width - 8, margin.top + h / 2); ctx.rotate(Math.PI / 2); ctx.fillStyle = css('--amber'); ctx.font = scaledFont(8, 'Manrope'); ctx.fillText(`τ (${getUnitLabel('pressure')})`, 0, 0); ctx.restore();

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
    ctx.strokeStyle = css('--cyan'); ctx.lineWidth = scaledLineWidth(2.2); ctx.stroke();
  }
  if (els.showStress.checked) {
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = margin.left + (p.signedX + 1) / 2 * w;
      const y = margin.top + h * (1 - p.stress / maxTau);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.setLineDash([5 * lineWidthScale, 4 * lineWidthScale]); ctx.strokeStyle = css('--amber'); ctx.lineWidth = scaledLineWidth(1.6); ctx.stroke(); ctx.setLineDash([]);
  }

  if (hoveredIndex >= 0) {
    const signed = hoveredIndex / 100 - 1;
    const x = margin.left + (signed + 1) / 2 * w;
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = scaledLineWidth(1); ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + h); ctx.stroke();
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
    ctx.strokeStyle = 'rgba(168, 137, 255, .48)'; ctx.setLineDash([4 * lineWidthScale, 4 * lineWidthScale]);
    ctx.lineWidth = scaledLineWidth(1);
    ctx.beginPath(); ctx.moveTo(left, centerY - pipeRadius * result.Pl); ctx.lineTo(right, centerY - pipeRadius * result.Pl); ctx.moveTo(left, centerY + pipeRadius * result.Pl); ctx.lineTo(right, centerY + pipeRadius * result.Pl); ctx.stroke(); ctx.setLineDash([]);
  }

  ctx.strokeStyle = css('--border'); ctx.lineWidth = scaledLineWidth(3);
  ctx.beginPath(); ctx.moveTo(left - 8, top); ctx.lineTo(right + 8, top); ctx.moveTo(left - 8, bottom); ctx.lineTo(right + 8, bottom); ctx.stroke();
  ctx.strokeStyle = 'rgba(38,224,197,.2)'; ctx.lineWidth = scaledLineWidth(1);
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
        ctx.lineWidth = scaledLineWidth(1);
        ctx.beginPath(); ctx.moveTo(x - 5 * local, y); ctx.lineTo(x, y); ctx.stroke();
      }
    });
  }

  ctx.fillStyle = css('--muted'); ctx.font = scaledFont(8, 'Manrope'); ctx.textAlign = 'left'; ctx.fillText('ENTRADA', left, top - 12); ctx.textAlign = 'right'; ctx.fillText('SAÍDA', right, top - 12);
  ctx.strokeStyle = css('--cyan'); ctx.lineWidth = scaledLineWidth(1.5);
  ctx.beginPath(); ctx.moveTo(right - 28, top - 14); ctx.lineTo(right - 4, top - 14); ctx.lineTo(right - 10, top - 18); ctx.moveTo(right - 4, top - 14); ctx.lineTo(right - 10, top - 10); ctx.stroke();
}

function animate(timestamp) {
  const delta = Math.min(40, timestamp - animationTime || 16);
  animationTime = timestamp;
  drawFlow(delta);
  animationFrame = requestAnimationFrame(animate);
}

function refresh() {
  let params = getParameters();
  const flowMode = els.flowMode.value;
  const pressureSpecMode = els.pressureSpecMode.value;

  if (flowMode === 'pressureGradient') {
    if (pressureSpecMode === 'differential') {
      params.G = params.pressureDifference / params.tubeLength;
    } else {
      params.G = params.pressureGradient;
    }
  } else {
    params.G = solveForG(params.flowRate, { ...params, G: defaults.pressureGradient });
  }

  syncYieldStressRange(params.R, params.G);

  for (let iter = 0; iter < 5; iter += 1) {
    const newTau0 = readYieldStress();
    if (Math.abs(newTau0 - params.tau0) < 1e-12) break;
    params.tau0 = newTau0;
    if (flowMode === 'flowRate') {
      params.G = solveForG(params.flowRate, { ...params, G: params.G });
      syncYieldStressRange(params.R, params.G);
    }
  }

  const pressureDifference = params.G * params.tubeLength;
  updateControls(params, { flowMode, pressureSpecMode, pressureDifference });
  result = calculate(params);
  updateMetrics(result, { flowMode, pressureSpecMode, pressureDifference });
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
  units.pressure = 'Pa';
  units.length = 'm';
  units.flowRate = 'm3/d';
  units.density = 'kg/m3';
  updateUnitSelects();
  els.model.value = defaults.model;
  els.flowMode.value = defaults.flowMode;
  els.pressureSpecMode.value = defaults.pressureSpecMode;
  els.radius.value = fromSI(defaults.radius, 'length');
  els.pressureGradientInput.value = fromSI(defaults.pressureGradient, 'pressureGradient');
  els.pressureDifference.value = fromSI(defaults.pressureDifference, 'pressure');
  els.tubeLength.value = fromSI(defaults.tubeLength, 'length');
  els.flowRateInput.value = fromSI(defaults.flowRate, 'flowRate');
  els.density.value = fromSI(defaults.density, 'density');
  els.soundSpeed.value = fromSI(defaults.soundSpeed, 'velocity');
  els.viscosity.value = Math.log10(defaults.viscosity);
  els.viscosityNumber.value = defaults.viscosity;
  els.consistency.value = Math.log10(defaults.consistency);
  els.consistencyNumber.value = defaults.consistency;
  els.flowIndex.value = defaults.flowIndex;
  els.flowIndexNumber.value = defaults.flowIndex;
  els.yieldStress.value = defaults.yieldStress;
  els.yieldStressNumber.value = defaults.yieldStress;
  [els.showVelocity, els.showStress, els.showPlug, els.showParticles].forEach((input) => { input.checked = true; });
  [els.viscosity, els.consistency, els.flowIndex, els.yieldStress].forEach(updateRange);
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
  els.chartReadout.textContent = `r/R ${signed.toFixed(2)}  ·  U ${formatValue(fromSI(point.velocity, 'velocity'), 4)} ${getUnitLabel('velocity')}  ·  τ ${formatValue(fromSI(point.stress, 'pressure'), 3)} ${getUnitLabel('pressure')}  ·  γ̇ ${formatValue(point.shearRate, 3)} s⁻¹`;
  drawProfileChart();
}

function setPanelVisibility() {
  const showControls = els.showControls.checked;
  const showDashboard = els.showDashboard.checked;
  if (!showControls && !showDashboard) {
    els.showControls.checked = true;
    els.showDashboard.checked = true;
  }
  els.workspace.classList.toggle('hide-controls', !els.showControls.checked);
  els.workspace.classList.toggle('hide-dashboard', !els.showDashboard.checked);
  requestAnimationFrame(() => { drawProfileChart(); drawFlow(); });
}

function setFontSize(value) {
  document.documentElement.dataset.fontSize = value;
  fontScale = value === 'default' ? 1 : value === 'large' ? 1.15 : 1.3;
  drawProfileChart(); drawFlow();
}

function setLineWidth(value) {
  document.documentElement.dataset.lineWidth = value;
  lineWidthScale = value === 'default' ? 1 : value === 'thick' ? 1.5 : 2;
  drawProfileChart(); drawFlow();
}

function toggleA11yPopover(show) {
  const open = typeof show === 'boolean' ? show : !els.accessibilityPopover.classList.contains('open');
  els.accessibilityPopover.classList.toggle('open', open);
  els.accessibilityButton.setAttribute('aria-expanded', String(open));
}

function updateUnitSelects() {
  $$('.unit-select').forEach((select) => {
    const dimension = select.dataset.dimension;
    if (dimension && units[dimension]) select.value = units[dimension];
  });
  $$('.unit-denominator').forEach((el) => { el.textContent = `/${getUnitDef('length', units.length).label}`; });
  if (els.soundSpeedUnit) els.soundSpeedUnit.textContent = getUnitLabel('velocity');
}

function applyUnits() {
  updateUnitSelects();
  if (result) {
    const p = result.params;
    setInputValue(els.radius, fromSI(p.R, 'length'));
    setInputValue(els.tubeLength, fromSI(p.tubeLength, 'length'));
    setInputValue(els.density, fromSI(p.density, 'density'));
    setInputValue(els.soundSpeed, fromSI(p.soundSpeed, 'velocity'));
    setInputValue(els.pressureGradientInput, fromSI(p.G, 'pressureGradient'));
    setInputValue(els.pressureDifference, fromSI(p.G * p.tubeLength, 'pressure'));
    setInputValue(els.flowRateInput, fromSI(result.flowRate, 'flowRate'));
  }
  refresh();
}

function setupUnits() {
  updateUnitSelects();
  $$('.unit-select').forEach((select) => {
    select.addEventListener('change', () => {
      const dimension = select.dataset.dimension;
      if (!dimension || !units[dimension]) return;
      units[dimension] = select.value;
      applyUnits();
    });
  });
}

function setupAccessibility() {
  setPanelVisibility();
  els.accessibilityButton.addEventListener('click', (e) => { e.stopPropagation(); toggleA11yPopover(); });
  els.accessibilityPopover.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => toggleA11yPopover(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleA11yPopover(false); });
  els.showControls.addEventListener('change', setPanelVisibility);
  els.showDashboard.addEventListener('change', setPanelVisibility);
  $$('#accessibilityPopover .segmented').forEach((group) => {
    const buttons = [...group.querySelectorAll('button')];
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const value = btn.dataset.value;
        if (group.getAttribute('aria-label') === 'Tamanho da fonte') setFontSize(value);
        else setLineWidth(value);
      });
    });
  });
}

syncSliderAndNumber(els.viscosityNumber, els.viscosity, true);
syncSliderAndNumber(els.consistencyNumber, els.consistency, true);
syncSliderAndNumber(els.flowIndexNumber, els.flowIndex, false);
syncSliderAndNumber(els.yieldStressNumber, els.yieldStress, false);

$$('input, select:not(.unit-select)').forEach((input) => input.addEventListener('input', refresh));
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
reset();
setupUnits();
setupAccessibility();
window.addEventListener('load', () => updateEquation(result));
cancelAnimationFrame(animationFrame);
animationFrame = requestAnimationFrame(animate);
