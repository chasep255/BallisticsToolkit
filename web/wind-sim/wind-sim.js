let btk = null;
let wind = null;
let animId = null;
let startTime = 0;
let dpr = Math.max(1, window.devicePixelRatio || 1);
// Smoothing state for flags to avoid flicker/rapid direction flips
const flagStates = new Map(); // key -> {vx, vy}

function resizeCanvases()
{
  const glc = document.getElementById('glcanvas');
  const ov = document.getElementById('overlay');
  if (!glc || !ov) return;
  const rect = glc.getBoundingClientRect();
  const cssW = rect.width;
  const cssH = rect.height;

  // Lock CSS size so changing the backing store size doesn't affect layout
  if (glc.style.width === '' || glc.style.height === '')
  {
    glc.style.width = cssW + 'px';
    glc.style.height = cssH + 'px';
  }
  if (ov.style.width === '' || ov.style.height === '')
  {
    ov.style.width = cssW + 'px';
    ov.style.height = cssH + 'px';
  }

  const W = Math.floor(cssW * dpr);
  const H = Math.floor(cssH * dpr);
  if (glc.width !== W || glc.height !== H)
  {
    glc.width = W;
    glc.height = H;
  }
  if (ov.width !== W || ov.height !== H)
  {
    ov.width = W;
    ov.height = H;
  }
}

const state = {
  meters: 1000,
  density: 60,
  preset: 'Calm',
  seed: 42,
  timeScale: 1.0,
  elapsed: 0
};

async function init()
{
  try
  {
    btk = await BallisticsToolkit();
    setupUI();
    setupGL();
    resizeCanvases();
    window.addEventListener('resize', () =>
    {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      resizeCanvases();
    });
  }
  catch (e)
  {
    console.error('Failed to load WASM:', e);
  }
}

function setupUI()
{
  const distanceYd = document.getElementById('distanceYd');
  const preset = document.getElementById('preset');
  const seed = document.getElementById('seed');
  const density = document.getElementById('density');
  const timeScale = document.getElementById('timeScale');
  const timeScaleVal = document.getElementById('timeScaleVal');
  const clockDisplay = document.getElementById('clockDisplay');
  const populatePresets = () =>
  {
    preset.innerHTML = '';
    const names = btk.WindPresets.listPresets();

    // Convert C++ vector to JavaScript array
    const presetNames = [];
    for (let i = 0; i < names.size(); ++i)
    {
      presetNames.push(names.get(i));
    }

    // Create options
    for (const name of presetNames)
    {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name.replace(/([A-Z])/g, ' $1').trim();
      preset.appendChild(opt);
    }

    // Set default selection to first preset
    if (presetNames.length > 0)
    {
      preset.value = presetNames[0];
    }

    console.log('Loaded presets:', presetNames);
  };

  const rebuild = () =>
  {
    state.meters = btk.Conversions.yardsToMeters(parseFloat(distanceYd.value) || 1000);
    state.preset = preset.value;
    // Randomize seed if not specified or invalid
    const userSeed = parseInt(seed.value, 10);
    state.seed = Number.isFinite(userSeed) ? userSeed : Math.floor(Math.random() * 1e9);
    seed.value = state.seed;
    state.density = Math.max(10, Math.min(400, parseInt(density.value || '60', 10)));
    // Create a new wind from preset (randomized orientation per seed)
    wind = btk.WindPresets.getPreset(state.preset, state.seed);
  };

  // Load presets once at startup
  populatePresets();

  // Always animating: rebuild parameters triggers immediate effect
  rebuild();
  startAnimation();

  distanceYd.addEventListener('change', rebuild);
  preset.addEventListener('change', rebuild);
  seed.addEventListener('change', rebuild);
  density.addEventListener('change', rebuild);
  timeScale.addEventListener('input', () =>
  {
    state.timeScale = parseFloat(timeScale.value) || 1.0;
    timeScaleVal.textContent = `${state.timeScale.toFixed(1)}x`;
  });
}

// WebGL minimal arrow rendering
let gl = null;
let program = null;
let posBuffer = null;
let colBuffer = null;

function setupGL()
{
  const canvas = document.getElementById('glcanvas');
  gl = canvas.getContext('webgl');
  if (!gl)
  {
    alert('WebGL not supported.');
    return;
  }
  const vsSrc = `
  attribute vec2 a_pos;
  attribute vec3 a_col;
  varying vec3 v_col;
  void main(){
    v_col = a_col;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }`;
  const fsSrc = `
  precision mediump float;
  varying vec3 v_col;
  void main(){
    gl_FragColor = vec4(v_col, 1.0);
  }`;
  const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
  {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return;
  }
  posBuffer = gl.createBuffer();
  colBuffer = gl.createBuffer();
}

function compileShader(type, src)
{
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
  {
    console.error('Shader compile error:', gl.getShaderInfoLog(sh));
  }
  return sh;
}

function startAnimation()
{
  startTime = performance.now();
  const loop = () =>
  {
    drawFrame();
    animId = requestAnimationFrame(loop);
  };
  if (!animId) animId = requestAnimationFrame(loop);
}

function stopAnimation()
{
  if (animId)
  {
    cancelAnimationFrame(animId);
    animId = null;
  }
}

function drawFrame()
{
  if (!gl || !wind) return;
  resizeCanvases();
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0.95, 0.96, 0.97, 1.0); // Slightly darker background for better contrast
  gl.clear(gl.COLOR_BUFFER_BIT);

  const now = performance.now();
  const dt = (now - startTime) / 1000.0;
  startTime = now;
  state.elapsed += dt * state.timeScale;
  const t = state.elapsed;

  // Build arrow list along X from 0..state.meters
  const N = state.density;
  const verts = [];
  const cols = [];

  for (let i = 0; i < N; ++i)
  {
    const x = (i / (N - 1)) * state.meters;
    const wv = wind.sample(x, t); // Vector3D
    const vx = wv.x; // tail/head
    const vy = wv.y; // cross (horizontal component we want to emphasize)
    const speed = Math.sqrt(vx * vx + vy * vy);
    // Map world X to NDC Y (vertical axis for downrange view)
    const ndcX = 0.0;
    const ndcY = -1 + 2 * (x / state.meters);

    // Arrow direction in screen plane (vy = crosswind, vx = tailwind)
    // For downrange view: vy goes left/right, vx goes up/down (tailwind up, headwind down)
    const dirx = vy; // crosswind component (left/right)
    const diry = -vx; // tailwind component (negative because +X is downrange, we want tailwind to point up)
    // Arrow length scales with total speed (m/s → scaled 0..1) - half scale
    const len = Math.max(0.01, 0.25 * Math.min(1.0, speed / 5.0));
    const mag = Math.sqrt(dirx * dirx + diry * diry) || 1.0;
    const ux = dirx / mag;
    const uy = diry / mag;

    // Arrow from base to tip
    const ax = ndcX;
    const ay = ndcY;
    const bx = ndcX + ux * len;
    const by = ndcY + uy * len;

    // Color ramp: blue->red by total speed (0..20 mph)
    const mphTotal = btk.Conversions.mpsToMph(speed);
    const s01 = Math.max(0, Math.min(1, mphTotal / 20.0));
    const r = s01;
    const g = 0.1 + 0.3 * (1.0 - Math.abs(s01 - 0.5) * 2.0); // Reduced green for better contrast
    const b = 1.0 - s01;

    // Line segment
    verts.push(ax, ay, bx, by);
    cols.push(r, g, b, r, g, b);
  }


  gl.useProgram(program);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  const aCol = gl.getAttribLocation(program, 'a_col');

  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cols), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aCol);
  gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);

  gl.lineWidth(3.0); // Make lines thicker
  gl.drawArrays(gl.LINES, 0, verts.length / 2);

  // Draw overlay axes (2D canvas)
  const overlay = document.getElementById('overlay');
  if (overlay)
  {
    const ctx = overlay.getContext('2d');
    const w = overlay.width,
      h = overlay.height;
    // draw using CSS pixel units via DPR scaling
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Axes styles
    ctx.strokeStyle = '#888';
    ctx.fillStyle = '#666';
    ctx.lineWidth = 1;
    ctx.font = '12px sans-serif';

    // Distance axis (yards) along vertical
    const yards = btk.Conversions.metersToYards(state.meters);
    const pad = 12; // px padding within canvas
    const wCss = w / dpr,
      hCss = h / dpr;
    const maxYd = Math.round(yards / 100) * 100; // round to nearest 100
    for (let yd = 0; yd <= maxYd; yd += 100)
    {
      const frac = 1 - (yd / yards);
      const y = pad + frac * (hCss - 2 * pad);
      ctx.beginPath();
      ctx.moveTo(wCss - 40, y);
      ctx.lineTo(wCss - 30, y);
      ctx.stroke();
      ctx.fillText(`${yd} yd`, wCss - 78, y + 4);

      // Sample wind speed every 100 yards beneath marker
      const metersAtTick = btk.Conversions.yardsToMeters(yd);
      const fracMeters = Math.max(0, Math.min(1, metersAtTick / state.meters));
      const xSample = state.meters * fracMeters; // clamp
      const wv = wind.sample(xSample, t);
      const vx = wv.x,
        vy = wv.y;
      const mph = btk.Conversions.mpsToMph(Math.sqrt(vx * vx + vy * vy));
      ctx.fillText(`${mph.toFixed(1)} mph`, wCss - 150, y + 4);
    }
    // Removed top 'Distance' label

    // Speed scale (mph) color ramp
    const rampX = 20,
      rampY = 20,
      rampW = 12,
      rampH = 160;
    for (let i = 0; i < rampH; ++i)
    {
      const t01 = i / rampH;
      const r = t01 * 255 | 0;
      const g = (25 + 80 * (1.0 - Math.abs(t01 - 0.5) * 2.0)) | 0;
      const b = (255 * (1.0 - t01)) | 0;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(rampX, rampY + (rampH - 1 - i), rampW, 1);
    }
    ctx.strokeStyle = '#aaa';
    ctx.strokeRect(rampX, rampY, rampW, rampH);
    ctx.fillStyle = '#666';
    ctx.fillText('0 mph', rampX + 20, rampY + rampH);
    ctx.fillText('20 mph', rampX + 20, rampY + 10);
    ctx.fillText('Speed', rampX - 2, rampY - 6);

    // Update clock display (mm:ss)
    const mm = Math.floor(state.elapsed / 60);
    const ss = Math.floor(state.elapsed % 60);
    const disp = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    const clockEl = document.getElementById('clockDisplay');
    if (clockEl) clockEl.textContent = disp;

    // ----------- F‑Class style wind flags (every 200 yd) --------------------
    // Draw along right side; stronger wind → longer streamer, higher freq, more flap
    const drawFlag = (key, baseX, baseY, vx, vy, tSec, dtSec) => {
      // Low-pass filter wind sample per-flag
      let st = flagStates.get(key);
      if (!st) { st = { vx: vx, vy: vy }; flagStates.set(key, st); }
      const tau = 1.2; // seconds
      const alpha = 1 - Math.exp(-Math.max(0.001, dtSec) / tau);
      st.vx += alpha * (vx - st.vx);
      st.vy += alpha * (vy - st.vy);

      const speedMs = Math.sqrt(st.vx * st.vx + st.vy * st.vy);
      const mph = btk.Conversions.mpsToMph(speedMs);

      // Pole (clamped so it doesn't go off-screen)
      // Pole should be taller than the flag
      let poleH = 45 + Math.min(15, mph * 0.3);
      poleH = Math.min(poleH, Math.max(15, baseY - (pad + 20)));
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX, baseY - poleH);
      ctx.stroke();

      // Attachment point at pole top
      const ax = baseX, ay = baseY - poleH;

      // Realistic flag physics: looking downrange perspective
      // Wind components: vx = head/tail, vy = crosswind
      // Flag points in the direction the wind is blowing (downwind)
      
      const headwind = st.vx;  // positive = toward us, negative = away from us  
      const crosswind = st.vy; // positive = right, negative = left
      
      // Wind speed determines angle from vertical (0° = limp, 90° = horizontal)
      const angleDeg = Math.min(85, Math.max(0, mph * 3.5 + Math.pow(mph, 1.2) * 0.8));
      const angleRad = angleDeg * Math.PI / 180.0;
      
      // Flag points in wind direction (not opposite!)
      // Crosswind component: positive vy = right crosswind, flag points right
      // Headwind component: positive vx = headwind toward us, flag points toward us (up)
      const flagDirX = crosswind * Math.sin(angleRad);   // crosswind component
      const flagDirY = headwind * Math.sin(angleRad);    // headwind component
      const flagLen = Math.sqrt(flagDirX * flagDirX + flagDirY * flagDirY) || 1.0;
      const ux = flagDirX / flagLen, uy = flagDirY / flagLen;
      const px = -uy, py = ux; // perpendicular for flapping

      // Streamer parameters (realistic flag behavior)
      const length = 35 + Math.min(10, mph * 0.15);      // px, shorter than pole
      const freq = 0.8 + mph * 0.1;                     // flutter rate increases with wind
      const ampBase = Math.min(8, 3 + mph * 0.2);        // flutter amplitude
      const widthPole = 14;                              // px thickness near pole
      const widthTip  = 5;                               // px thickness near tip
      const waves = 2 + Math.min(4, Math.floor(mph * 0.2));

      // Wavy ribbon streamer
      // Build ribbon polygon around centerline (thicker at pole)
      const segments = 24;
      const leftPts = [];
      const rightPts = [];
      for (let i = 0; i <= segments; ++i) {
        const s = i / segments;
        // Realistic flag flutter: starts at pole, grows toward tip
        const phase = (tSec * freq * 2.0 * Math.PI) + s * waves * 2.0 * Math.PI;
        const a = ampBase * Math.pow(s, 2.0); // flutter grows quadratically from pole
        const flutter = Math.sin(phase) * a;
        
        // Flag centerline with flutter perpendicular to flag direction
        const cx = ax + ux * (length * s) + px * flutter;
        const cy = ay + uy * (length * s) + py * flutter;
        const w = (1 - s) * widthPole + s * widthTip; // taper
        leftPts.push(cx + px * (w * 0.5), cy + py * (w * 0.5));
        rightPts.push(cx - px * (w * 0.5), cy - py * (w * 0.5));
      }
      // Two-color fill across width (red upper, yellow lower)
      // 1) Draw full yellow ribbon
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(leftPts[0], leftPts[1]);
      for (let i = 1; i < leftPts.length; ++i) ctx.lineTo(leftPts[i*2], leftPts[i*2+1]);
      for (let i = rightPts.length - 1; i >= 0; --i) ctx.lineTo(rightPts[i*2], rightPts[i*2+1]);
      ctx.closePath();
      ctx.fill();

      // 2) Draw red upper half by shrinking width toward the centerline by 50%
      const redLeft = [], redRight = [];
      for (let i = 0; i <= segments; ++i) {
        const s = i / segments;
        // Realistic flag flutter: starts at pole, grows toward tip
        const phase = (tSec * freq * 2.0 * Math.PI) + s * waves * 2.0 * Math.PI;
        const a = ampBase * Math.pow(s, 2.0); // flutter grows quadratically from pole
        const flutter = Math.sin(phase) * a;
        
        // Flag centerline with flutter perpendicular to flag direction
        const cx = ax + ux * (length * s) + px * flutter;
        const cy = ay + uy * (length * s) + py * flutter;
        const w = (1 - s) * widthPole + s * widthTip;
        const half = w * 0.25; // half of half-width = quarter of full width
        // Pick the same side as 'leftPts' for red band (upper visually)
        redLeft.push(cx + px * (half));
        redLeft.push(cy + py * (half));
        redRight.push(cx);
        redRight.push(cy);
      }
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.moveTo(redLeft[0], redLeft[1]);
      for (let i = 1; i < redLeft.length/2; ++i) ctx.lineTo(redLeft[i*2], redLeft[i*2+1]);
      for (let i = redRight.length/2 - 1; i >= 0; --i) ctx.lineTo(redRight[i*2], redRight[i*2+1]);
      ctx.closePath();
      ctx.fill();

      // Outline for visual clarity
      ctx.strokeStyle = '#b07d00';
      ctx.lineWidth = 1;
      ctx.stroke();
    };

      // Place flags at 200 yd intervals
      const marginLeft = 120; // px from left edge to avoid overlapping legend
      for (let yd = 100; yd <= maxYd; yd += 200) {
        const frac = 1 - (yd / yards);
        const y = pad + frac * (hCss - 2 * pad);
        const xMeters = btk.Conversions.yardsToMeters(yd);
        const wv = wind.sample(xMeters, t);
        const baseX = marginLeft;
        const baseY = y;
        drawFlag(yd, baseX, baseY, wv.x, wv.y, t, dt);
      }
  }
}

window.addEventListener('load', init);