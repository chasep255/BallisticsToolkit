/**
 * Hit Simulator
 * Monte Carlo simulation against user-defined circle/rectangle targets.
 */

import BallisticsToolkit from '../ballistics_toolkit_wasm.js';
import { createSettingsCookies } from '../settings-cookies.js';

const SettingsCookies = createSettingsCookies('hit_sim_');

let btk = null;

const DEFAULT_PARAMS = {
  bc: '0.311',
  dragFunction: 'G7',
  mv: '2750',
  weight: '140',
  diameter: '0.264',
  length: '1.4',
  twistRate: '8',
  enableSpinEffects: true,
  range: '600',
  targetShape: 'circle',
  circleDiameter: '20',
  rectWidth: '20',
  rectHeight: '20',
  numShots: '1000',
  mvSd: '7.0',
  bcSd: '0.8',
  windSd: '1.0',
  headwindSd: '0.0',
  updraftSd: '0.0',
  rifleAccuracy: '0.25',
  scopeCant: '0',
  altitude: '0',
  temperature: '59',
  humidity: '50'
};

function setDefaultValues()
{
  for (const [key, value] of Object.entries(DEFAULT_PARAMS))
  {
    const element = document.getElementById(key);
    if (element)
    {
      if (element.type === 'checkbox')
      {
        element.checked = value;
      }
      else
      {
        element.value = value;
      }
    }
  }
}

class HitProbCalculator
{
  constructor()
  {
    this.simulator = null;
    this.bullet = null;
    this.atmosphere = null;
    this.dummyTarget = null;
    this.isRunning = false;

    this.impacts = [];
    this.shotsFired = 0;
    this.totalShots = 0;

    this.canvas = document.getElementById('impactCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.setupEventListeners();
    this.onShapeChange();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    Utils.setupHelpModal('helpBtn', 'helpModal');
  }

  setupEventListeners()
  {
    document.getElementById('runBtn').addEventListener('click', () => this.run());
    document.getElementById('stopBtn').addEventListener('click', () => this.stop());

    document.getElementById('targetShape').addEventListener('change', () => this.onShapeChange());

    document.getElementById('resetDefaults').addEventListener('click', (e) =>
    {
      e.preventDefault();
      setDefaultValues();
      this.onShapeChange();
      SettingsCookies.saveAll();
    });
  }

  onShapeChange()
  {
    const shape = document.getElementById('targetShape').value;
    document.getElementById('circleDiamItem').style.display = shape === 'circle' ? '' : 'none';
    document.getElementById('rectWidthItem').style.display = shape === 'rectangle' ? '' : 'none';
    document.getElementById('rectHeightItem').style.display = shape === 'rectangle' ? '' : 'none';
  }

  resizeCanvas()
  {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const size = Math.max(Math.min(rect.width, rect.height, window.innerWidth - 100, window.innerHeight - 300), 300);
    this.canvas.width = size;
    this.canvas.height = size;
    if (this.impacts.length > 0) this.drawAll();
  }

  getShapeConfig()
  {
    const type = document.getElementById('targetShape').value;
    if (type === 'circle')
    {
      const diamIn = parseFloat(document.getElementById('circleDiameter').value);
      return { type: 'circle', diameter_m: btk.Conversions.inchesToMeters(diamIn), diameter_in: diamIn };
    }
    else
    {
      const wIn = parseFloat(document.getElementById('rectWidth').value);
      const hIn = parseFloat(document.getElementById('rectHeight').value);
      return {
        type: 'rectangle',
        width_m: btk.Conversions.inchesToMeters(wIn),
        height_m: btk.Conversions.inchesToMeters(hIn),
        width_in: wIn,
        height_in: hIn
      };
    }
  }

  isHit(x_m, y_m, shape)
  {
    if (shape.type === 'circle')
    {
      const r = shape.diameter_m / 2;
      return (x_m * x_m + y_m * y_m) <= r * r;
    }
    const hw = shape.width_m / 2;
    const hh = shape.height_m / 2;
    return Math.abs(x_m) <= hw && Math.abs(y_m) <= hh;
  }

  run()
  {
    this.stop();
    this.impacts = [];
    this.shotsFired = 0;
    this.clearStats();

    SettingsCookies.saveAll();

    try
    {
      this.setupSimulator();
    }
    catch (e)
    {
      console.error('Setup failed:', e);
      alert('Setup failed: ' + e.message);
      return;
    }

    this.totalShots = parseInt(document.getElementById('numShots').value) || 1000;
    this.isRunning = true;
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('progressBar').style.display = '';

    this.shape = this.getShapeConfig();
    this.batchSize = Math.min(50, this.totalShots);
    this.fireNextBatch();
  }

  stop()
  {
    this.isRunning = false;
    document.getElementById('runBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
  }

  setupSimulator()
  {
    if (this.simulator) { this.simulator.delete(); this.simulator = null; }
    if (this.bullet) { this.bullet.delete(); this.bullet = null; }
    if (this.atmosphere) { this.atmosphere.delete(); this.atmosphere = null; }
    if (this.dummyTarget) { this.dummyTarget.delete(); this.dummyTarget = null; }

    const bc = parseFloat(document.getElementById('bc').value);
    const dragFunction = document.getElementById('dragFunction').value;
    const mv = btk.Conversions.fpsToMps(parseFloat(document.getElementById('mv').value));
    const diameter = btk.Conversions.inchesToMeters(parseFloat(document.getElementById('diameter').value));
    const weightKg = btk.Conversions.grainsToKg(parseFloat(document.getElementById('weight').value));
    const length = btk.Conversions.inchesToMeters(parseFloat(document.getElementById('length').value));
    const twistRate = parseFloat(document.getElementById('twistRate').value);
    const enableSpin = document.getElementById('enableSpinEffects').checked;
    const twistMeters = enableSpin ? btk.Conversions.inchesToMeters(twistRate) : 0.0;
    const range = btk.Conversions.yardsToMeters(parseFloat(document.getElementById('range').value));
    const mvSd = btk.Conversions.fpsToMps(parseFloat(document.getElementById('mvSd').value));
    const bcSd = parseFloat(document.getElementById('bcSd').value) / 100.0; // percent -> fraction of BC
    const windSd = btk.Conversions.mphToMps(parseFloat(document.getElementById('windSd').value));
    const headwindSd = btk.Conversions.mphToMps(parseFloat(document.getElementById('headwindSd').value));
    const updraftSd = btk.Conversions.mphToMps(parseFloat(document.getElementById('updraftSd').value));
    const rifleAccuracyRad = btk.Conversions.moaToRadians(parseFloat(document.getElementById('rifleAccuracy').value));
    const altitude = btk.Conversions.feetToMeters(parseFloat(document.getElementById('altitude').value));
    const temperature = btk.Conversions.fahrenheitToKelvin(parseFloat(document.getElementById('temperature').value));
    const humidity = parseFloat(document.getElementById('humidity').value) / 100.0;

    this.bullet = new btk.Bullet(
      weightKg, diameter, length, bc,
      dragFunction === 'G1' ? btk.DragFunction.G1 : btk.DragFunction.G7
    );
    this.atmosphere = new btk.Atmosphere(temperature, altitude, humidity, 0.0);

    const targetList = btk.Targets.listTargets();
    const firstName = targetList.get(0);
    targetList.delete();
    this.dummyTarget = btk.Targets.getTarget(firstName);

    const scopeCantRad = btk.Conversions.degreesToRadians(parseFloat(document.getElementById('scopeCant').value));
    this.simulator = new btk.MatchSimulator(
      this.bullet, mv, this.dummyTarget, range, this.atmosphere,
      mvSd, bcSd, windSd, headwindSd, updraftSd,
      rifleAccuracyRad, scopeCantRad, 0.001, twistMeters
    );
  }

  fireNextBatch()
  {
    if (!this.isRunning) return;

    const remaining = this.totalShots - this.shotsFired;
    const count = Math.min(this.batchSize, remaining);

    for (let i = 0; i < count; i++)
    {
      const shot = this.simulator.fireShot();
      const x_m = shot.impactX;
      const y_m = shot.impactY;
      const hit = this.isHit(x_m, y_m, this.shape);
      this.impacts.push({ x_m, y_m, hit });
      this.shotsFired++;
    }
    this.simulator.clearShots();

    const pct = (this.shotsFired / this.totalShots) * 100;
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent = `${this.shotsFired} / ${this.totalShots}`;

    if (this.shotsFired >= this.totalShots)
    {
      this.isRunning = false;
      document.getElementById('runBtn').disabled = false;
      document.getElementById('stopBtn').disabled = true;
      this.computeAndDisplayStats();
      this.drawAll();
      return;
    }

    setTimeout(() => this.fireNextBatch(), 0);
  }

  computeAndDisplayStats()
  {
    const n = this.impacts.length;
    if (n === 0) return;

    let hits = 0;
    let sumX = 0, sumY = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const p of this.impacts)
    {
      if (p.hit) hits++;
      sumX += p.x_m;
      sumY += p.y_m;
      minX = Math.min(minX, p.x_m);
      maxX = Math.max(maxX, p.x_m);
      minY = Math.min(minY, p.y_m);
      maxY = Math.max(maxY, p.y_m);
    }

    const cx = sumX / n;
    const cy = sumY / n;

    const radii = new Float64Array(n);
    let sumR = 0, sumR2 = 0;
    for (let i = 0; i < n; i++)
    {
      const dx = this.impacts[i].x_m - cx;
      const dy = this.impacts[i].y_m - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      radii[i] = r;
      sumR += r;
      sumR2 += r * r;
    }

    const meanR = sumR / n;
    const rsd = n > 1 ? Math.sqrt(Math.max(0, (sumR2 - n * meanR * meanR) / (n - 1))) : 0;

    const sorted = Array.from(radii).sort((a, b) => a - b);
    const cep = sorted[Math.floor(n * 0.5)];

    // Extreme spread is the diameter of the point set, which only depends on
    // the convex hull: build the hull (monotone chain), then take the max
    // pairwise distance over hull points. Exact at any shot count.
    let es = 0;
    if (n >= 2)
    {
      const pts = this.impacts.map(p => [p.x_m, p.y_m]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lower = [];
      for (const p of pts)
      {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
      }
      const upper = [];
      for (let i = pts.length - 1; i >= 0; i--)
      {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
      }
      const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
      let es2 = 0;
      for (let i = 0; i < hull.length; i++)
      {
        for (let j = i + 1; j < hull.length; j++)
        {
          const dx = hull[j][0] - hull[i][0];
          const dy = hull[j][1] - hull[i][1];
          const d = dx * dx + dy * dy;
          if (d > es2) es2 = d;
        }
      }
      es = Math.sqrt(es2);
    }

    const toIn = (m) => btk.Conversions.metersToInches(m);

    const hitProb = (hits / n * 100).toFixed(1);
    document.getElementById('statHitProb').textContent = `${hitProb}%`;
    document.getElementById('statCounts').textContent = `${n} / ${hits} / ${n - hits}`;
    document.getElementById('statHSpread').textContent = `${toIn(maxX - minX).toFixed(2)}"`;
    document.getElementById('statVSpread').textContent = `${toIn(maxY - minY).toFixed(2)}"`;
    document.getElementById('statES').textContent = `${toIn(es).toFixed(2)}"`;
    document.getElementById('statMR').textContent = `${toIn(meanR).toFixed(2)}"`;
    document.getElementById('statRSD').textContent = `${toIn(rsd).toFixed(2)}"`;
    document.getElementById('statCEP').textContent = `${toIn(cep).toFixed(2)}"`;
  }

  clearStats()
  {
    const ids = ['statHitProb', 'statCounts', 'statHSpread', 'statVSpread', 'statES', 'statMR', 'statRSD', 'statCEP'];
    ids.forEach(id => document.getElementById(id).textContent = '--');
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressText').textContent = '0%';
  }

  drawAll()
  {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    if (this.impacts.length === 0) return;

    const shape = this.shape || this.getShapeConfig();

    let extentX, extentY;
    if (shape.type === 'circle')
    {
      extentX = shape.diameter_m / 2;
      extentY = shape.diameter_m / 2;
    }
    else
    {
      extentX = shape.width_m / 2;
      extentY = shape.height_m / 2;
    }

    for (const p of this.impacts)
    {
      extentX = Math.max(extentX, Math.abs(p.x_m));
      extentY = Math.max(extentY, Math.abs(p.y_m));
    }

    extentX *= 1.1;
    extentY *= 1.1;

    const extent = Math.max(extentX, extentY);
    const scale = (w / 2) / extent;
    const cx = w / 2;
    const cy = h / 2;

    const gridStep = btk.Conversions.inchesToMeters(1);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#bbb';
    ctx.textAlign = 'center';

    for (let v = -Math.ceil(extent / gridStep) * gridStep; v <= extent; v += gridStep)
    {
      const px = cx + v * scale;
      const py = cy - v * scale;
      ctx.strokeStyle = '#eee';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      if (Math.abs(v) > 1e-9)
      {
        ctx.fillText(`${Math.round(btk.Conversions.metersToInches(v))}"`, px, h - 4);
      }
    }

    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 2;
    if (shape.type === 'circle')
    {
      const r = (shape.diameter_m / 2) * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    else
    {
      const rw = shape.width_m * scale;
      const rh = shape.height_m * scale;
      ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
    }

    const dotR = Math.max(1.5, Math.min(3, w / 300));
    for (const p of this.impacts)
    {
      const px = cx + p.x_m * scale;
      const py = cy - p.y_m * scale;
      ctx.fillStyle = p.hit ? 'rgba(39, 174, 96, 0.6)' : 'rgba(231, 76, 60, 0.6)';
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

}

document.addEventListener('DOMContentLoaded', async () =>
{
  try
  {
    setDefaultValues();

    Utils.showLoading('Loading WebAssembly...');
    btk = await BallisticsToolkit();
    Utils.hideLoading();

    SettingsCookies.loadAll();
    SettingsCookies.attachAutoSave();

    new HitProbCalculator();
  }
  catch (e)
  {
    console.error('Init failed:', e);
    const loading = document.getElementById('loading');
    if (loading) loading.innerHTML = '<div>Failed to load. Check console.</div>';
  }
});
