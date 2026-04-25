/**
 * Target Simulator - Monte Carlo Match Simulation
 * Web GUI for ballistic match simulation using WebAssembly
 */

import BallisticsToolkit from '../ballistics_toolkit_wasm.js';
import { createSettingsCookies } from '../settings-cookies.js';

const SettingsCookies = createSettingsCookies('target_sim_');

const DEFAULT_PARAMS = {
  bc: '0.311',
  dragFunction: 'G7',
  mv: '2750',
  weight: '140',
  diameter: '0.264',
  length: '1.4',
  twistRate: '8',
  enableSpinEffects: true,
  target: 'MR-1FCA',
  range: '600',
  shots: '60',
  matches: '100',
  mvSd: '7.0',
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
      if (element.type === 'checkbox') element.checked = value;
      else element.value = value;
    }
  }
}

let btk = null;

class TargetSimulator
{
  constructor()
  {
    this.simulator = null;
    this.bullet = null;
    this.atmosphere = null;
    this.target = null;
    this.currentShots = [];
    this.allShots = [];
    this.matchScores = [];
    this.currentMatch = 0;
    this.currentShot = 0;
    this.totalShots = 0;
    this.totalMatches = 0;
    this.isRunning = false;

    // Performance tracking
    this.perfStartMs = null;
    this.perfShotsFired = 0;

    // Target display
    this.canvas = null;
    this.ctx = null;
    this.targetScale = 1.0;
    this.targetCenterX = 0;
    this.targetCenterY = 0;
    this.zoomFactor = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.shotItems = new Map();

    // Drag state
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // UI elements
    this.elements = {};

    // Initialize UI synchronously
    this.initializeUI();
    this.setupEventListeners();
    Utils.setupHelpModal('helpBtn', 'helpModal');
  }


  initializeUI()
  {
    // Get UI elements
    this.elements = {
      runBtn: document.getElementById('runBtn'),
      stopBtn: document.getElementById('stopBtn'),
      progressBar: document.getElementById('progressBar'),
      progressFill: document.getElementById('progressFill'),
      progressText: document.getElementById('progressText'),
      canvas: document.getElementById('targetCanvas'),
      tooltip: document.getElementById('tooltip')
    };

    // Initialize canvas
    this.canvas = this.elements.canvas;
    this.ctx = this.canvas.getContext('2d');

    // Set canvas size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.clearStats();

    // Populate target dropdown from C++
    this.populateTargetDropdown();
  }

  resizeCanvas()
  {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();

    // Check if we're on mobile
    const isMobile = window.innerWidth <= 768;

    if (isMobile)
    {
      // On mobile, be more conservative to ensure it fits
      const maxSize = Math.min(rect.width - 20, rect.height - 20, window.innerWidth - 40);
      const size = Math.max(maxSize, 250); // Minimum size of 250px on mobile
      this.canvas.width = size;
      this.canvas.height = size;
    }
    else
    {
      // On desktop, make canvas as large as possible
      const maxSize = Math.min(rect.width, rect.height, window.innerWidth - 100, window.innerHeight - 200);
      const size = Math.max(maxSize, 300); // Minimum size of 300px
      this.canvas.width = size;
      this.canvas.height = size;
    }

    this.redrawTarget();
  }

  setupEventListeners()
  {
    // Control buttons
    this.elements.runBtn.addEventListener('click', () => this.runSimulation());
    this.elements.stopBtn.addEventListener('click', () => this.stopSimulation());


    // Canvas interactions (mouse)
    this.canvas.addEventListener('wheel', (e) => this.onMouseWheel(e),
    {
      passive: false
    });
    this.canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.onCanvasMouseLeave());

    // Canvas interactions (pointer/touch)
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }


  populateTargetDropdown()
  {
    const targetSelect = document.getElementById('target');

    // Clear existing options
    targetSelect.innerHTML = '';

    // Get available targets from C++
    const availableTargets = btk.Targets.listTargets();

    // Add each target as an option directly from C++ vector
    const targetNames = [];
    for (let i = 0; i < availableTargets.size(); i++)
    {
      const targetName = availableTargets.get(i);
      targetNames.push(targetName);

      const option = document.createElement('option');
      option.value = targetName;
      option.textContent = targetName;
      targetSelect.appendChild(option);
    }

    const savedValue = SettingsCookies.get('target_sim_target');
    if (savedValue && targetNames.includes(savedValue))
    {
      targetSelect.value = savedValue;
    }
    else
    {
      const defaultTarget = targetNames.includes('MR-1FCA') ? 'MR-1FCA' : targetNames[0];
      if (defaultTarget) targetSelect.value = defaultTarget;
    }

    availableTargets.delete();
  }

  validateInputs()
  {
    const inputs = {
      bc: parseFloat(document.getElementById('bc').value),
      mv: parseFloat(document.getElementById('mv').value),
      diameter: parseFloat(document.getElementById('diameter').value),
      range: parseFloat(document.getElementById('range').value),
      shots: parseInt(document.getElementById('shots').value),
      matches: parseInt(document.getElementById('matches').value),
      mvSd: parseFloat(document.getElementById('mvSd').value),
      windSd: parseFloat(document.getElementById('windSd').value),
      headwindSd: parseFloat(document.getElementById('headwindSd').value),
      updraftSd: parseFloat(document.getElementById('updraftSd').value),
      rifleAccuracy: parseFloat(document.getElementById('rifleAccuracy').value),
      scopeCant: parseFloat(document.getElementById('scopeCant').value),
      altitude: parseFloat(document.getElementById('altitude').value),
      temperature: parseFloat(document.getElementById('temperature').value),
      humidity: parseFloat(document.getElementById('humidity').value) / 100.0
    };

    // Validate all inputs
    for (const [key, value] of Object.entries(inputs))
    {
      if (isNaN(value) || value < 0)
      {
        alert(`Invalid input for ${key}: ${value}`);
        return false;
      }
    }


    return true;
  }

  async runSimulation()
  {
    if (!this.validateInputs())
    {
      return;
    }

    if (this.isRunning)
    {
      alert('Simulation is already running');
      return;
    }

    try
    {
      // Clear previous results
      this.clearResults();

      // Setup simulation
      await this.setupSimulation();

      // Update UI
      this.elements.runBtn.disabled = true;
      this.elements.stopBtn.disabled = false;
      this.elements.progressBar.style.display = '';

      // Start simulation
      this.isRunning = true;
      // Start performance timer
      this.perfStartMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this.perfShotsFired = 0;
      this.fireBatch();

    }
    catch (error)
    {
      console.error('Simulation setup failed:', error);
      alert('Simulation setup failed: ' + error.message);
      this.stopSimulation();
    }
  }

  stopSimulation()
  {
    const wasRunning = this.isRunning;
    this.isRunning = false;
    this.elements.runBtn.disabled = false;
    this.elements.stopBtn.disabled = true;
    this.elements.progressBar.style.display = 'none';

    // If stopped mid-run, log partial performance stats
    if (wasRunning && this.perfStartMs != null && this.perfShotsFired > 0)
    {
      const endMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const totalMs = endMs - this.perfStartMs;
      const perShotMs = totalMs / this.perfShotsFired;
      console.log(`Target-Sim stopped: shots=${this.perfShotsFired}, total=${totalMs.toFixed(1)} ms, per-shot=${perShotMs.toFixed(2)} ms`);
    }
  }

  async setupSimulation()
  {
    // Dispose old BTK objects before creating new ones
    if (this.simulator)
    {
      this.simulator.delete();
      this.simulator = null;
    }
    if (this.bullet)
    {
      this.bullet.delete();
      this.bullet = null;
    }
    if (this.atmosphere)
    {
      this.atmosphere.delete();
      this.atmosphere = null;
    }
    if (this.target)
    {
      this.target.delete();
      this.target = null;
    }

    // Get parameters and convert to proper units
    const bc = parseFloat(document.getElementById('bc').value);
    const dragFunction = document.getElementById('dragFunction').value;
    const mv = btk.Conversions.fpsToMps(parseFloat(document.getElementById('mv').value));
    const diameter = btk.Conversions.inchesToMeters(parseFloat(document.getElementById('diameter').value));
    const weightKg = btk.Conversions.grainsToKg(parseFloat(document.getElementById('weight').value));
    const length = btk.Conversions.inchesToMeters(parseFloat(document.getElementById('length').value));
    const twistRate = parseFloat(document.getElementById('twistRate').value);
    const enableSpinEffects = document.getElementById('enableSpinEffects').checked;
    const twistMetersPerTurn = enableSpinEffects ? btk.Conversions.inchesToMeters(twistRate) : 0.0;
    const targetName = document.getElementById('target').value;
    const range = btk.Conversions.yardsToMeters(parseFloat(document.getElementById('range').value));
    const shots = parseInt(document.getElementById('shots').value);
    const matches = parseInt(document.getElementById('matches').value);
    const mvSd = btk.Conversions.fpsToMps(parseFloat(document.getElementById('mvSd').value));
    const windSd = btk.Conversions.mphToMps(parseFloat(document.getElementById('windSd').value));
    const headwindSd = btk.Conversions.mphToMps(parseFloat(document.getElementById('headwindSd').value));
    const updraftSd = btk.Conversions.mphToMps(parseFloat(document.getElementById('updraftSd').value));
    const rifleAccuracyRad = btk.Conversions.moaToRadians(parseFloat(document.getElementById('rifleAccuracy').value));
    const scopeCantRad = btk.Conversions.degreesToRadians(parseFloat(document.getElementById('scopeCant').value));
    const altitude = btk.Conversions.feetToMeters(parseFloat(document.getElementById('altitude').value));
    const temperature = btk.Conversions.fahrenheitToKelvin(parseFloat(document.getElementById('temperature').value));
    const humidity = parseFloat(document.getElementById('humidity').value) / 100.0;
    // Create bullet
    this.bullet = new btk.Bullet(
      weightKg,
      diameter,
      length,
      bc,
      dragFunction === 'G1' ? btk.DragFunction.G1 : btk.DragFunction.G7
    );

    // Create atmosphere
    this.atmosphere = new btk.Atmosphere(temperature, altitude, humidity, 0.0);

    // Get target
    this.target = btk.Targets.getTarget(targetName);
    if (!this.target)
    {
      throw new Error(`Unknown target: ${targetName}`);
    }


    // Create simulator
    this.simulator = new btk.MatchSimulator(
      this.bullet,
      mv,
      this.target,
      range,
      this.atmosphere,
      mvSd,
      windSd,
      headwindSd,
      updraftSd,
      rifleAccuracyRad,
      scopeCantRad,
      0.001, // timestep
      twistMetersPerTurn // twist rate
    );

    // Store simulation parameters
    this.totalShots = shots;
    this.totalMatches = matches;
    this.currentMatch = 1;
    this.currentShot = 0;

    // Reset zoom and draw target
    this.zoomFactor = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.redrawTarget();
  }

  fireBatch()
  {
    if (!this.isRunning) return;

    try
    {
      while (this.currentShot < this.totalShots)
      {
        const simulatedShot = this.simulator.fireShot();
        this.perfShotsFired++;
        this.currentShot++;
        this.currentShots.push(simulatedShot);
        this.allShots.push(simulatedShot);
      }

      let matchPoints = 0;
      let matchX = 0;
      for (const s of this.currentShots)
      {
        matchPoints += s.score;
        if (s.isX) matchX++;
      }
      this.matchScores.push({ score: matchPoints, xCount: matchX });

      this.simulator.clearShots();
      this.redrawTarget();
      this.updateStats();

      if (this.currentMatch >= this.totalMatches)
      {
        this.finishSimulation();
        return;
      }

      this.currentMatch++;
      this.currentShot = 0;
      this.currentShots = [];
      requestAnimationFrame(() => this.fireBatch());
    }
    catch (error)
    {
      console.error('Shot simulation failed:', error);
      alert('Shot simulation failed: ' + error.message);
      this.stopSimulation();
    }
  }

  finishSimulation()
  {
    this.isRunning = false;
    this.elements.runBtn.disabled = false;
    this.elements.stopBtn.disabled = true;
    this.elements.progressBar.style.display = 'none';

    // Log performance summary
    if (this.perfStartMs != null && this.perfShotsFired > 0)
    {
      const endMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const totalMs = endMs - this.perfStartMs;
      const perShotMs = totalMs / this.perfShotsFired;
      console.log(`Target-Sim complete: shots=${this.perfShotsFired}, total=${totalMs.toFixed(1)} ms, per-shot=${perShotMs.toFixed(2)} ms`);
    }
  }

  clearResults()
  {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.currentShots = [];
    this.allShots = [];
    this.matchScores = [];
    this.shotItems.clear();
    this.currentMatch = 0;
    this.currentShot = 0;
    this.clearStats();
  }

  drawTarget()
  {
    if (!this.simulator)
    {
      return;
    }

    const target = this.simulator.getTarget();

    // Calculate scale based on container width
    const ring8InnerDiameter = target.getRingInnerDiameter(8);
    const referenceDiameter = btk.Conversions.metersToInches(ring8InnerDiameter) * 2; // 8-ring diameter
    const baseScale = this.canvas.width * 0.85 / referenceDiameter; // Use width for scaling
    this.targetScale = baseScale * this.zoomFactor;

    // Calculate center with pan
    this.targetCenterX = this.canvas.width / 2 + this.panX;
    this.targetCenterY = this.canvas.height / 2 + this.panY;

    // Draw concentric circles for each scoring ring
    const ringSpecs = [
    {
      ring: 5,
      fill: 'white'
    },
    {
      ring: 6,
      fill: 'white'
    },
    {
      ring: 7,
      fill: 'black'
    },
    {
      ring: 8,
      fill: 'black'
    },
    {
      ring: 9,
      fill: 'black'
    },
    {
      ring: 10,
      fill: 'black'
    }];

    for (const spec of ringSpecs)
    {
      const ringInnerDiameter = target.getRingInnerDiameter(spec.ring);
      const radiusInches = btk.Conversions.metersToInches(ringInnerDiameter) / 2;
      const radiusPixels = radiusInches * this.targetScale;

      // Draw filled circle
      this.ctx.beginPath();
      this.ctx.arc(this.targetCenterX, this.targetCenterY, radiusPixels, 0, 2 * Math.PI);
      this.ctx.fillStyle = spec.fill;
      this.ctx.fill();

      // Draw boundary line
      this.ctx.strokeStyle = spec.fill === 'black' ? 'white' : 'black';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      // Add ring number
      if (spec.ring >= 5 && spec.ring <= 9)
      {
        this.ctx.fillStyle = spec.fill === 'black' ? 'white' : 'black';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(spec.ring.toString(), this.targetCenterX, this.targetCenterY - radiusPixels + 15);
      }
    }

    // Draw X-ring
    const xRingRadius = btk.Conversions.metersToInches(target.getXRingDiameter()) / 2 * this.targetScale;
    this.ctx.beginPath();
    this.ctx.arc(this.targetCenterX, this.targetCenterY, xRingRadius, 0, 2 * Math.PI);
    this.ctx.fillStyle = 'black';
    this.ctx.fill();
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    // Draw white X in center
    const xSize = xRingRadius * 0.5;
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(this.targetCenterX - xSize, this.targetCenterY - xSize);
    this.ctx.lineTo(this.targetCenterX + xSize, this.targetCenterY + xSize);
    this.ctx.moveTo(this.targetCenterX - xSize, this.targetCenterY + xSize);
    this.ctx.lineTo(this.targetCenterX + xSize, this.targetCenterY - xSize);
    this.ctx.stroke();

    target.delete();
  }

  drawShotImpact(simulatedShot)
  {
    if (!this.simulator)
    {
      return;
    }

    // Convert shot position to canvas coordinates
    const xPixels = this.targetCenterX + (btk.Conversions.metersToInches(simulatedShot.impactX) * this.targetScale);
    const yPixels = this.targetCenterY - (btk.Conversions.metersToInches(simulatedShot.impactY) * this.targetScale); // Flip Y axis

    // Use actual bullet diameter scaled to pixels
    const bulletDiameter = btk.Conversions.metersToInches(this.simulator.getBulletDiameter());
    const holeRadius = (bulletDiameter / 2) * this.targetScale;

    // Draw bullet hole (red circle with red outline)
    this.ctx.beginPath();
    this.ctx.arc(xPixels, yPixels, holeRadius, 0, 2 * Math.PI);
    this.ctx.fillStyle = 'red';
    this.ctx.fill();
    this.ctx.strokeStyle = 'red';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    // Store shot for tooltip
    const shotId = `${xPixels},${yPixels}`;
    this.shotItems.set(shotId, simulatedShot);
  }

  redrawTarget()
  {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.shotItems.clear();

    // Draw target
    this.drawTarget();

    // Redraw all shots
    for (const simulatedShot of this.allShots)
    {
      this.drawShotImpact(simulatedShot);
    }
  }


  onMouseWheel(e)
  {
    e.preventDefault();

    const zoomSpeed = 0.15;
    const zoomIn = e.deltaY < 0;

    if (zoomIn)
    {
      this.zoomFactor *= 1 + zoomSpeed;
    }
    else
    {
      this.zoomFactor *= 1 - zoomSpeed;
    }

    this.zoomFactor = Math.max(0.1, Math.min(10.0, this.zoomFactor));
    this.redrawTarget();
  }

  onCanvasMouseDown(e)
  {
    this.isDragging = true;
    this.lastMouseX = e.offsetX;
    this.lastMouseY = e.offsetY;
    this.canvas.style.cursor = 'grabbing';
    e.preventDefault();
  }

  onCanvasMouseUp(e)
  {
    this.isDragging = false;
    this.canvas.style.cursor = 'grab';
  }

  onCanvasMouseLeave()
  {
    this.isDragging = false;
    this.canvas.style.cursor = 'grab';
    this.hideTooltip();
  }

  onMouseMove(e)
  {
    if (this.isDragging)
    {
      const dx = e.offsetX - this.lastMouseX;
      const dy = e.offsetY - this.lastMouseY;

      this.panX += dx;
      this.panY += dy;

      this.lastMouseX = e.offsetX;
      this.lastMouseY = e.offsetY;

      this.redrawTarget();
    }

    // Update mouse position display
    this.updateMousePosition(e.offsetX, e.offsetY);

    // Check for tooltip
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find shot under cursor
    for (const [shotId, simulatedShot] of this.shotItems)
    {
      const [shotX, shotY] = shotId.split(',').map(Number);
      const distance = Math.sqrt((x - shotX) ** 2 + (y - shotY) ** 2);
      if (distance < 10)
      { // Within 10 pixels
        this.showTooltip(e, simulatedShot);
        return;
      }
    }

    this.hideTooltip();
  }

  // Pointer/touch handlers for drag + pinch zoom
  onPointerDown(e)
  {
    this.canvas.setPointerCapture(e.pointerId);
    this.activePointers = this.activePointers || new Map();
    this.activePointers.set(e.pointerId,
    {
      x: e.clientX,
      y: e.clientY
    });
    if (this.activePointers.size === 1)
    {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
    else if (this.activePointers.size === 2)
    {
      this.isDragging = false;
      const pts = Array.from(this.activePointers.values());
      this.pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      this.pinchStartZoom = this.zoomFactor;
    }
  }

  onPointerMove(e)
  {
    if (!this.activePointers || !this.activePointers.has(e.pointerId)) return;
    const prev = this.activePointers.get(e.pointerId);
    const curr = {
      x: e.clientX,
      y: e.clientY
    };
    this.activePointers.set(e.pointerId, curr);

    if (this.activePointers.size === 1 && this.isDragging)
    {
      const dx = curr.x - this.lastMouseX;
      const dy = curr.y - this.lastMouseY;
      this.panX += dx;
      this.panY += dy;
      this.lastMouseX = curr.x;
      this.lastMouseY = curr.y;
      this.redrawTarget();
    }
    else if (this.activePointers.size === 2 && this.pinchStartDist)
    {
      const pts = Array.from(this.activePointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const scale = dist / this.pinchStartDist;
      this.zoomFactor = Math.max(0.1, Math.min(10.0, this.pinchStartZoom * scale));
      this.redrawTarget();
    }
  }

  onPointerUp(e)
  {
    if (this.activePointers)
    {
      this.activePointers.delete(e.pointerId);
    }
    if (!this.activePointers || this.activePointers.size === 0)
    {
      this.isDragging = false;
      this.pinchStartDist = null;
    }
  }

  showTooltip(e, simulatedShot)
  {
    const tooltip = this.elements.tooltip;
    const cantLine = (simulatedShot.scopeCant !== undefined && simulatedShot.scopeCant !== null)
      ? `<div>Scope cant: ${btk.Conversions.radiansToDegrees(simulatedShot.scopeCant).toFixed(2)}&deg;</div>`
      : '';
    tooltip.innerHTML = `
            <div><strong>Shot Details:</strong></div>
            <div>Impact: X=${btk.Conversions.metersToInches(simulatedShot.impactX).toFixed(2)}" Y=${btk.Conversions.metersToInches(simulatedShot.impactY).toFixed(2)}"</div>
            <div>Score: ${simulatedShot.score}${simulatedShot.isX ? 'x' : ''}</div>
            ${cantLine}
            <div>MV: ${btk.Conversions.mpsToFps(simulatedShot.actualMv).toFixed(0)} fps | IV: ${btk.Conversions.mpsToFps(simulatedShot.impactVelocity).toFixed(0)} fps</div>
            <div>Wind: (${btk.Conversions.mpsToMph(simulatedShot.windDownrange).toFixed(1)}, ${btk.Conversions.mpsToMph(simulatedShot.windCrossrange).toFixed(1)}, ${btk.Conversions.mpsToMph(simulatedShot.windVertical).toFixed(1)}) mph</div>
            <div>Release: (${btk.Conversions.radiansToMoa(simulatedShot.releaseAngleH).toFixed(2)}, ${btk.Conversions.radiansToMoa(simulatedShot.releaseAngleV).toFixed(2)}) MOA</div>
        `;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.pageX + 15) + 'px';
    tooltip.style.top = (e.pageY + 10) + 'px';
  }

  hideTooltip()
  {
    this.elements.tooltip.style.display = 'none';
  }




  clearStats()
  {
    const valueIds = [
      'statAvgScore', 'statScoreSd', 'statScoreMinMax', 'statScorePct',
      'statXAvg', 'statXSd', 'statXMinMax', 'statXPct', 'statCounts',
      'distX', 'dist10', 'dist9', 'dist8', 'dist7', 'dist6', 'dist5', 'distMiss'
    ];
    for (const id of valueIds)
    {
      const el = document.getElementById(id);
      if (el) el.textContent = '--';
    }
    this.elements.progressFill.style.width = '0%';
    this.elements.progressText.textContent = '0%';
  }

  updateStats()
  {
    const totalPlanned = this.totalShots * this.totalMatches;
    const done = this.allShots.length;
    if (totalPlanned > 0)
    {
      const pct = (done / totalPlanned) * 100;
      this.elements.progressFill.style.width = `${pct}%`;
      this.elements.progressText.textContent = `${done} / ${totalPlanned}`;
    }

    if (this.allShots.length === 0)
    {
      return;
    }

    // Per-shot ring distribution
    const ring = { x: 0, r10: 0, r9: 0, r8: 0, r7: 0, r6: 0, r5: 0, miss: 0 };
    for (const s of this.allShots)
    {
      if (s.isX) ring.x++;
      else if (s.score === 10) ring.r10++;
      else if (s.score === 9) ring.r9++;
      else if (s.score === 8) ring.r8++;
      else if (s.score === 7) ring.r7++;
      else if (s.score === 6) ring.r6++;
      else if (s.score === 5) ring.r5++;
      else ring.miss++;
    }
    const n = this.allShots.length;
    const fmt = (c) => `${(c / n * 100).toFixed(1)}% (${c})`;
    const setD = (id, c) =>
    {
      const el = document.getElementById(id);
      if (el) el.textContent = fmt(c);
    };
    setD('distX', ring.x);
    setD('dist10', ring.r10);
    setD('dist9', ring.r9);
    setD('dist8', ring.r8);
    setD('dist7', ring.r7);
    setD('dist6', ring.r6);
    setD('dist5', ring.r5);
    setD('distMiss', ring.miss);

    // Match-level stats (one row per completed match)
    const m = this.matchScores.length;
    const matchesPlanned = this.totalMatches;
    const statCounts = document.getElementById('statCounts');
    if (statCounts) statCounts.textContent = `${m} / ${matchesPlanned}  |  ${done} / ${totalPlanned}`;

    if (m === 0)
    {
      return;
    }

    const pointTotals = this.matchScores.map(x => x.score);
    const xTotals = this.matchScores.map(x => x.xCount);

    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const sampleStd = (arr) =>
    {
      if (arr.length < 2) return 0;
      const mu = mean(arr);
      let s2 = 0;
      for (const v of arr) s2 += (v - mu) * (v - mu);
      return Math.sqrt(s2 / (arr.length - 1));
    };
    const percentile = (sorted, p) =>
    {
      if (sorted.length === 0) return null;
      const idx = Math.floor((sorted.length - 1) * p);
      return sorted[idx];
    };

    const sortNum = (a, b) => a - b;
    const sortedPoints = [...pointTotals].sort(sortNum);
    const sortedX = [...xTotals].sort(sortNum);

    const ptMean = mean(pointTotals);
    const xMean = mean(xTotals);
    const ptSd = sampleStd(pointTotals);
    const xSd = sampleStd(xTotals);

    const setIf = (id, text) =>
    {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setIf('statAvgScore', `${ptMean.toFixed(1)}-${xMean.toFixed(1)}x`);
    setIf('statScoreSd', ptSd.toFixed(2));
    setIf('statScoreMinMax', `${Math.min(...pointTotals)} - ${Math.max(...pointTotals)}`);
    setIf('statScorePct', `${percentile(sortedPoints, 0.05)} / ${percentile(sortedPoints, 0.5)} / ${percentile(sortedPoints, 0.95)}`);
    setIf('statXAvg', xMean.toFixed(1));
    setIf('statXSd', (m < 2 ? 0.0 : xSd).toFixed(2));
    setIf('statXMinMax', `${Math.min(...xTotals)} - ${Math.max(...xTotals)}`);
    setIf('statXPct', `${percentile(sortedX, 0.05)} / ${percentile(sortedX, 0.5)} / ${percentile(sortedX, 0.95)}`);
  }


  updateMousePosition(canvasX, canvasY)
  {
    const mousePositionBox = document.getElementById('mousePositionBox');
    const mousePositionContent = document.getElementById('mousePositionContent');
    if (!mousePositionBox || !mousePositionContent) return;

    // Show the mouse position box
    mousePositionBox.style.display = 'block';

    // Convert canvas coordinates to target coordinates (inches)
    // Use the same center calculation as drawTarget()
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    // Apply zoom and pan transformations (same as drawTarget)
    // Note: this.targetScale already includes zoomFactor, so don't multiply again
    const worldX = (canvasX - centerX - this.panX) / this.targetScale;
    const worldY = (canvasY - centerY - this.panY) / this.targetScale;

    // Convert to inches (assuming 1 unit = 1 inch at scale 1.0)
    const inchesX = worldX;
    const inchesY = -worldY; // Flip Y axis (canvas Y increases downward)

    // Update display
    mousePositionContent.innerHTML = `
            ${inchesX.toFixed(1)}", ${inchesY.toFixed(1)}"
        `;
  }


}

document.addEventListener('DOMContentLoaded', async () =>
{
  try
  {
    setDefaultValues();

    btk = await BallisticsToolkit();
    console.log('BallisticsToolkit WASM module ready');

    window.targetSimulator = new TargetSimulator();

    SettingsCookies.loadAll();
    SettingsCookies.attachAutoSave();

    document.getElementById('resetDefaults').addEventListener('click', (e) =>
    {
      e.preventDefault();
      setDefaultValues();
      window.targetSimulator.populateTargetDropdown();
      SettingsCookies.saveAll();
    });
  }
  catch (error)
  {
    console.error('Failed to initialize:', error);
    document.getElementById('loading').innerHTML = 'Failed to load WebAssembly module';
  }
});