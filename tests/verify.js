const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

const virtualConsole = new (require('jsdom').VirtualConsole)();
virtualConsole.on('error', () => {});
virtualConsole.on('warn', () => {});

const repoRoot = path.resolve(__dirname, '..');
const htmlPath = path.join(repoRoot, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<script[^>]+src=["']https?:\/\/[^"']+["'][^>]*><\/script>/g, '');

const dom = new JSDOM(html, {
  url: 'file://' + htmlPath,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole
});

const win = dom.window;

function ready(fn) {
  if (win.document.readyState === 'complete') return fn();
  win.addEventListener('load', fn);
}

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exitCode = 1;
  }
}

ready(() => {
  process.exitCode = 0;
  const base = {
    model: 'newtonian',
    R: 0.05,
    G: 12000,
    mu: 0.001,
    H: 0.001,
    n: 0.6,
    tau0: 0,
    density: 1000,
    soundSpeed: 1500,
    tubeLength: 0.5
  };

  // Newtonian sanity: analytic velocity and flow rate.
  const data = win.calculate({ ...base });
  assert(Math.abs(data.meanVelocity - 3750) < 1e-9, 'Newtonian V = G R^2 / (8 mu)');
  assert(Math.abs(data.flowRate - Math.PI * 0.05 * 0.05 * 3750) < 1e-9, 'Newtonian Q = V A');

  // Power-law: m == n and Δp effective equals exact laminar value.
  const plParams = { ...base, model: 'powerLaw', G: 546, R: 0.05, H: 0.5, n: 0.65, tau0: 0, mu: 0.001 };
  const plData = win.calculate(plParams);
  const plD = win.computeDiagnostics(plData, plData.params);
  assert(Math.abs(plD.m - 0.65) < 1e-12, 'Power-law m == n');
  assert(Math.abs(win.dpEffective(plData.params, plData, plD) - 546 * 0.5) < 1e-9, 'Power-law laminar Δp effective');

  // Bingham Pl=0.9: Darcy-Weisbach estimate within Pl^4/4 of exact laminar Δp.
  const PlTarget = 0.9;
  const tau0b = 0.9;
  const Gb = 2 * tau0b / (0.05 * PlTarget);
  const bingParams = { ...base, model: 'bingham', mu: 0.001, tau0: tau0b, G: Gb };
  const bingData = win.calculate(bingParams);
  const bingD = win.computeDiagnostics(bingData, bingData.params);
  const dwRatio = bingD.dpDW / (bingData.G * 0.5);
  assert(Math.abs(dwRatio - 1) <= Math.pow(PlTarget, 4) / 4 + 1e-12, `Bingham Pl=0.9 dwRatio ${dwRatio} exceeds Pl^4/4`);

  // Laminar Newtonian: exact Δp effective.
  const lamV = 0.01;
  const lamG = (8 * 0.001 * lamV) / (0.05 * 0.05);
  const lam = win.calculate({ ...base, G: lamG });
  const dl = win.computeDiagnostics(lam, lam.params);
  assert(Math.abs(win.dpEffective(lam.params, lam, dl) - lamG * 0.5) < 1e-12, 'Newtonian laminar Δp effective exact');
  assert(Math.abs(dl.reHbe - 1000) < 1e-9, 'Newtonian laminar Re_HBE');

  // Turbulent Newtonian water: Δp effective ≈ Darcy-Weisbach ~45 Pa at V=1 m/s.
  const turbV = 1;
  const turbG = (8 * 0.001 * turbV) / (0.05 * 0.05);
  const turb = win.calculate({ ...base, G: turbG });
  const dt = win.computeDiagnostics(turb, turb.params);
  assert(dt.reHbe > 20000, 'Newtonian turbulent Re_HBE');
  assert(Math.abs(win.dpEffective(turb.params, turb, dt) - 45) / 45 < 0.001, 'Newtonian turbulent Δp effective ~45 Pa');

  // Transition smoothing: check continuity around Re=2100 for Newtonian water.
  const testR = 0.05;
  const testMu = 0.001;
  const testL = 0.5;
  const testRho = 1000;
  const D = 2 * testR;
  function gFromRe(re) { return (4 * testMu * testMu * re) / (testRho * testR * testR * testR); }
  const reValues = [2090, 2095, 2100, 2105, 2110];
  const dpVals = reValues.map((re) => {
    const g = gFromRe(re);
    const d = win.calculate({ ...base, G: g, R: testR });
    const diag = win.computeDiagnostics(d, d.params);
    return win.dpEffective({ ...base, G: g, R: testR, tubeLength: testL }, d, diag);
  });
  for (let i = 1; i < dpVals.length; i += 1) {
    const jump = Math.abs(dpVals[i] - dpVals[i - 1]) / Math.max(1e-12, dpVals[i - 1]);
    assert(jump < 0.02, `Transition jump too large at Re=${reValues[i]}: ${jump}`);
  }

  // Non-homogeneous pressure mode round-trip: total Δp inverts to same Q.
  const baseNH = { ...base, model: 'newtonian', G: 100, tubeLength: 10, R: 0.05 };
  const targetQ = 0.001; // m^3/s
  win.els.geometryInput.value = '0 0.05\n10 0.03';
  const points = win.parseGeometryInput();
  if (points && points.length >= 2) {
    const { subsections } = win.buildSubsections(points, 20, 'linear');
    const P = win.totalPressureForQ(targetQ, baseNH, subsections, 1e-5, null);
    const solved = win.solveGlobalQ(P, baseNH, subsections);
    assert(Math.abs(solved - targetQ) / targetQ < 1e-4, 'NH pressure-mode round-trip Q');
  }

  // PCHIP: monotone interpolation stays within knot bounds and hits knots.
  const pchipPoints = [{ x: 0, r: 0.05 }, { x: 1, r: 0.02 }, { x: 2, r: 0.04 }];
  assert(Math.abs(win.cubicInterpolate(pchipPoints, 0) - 0.05) < 1e-12, 'PCHIP hits first knot');
  assert(Math.abs(win.cubicInterpolate(pchipPoints, 2) - 0.04) < 1e-12, 'PCHIP hits last knot');
  for (let xi = 0; xi <= 2; xi += 0.01) {
    const ri = win.radiusAt(pchipPoints, xi, 'cubic');
    assert(ri >= 0.019 && ri <= 0.05, `PCHIP radius out of bounds at x=${xi}: ${ri}`);
  }

  if (process.exitCode) {
    console.error('Some assertions failed.');
  } else {
    console.log('All verification assertions passed.');
  }
  process.exit(process.exitCode || 0);
});
