let btk = null;
let wind = null;
let animId = null;
let startTime = 0;
let dpr = Math.max(1, window.devicePixelRatio || 1);

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
    for (let i = 0; i < names.size(); ++i) {
      presetNames.push(names.get(i));
    }
    
    // Create options
    for (const name of presetNames) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name.replace(/([A-Z])/g, ' $1').trim();
      preset.appendChild(opt);
    }
    
    // Set default selection to first preset
    if (presetNames.length > 0) {
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
  gl.clearColor(0.97, 0.98, 0.98, 1.0); // Light gray background
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
    // Arrow length scales with total speed (m/s → scaled 0..1)
    const len = Math.max(0.02, 0.5 * Math.min(1.0, speed / 5.0));
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
  }
}

window.addEventListener('load', init);