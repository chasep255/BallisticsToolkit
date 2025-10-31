/**
 * Target Simulator - Monte Carlo Match Simulation
 * Web GUI for ballistic match simulation using WebAssembly
 */

import BallisticsToolkit from '../ballistics_toolkit_wasm.js';

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
      liveScore: document.getElementById('liveScore'),
      canvas: document.getElementById('targetCanvas'),
      tooltip: document.getElementById('tooltip')
    };

    // Initialize canvas
    this.canvas = this.elements.canvas;
    this.ctx = this.canvas.getContext('2d');

    // Set canvas size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

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

    // Set default selection to MR-1FCA if available, otherwise first target
    const defaultTarget = targetNames.includes('MR-1FCA') ? 'MR-1FCA' : targetNames[0];
    if (defaultTarget)
    {
      targetSelect.value = defaultTarget;
    }

    console.log(`Loaded ${targetNames.length} targets:`, targetNames);
  }

  populateTargetDropdownFallback()
  {
    const targetSelect = document.getElementById('target');
    const fallbackTargets = [
      'SR', 'SR-3', 'SR-1', 'SR-21', 'MR-63', 'MR-65', 'MR-1', 'MR-31', 'MR-52',
      'LR', 'MR-63FCA', 'MR-65FCA', 'MR-1FCA', 'LR-FCA'
    ];

    targetSelect.innerHTML = '';
    fallbackTargets.forEach(targetName =>
    {
      const option = document.createElement('option');
      option.value = targetName;
      option.textContent = targetName;
      if (targetName === 'MR-1FCA') option.selected = true;
      targetSelect.appendChild(option);
    });
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

      // Start simulation
      this.isRunning = true;
      // Start performance timer
      this.perfStartMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this.perfShotsFired = 0;
      this.fireNextShot();

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
    const targetName = document.getElementById('target').value;
    const range = btk.Conversions.yardsToMeters(parseFloat(document.getElementById('range').value));
    const shots = parseInt(document.getElementById('shots').value);
    const matches = parseInt(document.getElementById('matches').value);
    const mvSd = btk.Conversions.fpsToMps(parseFloat(document.getElementById('mvSd').value));
    const windSd = btk.Conversions.mphToMps(parseFloat(document.getElementById('windSd').value));
    const headwindSd = btk.Conversions.mphToMps(parseFloat(document.getElementById('headwindSd').value));
    const updraftSd = btk.Conversions.mphToMps(parseFloat(document.getElementById('updraftSd').value));
    const rifleAccuracyMrad = btk.Conversions.moaToRadians(parseFloat(document.getElementById('rifleAccuracy').value));
    const altitude = btk.Conversions.feetToMeters(parseFloat(document.getElementById('altitude').value));
    const temperature = btk.Conversions.fahrenheitToKelvin(parseFloat(document.getElementById('temperature').value));
    const humidity = parseFloat(document.getElementById('humidity').value) / 100.0;
    // Create bullet
    this.bullet = new btk.Bullet(
      btk.Conversions.grainsToKg(0), // Weight not used in 3DOF
      diameter,
      btk.Conversions.inchesToMeters(0), // Length not used
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
      rifleAccuracyMrad,
      0.001 // timestep
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

  fireNextShot()
  {
    if (!this.isRunning)
    {
      return;
    }

    try
    {
      // Fire shot
      const simulatedShot = this.simulator.fireShot();
      this.perfShotsFired++;
      this.currentShot++;
      this.currentShots.push(simulatedShot);
      this.allShots.push(simulatedShot);

      // Update display
      this.drawShotImpact(simulatedShot);
      this.updateLiveScore();

      // Check if match is complete
      if (this.currentShot >= this.totalShots)
      {
        this.finishMatch();
      }
      else
      {
        // Schedule next shot
        setTimeout(() => this.fireNextShot(), 50);
      }

    }
    catch (error)
    {
      console.error('Shot simulation failed:', error);
      alert('Shot simulation failed: ' + error.message);
      this.stopSimulation();
    }
  }

  finishMatch()
  {
    // Clear shots for next match
    this.simulator.clearShots();

    // Check if all matches are complete
    if (this.currentMatch >= this.totalMatches)
    {
      this.finishSimulation();
    }
    else
    {
      // Start next match
      this.currentMatch++;
      this.currentShot = 0;
      this.currentShots = [];

      // Log match header

      // Schedule next shot
      setTimeout(() => this.fireNextShot(), 50);
    }
  }

  finishSimulation()
  {
    this.isRunning = false;
    this.elements.runBtn.disabled = false;
    this.elements.stopBtn.disabled = true;

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
    this.shotItems.clear();
    this.currentMatch = 0;
    this.currentShot = 0;
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
    tooltip.innerHTML = `
            <div><strong>Shot Details:</strong></div>
            <div>Impact: X=${btk.Conversions.metersToInches(simulatedShot.impactX).toFixed(2)}" Y=${btk.Conversions.metersToInches(simulatedShot.impactY).toFixed(2)}"</div>
            <div>Score: ${simulatedShot.score}${simulatedShot.isX ? 'x' : ''}</div>
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




  updateLiveScore()
  {
    if (this.allShots.length === 0)
    {
      const totalShotsAllMatches = this.totalShots * this.totalMatches;
      this.elements.liveScore.textContent = `Estimated Avg Match Score: --- | Shots: 0/${totalShotsAllMatches}`;
      return;
    }

    const totalScore = this.allShots.reduce((sum, simulatedShot) => sum + simulatedShot.score, 0);
    const xCount = this.allShots.filter(simulatedShot => simulatedShot.isX).length;
    const shotsFired = this.allShots.length;
    const totalShotsAllMatches = this.totalShots * this.totalMatches;

    if (shotsFired > 0)
    {
      const avgScorePerShot = totalScore / shotsFired;
      const avgXRate = xCount / shotsFired;
      const estimatedMatchScore = Math.round(avgScorePerShot * this.totalShots);
      const estimatedMatchXCount = Math.round(avgXRate * this.totalShots);

      this.elements.liveScore.textContent =
        `Estimated Avg Match Score: ${estimatedMatchScore}-${estimatedMatchXCount}x | Shots: ${shotsFired}/${totalShotsAllMatches}`;
    }
    else
    {
      this.elements.liveScore.textContent = `Estimated Avg Match Score: --- | Shots: 0/${totalShotsAllMatches}`;
    }
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


  mean(arr)
  {
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  median(arr)
  {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  stdDev(arr)
  {
    const mean = this.mean(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () =>
{
  try
  {
    btk = await BallisticsToolkit();
    console.log('BallisticsToolkit WASM module ready');

    // Create simulator instance after WASM is loaded
    window.targetSimulator = new TargetSimulator();
    console.log('Target Simulator initialized successfully');

  }
  catch (error)
  {
    console.error('Failed to initialize:', error);
    document.getElementById('loading').innerHTML = 'Failed to load WebAssembly module';
  }
});