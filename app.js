const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const defaults = {
  model: 'herschelBulkley',
  radius: 0.05,
  pressureGradient: 12000,
  viscosity: 0.001,
  consistency: 0.001,
  flowIndex: 0.6,
  yieldStress: 0.6,
  flowMode: 'pressureGradient',
  pressureSpecMode: 'gradient',
  pressureDifference: 6000,
  tubeLength: 0.5,
  flowRate: 0.001,
  density: 1000,
  soundSpeed: 1500,
  bundleDuctCount: 19,
  bundlePorosity: 0.15
};

function getModelDefaults(model) {
  const base = {
    viscosity: 0.001,
    consistency: 0.001,
    flowIndex: 0.6,
    yieldStress: 0
  };
  if (model === 'newtonian') return { ...base, yieldStress: 0 };
  if (model === 'powerLaw') return { ...base, yieldStress: 0 };
  if (model === 'bingham') return { ...base, yieldStress: 0.5 };
  if (model === 'herschelBulkley') return { ...base, yieldStress: 0.6 };
  return base;
}

const DEBUG = false;

const units = {
  pressure: 'Pa',
  length: 'm',
  velocity: 'm/s',
  flowRate: 'm3/d',
  density: 'kg/m3',
  area: 'm2'
};

const unitOptions = {
  area: [
    { value: 'm2', label: 'm²', toBase: 1 },
    { value: 'ft2', label: 'ft²', toBase: 0.09290304 },
    { value: 'in2', label: 'in²', toBase: 0.00064516 }
  ],
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
  velocity: [
    { value: 'm/s', label: 'm/s', toBase: 1 },
    { value: 'ft/s', label: 'ft/s', toBase: 0.3048 },
    { value: 'in/s', label: 'in/s', toBase: 0.0254 }
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
    const vDef = getUnitDef('velocity', unitValue || units.velocity);
    return value * vDef.toBase;
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
    const vDef = getUnitDef('velocity', unitValue || units.velocity);
    return value / vDef.toBase;
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
    return getUnitDef('velocity', unitValue || units.velocity).label;
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

function hexLattice(N, spacing) {
  const centers = [];
  if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(spacing) || spacing <= 0) return centers;
  centers.push({ x: 0, y: 0 });
  if (N === 1) return centers;
  let ring = 0;
  while (centers.length < N) {
    ring += 1;
    for (let q = -ring; q <= ring; q += 1) {
      for (let r = -ring; r <= ring; r += 1) {
        const s = -q - r;
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) !== ring) continue;
        const x = spacing * (q + r / 2);
        const y = spacing * (Math.sqrt(3) / 2 * r);
        centers.push({ x, y });
      }
    }
  }
  centers.sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));
  return centers.slice(0, N);
}

function getBundleGeometry(params) {
  const r = Math.max(1e-9, params.R);
  const inputMode = els.bundleInputMode ? els.bundleInputMode.value : 'count';
  const maxN = 100000;
  let N;
  let R_env;
  let A_total;
  let porosity;
  let centers = [];
  let packingWarning = false;

  if (inputMode === 'count') {
    const rawCount = Math.floor(readPositive(els.bundleDuctCount, defaults.bundleDuctCount));
    N = Math.max(1, Math.min(maxN, rawCount));
    centers = hexLattice(N, 2 * r);
    const dMax = centers.reduce((m, c) => Math.max(m, Math.hypot(c.x, c.y)), 0);
    R_env = r + dMax;
    A_total = Math.PI * R_env * R_env;
    porosity = (N * Math.PI * r * r) / A_total;
  } else {
    const phi = Math.min(0.999999, Math.max(0.000001, Number(els.bundlePorosityInput.value) || defaults.bundlePorosity));
    A_total = readDisplay(els.bundleTotalAreaInput, 'area', defaults.bundleTotalArea);
    const targetN = (phi * A_total) / (Math.PI * r * r);
    N = Math.max(1, Math.min(maxN, Math.round(targetN)));
    R_env = Math.sqrt(A_total / Math.PI);
    let s = Math.sqrt((2 * A_total) / (N * Math.sqrt(3)));
    if (!Number.isFinite(s) || s <= 0) s = 2 * r;
    if (s < 2 * r) {
      packingWarning = true;
      s = 2 * r;
    }
    centers = hexLattice(N, s);
  }
  porosity = porosity || (N * Math.PI * r * r) / A_total;

  return {
    N,
    r,
    A_total,
    R_env,
    porosity,
    centers,
    packingWarning,
    inputMode
  };
}

defaults.bundleTotalArea = (() => {
  const r = defaults.radius;
  const centers = hexLattice(defaults.bundleDuctCount, 2 * r);
  const dMax = centers.reduce((m, c) => Math.max(m, Math.hypot(c.x, c.y)), 0);
  return Math.PI * Math.pow(r + dMax, 2);
})();

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
  dpMethod: $('#dpMethod'),
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
  wallShearRateEquation: $('#wallShearRateEquation'),
  flowRateEquation: $('#flowRateEquation'),
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
  workspace: $('.workspace'),
  ductMode: $('#ductMode'),
  nonHomogeneousGeometry: $('#nonHomogeneousGeometry'),
  geometryInput: $('#geometryInput'),
  geometryWarning: $('#geometryWarning'),
  geometryUnitLabel: $('#geometryUnitLabel'),
  profileMode: $('#profileMode'),
  subdivisionsInput: $('#subdivisionsInput'),
  generateGeometryButton: $('#generateGeometryButton'),
  calculateDuctButton: $('#calculateDuctButton'),
  radiusField: $('#radiusField'),
  tubeLengthField: $('#tubeLengthField'),
  homogeneousDashboard: $('#homogeneousDashboard'),
  nonHomogeneousDashboard: $('#nonHomogeneousDashboard'),
  nhResultTitle: $('#nhResultTitle'),
  nhFlowState: $('#nhFlowState'),
  nhTotalPressure: $('#nhTotalPressure'),
  nhTotalPressureUnit: $('#nhTotalPressureUnit'),
  nhAvgRadius: $('#nhAvgRadius'),
  nhAvgRadiusUnit: $('#nhAvgRadiusUnit'),
  nhAvgVelocity: $('#nhAvgVelocity'),
  nhAvgVelocityUnit: $('#nhAvgVelocityUnit'),
  nhReMax: $('#nhReMax'),
  nhReMedian: $('#nhReMedian'),
  nhAvgMach: $('#nhAvgMach'),
  nhSectionCount: $('#nhSectionCount'),
  ductLegendMin: $('#ductLegendMin'),
  ductLegendMax: $('#ductLegendMax'),
  ductProfileCanvas: $('#ductProfileCanvas'),
  ductFlowCanvas: $('#ductFlowCanvas'),
  nhProfileWrap: $('#nhProfileWrap'),
  nhFlowWrap: $('#nhFlowWrap'),
  nhVisualKicker: $('#nhVisualKicker'),
  nhVisualTitle: $('#nhVisualTitle'),
  nhFlowControls: $('#nhFlowControls'),
  nhPauseButton: $('#nhPauseButton'),
  nhAnimationLabel: $('#nhAnimationLabel'),
  nhSectionTableBody: $('#nhSectionTableBody'),
  bundleGeometry: $('#bundleGeometry'),
  bundleInputMode: $('#bundleInputMode'),
  bundleDuctCount: $('#bundleDuctCount'),
  bundleDuctCountField: $('#bundleDuctCountField'),
  bundlePorosityInput: $('#bundlePorosityInput'),
  bundlePorosityField: $('#bundlePorosityField'),
  bundleTotalAreaInput: $('#bundleTotalAreaInput'),
  bundleTotalAreaField: $('#bundleTotalAreaField'),
  bundleTotalAreaUnit: $('#bundleTotalAreaUnit'),
  bundleDashboard: $('#bundleDashboard'),
  bundleTotalFlow: $('#bundleTotalFlow'),
  bundleTotalFlowUnit: $('#bundleTotalFlowUnit'),
  bundlePressure: $('#bundlePressure'),
  bundlePressureUnit: $('#bundlePressureUnit'),
  bundleDuctCountDisplay: $('#bundleDuctCountDisplay'),
  bundlePorosityDisplay: $('#bundlePorosityDisplay'),
  bundleEnvelopeRadius: $('#bundleEnvelopeRadius'),
  bundleEnvelopeRadiusUnit: $('#bundleEnvelopeRadiusUnit'),
  bundleDuctVelocity: $('#bundleDuctVelocity'),
  bundleDuctVelocityUnit: $('#bundleDuctVelocityUnit'),
  bundleFlowState: $('#bundleFlowState'),
  bundleWallStress: $('#bundleWallStress'),
  bundlePlasticityIndex: $('#bundlePlasticityIndex'),
  bundleReynoldsHbe: $('#bundleReynoldsHbe'),
  bundleMach: $('#bundleMach'),
  bundleCanvas: $('#bundleCanvas'),
  bundlePreviewReadout: $('#bundlePreviewReadout'),
  bundleWarning: $('#bundleWarning'),
  generateBundleButton: $('#generateBundleButton'),
  calculateBundleButton: $('#calculateBundleButton'),
  bundleGeometryPanel: $('#bundleGeometryPanel'),
  bundleResultPanel: $('#bundleResultPanel')
};

let result = null;
let animationFrame = 0;
let animationTime = 0;
let animationPaused = false;
let particles = [];
let hoveredIndex = -1;
let fontScale = 1;
let lineWidthScale = 1;
let nhGeometry = null;
let nhPaused = false;
let nhFlowTime = 0;
let nhParticles = [];
let nhView = 'profile';
let bundleResult = null;
let bundleGeometry = null;
let bundleView = null;
let displaySciDigits = 2;

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

// Non-homogeneous duct helpers
function sanitizeGeometryInput() {
  const v = els.geometryInput.value.replace(/[^\d\s\.\-eE+\t\n\r]/g, '');
  if (v !== els.geometryInput.value) els.geometryInput.value = v;
}

function parseGeometryInput() {
  const raw = els.geometryInput.value.replace(/[^\d\s\.\-eE+]/g, '').trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 4 || tokens.length % 2 !== 0) return null;
  const points = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const x = Number(tokens[i]);
    const r = Number(tokens[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(r) || r <= 0) return null;
    points.push({ x: toSI(x, 'length'), r: toSI(r, 'length') });
  }
  points.sort((a, b) => a.x - b.x);
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].x <= points[i - 1].x + 1e-12) return null;
  }
  return points;
}

function linearInterpolate(points, x) {
  const first = points[0];
  const last = points[points.length - 1];
  if (x <= first.x) return first.r;
  if (x >= last.x) return last.r;
  let i = 1;
  while (i < points.length && points[i].x < x) i += 1;
  const p0 = points[i - 1];
  const p1 = points[i];
  const t = (x - p0.x) / (p1.x - p0.x);
  return p0.r + t * (p1.r - p0.r);
}

function pchipEdgeCase(h0, h1, m0, m1) {
  // One-sided three-point estimate for the derivative (Fritsch–Carlson / Moler).
  const d = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
  if (Math.sign(d) !== Math.sign(m0)) return 0;
  if (Math.abs(d) > 3 * Math.abs(m0)) return 3 * m0;
  return d;
}

function buildPchipSpline(points) {
  const n = points.length;
  const h = [];
  const m = [];
  for (let i = 0; i < n - 1; i += 1) {
    const hi = points[i + 1].x - points[i].x;
    h[i] = hi;
    m[i] = hi > 0 ? (points[i + 1].r - points[i].r) / hi : 0;
  }
  if (n === 2) return { points, d: [m[0], m[0]] };
  const d = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    const sm0 = Math.sign(m[i - 1]);
    const sm1 = Math.sign(m[i]);
    if (sm0 === 0 || sm1 === 0 || sm0 !== sm1) {
      d[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }
  d[0] = pchipEdgeCase(h[0], h[1], m[0], m[1]);
  d[n - 1] = pchipEdgeCase(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
  return { points, d };
}

function cubicInterpolate(points, x, stats = null) {
  if (points.length < 3) return linearInterpolate(points, x);
  if (!points.pchipSpline) points.pchipSpline = buildPchipSpline(points);
  const pts = points.pchipSpline.points;
  if (x <= pts[0].x) return pts[0].r;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].r;
  let i = 1;
  while (i < pts.length && pts[i].x < x) i += 1;
  const j = i - 1;
  const x0 = pts[j].x;
  const x1 = pts[j + 1].x;
  const h = x1 - x0;
  if (h <= 0) return pts[j].r;
  const t = (x - x0) / h;
  const r0 = pts[j].r;
  const r1 = pts[j + 1].r;
  const d0 = points.pchipSpline.d[j] * h;
  const d1 = points.pchipSpline.d[j + 1] * h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const val = r0 * h00 + d0 * h10 + r1 * h01 + d1 * h11;
  if (stats && val < 1e-6) stats.clamped += 1;
  return val;
}

function radiusAt(points, x, mode, stats = null) {
  const raw = mode === 'cubic' && points.length >= 3 ? cubicInterpolate(points, x, stats) : linearInterpolate(points, x);
  if (raw < 1e-6 && stats) stats.clamped += 1;
  return Math.max(1e-6, raw);
}

function buildSubsections(points, subdivisions, mode) {
  let nPer = Math.max(1, Math.min(1000, Math.floor(Number(subdivisions) || 20)));
  const maxTotal = 2000;
  const nTotal = (points.length - 1) * nPer;
  const capped = nTotal > maxTotal;
  if (capped) {
    nPer = Math.max(1, Math.floor(maxTotal / (points.length - 1)));
  }
  const stats = { clamped: 0 };
  const subsections = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const x0 = points[i].x;
    const x1 = points[i + 1].x;
    const dx = (x1 - x0) / nPer;
    for (let k = 0; k < nPer; k += 1) {
      const xLeft = x0 + k * dx;
      const xRight = (k === nPer - 1) ? x1 : x0 + (k + 1) * dx;
      const xCenter = (xLeft + xRight) / 2;
      const r = radiusAt(points, xCenter, mode, stats);
      subsections.push({ xLeft, xRight, xCenter, r, dx: xRight - xLeft, segmentIndex: i });
    }
  }
  return { n: subsections.length, subdivisionsPerSegment: nPer, subsections, clampCount: stats.clamped, capped };
}

function solveSection(baseParams, R, dx, flowSpec, hint = null) {
  const params = { ...baseParams, R: Math.max(1e-6, R), tubeLength: dx };
  let G;
  if (flowSpec.flowMode === 'flowRate') {
    G = solveForG(flowSpec.targetQ, { ...params, G: Number.isFinite(hint) ? hint : defaults.pressureGradient }, 1e-6, Number.isFinite(hint) ? hint : null);
  } else {
    G = flowSpec.G;
  }
  const data = calculate({ ...params, G });
  const d = computeDiagnostics(data, params);
  return { data, G, reHbe: d.reHbe, mach: d.mach, dp: dpEffective(params, data, d), dx };
}

function median(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function resetNHParticles(count = 90) {
  nhParticles = Array.from({ length: count }, (_, i) => ({
    t: Math.random(),
    y: Math.random() * 2 - 1,
    size: 0.7 + Math.random() * 1.5,
    alpha: 0.25 + Math.random() * 0.65,
    phase: i * 0.13
  }));
}

function markGeometryDirty() {
  if (nhGeometry) {
    nhGeometry.geometryDirty = true;
    nhGeometry.resultsDirty = true;
    nhGeometry.calculated = false;
  }
  updateNHButtons();
}

function markResultsDirty() {
  if (nhGeometry) {
    nhGeometry.resultsDirty = true;
  }
  updateNHButtons();
}

function updateNHButtons() {
  const geometryDirty = !nhGeometry || nhGeometry.geometryDirty;
  const resultsDirty = !nhGeometry || !nhGeometry.calculated || nhGeometry.resultsDirty;
  els.generateGeometryButton.textContent = geometryDirty ? 'Gerar geometria' : 'Geometria';
  els.calculateDuctButton.disabled = geometryDirty;
  els.calculateDuctButton.textContent = resultsDirty ? 'Calcular' : 'Escoamento';
}

function showNHVisual(view) {
  nhView = view;
  if (view === 'flow') {
    els.nhProfileWrap.hidden = true;
    els.nhFlowWrap.hidden = false;
    els.nhFlowControls.hidden = false;
    els.nhVisualKicker.textContent = 'Vista longitudinal';
    els.nhVisualTitle.textContent = 'Escoamento com partículas';
    drawDuctFlow(0);
  } else {
    els.nhProfileWrap.hidden = false;
    els.nhFlowWrap.hidden = true;
    els.nhFlowControls.hidden = true;
    els.nhVisualKicker.textContent = 'Perfil axial';
    els.nhVisualTitle.textContent = 'Geometria do duto';
    drawDuctProfile();
  }
}

function generateGeometry() {
  sanitizeGeometryInput();
  const points = parseGeometryInput();
  if (!points || points.length < 2) {
    els.geometryInput.classList.add('invalid');
    if (els.geometryWarning) { els.geometryWarning.textContent = ''; els.geometryWarning.hidden = true; }
    nhGeometry = null;
    updateNHButtons();
    return;
  }
  if (points.length > 500) {
    els.geometryInput.classList.add('invalid');
    if (els.geometryWarning) { els.geometryWarning.textContent = 'Aviso: o número máximo de pontos é 500. Reduza a geometria ou aumente o espaçamento entre pontos.'; els.geometryWarning.hidden = false; }
    nhGeometry = null;
    updateNHButtons();
    return;
  }
  els.geometryInput.classList.remove('invalid');
  const mode = els.profileMode.value;
  const subdivisions = Math.max(1, Math.floor(Number(els.subdivisionsInput.value) || 20));
  const { n, subdivisionsPerSegment, subsections, clampCount, capped } = buildSubsections(points, subdivisions, mode);
  if (subdivisionsPerSegment !== subdivisions) els.subdivisionsInput.value = subdivisionsPerSegment;
  nhGeometry = { points, mode, subdivisions: n, subdivisionsPerSegment, subsections, clampCount, capped, calculated: false, sectionResults: null, segmentResults: null, totalPressure: 0, geometryDirty: false, resultsDirty: true };
  if (els.geometryWarning) {
    const messages = [];
    if (clampCount > 0) messages.push(`${clampCount} trecho(s) com raio < 1 µm foram truncados.`);
    if (capped) messages.push(`Número de subseções limitado a 2000; subdivisões por trecho ajustadas para ${subdivisionsPerSegment}.`);
    if (messages.length > 0) {
      els.geometryWarning.textContent = `Aviso: ${messages.join(' ')}`;
      els.geometryWarning.hidden = false;
    } else {
      els.geometryWarning.textContent = '';
      els.geometryWarning.hidden = true;
    }
  }
  resetNHParticles();
  showNHVisual('profile');
  updateNHButtons();
}

function verifyNHResults(sectionResults, targetQ, targetP, flowMode) {
  if (!sectionResults || sectionResults.length === 0) return;
  const qValues = sectionResults.map((sr) => sr.data.flowRate);
  const maxQError = targetQ > 0 ? Math.max(...qValues.map((q) => Math.abs(q - targetQ) / Math.abs(targetQ))) : 0;
  const computedP = sectionResults.reduce((sum, sr) => sum + sr.dp, 0);
  const pError = targetP > 0 ? Math.abs(computedP - targetP) / targetP : 0;
  if (DEBUG) {
    console.log('[RheoFlow NH verify] flowMode:', flowMode, 'target Q:', targetQ, 'max section Q error:', maxQError, 'computed Δp:', computedP, 'target Δp:', targetP, 'relative Δp error:', pError);
    if (targetQ === 0) {
      console.log('[RheoFlow NH verify] no flow (target pressure below yield threshold)');
    } else if (maxQError > 1e-3 || pError > 1e-2) {
      console.warn('[RheoFlow NH verify] mismatch detected', { maxQError, pError, sectionCount: sectionResults.length });
    } else {
      console.log('[RheoFlow NH verify] OK');
    }
  }
}

function calculateNonHomogeneous() {
  if (!nhGeometry) return;
  const { points, mode, subsections } = nhGeometry;
  const baseParams = getParameters();
  const profileLength = points[points.length - 1].x - points[0].x;
  if (profileLength <= 0) return;
  const pressureSpecMode = els.pressureSpecMode.value;
  const flowMode = els.flowMode.value;
  let targetQ;
  let targetP = 0;
  if (flowMode === 'flowRate') {
    targetQ = baseParams.flowRate;
  } else {
    targetP = pressureSpecMode === 'differential' ? baseParams.pressureDifference : baseParams.pressureGradient * profileLength;
    targetQ = solveGlobalQ(targetP, baseParams, subsections);
  }
  const flowSpec = { flowMode: 'flowRate', targetQ };
  const sectionResults = [];
  let sectionHint = null;
  for (let i = 0; i < subsections.length; i += 1) {
    const s = subsections[i];
    const sr = solveSection(baseParams, s.r, s.dx, flowSpec, sectionHint);
    sectionResults.push(sr);
    sectionHint = sr.G;
  }
  const totalPressure = sectionResults.reduce((sum, sr) => sum + sr.dp, 0);
  verifyNHResults(sectionResults, targetQ, flowMode === 'pressureGradient' ? targetP : totalPressure, flowMode);
  const r2Sum = subsections.reduce((sum, s) => sum + s.r * s.r * s.dx, 0);
  const avgRadius = Math.sqrt(r2Sum / profileLength);
  const avgArea = Math.PI * avgRadius * avgRadius;
  const avgVelocity = targetQ > 0 && avgArea > 0 ? targetQ / avgArea : 0;
  const avgMach = baseParams.soundSpeed > 0 ? avgVelocity / baseParams.soundSpeed : 0;
  const segmentResults = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const x = points[i].x;
    const dx = points[i + 1].x - points[i].x;
    const segmentSubs = sectionResults.filter((sr, idx) => subsections[idx].segmentIndex === i);
    const centerIdx = Math.floor(segmentSubs.length / 2);
    const centerSr = segmentSubs[centerIdx] || segmentSubs[0];
    const dpSum = segmentSubs.reduce((sum, sr) => sum + sr.dp, 0);
    if (centerSr) segmentResults.push({ x, dx, r: centerSr.data.params.R, meanV: centerSr.data.meanVelocity, reHbe: centerSr.reHbe, mach: centerSr.mach, dp: dpSum });
  }
  const reValues = sectionResults.map((s) => s.reHbe);
  nhGeometry = {
    ...nhGeometry,
    sectionResults,
    segmentResults,
    totalPressure,
    avgRadius,
    avgVelocity,
    avgMach,
    reMax: Math.max(...reValues),
    reMedian: median(reValues),
    calculated: true,
    geometryDirty: false,
    resultsDirty: false,
    baseParams,
    flowSpec
  };
  if (DEBUG) {
    console.log(`[RheoFlow NH resolution] ${subsections.length} subsections, total Δp = ${totalPressure.toExponential(8)} Pa, mode = ${flowMode}`);
    console.table(segmentResults.map((s, i) => ({ section: i + 1, x: s.x, dx: s.dx, R: s.r, U: s.meanV, Re: s.reHbe, Ma: s.mach, dp: s.dp })));
  }
  updateNonHomogeneousMetrics();
  showNHVisual('flow');
  updateNHButtons();
}

function updateUnitDisplay(element, dimension) {
  if (!element) return;
  if (element.tagName === 'SELECT') {
    const selectDim = element.dataset.dimension;
    if (selectDim && units[selectDim]) element.value = units[selectDim];
  } else {
    element.textContent = getUnitLabel(dimension);
  }
}

function updateNonHomogeneousMetrics() {
  if (!nhGeometry) return;
  const { points, totalPressure, avgRadius, avgVelocity, avgMach, reMax, reMedian, segmentResults, subsections } = nhGeometry;
  if (els.ductLegendMin && els.ductLegendMax) {
    const unitLabel = getUnitLabel('length');
    els.ductLegendMin.textContent = `x = ${formatValue(fromSI(points[0].x, 'length'), 3)} ${unitLabel}`;
    els.ductLegendMax.textContent = `x = ${formatValue(fromSI(points[points.length - 1].x, 'length'), 3)} ${unitLabel}`;
  }
  els.nhTotalPressure.textContent = formatValue(fromSI(totalPressure, 'pressure'), 3);
  updateUnitDisplay(els.nhTotalPressureUnit, 'pressure');
  els.nhAvgRadius.textContent = formatValue(fromSI(avgRadius, 'length'), 4);
  updateUnitDisplay(els.nhAvgRadiusUnit, 'length');
  els.nhAvgVelocity.textContent = formatValue(fromSI(avgVelocity, 'velocity'), 3);
  updateUnitDisplay(els.nhAvgVelocityUnit, 'velocity');
  els.nhReMax.textContent = formatValue(reMax, 2);
  els.nhReMedian.textContent = formatValue(reMedian, 2);
  els.nhAvgMach.textContent = formatValue(avgMach, 3);
  els.nhSectionCount.textContent = String(subsections.length);
  const anyFlowing = avgVelocity > 0;
  const turbulent = reMax > 2100;
  const supersonic = avgMach > 1;
  els.nhFlowState.classList.remove('stopped', 'turbulent', 'supersonic');
  if (!anyFlowing) {
    els.nhFlowState.innerHTML = '<span></span>Sem escoamento';
    els.nhFlowState.classList.add('stopped');
  } else if (turbulent && supersonic) {
    els.nhFlowState.innerHTML = '<span></span>Turbulento / Supersônico';
    els.nhFlowState.classList.add('turbulent', 'supersonic');
  } else if (turbulent) {
    els.nhFlowState.innerHTML = '<span></span>Turbulento';
    els.nhFlowState.classList.add('turbulent');
  } else if (supersonic) {
    els.nhFlowState.innerHTML = '<span></span>Supersônico';
    els.nhFlowState.classList.add('supersonic');
  } else {
    els.nhFlowState.innerHTML = '<span></span>Escoando';
  }
  els.nhSectionTableBody.innerHTML = segmentResults.map((s) => `<tr><td>${formatValue(fromSI(s.x, 'length'), 3)}</td><td>${formatValue(fromSI(s.dx, 'length'), 3)}</td><td>${formatValue(fromSI(s.r, 'length'), 4)}</td><td>${formatValue(fromSI(s.meanV, 'velocity'), 3)}</td><td>${formatValue(s.reHbe, 2)}</td><td>${formatValue(fromSI(s.dp, 'pressure'), 3)}</td></tr>`).join('');
}

function drawDuctProfile() {
  if (!nhGeometry) return;
  const { ctx, width, height } = setupCanvas(els.ductProfileCanvas);
  const margin = { top: 18, right: 42, bottom: 42, left: 52 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;
  ctx.clearRect(0, 0, width, height);
  const { points, subsections, mode } = nhGeometry;
  const x0 = points[0].x;
  const xN = points[points.length - 1].x;
  const maxR = Math.max(...points.map((p) => p.r));
  const xScale = w / (xN - x0);
  const yScale = h / (maxR * 1.1);
  const mapX = (x) => margin.left + (x - x0) * xScale;
  const mapY = (r) => margin.top + h - r * yScale;
  ctx.strokeStyle = css('--border-soft');
  ctx.lineWidth = scaledLineWidth(1);
  ctx.fillStyle = css('--muted-2');
  ctx.font = scaledFont(8, 'DM Mono');
  for (let i = 0; i <= 4; i += 1) {
    const x = margin.left + w * i / 4;
    ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + h); ctx.stroke();
    const xv = x0 + (xN - x0) * i / 4;
    ctx.textAlign = 'center'; ctx.fillText(formatValue(fromSI(xv, 'length'), 2), x, margin.top + h + 17);
  }
  for (let i = 0; i <= 4; i += 1) {
    const y = margin.top + h * i / 4;
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + w, y); ctx.stroke();
    const rv = maxR * 1.1 * (1 - i / 4);
    ctx.textAlign = 'right'; ctx.fillText(formatValue(fromSI(rv, 'length'), 3), margin.left - 7, y + 3);
  }
  ctx.textAlign = 'center'; ctx.fillText(`x (${getUnitLabel('length')})`, margin.left + w / 2, height - 8);
  ctx.save(); ctx.translate(11, margin.top + h / 2); ctx.rotate(-Math.PI / 2); ctx.font = scaledFont(8, 'Manrope'); ctx.fillText(`r (${getUnitLabel('length')})`, 0, 0); ctx.restore();
  const samples = 200;
  ctx.beginPath();
  for (let i = 0; i <= samples; i += 1) {
    const x = x0 + (xN - x0) * i / samples;
    const r = radiusAt(points, x, mode);
    const px = mapX(x);
    const py = mapY(r);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = css('--cyan'); ctx.lineWidth = scaledLineWidth(2.2); ctx.stroke();
  ctx.fillStyle = css('--cyan');
  points.forEach((p) => {
    const px = mapX(p.x);
    const py = mapY(p.r);
    ctx.beginPath(); ctx.arc(px, py, 3 * lineWidthScale, 0, Math.PI * 2); ctx.fill();
  });
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.setLineDash([3 * lineWidthScale, 3 * lineWidthScale]);
  ctx.lineWidth = scaledLineWidth(1);
  subsections.forEach((s) => {
    const x = mapX(s.xLeft);
    ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + h); ctx.stroke();
  });
  ctx.setLineDash([]);
}

function drawDuctFlow(delta = 0) {
  if (!nhGeometry) return;
  const { ctx, width, height } = setupCanvas(els.ductFlowCanvas);
  ctx.clearRect(0, 0, width, height);
  const { points, subsections, sectionResults, calculated } = nhGeometry;
  const x0 = points[0].x;
  const xN = points[points.length - 1].x;
  const maxR = Math.max(...points.map((p) => p.r));
  const left = 28;
  const right = width - 20;
  const centerY = height / 2;
  const pipeHeight = height * 0.7;
  const yScale = pipeHeight / (2 * maxR);
  const L = xN - x0;
  if (L <= 0) return;
  const mapX = (x) => left + (x - x0) / L * (right - left);
  ctx.strokeStyle = css('--border'); ctx.lineWidth = scaledLineWidth(3);
  ctx.beginPath();
  for (let i = 0; i <= 200; i += 1) {
    const x = x0 + L * i / 200;
    const r = radiusAt(points, x, els.profileMode.value);
    const px = mapX(x);
    const py = centerY - r * yScale;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i <= 200; i += 1) {
    const x = x0 + L * i / 200;
    const r = radiusAt(points, x, els.profileMode.value);
    const px = mapX(x);
    const py = centerY + r * yScale;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  const globalMeanV = calculated ? sectionResults.reduce((m, sr) => Math.max(m, sr.data.meanVelocity), 0) || 1 : 1;
  if (calculated) {
    subsections.forEach((s, i) => {
      const sr = sectionResults[i];
      const vRatio = sr.data.meanVelocity / globalMeanV;
      const xLeft = mapX(s.xLeft);
      const xRight = mapX(s.xRight);
      const rPx = s.r * yScale;
      const hue = 184 - vRatio * 12;
      const light = 14 + vRatio * 31;
      ctx.fillStyle = `hsla(${hue}, 72%, ${light}%, .74)`;
      ctx.fillRect(xLeft, centerY - rPx, xRight - xLeft, rPx * 2);
    });
  } else {
    ctx.fillStyle = 'rgba(38,224,197,.08)';
    subsections.forEach((s) => {
      const xLeft = mapX(s.xLeft); const xRight = mapX(s.xRight); const rPx = s.r * yScale;
      ctx.fillRect(xLeft, centerY - rPx, xRight - xLeft, rPx * 2);
    });
  }
  function subsectionIndexAt(x) {
    if (x <= x0) return 0;
    if (x >= xN) return subsections.length - 1;
    let lo = 0;
    let hi = subsections.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (x < subsections[mid].xLeft) {
        hi = mid - 1;
      } else if (x >= subsections[mid].xRight) {
        lo = mid + 1;
      } else {
        return mid;
      }
    }
    return subsections.length - 1;
  }
  if (calculated && !nhPaused) {
    const speedScale = 0.00008;
    nhParticles.forEach((p) => {
      const xActual = x0 + p.t * L;
      const sIndex = subsectionIndexAt(xActual);
      const sr = sectionResults[sIndex];
      const localMeanV = sr ? sr.data.meanVelocity : 0;
      const velocityRatio = localMeanV / globalMeanV;
      p.t = (p.t + delta * speedScale * (0.08 + velocityRatio)) % 1;
    });
  }
  if (calculated) {
    nhParticles.forEach((p) => {
      const xActual = x0 + p.t * L;
      const sIndex = subsectionIndexAt(xActual);
      const sr = sectionResults[sIndex];
      const r = sr ? sr.data.params.R : radiusAt(points, xActual, els.profileMode.value);
      const localMeanV = sr ? sr.data.meanVelocity : 0;
      const velocityRatio = localMeanV / globalMeanV;
      const px = mapX(xActual);
      const py = centerY + p.y * r * yScale;
      ctx.fillStyle = `rgba(218, 255, 250, ${p.alpha * (0.25 + velocityRatio * 0.75)})`;
      ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
      if (velocityRatio > 0.15) {
        ctx.strokeStyle = `rgba(38, 224, 197, ${p.alpha * 0.32})`;
        ctx.lineWidth = scaledLineWidth(1);
        ctx.beginPath(); ctx.moveTo(px - 5 * velocityRatio, py); ctx.lineTo(px, py); ctx.stroke();
      }
    });
  }
  ctx.fillStyle = css('--muted'); ctx.font = scaledFont(8, 'Manrope'); ctx.textAlign = 'left'; ctx.fillText('ENTRADA', left, centerY - maxR * yScale - 12); ctx.textAlign = 'right'; ctx.fillText('SAÍDA', right, centerY - maxR * yScale - 12);
  ctx.strokeStyle = css('--cyan'); ctx.lineWidth = scaledLineWidth(1.5);
  ctx.beginPath(); ctx.moveTo(right - 28, centerY - maxR * yScale - 14); ctx.lineTo(right - 4, centerY - maxR * yScale - 14); ctx.lineTo(right - 10, centerY - maxR * yScale - 18); ctx.moveTo(right - 4, centerY - maxR * yScale - 14); ctx.lineTo(right - 10, centerY - maxR * yScale - 10); ctx.stroke();
}

function calculateBundle(params, geom) {
  const r = Math.max(1e-9, geom.r);
  const N = geom.N;
  const ductParams = { ...params, R: r };
  const flowMode = els.flowMode.value;
  const pressureSpecMode = els.pressureSpecMode.value;
  let G;
  let qDuct;
  if (flowMode === 'pressureGradient') {
    if (pressureSpecMode === 'differential') {
      G = params.pressureDifference / params.tubeLength;
    } else {
      G = Number.isFinite(params.pressureGradient) ? params.pressureGradient : params.G;
    }
    qDuct = flowRateAtG(G, ductParams);
  } else {
    qDuct = params.flowRate / N;
    const hintG = Number.isFinite(params.G) && params.G > 0 ? params.G : defaults.pressureGradient;
    G = solveForG(qDuct, { ...ductParams, G: hintG }, 1e-6, hintG);
  }
  const data = calculate({ ...ductParams, G });
  const diag = computeDiagnostics(data, ductParams);
  const dpTotal = dpEffective(ductParams, data, diag);
  return { data, diag, G, qDuct, qTotal: qDuct * N, dpTotal, geom };
}

function updateBundleInputVisibility() {
  if (!els.bundleInputMode) return;
  const mode = els.bundleInputMode.value;
  if (els.bundleDuctCountField) els.bundleDuctCountField.hidden = mode !== 'count';
  if (els.bundlePorosityField) els.bundlePorosityField.hidden = mode !== 'porosity';
  if (els.bundleTotalAreaField) els.bundleTotalAreaField.hidden = mode !== 'porosity';
}

function updateBundleMetrics(bundle) {
  if (!bundle) return;
  const { data, diag, qTotal, dpTotal, geom } = bundle;
  const params = data.params;
  const flowing = data.flowing && data.meanVelocity > 0;
  const turbulent = diag.reHbe > 2100;
  const supersonic = diag.mach > 1;
  els.bundleFlowState.classList.remove('stopped', 'turbulent', 'supersonic');
  if (!flowing) {
    els.bundleFlowState.innerHTML = '<span></span>Sem escoamento';
    els.bundleFlowState.classList.add('stopped');
  } else if (turbulent && supersonic) {
    els.bundleFlowState.innerHTML = '<span></span>Turbulento / Supersônico';
    els.bundleFlowState.classList.add('turbulent', 'supersonic');
  } else if (turbulent) {
    els.bundleFlowState.innerHTML = '<span></span>Turbulento';
    els.bundleFlowState.classList.add('turbulent');
  } else if (supersonic) {
    els.bundleFlowState.innerHTML = '<span></span>Supersônico';
    els.bundleFlowState.classList.add('supersonic');
  } else {
    els.bundleFlowState.innerHTML = '<span></span>Escoando';
  }
  els.bundleTotalFlow.textContent = formatValue(fromSI(qTotal, 'flowRate'), 3);
  updateUnitDisplay(els.bundleTotalFlowUnit, 'flowRate');
  els.bundlePressure.textContent = formatValue(fromSI(dpTotal, 'pressure'), 3);
  updateUnitDisplay(els.bundlePressureUnit, 'pressure');
  els.bundleDuctCountDisplay.textContent = String(geom.N);
  els.bundlePorosityDisplay.textContent = `${formatValue(geom.porosity * 100, 1)} %`;
  els.bundleEnvelopeRadius.textContent = formatValue(fromSI(geom.R_env, 'length'), 3);
  updateUnitDisplay(els.bundleEnvelopeRadiusUnit, 'length');
  els.bundleDuctVelocity.textContent = formatValue(fromSI(data.meanVelocity, 'velocity'), 3);
  updateUnitDisplay(els.bundleDuctVelocityUnit, 'velocity');
  els.bundleWallStress.textContent = formatValue(fromSI(data.tauW, 'pressure'), 3);
  els.bundlePlasticityIndex.textContent = params.tau0 > 0 ? formatValue(data.Pl, 4) : '0';
  els.bundleReynoldsHbe.textContent = formatValue(diag.reHbe, 2);
  els.bundleMach.textContent = formatValue(diag.mach, 3);
  if (els.bundleWarning) {
    if (geom.packingWarning) {
      els.bundleWarning.textContent = 'Aviso: a porosidade solicitada excede o limite de empacotamento hexagonal (~90,7 %). O espaçamento foi ajustado para 2r.';
      els.bundleWarning.hidden = false;
    } else {
      els.bundleWarning.textContent = '';
      els.bundleWarning.hidden = true;
    }
  }
  if (els.bundlePreviewReadout) {
    els.bundlePreviewReadout.textContent = `N = ${geom.N} · φ = ${formatValue(geom.porosity * 100, 1)}% · R_env = ${formatValue(fromSI(geom.R_env, 'length'), 3)} ${getUnitLabel('length')}`;
  }
  updateBundleInputVisibility();
}

function updateBundleGeometryReadout(geom) {
  if (!geom || !els.bundlePreviewReadout) return;
  els.bundlePreviewReadout.textContent = `N = ${geom.N} · φ = ${formatValue(geom.porosity * 100, 1)}% · R_env = ${formatValue(fromSI(geom.R_env, 'length'), 3)} ${getUnitLabel('length')}`;
  if (els.bundleWarning) {
    if (geom.packingWarning) {
      els.bundleWarning.textContent = 'Aviso: a porosidade solicitada excede o limite de empacotamento hexagonal (~90,7 %). O espaçamento foi ajustado para 2r.';
      els.bundleWarning.hidden = false;
    } else {
      els.bundleWarning.textContent = '';
      els.bundleWarning.hidden = true;
    }
  }
}

function showBundleView(view) {
  bundleView = view;
  if (els.bundleGeometryPanel) els.bundleGeometryPanel.hidden = view !== 'geometry';
  if (els.bundleResultPanel) els.bundleResultPanel.hidden = view !== 'results';
}

function updateBundleButtons() {
  if (!els.generateBundleButton || !els.calculateBundleButton) return;
  const geometryReady = !!bundleGeometry;
  const resultsReady = !!bundleResult;
  els.generateBundleButton.textContent = geometryReady ? 'Geometria' : 'Gerar geometria';
  els.generateBundleButton.disabled = false;
  els.calculateBundleButton.disabled = !geometryReady;
  els.calculateBundleButton.textContent = resultsReady ? 'Resultado' : 'Calcular';
}

function markBundleGeometryDirty() {
  bundleGeometry = null;
  bundleResult = null;
  showBundleView(null);
  updateBundleButtons();
}

function markBundleResultsDirty() {
  bundleResult = null;
  if (bundleView === 'results') showBundleView(null);
  updateBundleButtons();
}

function generateBundleGeometry() {
  const params = getParameters();
  bundleGeometry = getBundleGeometry(params);
  bundleResult = null;
  showBundleView('geometry');
  updateBundleGeometryReadout(bundleGeometry);
  updateBundleButtons();
  requestAnimationFrame(() => { if (bundleGeometry && els.bundleCanvas) drawBundlePreview(bundleGeometry); });
}

function calculateBundleFlow() {
  if (!bundleGeometry) return;
  const flowMode = els.flowMode.value;
  const pressureSpecMode = els.pressureSpecMode.value;
  let params = getParameters();
  syncYieldStressRange(bundleGeometry.r, params.G || defaults.pressureGradient);
  let tau0 = readYieldStress();
  let bundle = null;
  for (let iter = 0; iter < 5; iter += 1) {
    bundle = calculateBundle({ ...params, tau0 }, bundleGeometry);
    syncYieldStressRange(bundleGeometry.r, bundle.G);
    const newTau0 = readYieldStress();
    if (Math.abs(newTau0 - tau0) < 1e-12) break;
    tau0 = newTau0;
  }
  bundle = calculateBundle({ ...params, tau0 }, bundleGeometry);
  bundleResult = bundle;
  params.G = bundle.G;
  updateControls(params, { flowMode, pressureSpecMode, pressureDifference: bundle.dpTotal });
  updateBundleMetrics(bundle);
  updateBundleButtons();
  showBundleView('results');
}

function drawBundlePreview(geom) {
  if (!geom || !geom.N || !els.bundleCanvas) return;
  const { ctx, width, height } = setupCanvas(els.bundleCanvas);
  ctx.clearRect(0, 0, width, height);
  const r = geom.r;
  const R_env = geom.R_env;
  const centers = geom.centers;
  const visibleCenters = centers.filter((c) => Math.hypot(c.x, c.y) + r <= R_env + 1e-12);
  const maxExtent = Math.max(R_env, ...centers.map((c) => Math.hypot(c.x, c.y) + r));
  const margin = 18;
  const available = Math.min(width, height) - 2 * margin;
  if (available <= 0) return;
  const scale = available / (2 * maxExtent);
  const cx = width / 2;
  const cy = height / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, R_env * scale, 0, Math.PI * 2);
  ctx.strokeStyle = css('--border');
  ctx.lineWidth = scaledLineWidth(1.5);
  ctx.stroke();

  const rPx = r * scale;
  if (geom.N > 2000 || rPx < 0.5) {
    const path = new Path2D();
    if (rPx < 0.5) {
      visibleCenters.forEach((c) => {
        const x = cx + c.x * scale;
        const y = cy + c.y * scale;
        path.rect(x - 0.5, y - 0.5, 1, 1);
      });
    } else {
      visibleCenters.forEach((c) => {
        const x = cx + c.x * scale;
        const y = cy + c.y * scale;
        path.moveTo(x + rPx, y);
        path.arc(x, y, rPx, 0, Math.PI * 2);
      });
    }
    ctx.fillStyle = css('--cyan');
    ctx.globalAlpha = 0.35;
    ctx.fill(path);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = css('--cyan');
    visibleCenters.forEach((c) => {
      const x = cx + c.x * scale;
      const y = cy + c.y * scale;
      ctx.beginPath();
      ctx.arc(x, y, rPx, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function toggleDuctMode() {
  const mode = els.ductMode.value;
  const isNH = mode === 'nonHomogeneous';
  const isBundle = mode === 'bundle';
  els.radiusField.hidden = isNH;
  els.tubeLengthField.hidden = isNH;
  els.nonHomogeneousGeometry.hidden = !isNH;
  els.bundleGeometry.hidden = !isBundle;
  els.homogeneousDashboard.hidden = isNH || isBundle;
  els.nonHomogeneousDashboard.hidden = !isNH;
  els.bundleDashboard.hidden = !isBundle;
  els.geometryUnitLabel.textContent = getUnitLabel('length');
  if (isNH) {
    els.yieldStress.disabled = true;
    els.yieldStressNumber.max = '1e12';
    if (els.yieldStressMax) els.yieldStressMax.textContent = '';
    if (!nhGeometry) generateGeometry();
    else { showNHVisual(nhView || 'profile'); }
  } else if (isBundle) {
    els.yieldStress.disabled = false;
    updateBundleInputVisibility();
    refresh();
    if (bundleGeometry) showBundleView(bundleView || 'geometry');
  } else {
    els.yieldStress.disabled = false;
    drawProfileChart();
    drawFlow();
  }
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
    mu: Math.min(10, Math.max(0.001, readPositive(els.viscosityNumber, defaults.viscosity))),
    H: Math.min(100, Math.max(0.001, readPositive(els.consistencyNumber, defaults.consistency))),
    n: Math.min(1.8, Math.max(0.2, Number(els.flowIndexNumber.value) || defaults.flowIndex)),
    tau0: Math.max(0, Number(els.yieldStressNumber.value) || 0)
  };
}

function flowRateAnalytic(tauW, params) {
  const R = params.R;
  if (!Number.isFinite(tauW) || tauW <= 0 || !Number.isFinite(R) || R <= 0) return 0;
  const n = params.model === 'newtonian' || params.model === 'bingham' ? 1 : Math.max(0.2, Number(params.n) || 1);
  const K = params.model === 'newtonian' || params.model === 'bingham' ? params.mu : params.H;
  const tau0 = params.model === 'bingham' || params.model === 'herschelBulkley' ? params.tau0 : 0;
  if (tauW <= tau0) return 0;
  if (K <= 0) return 0;

  const base = Math.PI * Math.pow(R, 3) * Math.pow(tauW / K, 1 / n);
  const Pl = tau0 / tauW;
  const o = 1 - Pl;
  const a = 1 / n + 3;
  const b = 1 / n + 2;
  const c = 1 / n + 1;
  const bracket = Math.pow(o, a) / a + 2 * Pl * Math.pow(o, b) / b + Pl * Pl * Math.pow(o, c) / c;
  return base * bracket;
}

function flowRateAtG(G, params) {
  const R = params.R;
  if (!Number.isFinite(G) || G <= 0 || !Number.isFinite(R) || R <= 0) return 0;
  const tauW = (G * R) / 2;
  return flowRateAnalytic(tauW, params);
}

function computeDiagnostics(data, params) {
  const V = data.meanVelocity;
  const D = 2 * params.R;
  const n = params.model === 'newtonian' || params.model === 'bingham' ? 1 : Math.max(0.2, Number(params.n) || 1);
  const K = params.model === 'newtonian' || params.model === 'bingham' ? params.mu : params.H;
  const tau0 = params.model === 'bingham' || params.model === 'herschelBulkley' ? params.tau0 : 0;

  const mach = params.soundSpeed > 0 ? V / params.soundSpeed : 0;
  const gammaAppw = V > 0 && D > 0 ? (8 * V) / D : 0;
  const tauApparent = tau0 + K * Math.pow(gammaAppw, n);
  const m = tauApparent > 0 ? (n * K * Math.pow(gammaAppw, n)) / tauApparent : (n > 0 ? n : 1);
  const mClamped = Number.isFinite(m) && m > 0 ? m : (n > 0 ? n : 1);

  const mForRe = Number.isFinite(m) && m > 0 ? m : (n > 0 ? n : 1);
  let reHbe = 0;
  if (V > 0 && D > 0) {
    const mFactor = (3 * mForRe + 1) / (4 * mForRe);
    const denomHbe = (tau0 / 8) * Math.pow(D / V, n) + K * Math.pow(mFactor, n) * Math.pow(8, n - 1);
    if (Number.isFinite(denomHbe) && denomHbe > 0) {
      reHbe = (params.density * Math.pow(V, 2 - n) * Math.pow(D, n)) / denomHbe;
    }
  }

  const fDarcy = darcyFrictionFactor(reHbe, mClamped);
  const dpDW = (fDarcy > 0 && D > 0)
    ? fDarcy * (params.tubeLength / D) * (params.density * V * V / 2)
    : 0;

  return { V, mach, gammaAppw, m, mClamped, reHbe, fDarcy, dpDW };
}

function dpEffective(params, data, diag) {
  if (diag.reHbe <= 2100) return data.G * params.tubeLength;
  return diag.dpDW;
}

function estimateGForQ(targetQ, params) {
  const R = params.R;
  const tau0 = params.model === 'bingham' || params.model === 'herschelBulkley' ? params.tau0 : 0;
  const thresholdG = tau0 > 0 ? (2 * tau0) / R : 0;
  if (targetQ <= 0) return thresholdG;
  const n = Math.max(0.2, Number(params.n) || 1);
  const K = params.model === 'newtonian' || params.model === 'bingham' ? params.mu : params.H;
  let flowG = 0;
  if (params.model === 'newtonian' || params.model === 'bingham') {
    flowG = (8 * K * targetQ) / (Math.PI * R ** 4);
  } else if (params.model === 'powerLaw' || params.model === 'herschelBulkley') {
    const exponent = (3 * n + 1) / n;
    flowG = 2 * K * ((targetQ * (3 * n + 1)) / (Math.PI * n * R ** exponent)) ** n;
  }
  return thresholdG + flowG;
}

function solveForG(targetQ, params, tolerance = 1e-6, hint = null) {
  if (!Number.isFinite(targetQ) || targetQ <= 0) return 0;
  const hasYield = params.model === 'bingham' || params.model === 'herschelBulkley';
  const minG = hasYield && params.tau0 > 0 ? (2 * params.tau0) / params.R : 0;
  if (flowRateAtG(minG, params) >= targetQ) return minG;

  let lo = minG;
  const start = Number.isFinite(hint) ? hint : (Number(params.G) || defaults.pressureGradient);
  let hi = Math.max(minG + 1, estimateGForQ(targetQ, params), start);
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
    if (hi - lo < tolerance * hi) break;
  }
  return (lo + hi) / 2;
}

function thresholdPressure(baseParams, subsections) {
  const tau0 = baseParams.model === 'bingham' || baseParams.model === 'herschelBulkley' ? baseParams.tau0 : 0;
  if (!tau0) return 0;
  return subsections.reduce((sum, s) => sum + (2 * tau0 / s.r) * s.dx, 0);
}

function estimateFlowRateForPressure(targetP, baseParams, subsections) {
  if (targetP <= 0) return 0;
  const tau0 = baseParams.model === 'bingham' || baseParams.model === 'herschelBulkley' ? baseParams.tau0 : 0;
  const thresholdP = tau0 > 0 ? subsections.reduce((sum, s) => sum + (2 * tau0 / s.r) * s.dx, 0) : 0;
  if (targetP <= thresholdP) return 0;
  const n = Math.max(0.2, Number(baseParams.n) || 1);
  const K = baseParams.model === 'newtonian' || baseParams.model === 'bingham' ? baseParams.mu : baseParams.H;
  const effectiveP = Math.max(0, targetP - thresholdP);
  if (baseParams.model === 'newtonian' || baseParams.model === 'bingham') {
    const denom = (8 * K / Math.PI) * subsections.reduce((sum, s) => sum + s.dx / (s.r ** 4), 0);
    return denom > 0 ? effectiveP / denom : 0;
  }
  const exponent = 3 * n + 1;
  const sum = subsections.reduce((sum, s) => sum + s.dx / (s.r ** exponent), 0);
  if (sum <= 0) return 0;
  return (Math.PI * n / (3 * n + 1)) * Math.pow(effectiveP / (2 * K * sum), 1 / n);
}

function pressureDropForQ(Q, baseParams, s, tolerance = 1e-5, hint = null) {
  const R = Math.max(1e-6, s.r);
  const dx = s.dx;
  const params = { ...baseParams, R, tubeLength: dx };
  const G = solveForG(Q, params, tolerance, hint);
  const V = Q / (Math.PI * R * R);
  const data = { G, meanVelocity: V };
  const d = computeDiagnostics(data, params);
  return { dp: dpEffective(params, data, d), G, reHbe: d.reHbe, mach: d.mach };
}

function totalPressureForQ(Q, baseParams, subsections, tolerance = 1e-5, hintArray = null) {
  let total = 0;
  let lastG = baseParams.pressureGradient;
  for (let i = 0; i < subsections.length; i += 1) {
    const s = subsections[i];
    const hint = hintArray && Number.isFinite(hintArray[i]) ? hintArray[i] : lastG;
    const r = pressureDropForQ(Q, baseParams, s, tolerance, hint);
    total += r.dp;
    lastG = r.G;
    if (hintArray) hintArray[i] = r.G;
  }
  return total;
}

function solveGlobalQ(targetP, baseParams, subsections) {
  if (!Number.isFinite(targetP) || targetP <= 0 || subsections.length === 0) return 0;
  const thresholdP = thresholdPressure(baseParams, subsections);
  if (targetP <= thresholdP) return 0;
  const Qest = estimateFlowRateForPressure(targetP, baseParams, subsections);
  const hintArray = new Array(subsections.length);
  let lo = 0;
  let pLo = thresholdP;
  let hi = Math.max(Qest * 2, 1e-12);
  let pHi = totalPressureForQ(hi, baseParams, subsections, 1e-5, hintArray);
  for (let safety = 0; safety < 30; safety += 1) {
    if (pHi >= targetP || !Number.isFinite(pHi) || hi > 1e12) break;
    hi *= 2;
    pHi = totalPressureForQ(hi, baseParams, subsections, 1e-5, hintArray);
  }
  if (!Number.isFinite(pHi) || pHi < targetP) return hi;
  let fLo = pLo - targetP;
  let fHi = pHi - targetP;
  let Q = hi;
  for (let i = 0; i < 40; i += 1) {
    const newQ = hi - fHi * (hi - lo) / (fHi - fLo);
    const newP = totalPressureForQ(newQ, baseParams, subsections, 1e-5, hintArray);
    const newF = newP - targetP;
    Q = newQ;
    if (Math.abs(newF) < 1e-5 * Math.max(1, targetP) || Math.abs(hi - lo) < 1e-7 * hi) break;
    if (newF * fHi < 0) {
      lo = hi;
      fLo = fHi;
      hi = newQ;
      fHi = newF;
    } else {
      hi = newQ;
      fHi = newF;
      fLo *= 0.5;
    }
  }
  return Q;
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

  const flowRate = flowRateAnalytic(tauW, params);
  const meanVelocity = flowRate / (Math.PI * R * R);
  const wallShearRate = flowing ? samples[samples.length - 1].shearRate : 0;

  return { params, G, tauW, tau0, flowing, Pl, Rp, samples, maxVelocity, meanVelocity, flowRate, wallShearRate };
}

// Darcy friction factor from Madlener et al. (2009): laminar f_D = 64/Re,
// turbulent via the Dodge–Metzner (1959) correlation (converted from Fanning
// to Darcy form) using the local flow-behavior index m. The implicit equation
//   1/sqrt(f_D) = (2/m^0.75) * log10[ Re * (f_D/4)^(1 - m/2) ] - 0.2/m^1.2
// is solved by fixed-point iteration on y = 1/sqrt(f_D). For m = 1 the
// expression reduces to the Prandtl–Nikuradse smooth-pipe equation.
function darcyFrictionTurbulent(re, m) {
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

function darcyFrictionFactor(re, m) {
  if (!Number.isFinite(re) || re <= 0) return 0;
  const fLam = 64 / re;
  if (re <= 2100) return fLam;
  if (re >= 3000) return darcyFrictionTurbulent(re, m);
  const w = (re - 2100) / 900;
  return (1 - w) * fLam + w * darcyFrictionTurbulent(re, m);
}

function formatValue(value, digits = 3) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 10000 || abs < 0.001)) return value.toExponential(displaySciDigits).replace('.', ',');
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

function formatNumeric(value) {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs < 1e-6) return String(value.toPrecision(6));
  return String(Number(value.toFixed(10)));
}

function formatDisplay(value, dimension, digits = 3) {
  return `${formatValue(fromSI(value, dimension), digits)} ${getUnitLabel(dimension)}`;
}

function updateRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const denom = max - min;
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || denom === 0) return;
  const progress = (value - min) / denom * 100;
  input.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, progress))}%`);
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
    markResultsDirty();
  });
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    if (!Number.isFinite(v)) return;
    numberInput.value = String(isLog ? 10 ** v : v);
    markResultsDirty();
  });
}

function clampOnBlur(input, isLog = false) {
  if (!input) return;
  input.addEventListener('blur', () => {
    const raw = Number(input.value);
    if (!Number.isFinite(raw) || input.value === '') return;
    const min = Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    let v = raw;
    if (isLog) {
      if (v <= 0 || min <= 0 || max <= 0) return;
      const logMin = Math.log10(min);
      const logMax = Math.log10(max);
      v = 10 ** Math.max(logMin, Math.min(logMax, Math.log10(v)));
    } else {
      if (Number.isFinite(min) && v < min) v = min;
      if (Number.isFinite(max) && v > max) v = max;
    }
    if (v !== raw) {
      input.value = String(v);
      input.classList.add('invalid');
      setTimeout(() => input.classList.remove('invalid'), 400);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
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
  const yieldMin = Number(els.yieldStress.min);
  const yieldMax = els.yieldStress.max === '' ? Infinity : Number(els.yieldStress.max);
  els.yieldStress.value = String(Math.max(yieldMin, Math.min(yieldMax, params.tau0)));
  [els.viscosity, els.consistency, els.flowIndex, els.yieldStress].forEach(updateRange);

  els.viscosityOutput.textContent = `${formatValue(params.mu, 4)} Pa·s`;
  els.consistencyOutput.textContent = `${formatValue(params.H, 4)} Pa·sⁿ`;
  els.flowIndexOutput.textContent = formatValue(params.n, 2);
  els.yieldStressOutput.textContent = `${formatValue(params.tau0, 1)} Pa`;

  setInputValue(els.radius, fromSI(params.R, 'length'));
  setInputValue(els.tubeLength, fromSI(params.tubeLength, 'length'));
  setInputValue(els.density, fromSI(params.density, 'density'));
  setInputValue(els.soundSpeed, fromSI(params.soundSpeed, 'velocity'));

  if (els.ductMode.value !== 'nonHomogeneous') {
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
}

function updateMetrics(data, mode = {}) {
  const params = data.params;
  const d = computeDiagnostics(data, params);
  const dp = dpEffective(params, data, d);
  const dpMethod = d.reHbe <= 2100 ? 'laminar exato' : 'Dodge–Metzner turbulento';

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
  els.pressureDifferenceOutput.textContent = formatValue(fromSI(dp, 'pressure'), 3);
  els.localGradient.textContent = formatValue(d.m, 4);
  els.reynoldsHbeNumber.textContent = formatValue(d.reHbe, 2);
  els.darcyFriction.textContent = formatValue(d.fDarcy, 5);
  els.darcyWeisbachPressure.textContent = formatValue(fromSI(dp, 'pressure'), 3);
  if (els.dpMethod) els.dpMethod.textContent = `(${dpMethod})`;
  els.machNumber.textContent = formatValue(d.mach, 3);
  els.legendMax.innerHTML = `<span class="math">U<sub>max</sub></span> = ${formatValue(fromSI(data.maxVelocity, 'velocity'))} ${getUnitLabel('velocity')}`;

  const flowing = data.flowing && data.maxVelocity > 0;
  const turbulent = d.reHbe > 2100;
  const supersonic = d.mach > 1;
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

function refreshDisplays() {
  if (result) {
    updateMetrics(result, { pressureDifference: result.params.G * result.params.tubeLength });
    updateEquation(result);
    drawProfileChart();
  }
  if (nhGeometry) {
    updateNonHomogeneousMetrics();
    if (nhView === 'profile') drawDuctProfile();
    else drawDuctFlow(0);
  }
}

let typesetTimeout;
function typesetEquations() {
  if (!window.MathJax || !window.MathJax.typesetPromise) return;
  const nodes = [els.equation, els.wallStressEquation, els.wallShearRateEquation, els.flowRateEquation, els.localGradientEquation, els.reynoldsHbeEquation, els.darcyFrictionEquation, els.darcyWeisbachEquation, els.equationVars];
  if (window.MathJax.typesetClear) window.MathJax.typesetClear(nodes);
  window.MathJax.typesetPromise(nodes).catch(() => {});
}
function debouncedTypesetEquations() {
  clearTimeout(typesetTimeout);
  typesetTimeout = setTimeout(typesetEquations, 150);
}

function updateEquation(data) {
  const { model, R, mu, H, n, G } = data.params;
  const commonWallStress = String.raw`\[G\equiv-\frac{dp}{dz}>0,\qquad \tau_w=\tau(R)=-\frac{R}{2}\frac{dp}{dz}=\frac{G R}{2}=\frac{${formatValue(G, 2)}\,${formatValue(R, 4)}}{2}=${formatValue(data.tauW, 3)}\ \mathrm{Pa}\]`;
  els.wallStressEquation.textContent = commonWallStress;

  if (model === 'newtonian') {
    els.equation.textContent = String.raw`\[\tau_{rz}=\mu\frac{dU_z}{dr},\qquad U_z(r)=\frac{G}{4\mu}\left(R^2-r^2\right),\quad 0\le r\le R\]`;
    els.flowRateEquation.textContent = String.raw`\[Q=2\pi\int_0^R U_z(r)\,r\,dr=\frac{\pi G R^4}{8\mu}\]`;
    els.wallShearRateEquation.textContent = String.raw`\[\dot{\gamma}_w=\frac{8\bar{u}}{D}=\frac{\tau_w}{\mu}=${formatValue(data.wallShearRate, 3)}\ \mathrm{s^{-1}}\]`;
    els.equationVars.textContent = String.raw`\(\mu=${formatValue(mu, 4)}\ \mathrm{Pa\,s},\quad G=${formatValue(G, 2)}\ \mathrm{Pa\,m^{-1}},\quad R=${formatValue(R, 4)}\ \mathrm{m},\quad Q=${formatValue(data.flowRate, 4)}\ \mathrm{m^3\,s^{-1}}\)`;
  } else if (model === 'powerLaw') {
    els.equation.textContent = String.raw`\[\tau_{rz}=-H\left(-\frac{dU_z}{dr}\right)^n,\qquad U_z(r)=\frac{nR}{n+1}\left(\frac{\tau_w}{H}\right)^{1/n}\left[1-\left(\frac rR\right)^{(n+1)/n}\right]\]`;
    els.flowRateEquation.textContent = String.raw`\[Q=2\pi\int_0^R U_z(r)\,r\,dr=\frac{\pi nR^3}{3n+1}\left(\frac{\tau_w}{H}\right)^{1/n}\]`;
    els.wallShearRateEquation.textContent = String.raw`\[\dot{\gamma}_w=\left(\frac{\tau_w}{H}\right)^{1/n}=\frac{3n+1}{4n}\frac{8\bar{u}}{D}=${formatValue(data.wallShearRate, 3)}\ \mathrm{s^{-1}}\]`;
    els.equationVars.textContent = String.raw`\(H=${formatValue(H, 4)}\ \mathrm{Pa\,s^n},\quad n=${formatValue(n, 2)},\quad G=${formatValue(G, 2)}\ \mathrm{Pa\,m^{-1}},\quad R=${formatValue(R, 4)}\ \mathrm{m},\quad Q=${formatValue(data.flowRate, 4)}\ \mathrm{m^3\,s^{-1}}\)`;
  } else if (model === 'bingham') {
    els.equation.textContent = String.raw`\[U_z(r)=\begin{cases}\displaystyle \frac{R\tau_w}{2\mu}(1-\mathrm{Pl})^2,&0\le r\le R_p,\\[6pt]\displaystyle \frac{R\tau_w}{2\mu}\left[(1-\mathrm{Pl})^2-\left(\frac rR-\mathrm{Pl}\right)^2\right],&R_p<r\le R,\end{cases}\quad \underbrace{\mathrm{Pl}=\frac{R_p}{R}=\frac{\tau_0}{\tau_w}}_{\text{índice de plasticidade}}\]`;
    els.flowRateEquation.textContent = String.raw`\[Q=2\pi\left[\int_0^{R_p}U_p r\,dr+\int_{R_p}^{R}U_z(r)r\,dr\right]=\frac{\pi G R^4}{8\mu}\left(1-\frac{4\mathrm{Pl}}{3}+\frac{\mathrm{Pl}^4}{3}\right)\]`;
    els.wallShearRateEquation.textContent = String.raw`\[\dot{\gamma}_w=\frac{\tau_w-\tau_0}{\mu}=${formatValue(data.wallShearRate, 3)}\ \mathrm{s^{-1}}\]`;
    els.equationVars.textContent = String.raw`\(\mu=${formatValue(mu, 4)}\ \mathrm{Pa\,s},\quad \tau_0=${formatValue(data.tau0, 3)}\ \mathrm{Pa},\quad \mathrm{Pl}=${formatValue(data.Pl, 4)},\quad R_p=${formatValue(data.Rp, 5)}\ \mathrm{m},\quad Q=${formatValue(data.flowRate, 4)}\ \mathrm{m^3\,s^{-1}}\)`;
  } else {
    els.equation.textContent = String.raw`\[U_z(r)=\begin{cases}\displaystyle \frac{nR}{n+1}\left(\frac{\tau_w}{H}\right)^{1/n}(1-\mathrm{Pl})^{(n+1)/n},&0\le r\le R_p,\\[6pt]\displaystyle \frac{nR}{n+1}\left(\frac{\tau_w}{H}\right)^{1/n}\left[(1-\mathrm{Pl})^{(n+1)/n}-\left(\frac rR-\mathrm{Pl}\right)^{(n+1)/n}\right],&R_p<r\le R,\end{cases}\quad \underbrace{\mathrm{Pl}=\frac{R_p}{R}=\frac{\tau_0}{\tau_w}}_{\text{índice de plasticidade}}\]`;
    els.flowRateEquation.textContent = String.raw`\[Q=\pi R^3\left(\frac{\tau_w}{H}\right)^{1/n}\left[\frac{(1-\mathrm{Pl})^{1/n+3}}{1/n+3}+\frac{2\mathrm{Pl}(1-\mathrm{Pl})^{1/n+2}}{1/n+2}+\frac{\mathrm{Pl}^2(1-\mathrm{Pl})^{1/n+1}}{1/n+1}\right]\]`;
    els.wallShearRateEquation.textContent = String.raw`\[\dot{\gamma}_w=\left(\frac{\tau_w-\tau_0}{H}\right)^{1/n}=${formatValue(data.wallShearRate, 3)}\ \mathrm{s^{-1}}\]`;
    els.equationVars.textContent = String.raw`\(H=${formatValue(H, 4)}\ \mathrm{Pa\,s^n},\quad n=${formatValue(n, 2)},\quad \tau_0=${formatValue(data.tau0, 3)}\ \mathrm{Pa},\quad \mathrm{Pl}=${formatValue(data.Pl, 4)},\quad R_p=${formatValue(data.Rp, 5)}\ \mathrm{m},\quad Q=${formatValue(data.flowRate, 4)}\ \mathrm{m^3\,s^{-1}}\)`;
  }
  els.localGradientEquation.textContent = String.raw`\[\dot{\gamma}_{\mathrm{appw}}=\frac{8\bar{u}}{D},\qquad m=\frac{nK\left(\frac{8\bar{u}}{D}\right)^n+\eta_\infty\left(\frac{8\bar{u}}{D}\right)}{\tau_0+K\left(\frac{8\bar{u}}{D}\right)^n+\eta_\infty\left(\frac{8\bar{u}}{D}\right)}\quad\Rightarrow\quad \eta_\infty=0:\ m=\frac{nK\left(\frac{8\bar{u}}{D}\right)^n}{\tau_0+K\left(\frac{8\bar{u}}{D}\right)^n}\]`;
  els.reynoldsHbeEquation.textContent = String.raw`\[\mathrm{Re}_{\mathrm{gen\,HBE}}=\frac{\rho\bar{u}^{2-n}D^n}{\frac{\tau_0}{8}\left(\frac{D}{\bar{u}}\right)^n+K\left(\frac{3m+1}{4m}\right)^n8^{n-1}+\eta_\infty\left(\frac{3m+1}{4m}\right)\left(\frac{D}{\bar{u}}\right)^{n-1}}\quad(\eta_\infty=0)\]`;
  els.darcyFrictionEquation.textContent = String.raw`\[f_{\mathrm{Darcy}}=\begin{cases}\displaystyle\frac{64}{\mathrm{Re}_{\mathrm{gen\,HBE}}},&\mathrm{Re}_{\mathrm{gen\,HBE}}\le 2100\quad(\text{laminar})\\[6pt]\displaystyle(1-w)\frac{64}{\mathrm{Re}_{\mathrm{gen\,HBE}}}+w\,f_{\mathrm{DM}},&2100<\mathrm{Re}_{\mathrm{gen\,HBE}}<3000,\ w=\frac{\mathrm{Re}_{\mathrm{gen\,HBE}}-2100}{900}\\[6pt]\displaystyle\frac{1}{\sqrt{f_{\mathrm{Darcy}}}}=\frac{2}{m^{0{,}75}}\log_{10}\!\left[\mathrm{Re}_{\mathrm{gen\,HBE}}\left(\frac{f_{\mathrm{Darcy}}}{4}\right)^{1-m/2}\right]-\frac{0{,}2}{m^{1{,}2}},&\mathrm{Re}_{\mathrm{gen\,HBE}}\ge 3000\quad(\text{Dodge--Metzner})\end{cases}\]`;
  els.darcyWeisbachEquation.textContent = String.raw`\[\Delta p_{\mathrm{DW}}=f_{\mathrm{Darcy}}\,\frac{L}{D}\,\frac{\rho\bar{u}^2}{2}\]`;
  debouncedTypesetEquations();
}

function setupCanvas(canvas) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  if (canvas._rheoRatio !== ratio) canvas._rheoRect = null;
  if (!canvas._rheoRect) {
    canvas._rheoRect = canvas.getBoundingClientRect();
    canvas._rheoRatio = ratio;
  }
  const rect = canvas._rheoRect;
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
  if (els.ductMode.value === 'nonHomogeneous') {
    if (nhView === 'flow') drawDuctFlow(delta);
  } else {
    drawFlow(delta);
  }
  animationFrame = requestAnimationFrame(animate);
}

function refresh() {
  const flowMode = els.flowMode.value;
  const pressureSpecMode = els.pressureSpecMode.value;
  const ductMode = els.ductMode.value;
  if (ductMode === 'nonHomogeneous') {
    updateControls(getParameters(), { flowMode, pressureSpecMode });
    if (nhGeometry) showNHVisual(nhView || 'profile');
    return;
  }
  let params = getParameters();

  if (ductMode === 'bundle') {
    updateControls(getParameters(), { flowMode, pressureSpecMode });
    updateBundleInputVisibility();
    updateBundleButtons();
    if (bundleGeometry) {
      drawBundlePreview(bundleGeometry);
      updateBundleGeometryReadout(bundleGeometry);
    }
    return;
  }

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

  result = calculate(params);
  const diag = computeDiagnostics(result, result.params);
  const pressureDifference = dpEffective(result.params, result, diag);
  updateControls(params, { flowMode, pressureSpecMode, pressureDifference });
  updateMetrics(result, { flowMode, pressureSpecMode });
  updateEquation(result);
  if (ductMode === 'nonHomogeneous') {
    if (nhGeometry) {
      drawDuctProfile();
      drawDuctFlow();
    }
  } else {
    drawProfileChart();
    drawFlow();
  }
}

function exportCsv() {
  if (els.ductMode.value === 'nonHomogeneous') {
    if (!nhGeometry || !nhGeometry.sectionResults) return;
    const rows = ['x_m,dx_m,r_m,velocity_m_per_s,re_hbe,dp_Pa'];
    nhGeometry.sectionResults.forEach((sr, i) => {
      const s = nhGeometry.subsections[i];
      rows.push([(s ? s.xCenter : ''), sr.dx, sr.data.params.R, sr.data.meanVelocity, sr.reHbe, sr.dp].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rheoflow-nh-${nhGeometry.sectionResults.length}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  if (els.ductMode.value === 'bundle') {
    if (!bundleResult) return;
    const { geom, qTotal, data } = bundleResult;
    const rows = [
      `# bundle: N=${geom.N}, porosity=${geom.porosity.toExponential(6)}, A_total_m2=${geom.A_total.toExponential(6)}, Q_total_m3s=${qTotal.toExponential(6)}`,
      'r_m,r_over_R,velocity_m_per_s,shear_stress_Pa,shear_rate_per_s'
    ];
    data.samples.forEach((p) => rows.push([p.r, p.x, p.velocity, p.stress, p.shearRate].join(',')));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rheoflow-bundle-${geom.N}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
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
  units.velocity = 'm/s';
  units.flowRate = 'm3/d';
  units.density = 'kg/m3';
  units.area = 'm2';
  updateUnitSelects();
  const md = getModelDefaults(defaults.model);
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
  els.viscosity.value = Math.log10(md.viscosity);
  els.viscosityNumber.value = md.viscosity;
  els.consistency.value = Math.log10(md.consistency);
  els.consistencyNumber.value = md.consistency;
  els.flowIndex.value = md.flowIndex;
  els.flowIndexNumber.value = md.flowIndex;
  els.yieldStress.value = md.yieldStress;
  els.yieldStressNumber.value = md.yieldStress;
  [els.showVelocity, els.showStress, els.showPlug, els.showParticles].forEach((input) => { input.checked = true; });
  [els.viscosity, els.consistency, els.flowIndex, els.yieldStress].forEach(updateRange);
  els.ductMode.value = 'homogeneous';
  els.geometryInput.value = '';
  els.geometryInput.classList.remove('invalid');
  els.subdivisionsInput.value = 20;
  els.profileMode.value = 'linear';
  els.bundleInputMode.value = 'count';
  els.bundleDuctCount.value = defaults.bundleDuctCount;
  els.bundlePorosityInput.value = defaults.bundlePorosity;
  els.bundleTotalAreaInput.value = Number(defaults.bundleTotalArea.toFixed(6));
  bundleGeometry = null;
  bundleResult = null;
  nhGeometry = null;
  nhPaused = false;
  els.nhPauseButton.classList.remove('paused');
  els.nhAnimationLabel.textContent = 'Animação ativa';
  toggleDuctMode();
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
  requestAnimationFrame(() => {
    if (els.ductMode.value === 'nonHomogeneous') { drawDuctProfile(); drawDuctFlow(); }
    else if (els.ductMode.value === 'bundle') { if (bundleResult) drawBundlePreview(bundleResult.geom); }
    else { drawProfileChart(); drawFlow(); }
  });
}

function setFontSize(value) {
  document.documentElement.dataset.fontSize = value;
  fontScale = value === 'default' ? 1 : value === 'large' ? 1.15 : 1.3;
  if (els.ductMode.value === 'nonHomogeneous') {
    drawDuctProfile(); drawDuctFlow();
  } else if (els.ductMode.value === 'bundle') {
    if (bundleGeometry) drawBundlePreview(bundleGeometry);
  } else {
    drawProfileChart(); drawFlow();
  }
}

function setLineWidth(value) {
  document.documentElement.dataset.lineWidth = value;
  lineWidthScale = value === 'default' ? 1 : value === 'thick' ? 1.5 : 2;
  if (els.ductMode.value === 'nonHomogeneous') {
    drawDuctProfile(); drawDuctFlow();
  } else if (els.ductMode.value === 'bundle') {
    if (bundleGeometry) drawBundlePreview(bundleGeometry);
  } else {
    drawProfileChart(); drawFlow();
  }
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
  if (els.geometryUnitLabel) els.geometryUnitLabel.textContent = getUnitLabel('length');
}

function applyUnits(oldUnits = {}) {
  const newUnits = { pressure: units.pressure, length: units.length, velocity: units.velocity, flowRate: units.flowRate, density: units.density, area: units.area };
  Object.assign(units, oldUnits);
  const toSIInput = (input, dimension) => {
    if (!input) return undefined;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return undefined;
    return toSI(value, dimension);
  };
  const si = {
    radius: toSIInput(els.radius, 'length'),
    tubeLength: toSIInput(els.tubeLength, 'length'),
    density: toSIInput(els.density, 'density'),
    soundSpeed: toSIInput(els.soundSpeed, 'velocity'),
    pressureGradient: toSIInput(els.pressureGradientInput, 'pressureGradient'),
    pressureDifference: toSIInput(els.pressureDifference, 'pressure'),
    flowRate: toSIInput(els.flowRateInput, 'flowRate'),
    bundleTotalArea: toSIInput(els.bundleTotalAreaInput, 'area')
  };
  Object.assign(units, newUnits);
  updateUnitSelects();
  if (si.radius !== undefined) setInputValue(els.radius, fromSI(si.radius, 'length'));
  if (si.tubeLength !== undefined) setInputValue(els.tubeLength, fromSI(si.tubeLength, 'length'));
  if (si.density !== undefined) setInputValue(els.density, fromSI(si.density, 'density'));
  if (si.soundSpeed !== undefined) setInputValue(els.soundSpeed, fromSI(si.soundSpeed, 'velocity'));
  if (si.pressureGradient !== undefined) setInputValue(els.pressureGradientInput, fromSI(si.pressureGradient, 'pressureGradient'));
  if (si.pressureDifference !== undefined) setInputValue(els.pressureDifference, fromSI(si.pressureDifference, 'pressure'));
  if (si.flowRate !== undefined) setInputValue(els.flowRateInput, fromSI(si.flowRate, 'flowRate'));
  if (si.bundleTotalArea !== undefined) setInputValue(els.bundleTotalAreaInput, fromSI(si.bundleTotalArea, 'area'));

  if (els.ductMode.value === 'nonHomogeneous' && nhGeometry) {
    const lines = nhGeometry.points.map((p) => `${formatNumeric(fromSI(p.x, 'length'))} ${formatNumeric(fromSI(p.r, 'length'))}`);
    els.geometryInput.value = lines.join('\n');
    generateGeometry();
    if (nhGeometry) calculateNonHomogeneous();
  }
  if (els.ductMode.value === 'bundle' && bundleGeometry) {
    generateBundleGeometry();
    if (bundleGeometry) calculateBundleFlow();
  }
  refresh();
}

function setupUnits() {
  updateUnitSelects();
  $$('.unit-select').forEach((select) => {
    select.addEventListener('change', () => {
      const dimension = select.dataset.dimension;
      if (!dimension || !units[dimension]) return;
      const oldUnits = { pressure: units.pressure, length: units.length, velocity: units.velocity, flowRate: units.flowRate, density: units.density, area: units.area };
      units[dimension] = select.value;
      applyUnits(oldUnits);
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
clampOnBlur(els.viscosityNumber, true);
syncSliderAndNumber(els.consistencyNumber, els.consistency, true);
clampOnBlur(els.consistencyNumber, true);
syncSliderAndNumber(els.flowIndexNumber, els.flowIndex, false);
clampOnBlur(els.flowIndexNumber, false);
syncSliderAndNumber(els.yieldStressNumber, els.yieldStress, false);
clampOnBlur(els.yieldStressNumber, false);

[els.radius, els.tubeLength, els.pressureGradientInput, els.pressureDifference, els.flowRateInput, els.density, els.soundSpeed].forEach((input) => clampOnBlur(input, false));

$$('input, select:not(.unit-select)').forEach((input) => {
  input.addEventListener('input', () => {
    if (els.ductMode.value === 'bundle') {
      if (input === els.bundleDuctCount || input === els.bundlePorosityInput || input === els.bundleTotalAreaInput || input === els.radius) {
        markBundleGeometryDirty();
      } else if (input !== els.bundleInputMode) {
        markBundleResultsDirty();
      }
    }
    refresh();
  });
});
window.addEventListener('resize', () => {
  [els.flowCanvas, els.profileCanvas, els.ductProfileCanvas, els.ductFlowCanvas, els.bundleCanvas].forEach((c) => { if (c) c._rheoRect = null; });
  if (els.ductMode.value === 'nonHomogeneous') { if (nhView === 'profile') drawDuctProfile(); else drawDuctFlow(0); }
  else if (els.ductMode.value === 'bundle') { if (bundleGeometry) drawBundlePreview(bundleGeometry); }
  else { drawProfileChart(); drawFlow(); }
});
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
  if (els.ductMode.value === 'nonHomogeneous') { drawDuctProfile(); drawDuctFlow(); }
  else if (els.ductMode.value === 'bundle') { if (bundleGeometry) drawBundlePreview(bundleGeometry); }
  else { drawProfileChart(); drawFlow(); }
});
els.resetButton.addEventListener('click', reset);
els.exportButton.addEventListener('click', exportCsv);
els.ductMode.addEventListener('change', toggleDuctMode);
els.generateGeometryButton.addEventListener('click', () => {
  if (nhGeometry && !nhGeometry.geometryDirty) showNHVisual('profile');
  else generateGeometry();
});
els.calculateDuctButton.addEventListener('click', () => {
  if (!nhGeometry || nhGeometry.geometryDirty) return;
  if (!nhGeometry.calculated || nhGeometry.resultsDirty) calculateNonHomogeneous();
  else showNHVisual('flow');
});
els.generateBundleButton.addEventListener('click', () => {
  if (bundleGeometry && bundleView !== 'geometry') showBundleView('geometry');
  else generateBundleGeometry();
});
els.calculateBundleButton.addEventListener('click', () => {
  if (!bundleGeometry) return;
  if (!bundleResult || bundleView !== 'results') calculateBundleFlow();
  else showBundleView('results');
});
els.bundleInputMode.addEventListener('change', () => { markBundleGeometryDirty(); updateBundleInputVisibility(); refresh(); });
els.geometryInput.addEventListener('input', () => {
  sanitizeGeometryInput();
  els.geometryInput.classList.remove('invalid');
  if (els.ductMode.value === 'nonHomogeneous') markGeometryDirty();
});
els.profileMode.addEventListener('change', () => { if (els.ductMode.value === 'nonHomogeneous') generateGeometry(); });
els.subdivisionsInput.addEventListener('input', () => { if (els.ductMode.value === 'nonHomogeneous') generateGeometry(); });
els.flowMode.addEventListener('change', () => { if (els.ductMode.value === 'nonHomogeneous') markResultsDirty(); else if (els.ductMode.value === 'bundle') markBundleResultsDirty(); refresh(); });
els.pressureSpecMode.addEventListener('change', () => { if (els.ductMode.value === 'nonHomogeneous') markResultsDirty(); else if (els.ductMode.value === 'bundle') markBundleResultsDirty(); refresh(); });
els.model.addEventListener('change', () => { markResultsDirty(); if (els.ductMode.value === 'bundle') markBundleResultsDirty(); });
[els.density, els.soundSpeed, els.flowRateInput, els.pressureGradientInput, els.pressureDifference, els.radius, els.tubeLength].forEach((input) => {
  input.addEventListener('input', markResultsDirty);
});
els.nhPauseButton.addEventListener('click', () => {
  nhPaused = !nhPaused;
  els.nhPauseButton.classList.toggle('paused', nhPaused);
  els.nhAnimationLabel.textContent = nhPaused ? 'Animação pausada' : 'Animação ativa';
});

document.addEventListener('click', (e) => {
  const strong = e.target.closest('strong');
  if (!strong) return;
  if (!strong.closest('.metric-card, .diagnostic-list')) return;
  if (!/[0-9]/.test(strong.textContent)) return;
  displaySciDigits = displaySciDigits === 2 ? 6 : 2;
  refreshDisplays();
});

resetParticles();
reset();
setupUnits();
setupAccessibility();
window.addEventListener('load', () => updateEquation(result));
cancelAnimationFrame(animationFrame);
animationFrame = requestAnimationFrame(animate);

if (typeof window !== 'undefined') {
  window.els = els;
  window.defaults = defaults;
}
