import BallisticsToolkit from '../ballistics_toolkit_wasm.js';
import * as THREE from 'three';
import
{
  SmokeSimulation
}
from './core/smoke-sim.js';

let btk = null; // WASM module
let wind = null; // BTK wind generator (WASM)
let visualizations = []; // Array of WindFieldVisualization instances
let smokeSimulation = null; // Smoke simulation for composite visualization
let animId = null;
let startTime = 0;
let dpr = Math.max(1, window.devicePixelRatio || 1);
const RANGE_HEIGHT_YD = 200; // Crossrange extent in yards (fixed)
let colorThreshold = 7.5; // mph threshold for red color

// WindFieldVisualization class for individual wind field displays
class WindFieldVisualization
{
  constructor(canvasId, title, samplingFunction)
  {
    this.canvasId = canvasId;
    this.title = title;
    this.samplingFunction = samplingFunction;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.vectorField = null;
    this.stats = {
      minSpeed: Infinity,
      maxSpeed: 0,
      avgSpeed: 0,
      totalSpeedSum: 0, // NEW: cumulative sum
      totalSampleCount: 0 // NEW: cumulative count
    };
    this.canvas = null;

    // EMA tracking for min/max normalization
    this.emaMin = 0;
    this.emaMax = 0;
    this.emaAlpha = 0.01; // EMA smoothing factor
    this.hasInitialized = false;

    // Histogram tracking (cumulative)
    this.histogramBinSize = 0.01; // 0.01 mph bins
    this.histogramBins = new Map(); // Map from bin index to count
    this.histogramMaxSpeed = 0; // Track max speed seen for bin sizing
  }

  init()
  {
    this.canvas = document.getElementById(this.canvasId);
    if (!this.canvas) return false;

    this.renderer = new THREE.WebGLRenderer(
    {
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(2, dpr));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    // Add lighting for proper material rendering
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(0, 0, 1);
    this.scene.add(light);

    const marginX = 50;
    const marginY = 20;
    this.camera = new THREE.OrthographicCamera(
      -marginX,
      1000 + marginX,
      100 + marginY, // Top = +100 yards (right)
      -100 - marginY, // Bottom = -100 yards (left)
      -10,
      10
    );
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    this.buildVectorField();
    return true;
  }

  buildVectorField()
  {
    if (!this.scene) return;

    // Remove previous fields
    if (this.vectorField)
    {
      this.scene.remove(this.vectorField);
      if (this.vectorField.geometry) this.vectorField.geometry.dispose();
      if (this.vectorField.material) this.vectorField.material.dispose();
      this.vectorField = null;
    }
    if (this.squareField)
    {
      this.scene.remove(this.squareField);
      if (this.squareField.geometry) this.squareField.geometry.dispose();
      if (this.squareField.material) this.squareField.material.dispose();
      this.squareField = null;
    }

    // Grid resolution
    const nx = 60; // Fixed density
    const ny = 12; // Fixed density for 5:1 aspect ratio
    const count = nx * ny;

    // Fixed visualization range - doesn't need to match sampling range
    const rangeX = 1000.0; // yards
    const rangeY = 200.0; // yards

    // Create square geometry for background - no gaps between squares
    this.squareSizeX = rangeX / nx; // Calculate size to fill grid with no gaps
    this.squareSizeY = rangeY / ny;
    // Unit square - will be scaled by instance matrix
    const squarePositions = new Float32Array([
      -0.5, -0.5, -0.1, // bottom left
      0.5, -0.5, -0.1, // bottom right
      0.5, 0.5, -0.1, // top right
      -0.5, 0.5, -0.1 // top left
    ]);
    const squareIndices = new Uint16Array([
      0, 1, 2, // first triangle
      0, 2, 3 // second triangle
    ]);
    const squareGeometry = new THREE.BufferGeometry();
    squareGeometry.setAttribute('position', new THREE.BufferAttribute(squarePositions, 3));
    squareGeometry.setIndex(new THREE.BufferAttribute(squareIndices, 1));

    // Create triangle geometry for wind direction
    const triHeight = 10; // height (pointing direction)
    const triBase = 5; // base width (2:1 ratio)
    const triPositions = new Float32Array([
      triHeight * 0.5, 0, 0, // tip (front)
      -triHeight * 0.5, triBase * 0.5, 0, // back left
      -triHeight * 0.5, -triBase * 0.5, 0 // back right
    ]);
    const triGeometry = new THREE.BufferGeometry();
    triGeometry.setAttribute('position', new THREE.BufferAttribute(triPositions, 3));

    // Create materials
    const squareMaterial = new THREE.ShaderMaterial(
    {
      vertexShader: `
        attribute vec3 instanceColor;
        varying vec3 vColor;
        
        void main() {
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
      toneMapped: false
    });

    const triMaterial = new THREE.MeshBasicMaterial(
    {
      color: 0xffffff, // White triangles
      toneMapped: false
    });

    // Create instanced meshes
    this.squareField = new THREE.InstancedMesh(squareGeometry, squareMaterial, count);
    this.squareField.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.vectorField = new THREE.InstancedMesh(triGeometry, triMaterial, count);
    this.vectorField.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Set up per-instance colors for squares
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++)
    {
      colors[i * 3 + 0] = 0; // r
      colors[i * 3 + 1] = 0; // g  
      colors[i * 3 + 2] = 1; // b (blue)
    }
    squareGeometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 3));
    squareGeometry.getAttribute('instanceColor').setUsage(THREE.DynamicDrawUsage);

    this.scene.add(this.squareField);
    this.scene.add(this.vectorField);

    // Use the same sample range that was passed to the preset
    const minX = 0.0; // yards
    const maxX = 1000.0; // yards  
    const minY = -100.0; // yards
    const maxY = 100.0; // yards

    // Precompute grid sample positions (yards) using wind generator's sample range
    const pos = [];
    for (let j = 0; j < ny; ++j)
    {
      const y = minY + (j + 0.5) * ((maxY - minY) / ny);
      for (let i = 0; i < nx; ++i)
      {
        const x = minX + (i + 0.5) * ((maxX - minX) / nx);
        pos.push(x, y);
      }
    }
    this.vectorField.userData = {
      nx,
      ny,
      positions: pos
    };
  }

  update()
  {
    if (!this.vectorField || !this.squareField || !this.samplingFunction) return;

    const
    {
      positions
    } = this.vectorField.userData;
    const tmpMat = new THREE.Matrix4();
    const tmpPos = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();
    const squareScale = new THREE.Vector3(this.squareSizeX, this.squareSizeY, 1);
    const triangleScale = new THREE.Vector3(1, 1, 1); // Triangles use their own size

    // Reset stats for this frame
    const frameStats = {
      minSpeed: Infinity,
      maxSpeed: 0,
      totalSpeed: 0,
      sampleCount: 0
    };

    for (let idx = 0, n = positions.length / 2; idx < n; ++idx)
    {
      const x_yd = positions[idx * 2 + 0];
      const y_yd = positions[idx * 2 + 1];
      const x_m = btk.Conversions.yardsToMeters(x_yd);
      // Convert display coordinates to BTK coordinates:
      // Display: Y=-100 (top/left) to Y=+100 (bottom/right) when looking downrange
      // BTK: Y is crossrange, positive = LEFT when looking downrange
      // Your debug shows BTK Y=50-75 should be on left side, so we need to flip
      // Display Y=-100 (left) should map to BTK Y=+100 (left in BTK)
      // Display Y=+100 (right) should map to BTK Y=-100 (right in BTK)
      // So: BTK_y = -display_y
      const y_m = btk.Conversions.yardsToMeters(-y_yd);

      // Sample wind using the provided sampling function
      const wv = this.samplingFunction(x_m, y_m, 0);

      // Arrow points in wind direction (downwind), not against it
      // BTK: wv.x = headwind (downrange), wv.y = crosswind (positive = LEFT)
      // Three.js display: X = downrange, Y = crossrange (positive = DOWN/RIGHT)
      // Need to flip Y to convert from BTK (left positive) to display (right positive)
      const theta = Math.atan2(-wv.y, wv.x);
      const speedMph = btk.Conversions.mpsToMph(Math.sqrt(wv.x * wv.x + wv.y * wv.y));

      // Update frame statistics
      frameStats.sampleCount++;
      frameStats.totalSpeed += speedMph;
      frameStats.minSpeed = Math.min(frameStats.minSpeed, speedMph);
      frameStats.maxSpeed = Math.max(frameStats.maxSpeed, speedMph);

      // Accumulate histogram bin
      const binIndex = Math.floor(speedMph / this.histogramBinSize);
      this.histogramBins.set(binIndex, (this.histogramBins.get(binIndex) || 0) + 1);
      this.histogramMaxSpeed = Math.max(this.histogramMaxSpeed, speedMph);

      // Dynamic color scale: 0 mph = blue, colorThreshold mph = red
      const s01 = Math.max(0, Math.min(1, speedMph / colorThreshold));

      // Blue (0 mph) to red (colorThreshold mph) color ramp
      const r = s01;
      const g = 0;
      const b = 1.0 - s01;

      // Set color for squares (background)
      const squareColorAttr = this.squareField.geometry.getAttribute('instanceColor');
      squareColorAttr.setXYZ(idx, r, g, b);

      // Clean up WASM object
      if (wv && wv.delete) wv.delete();

      // Position squares (no rotation) and triangles (with rotation) at the same location
      tmpPos.set(x_yd, y_yd, 0);

      // Squares: no rotation, just position
      const squareMat = new THREE.Matrix4();
      const noRotation = new THREE.Quaternion();
      squareMat.compose(tmpPos, noRotation, squareScale);

      // Triangles: position + rotation
      tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), theta);
      tmpMat.compose(tmpPos, tmpQuat, triangleScale);

      // Update both square and triangle matrices
      this.squareField.setMatrixAt(idx, squareMat);
      this.vectorField.setMatrixAt(idx, tmpMat);
    }

    // Update statistics with frame data
    if (frameStats.sampleCount > 0)
    {
      // Update all-time min/max from frame statistics
      this.stats.minSpeed = Math.min(this.stats.minSpeed, frameStats.minSpeed);
      this.stats.maxSpeed = Math.max(this.stats.maxSpeed, frameStats.maxSpeed);

      // Accumulate for all-time average
      this.stats.totalSpeedSum += frameStats.totalSpeed;
      this.stats.totalSampleCount += frameStats.sampleCount;
      this.stats.avgSpeed = this.stats.totalSpeedSum / this.stats.totalSampleCount;

      // Update EMA min/max for this visualization
      this.updateEMAMinMax(frameStats.minSpeed, frameStats.maxSpeed);
    }

    // Update both meshes
    this.squareField.instanceMatrix.needsUpdate = true;
    this.vectorField.instanceMatrix.needsUpdate = true;
    this.squareField.geometry.getAttribute('instanceColor').needsUpdate = true;
  }

  updateStats(speedMph)
  {
    this.stats.sampleCount++;
    this.stats.totalSpeed += speedMph;
    this.stats.minSpeed = Math.min(this.stats.minSpeed, speedMph);
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, speedMph);
    this.stats.avgSpeed = this.stats.totalSpeed / this.stats.sampleCount;
  }

  updateEMAMinMax(frameMin, frameMax)
  {
    if (!this.hasInitialized)
    {
      // Initialize EMA with first frame values
      this.emaMin = frameMin;
      this.emaMax = frameMax;
      this.hasInitialized = true;
    }
    else
    {
      // Update EMA: new_value = alpha * current + (1 - alpha) * previous
      this.emaMin = this.emaAlpha * frameMin + (1 - this.emaAlpha) * this.emaMin;
      this.emaMax = this.emaAlpha * frameMax + (1 - this.emaAlpha) * this.emaMax;
    }
  }

  resetStats()
  {
    this.stats.minSpeed = Infinity;
    this.stats.maxSpeed = 0;
    this.stats.avgSpeed = 0;
    this.stats.totalSpeedSum = 0;
    this.stats.totalSampleCount = 0;

    // Reset histogram
    this.histogramBins.clear();
    this.histogramMaxSpeed = 0;

    // Reset EMA values
    this.emaMin = 0;
    this.emaMax = 0;
    this.hasInitialized = false;
  }

  updateStatsDisplay()
  {
    // Stats are now displayed in the main wind stats table
    // This method is kept for compatibility but does nothing
  }

  dispose()
  {
    if (this.vectorField)
    {
      this.scene.remove(this.vectorField);
      if (this.vectorField.geometry) this.vectorField.geometry.dispose();
      if (this.vectorField.material) this.vectorField.material.dispose();
      this.vectorField = null;
    }
    if (this.squareField)
    {
      this.scene.remove(this.squareField);
      if (this.squareField.geometry) this.squareField.geometry.dispose();
      if (this.squareField.material) this.squareField.material.dispose();
      this.squareField = null;
    }
    if (this.renderer)
    {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
  }
}



function resizeRenderer()
{
  for (const viz of visualizations)
  {
    if (!viz.renderer) continue;
    const canvas = viz.canvas;
    if (!canvas) continue;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    if (canvas.style.width === '' || canvas.style.height === '')
    {
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
    }
    const W = Math.floor(cssW * dpr);
    const H = Math.floor(cssH * dpr);
    viz.renderer.setSize(W, H, false);
  }
}

const state = {
  yards: 1000, // Fixed at 1000 yards
  meters: 914.4,
  density: 60, // Fixed at 60 arrows
  preset: 'Calm',
  timeScale: 1.0,
  elapsed: 0,
  stats:
  {
    minSpeed: Infinity,
    maxSpeed: 0,
    avgSpeed: 0,
    totalSpeedSum: 0,
    totalSampleCount: 0
  }
};

async function init()
{
  try
  {
    // Load WASM module
    btk = await BallisticsToolkit();
    setupUI();
    buildAllVisualizations();
    resizeRenderer();
    window.addEventListener('resize', () =>
    {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      resizeRenderer();
    });
  }
  catch (e)
  {
    console.error('Failed to initialize:', e);
  }
}

function resetStats()
{
  state.stats.minSpeed = Infinity;
  state.stats.maxSpeed = 0;
  state.stats.avgSpeed = 0;
  state.stats.totalSpeedSum = 0;
  state.stats.totalSampleCount = 0;
  updateStatsDisplay();

  // Reset stats for all visualizations
  for (const viz of visualizations)
  {
    viz.resetStats();
  }
}

function updateGlobalStats()
{
  // Reset global stats for this frame
  let frameMinSpeed = Infinity;
  let frameMaxSpeed = 0;
  let totalFrameSpeed = 0;
  let frameCount = 0;

  // Aggregate current frame stats from all visualizations
  for (const viz of visualizations)
  {
    // Use the current stats from each visualization
    if (viz.stats.minSpeed !== Infinity)
    {
      frameMinSpeed = Math.min(frameMinSpeed, viz.stats.minSpeed);
    }
    if (viz.stats.maxSpeed > 0)
    {
      frameMaxSpeed = Math.max(frameMaxSpeed, viz.stats.maxSpeed);
    }
    if (viz.stats.avgSpeed > 0)
    {
      totalFrameSpeed += viz.stats.avgSpeed;
      frameCount++;
    }
  }

  // Update global all-time min/max
  if (frameMinSpeed !== Infinity)
  {
    state.stats.minSpeed = Math.min(state.stats.minSpeed, frameMinSpeed);
  }
  if (frameMaxSpeed > 0)
  {
    state.stats.maxSpeed = Math.max(state.stats.maxSpeed, frameMaxSpeed);
  }

  // Accumulate for all-time average
  state.stats.totalSpeedSum += totalFrameSpeed;
  state.stats.totalSampleCount += frameCount;
  if (state.stats.totalSampleCount > 0)
  {
    state.stats.avgSpeed = state.stats.totalSpeedSum / state.stats.totalSampleCount;
  }
}

function updateStatsDisplay()
{
  const stats = state.stats;
  const minSpeedEl = document.getElementById('minSpeed');
  const maxSpeedEl = document.getElementById('maxSpeed');
  const avgSpeedEl = document.getElementById('avgSpeed');

  if (minSpeedEl)
  {
    minSpeedEl.textContent = stats.minSpeed === Infinity ? '0.0' : stats.minSpeed.toFixed(1);
  }
  if (maxSpeedEl)
  {
    maxSpeedEl.textContent = stats.maxSpeed.toFixed(1);
  }
  if (avgSpeedEl)
  {
    avgSpeedEl.textContent = stats.avgSpeed.toFixed(1);
  }


  // Update wind field statistics table (only occasionally, not every frame)
  // Rebuild table every 60 frames (~1 second) instead of every frame
  if (!window.tableUpdateCounter) window.tableUpdateCounter = 0;
  window.tableUpdateCounter++;
  if (window.tableUpdateCounter >= 60)
  {
    window.tableUpdateCounter = 0;
    updateWindStatsTable();
  }
}

function updateWindStatsTable()
{
  const tableBody = document.getElementById('windDetailsTableBody');
  if (!tableBody) return;

  // Clear existing rows
  tableBody.innerHTML = '';

  if (!wind) return;

  // Add rows for each visualization
  for (let i = 0; i < visualizations.length; i++)
  {
    const viz = visualizations[i];
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid #dee2e6';

    // Get component details if this is a component visualization
    let strength = '-';
    let downrangeScale = '-';
    let crossrangeScale = '-';
    let temporalScale = '-';
    let exponent = '-';
    let sigmoidThreshold = '-';
    let rms = '-';

    if (viz.title.startsWith('Component '))
    {
      const componentIndex = parseInt(viz.title.split(' ')[1]);
      if (componentIndex >= 0 && componentIndex < wind.getNumActiveComponents())
      {
        const str = wind.getComponentStrength(componentIndex);
        const downrange = wind.getComponentDownrangeScale(componentIndex);
        const crossrange = wind.getComponentCrossrangeScale(componentIndex);
        const temporal = wind.getComponentTemporalScale(componentIndex);
        const exp = wind.getComponentExponent(componentIndex);
        const sigmoid = wind.getComponentSigmoidThreshold(componentIndex);
        const rmsValue = wind.getComponentRMS(componentIndex);

        // Convert to display units
        const downrangeYd = btk.Conversions.metersToYards(downrange);
        const crossrangeYd = btk.Conversions.metersToYards(crossrange);
        const strengthMph = btk.Conversions.mpsToMph(str);
        const rmsMph = btk.Conversions.mpsToMph(rmsValue);
        const sigmoidMph = btk.Conversions.mpsToMph(sigmoid); // Convert threshold to mph

        strength = strengthMph.toFixed(1);
        downrangeScale = downrangeYd.toFixed(0);
        crossrangeScale = crossrangeYd.toFixed(0);
        // Convert temporal scale to minutes (it's stored in seconds)
        temporalScale = (temporal / 60).toFixed(1);
        exponent = exp.toFixed(2);
        sigmoidThreshold = sigmoidMph.toFixed(1);
        rms = rmsMph.toExponential(2);

      }
    }

    row.innerHTML = `
      <td style="padding: 10px; font-weight: bold; color: #333;">${viz.title}</td>
      <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 12px;">
        ${viz.stats.minSpeed === Infinity ? '0.0' : viz.stats.minSpeed.toFixed(1)}
      </td>
      <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 12px;">
        ${viz.stats.maxSpeed.toFixed(1)}
      </td>
      <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 12px;">
        ${viz.stats.avgSpeed.toFixed(1)}
      </td>
      <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 12px;">
        ${strength}
      </td>
      <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 12px;">
        ${downrangeScale}
      </td>
      <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 12px;">
        ${crossrangeScale}
      </td>
      <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 12px;">
        ${temporalScale}
      </td>
      <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 12px;">
        ${exponent}
      </td>
      <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 12px;">
        ${sigmoidThreshold}
      </td>
      <td style="padding: 10px; text-align: center; font-family: monospace; font-size: 12px;">
        ${rms}
      </td>
      <td style="padding: 10px; text-align: center;">
        ${viz.title.startsWith('Component ') || viz.title === 'Composite Wind' ? `<button class="histogram-btn" data-title="${viz.title.replace(/"/g, '&quot;')}" style="padding: 5px 10px; background: #6f42c1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">📊 Histogram</button>` : '-'}
      </td>
    `;

    tableBody.appendChild(row);
  }
}

function updateComponentDetails()
{
  if (!wind) return;

  const simulationTimeEl = document.getElementById('simulationTime');
  const activeComponentsEl = document.getElementById('activeComponents');
  const advectionGainEl = document.getElementById('advectionGain');

  // Update global state in top stats panel
  if (activeComponentsEl)
  {
    const numComponents = wind.getNumActiveComponents();
    activeComponentsEl.textContent = numComponents;
  }

  if (simulationTimeEl)
  {
    const currentTime = wind.getCurrentTime();
    simulationTimeEl.textContent = currentTime.toFixed(1);
  }

  if (advectionGainEl)
  {
    const advectionGain = wind.getAdvectionGain();
    advectionGainEl.textContent = advectionGain.toFixed(1);
  }

  // Update global advection display
  const globalAdvectionOffsetEl = document.getElementById('globalAdvectionOffset');
  const globalAdvectionSpeedEl = document.getElementById('globalAdvectionSpeed');

  if (globalAdvectionOffsetEl)
  {
    const offset = wind.getGlobalAdvectionOffset();
    const offsetX = offset.x * 1.094; // m to yards
    const offsetY = offset.y * 1.094; // m to yards
    globalAdvectionOffsetEl.textContent = `(${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`;
    offset.delete();
  }

  if (globalAdvectionSpeedEl)
  {
    const velocity = wind.getGlobalAdvectionVelocity();
    const velX = velocity.x * 2.237; // m/s to mph
    const velY = velocity.y * 2.237; // m/s to mph
    const speed = Math.sqrt(velX * velX + velY * velY);
    globalAdvectionSpeedEl.textContent = speed.toFixed(1);
    velocity.delete();
  }
}

function setupUI()
{
  const preset = document.getElementById('preset');
  const timeScale = document.getElementById('timeScale');
  const timeScaleVal = document.getElementById('timeScaleVal');
  const restartBtn = document.getElementById('restartBtn');
  const helpBtn = document.getElementById('helpBtn');
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

  };

  const rebuild = () =>
  {
    // Use fixed values instead of reading from UI
    state.yards = 1000; // Fixed at 1000 yards
    state.meters = btk.Conversions.yardsToMeters(state.yards);
    state.preset = preset.value;
    state.density = 60; // Fixed at 60 arrows

    // Reset statistics
    resetStats();

    // Reset time tracking
    state.elapsed = 0.0;

    // Always create a new wind generator instance
    if (wind)
    {
      wind.delete();
      wind = null;
    }
    // Define the sampling area (yards)
    const minCorner = new btk.Vector3D(0.0, -100.0, 0.0);
    const maxCorner = new btk.Vector3D(1000.0, 100.0, 0.0);
    try
    {
      wind = btk.WindPresets.getPreset(state.preset, minCorner, maxCorner);
    }
    catch (error)
    {
      console.error('Error creating preset:', error);
    }
    finally
    {
      // Clean up Vector3D objects
      minCorner.delete();
      maxCorner.delete();
    }
    buildAllVisualizations();
  };

  // Load presets once at startup
  populatePresets();

  rebuild();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () =>
  {
    if (wind)
    {
      wind.delete();
      wind = null;
    }
    clearAllVisualizations();
  });
  startAnimation();

  preset.addEventListener('change', () =>
  {
    // Clean up existing wind object before creating new one
    if (wind)
    {
      wind.delete();
      wind = null;
    }
    rebuild();
  });

  // Button event listeners
  restartBtn.addEventListener('click', () =>
  {
    rebuild();
    startAnimation();
  });

  helpBtn.addEventListener('click', () =>
  {
    document.getElementById('helpModal').style.display = 'block';
  });

  // Help modal close functionality
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.querySelector('.help-close');

  if (helpClose)
  {
    helpClose.addEventListener('click', () =>
    {
      helpModal.style.display = 'none';
    });
  }

  // Close modal when clicking outside
  if (helpModal)
  {
    helpModal.addEventListener('click', (e) =>
    {
      if (e.target === helpModal)
      {
        helpModal.style.display = 'none';
      }
    });
  }
  timeScale.addEventListener('input', () =>
  {
    state.timeScale = parseFloat(timeScale.value) || 1.0;
    timeScaleVal.textContent = `${state.timeScale.toFixed(1)}x`;
  });

  // Color threshold slider
  const colorThresholdSlider = document.getElementById('colorThreshold');
  const colorThresholdVal = document.getElementById('colorThresholdVal');
  colorThresholdSlider.addEventListener('input', () =>
  {
    colorThreshold = parseFloat(colorThresholdSlider.value) || 7.5;
    colorThresholdVal.textContent = `${colorThreshold.toFixed(1)} mph`;
  });

  // Event delegation for histogram buttons (since table rows are rebuilt every frame)
  const tableBody = document.getElementById('windDetailsTableBody');

  if (tableBody)
  {
    // Test that the table body receives clicks at all
    tableBody.addEventListener('click', (e) =>
    {

      // Check if clicked element is a histogram button or inside one
      let btn = e.target;
      if (!btn.classList.contains('histogram-btn'))
      {
        // Maybe clicked inside the button (like the emoji)
        btn = e.target.closest('.histogram-btn');
      }

      if (btn && btn.classList.contains('histogram-btn'))
      {
        e.preventDefault();
        e.stopPropagation();
        const title = btn.getAttribute('data-title');

        if (!title)
        {
          console.error('No data-title attribute on histogram button');
          alert('Error: Missing data attribute on histogram button');
          return;
        }

        try
        {
          if (title.startsWith('Component '))
          {
            const componentIndex = parseInt(title.split(' ')[1]);
            showHistogram(componentIndex, title, false);
          }
          else if (title === 'Composite Wind')
          {
            showHistogram(-1, title, true);
          }
          else
          {
            console.error('Unknown title format:', title);
            alert('Error: Unknown visualization type: ' + title);
          }
        }
        catch (error)
        {
          console.error('Error in histogram click handler:', error);
          alert('Error showing histogram: ' + error.message);
        }
      }
    }, true); // Use capture phase

    // Also try direct listener on document to catch all clicks
    document.addEventListener('click', (e) =>
    {
      if (e.target && e.target.classList && e.target.classList.contains('histogram-btn'))
      {
        const title = e.target.getAttribute('data-title');
        if (title)
        {
          if (title.startsWith('Component '))
          {
            const componentIndex = parseInt(title.split(' ')[1]);
            showHistogram(componentIndex, title, false);
          }
          else if (title === 'Composite Wind')
          {
            showHistogram(-1, title, true);
          }
        }
      }
    }, true);
  }
}

// Build all wind field visualizations
function buildAllVisualizations()
{
  // Clear existing visualizations
  clearAllVisualizations();

  if (!wind) return;

  const container = document.getElementById('windVisualizations');
  if (!container) return;

  // Get number of active components
  const numComponents = wind.getNumActiveComponents();

  // No bias visualization - we removed bias concept

  // Create a reusable Vector3D to avoid allocating on every sample
  const reusablePos = new btk.Vector3D(0, 0, 0);

  // Create component visualizations
  for (let i = 0; i < numComponents; i++)
  {
    createVisualizationSection(container, `component${i}`, `Component ${i}`, (x, y, z) =>
    {
      const pos = new btk.Vector3D(x, y, z);
      const result = wind.sampleComponent(i, pos);
      pos.delete();
      return result;
    });
  }

  // Create composite visualization
  createVisualizationSection(container, 'composite', 'Composite Wind', (x, y, z) =>
  {
    return wind.sample(x, y, z);
  });

  // Create separate smoke flow visualization section
  createSmokeVisualizationSection(container, 'smoke-flow', 'Smoke Flow Visualization');

  // Initialize all visualizations
  for (const viz of visualizations)
  {
    viz.init();
  }
}

function createVisualizationSection(container, canvasId, title, samplingFunction)
{
  // Create section container
  const section = document.createElement('div');
  section.className = 'wind-field-section';

  // Create title
  const titleEl = document.createElement('div');
  titleEl.className = 'wind-field-title';
  titleEl.textContent = title;
  section.appendChild(titleEl);

  // Create canvas wrapper
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'wind-field-canvas-wrap';

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.id = canvasId;
  canvas.className = 'wind-field-canvas';
  canvas.width = 1000;
  canvas.height = 200;
  canvasWrap.appendChild(canvas);

  // Add axis labels
  const axisLabels = document.createElement('div');
  axisLabels.className = 'axis-labels';
  axisLabels.innerHTML = `
    <div class="x-axis-label left">0 yd</div>
    <div class="x-axis-label center">500 yd</div>
    <div class="x-axis-label right">1000 yd</div>
    <div class="x-axis-label title">Downrange (yards)</div>
    <div class="y-axis-label top">-100 yd</div>
    <div class="y-axis-label center">0 yd</div>
    <div class="y-axis-label bottom">+100 yd</div>
    <div class="y-axis-label title">Crossrange (yards)</div>
  `;
  canvasWrap.appendChild(axisLabels);

  // Add legend
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.textContent = 'Color = speed (blue→red). Triangle points toward wind direction in ground plane.';
  canvasWrap.appendChild(legend);

  section.appendChild(canvasWrap);
  container.appendChild(section);

  // Create and store visualization
  const visualization = new WindFieldVisualization(canvasId, title, samplingFunction);
  visualizations.push(visualization);
}

function createSmokeVisualizationSection(container, canvasId, title)
{
  // Create section container
  const section = document.createElement('div');
  section.className = 'wind-field-section';

  // Create title
  const titleEl = document.createElement('div');
  titleEl.className = 'wind-field-title';
  titleEl.textContent = title;
  section.appendChild(titleEl);

  // Create canvas wrapper
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'wind-field-canvas-wrap';

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.id = canvasId;
  canvas.className = 'wind-field-canvas';
  canvas.width = 1000;
  canvas.height = 200;
  canvasWrap.appendChild(canvas);

  // Add axis labels
  const axisLabels = document.createElement('div');
  axisLabels.className = 'axis-labels';
  axisLabels.innerHTML = `
    <div class="x-axis-label left">0 yd</div>
    <div class="x-axis-label center">500 yd</div>
    <div class="x-axis-label right">1000 yd</div>
    <div class="x-axis-label title">Downrange (yards)</div>
    <div class="y-axis-label top">-100 yd</div>
    <div class="y-axis-label center">0 yd</div>
    <div class="y-axis-label bottom">+100 yd</div>
    <div class="y-axis-label title">Crossrange (yards)</div>
  `;
  canvasWrap.appendChild(axisLabels);

  // Add legend
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.textContent = 'Smoke particles show wind flow patterns. Color = speed (blue→red).';
  canvasWrap.appendChild(legend);

  section.appendChild(canvasWrap);
  container.appendChild(section);

  // Create Three.js scene for smoke simulation
  const scene = new THREE.Scene();

  // Match the wind visualization camera bounds: 0-1000 X, -100 to +100 Y
  const marginX = 20;
  const marginY = 20;
  const camera = new THREE.OrthographicCamera(
    -marginX,
    1000 + marginX,
    100 + marginY,
    -100 - marginY,
    -10,
    10
  );
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer(
  {
    canvas: canvas,
    alpha: false, // Opaque black background
    antialias: true,
    preserveDrawingBuffer: false
  });
  renderer.setSize(1000, 200, false); // Don't update style
  renderer.setClearColor(0x000000, 1.0); // Solid black background
  renderer.sortObjects = false; // Disable sorting for better performance

  // Dispose existing smoke simulation if any
  if (smokeSimulation)
  {
    smokeSimulation.dispose();
    smokeSimulation = null;
  }

  // Create new smoke simulation with bounds
  const bounds = {
    minX_m: 0.0,
    maxX_m: 914.4, // 1000 yards
    minY_m: -91.44, // -100 yards
    maxY_m: 91.44 // 100 yards
  };
  smokeSimulation = new SmokeSimulation(btk, scene, wind, bounds);
  smokeSimulation.setEnabled(true); // Always enabled

  // Store renderer and scene for cleanup
  smokeSimulation.renderer = renderer;
  smokeSimulation.camera = camera;
}

function clearAllVisualizations()
{
  // Dispose all visualizations
  for (const viz of visualizations)
  {
    viz.dispose();
  }
  visualizations = [];

  // Dispose smoke simulation
  if (smokeSimulation)
  {
    smokeSimulation.dispose();
    if (smokeSimulation.renderer)
    {
      smokeSimulation.renderer.dispose();
    }
    smokeSimulation = null;
  }

  // Clear container
  const container = document.getElementById('windVisualizations');
  if (container)
  {
    container.innerHTML = '';
  }
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

function frameOnce()
{
  drawFrame();
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
  if (!wind) return;
  resizeRenderer();

  const now = performance.now();
  const dt = (now - startTime) / 1000.0;
  startTime = now;
  state.elapsed += dt * state.timeScale;
  const t = state.elapsed;

  // Advance wind time once per frame
  wind.advanceTime(t);

  // Update all visualizations
  for (const viz of visualizations)
  {
    viz.update();
    viz.renderer.render(viz.scene, viz.camera);
  }

  // Update and render smoke simulation
  if (smokeSimulation)
  {
    smokeSimulation.advanceTime(t);
    if (smokeSimulation.renderer && smokeSimulation.camera)
    {
      smokeSimulation.renderer.render(smokeSimulation.scene, smokeSimulation.camera);
    }
  }

  // Update global stats by aggregating from all visualizations
  updateGlobalStats();

  // Update statistics display
  updateStatsDisplay();

  // Update component details table
  updateComponentDetails();
}

function showError(message)
{
  const errorDiv = document.getElementById('error');
  if (errorDiv)
  {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

// Note: Histogram data is now accumulated continuously during visualization updates
// The generateHistogramData function has been removed in favor of using
// the accumulated histogram data stored in each visualization object

// Draw histogram on canvas
function drawHistogram(canvas, histogramData)
{
  const ctx = canvas.getContext('2d');

  // Get actual canvas dimensions
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  const padding = {
    top: 50,
    right: 50,
    bottom: 80,
    left: 80
  };
  const width = canvasWidth - padding.left - padding.right;
  const height = canvasHeight - padding.top - padding.bottom;

  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Find max bin count for scaling
  const maxCount = Math.max(...histogramData.bins);
  if (maxCount === 0)
  {
    ctx.fillStyle = '#333';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No data', canvasWidth / 2, canvasHeight / 2);
    return;
  }

  // Draw background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw axes
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + height);
  ctx.lineTo(padding.left + width, padding.top + height);
  ctx.stroke();

  // Draw grid lines
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++)
  {
    const y = padding.top + (height * i / 10);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + width, y);
    ctx.stroke();
  }

  // Draw bars
  const barWidth = width / histogramData.numBins;
  ctx.fillStyle = '#6f42c1';
  for (let i = 0; i < histogramData.numBins; i++)
  {
    if (histogramData.bins[i] > 0)
    {
      const barHeight = (histogramData.bins[i] / maxCount) * height;
      const x = padding.left + i * barWidth;
      const y = padding.top + height - barHeight;
      ctx.fillRect(x, y, Math.max(1, barWidth), barHeight);
    }
  }

  // Draw axis labels
  ctx.fillStyle = '#333';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // X-axis labels (speed in mph)
  for (let i = 0; i <= 10; i++)
  {
    const speed = (histogramData.maxSpeed * i / 10);
    const x = padding.left + (width * i / 10);
    ctx.fillText(speed.toFixed(1), x, padding.top + height + 10);
  }
  ctx.font = 'bold 16px Arial';
  ctx.fillText('Wind Speed (mph)', padding.left + width / 2, padding.top + height + 50);

  // Y-axis labels (count)
  ctx.font = '14px Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 10; i++)
  {
    const count = Math.round(maxCount * (1 - i / 10));
    const y = padding.top + (height * i / 10);
    ctx.fillText(count.toString(), padding.left - 10, y);
  }
  ctx.save();
  ctx.translate(20, padding.top + height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px Arial';
  ctx.fillText('Frequency', 0, 0);
  ctx.restore();
}

// Show histogram modal for a component or composite wind
function showHistogram(componentIndex, title, isComposite = false)
{
  if (!wind)
  {
    console.error('Wind generator not initialized');
    return;
  }

  // Find the visualization for this title
  const viz = visualizations.find(v => v.title === title);
  if (!viz)
  {
    console.error('Visualization not found for title:', title, 'Available:', visualizations.map(v => v.title));
    return;
  }

  // Use accumulated histogram data from visualization
  const binSize = viz.histogramBinSize;
  const maxSpeedMph = Math.max(viz.histogramMaxSpeed, viz.stats.maxSpeed > 0 ? viz.stats.maxSpeed : 1);
  const numBins = Math.ceil(maxSpeedMph / binSize);

  // Convert Map to array for drawing
  const bins = new Array(numBins).fill(0);
  let totalCount = 0;
  let minSpeed = Infinity;
  let maxSpeed = -Infinity;
  let sumSpeed = 0;
  let sumSpeedSquared = 0;

  for (const [binIndex, count] of viz.histogramBins.entries())
  {
    if (binIndex >= 0 && binIndex < numBins)
    {
      bins[binIndex] = count;
      totalCount += count;

      // Calculate speed for this bin (center of bin)
      const speedMph = (binIndex + 0.5) * binSize;
      minSpeed = Math.min(minSpeed, speedMph);
      maxSpeed = Math.max(maxSpeed, speedMph);

      // For statistics, we need to distribute the count across the bin range
      // For simplicity, use the bin center
      sumSpeed += speedMph * count;
      sumSpeedSquared += speedMph * speedMph * count;
    }
  }

  // Calculate statistics
  const mean = totalCount > 0 ? sumSpeed / totalCount : 0;
  const variance = totalCount > 0 ? (sumSpeedSquared / totalCount) - (mean * mean) : 0;
  const stdDev = Math.sqrt(Math.max(0, variance));

  // Use actual min/max from stats if available (more accurate than bin centers)
  const actualMin = viz.stats.minSpeed !== Infinity ? viz.stats.minSpeed : (minSpeed !== Infinity ? minSpeed : 0);
  const actualMax = viz.stats.maxSpeed > 0 ? viz.stats.maxSpeed : (maxSpeed !== -Infinity ? maxSpeed : 0);

  const histogramData = {
    bins: bins,
    binSize: binSize,
    numBins: numBins,
    maxSpeed: maxSpeedMph,
    stats:
    {
      min: actualMin,
      max: actualMax,
      mean: mean,
      stdDev: stdDev,
      numSamples: totalCount
    }
  };

  // Handle empty histogram case
  if (totalCount === 0)
  {
    alert('No histogram data available yet. The histogram accumulates data as the visualization runs.');
    return;
  }

  // Show modal
  const modal = document.getElementById('histogramModal');
  const canvas = document.getElementById('histogramCanvas');
  const titleEl = document.getElementById('histogramTitle');
  const statsEl = document.getElementById('histogramStats');

  if (!modal)
  {
    console.error('Histogram modal element not found');
    alert('Error: Histogram modal not found. Please refresh the page.');
    return;
  }

  if (!canvas)
  {
    console.error('Histogram canvas element not found');
    alert('Error: Histogram canvas not found. Please refresh the page.');
    return;
  }

  if (!titleEl)
  {
    console.error('Histogram title element not found');
    alert('Error: Histogram title element not found. Please refresh the page.');
    return;
  }

  if (!statsEl)
  {
    console.error('Histogram stats element not found');
    alert('Error: Histogram stats element not found. Please refresh the page.');
    return;
  }

  try
  {
    // Set canvas to fill the modal width
    const modalContent = modal.querySelector('div');
    const modalWidth = modalContent.offsetWidth;
    const canvasWidth = modalWidth - 40; // 20px padding on each side
    const canvasHeight = 500; // Fixed height

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';

    // Update title
    titleEl.textContent = `${title} - Wind Speed Histogram`;

    // Update stats
    statsEl.innerHTML = `
      <strong>Statistics:</strong> Min: ${histogramData.stats.min.toFixed(2)} mph, 
      Max: ${histogramData.stats.max.toFixed(2)} mph, 
      Mean: ${histogramData.stats.mean.toFixed(2)} mph, 
      Std Dev: ${histogramData.stats.stdDev.toFixed(2)} mph | 
      <strong>Samples:</strong> ${histogramData.stats.numSamples} | 
      <strong>Bin Size:</strong> ${histogramData.binSize} mph
    `;

    // Draw histogram
    drawHistogram(canvas, histogramData);

    // Show modal
    modal.style.display = 'block';
  }
  catch (error)
  {
    console.error('Error displaying histogram:', error);
    alert('Error displaying histogram: ' + error.message);
  }
}

// Close histogram modal
function closeHistogramModal()
{
  const modal = document.getElementById('histogramModal');
  modal.style.display = 'none';
}

// Setup modal close handlers
document.addEventListener('DOMContentLoaded', () =>
{
  const closeBtn = document.getElementById('closeHistogramModal');
  const modal = document.getElementById('histogramModal');

  if (closeBtn)
  {
    closeBtn.addEventListener('click', closeHistogramModal);
  }

  if (modal)
  {
    modal.addEventListener('click', (e) =>
    {
      if (e.target === modal)
      {
        closeHistogramModal();
      }
    });
  }
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () =>
{
  try
  {
    btk = await BallisticsToolkit();
    await setupUI();

  }
  catch (error)
  {
    console.error('Failed to initialize:', error);
    showError('Failed to load wind simulator. Please refresh the page.');
  }
});