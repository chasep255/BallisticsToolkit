/**
 * Target Simulator - Monte Carlo Match Simulation
 * Web GUI for ballistic match simulation using WebAssembly
 */

class TargetSimulator {
    constructor() {
        this.btk = null;
        this.simulator = null;
        this.currentShots = [];
        this.allShots = [];
        this.currentMatch = 0;
        this.currentShot = 0;
        this.totalShots = 0;
        this.totalMatches = 0;
        this.isRunning = false;
        this.allResults = [];
        
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
        
        this.init();
    }

    async init() {
        try {
            // Show loading
            document.getElementById('loading').classList.add('show');
            
            // Initialize WebAssembly module
            this.btk = await BallisticsToolkit();
            
            // Hide loading
            document.getElementById('loading').classList.remove('show');
            
            // Initialize UI
            this.initializeUI();
            this.setupEventListeners();
            
            console.log('Target Simulator initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Target Simulator:', error);
            document.getElementById('loading').innerHTML = 'Failed to load WebAssembly module';
        }
    }

    initializeUI() {
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
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.redrawTarget();
    }

    setupEventListeners() {
        // Control buttons
        this.elements.runBtn.addEventListener('click', () => this.runSimulation());
        this.elements.stopBtn.addEventListener('click', () => this.stopSimulation());
        
        
        // Canvas interactions (mouse)
        this.canvas.addEventListener('wheel', (e) => this.onMouseWheel(e));
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

    validateInputs() {
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
        for (const [key, value] of Object.entries(inputs)) {
            if (isNaN(value) || value < 0) {
                alert(`Invalid input for ${key}: ${value}`);
                return false;
            }
        }


        return true;
    }

    async runSimulation() {
        if (!this.validateInputs()) {
            return;
        }

        if (this.isRunning) {
            alert('Simulation is already running');
            return;
        }

        try {
            // Clear previous results
            this.clearResults();
            
            // Setup simulation
            await this.setupSimulation();
            
            // Update UI
            this.elements.runBtn.disabled = true;
            this.elements.stopBtn.disabled = false;
            
            // Start simulation
            this.isRunning = true;
            this.fireNextShot();
            
        } catch (error) {
            console.error('Simulation setup failed:', error);
            alert('Simulation setup failed: ' + error.message);
            this.stopSimulation();
        }
    }

    stopSimulation() {
        this.isRunning = false;
        this.elements.runBtn.disabled = false;
        this.elements.stopBtn.disabled = true;
    }

    async setupSimulation() {
        // Get parameters
        const bc = parseFloat(document.getElementById('bc').value);
        const mv = parseFloat(document.getElementById('mv').value);
        const diameter = parseFloat(document.getElementById('diameter').value);
        const targetName = document.getElementById('target').value;
        const range = parseFloat(document.getElementById('range').value);
        const shots = parseInt(document.getElementById('shots').value);
        const matches = parseInt(document.getElementById('matches').value);
        const mvSd = parseFloat(document.getElementById('mvSd').value);
        const windSd = parseFloat(document.getElementById('windSd').value);
        const headwindSd = parseFloat(document.getElementById('headwindSd').value);
        const updraftSd = parseFloat(document.getElementById('updraftSd').value);
        const rifleAccuracy = parseFloat(document.getElementById('rifleAccuracy').value);
        const altitude = parseFloat(document.getElementById('altitude').value);
        const temperature = parseFloat(document.getElementById('temperature').value);
        const humidity = parseFloat(document.getElementById('humidity').value) / 100.0;
        // Create bullet
        const bullet = new this.btk.Bullet(
            this.btk.Weight.grains(0), // Weight not used in 3DOF
            this.btk.Distance.inches(diameter),
            this.btk.Distance.inches(0), // Length not used
            bc,
            document.getElementById('dragFunction').value === 'G1' ? 
                this.btk.DragFunction.G1 : this.btk.DragFunction.G7
        );

        // Create atmosphere
        const temp = this.btk.Temperature.fahrenheit(temperature);
        const alt = this.btk.Distance.feet(altitude);
        // Use automatic pressure calculation at altitude
        const press = this.btk.Pressure.zero(); // This will be calculated automatically
        
        const atmosphere = new this.btk.Atmosphere(temp, alt, humidity, press);

        // Get target
        const target = this.btk.NRATargets.getTarget(targetName);
        if (!target) {
            throw new Error(`Unknown target: ${targetName}`);
        }


        // Create simulator
        const rifleAccuracyMrad = this.btk.Angle.moa(rifleAccuracy).getMrad();
        
        this.simulator = new this.btk.MatchSimulator(
            bullet,
            this.btk.Velocity.fps(mv),
            target,
            this.btk.Distance.yards(range),
            atmosphere,
            this.btk.Velocity.fps(mvSd),
            this.btk.Velocity.mph(windSd),
            this.btk.Velocity.mph(headwindSd),
            this.btk.Velocity.mph(updraftSd),
            this.btk.Angle.mrad(rifleAccuracyMrad),
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

    fireNextShot() {
        if (!this.isRunning) {
            return;
        }

        try {
            // Fire shot
            const shot = this.simulator.fireShot();
            this.currentShot++;
            this.currentShots.push(shot);
            this.allShots.push(shot);

            // Update display
            this.drawShotImpact(shot);
            this.updateLiveScore();

            // Check if match is complete
            if (this.currentShot >= this.totalShots) {
                this.finishMatch();
            } else {
                // Schedule next shot
                setTimeout(() => this.fireNextShot(), 50);
            }

        } catch (error) {
            console.error('Shot simulation failed:', error);
            alert('Shot simulation failed: ' + error.message);
            this.stopSimulation();
        }
    }

    finishMatch() {
        // Get match result
        const result = this.simulator.getMatchResult();
        this.allResults.push(result);

        // Clear shots for next match
        this.simulator.clearShots();

        // Check if all matches are complete
        if (this.currentMatch >= this.totalMatches) {
            this.finishSimulation();
        } else {
            // Start next match
            this.currentMatch++;
            this.currentShot = 0;
            this.currentShots = [];

            // Log match header

            // Schedule next shot
            setTimeout(() => this.fireNextShot(), 50);
        }
    }

    finishSimulation() {
        this.isRunning = false;
        this.elements.runBtn.disabled = false;
        this.elements.stopBtn.disabled = true;
    }

    clearResults() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.currentShots = [];
        this.allShots = [];
        this.shotItems.clear();
        this.currentMatch = 0;
        this.currentShot = 0;
        this.allResults = [];
    }

    drawTarget() {
        if (!this.simulator) {
            return;
        }

        const target = this.simulator.getTarget();
        
        // Calculate scale based on container width
        const ring8Info = this.btk.getRingInfoWrapper(target, 8);
        const referenceDiameter = ring8Info.inner.getInches() * 2; // 8-ring diameter
        const baseScale = this.canvas.width * 0.85 / referenceDiameter; // Use width for scaling
        this.targetScale = baseScale * this.zoomFactor;

        // Calculate center with pan
        this.targetCenterX = this.canvas.width / 2 + this.panX;
        this.targetCenterY = this.canvas.height / 2 + this.panY;

        // Draw concentric circles for each scoring ring
        const ringSpecs = [
            { ring: 5, fill: 'white' },
            { ring: 6, fill: 'white' },
            { ring: 7, fill: 'black' },
            { ring: 8, fill: 'black' },
            { ring: 9, fill: 'black' },
            { ring: 10, fill: 'black' }
        ];

        for (const spec of ringSpecs) {
            const ringInfo = this.btk.getRingInfoWrapper(target, spec.ring);
            const radiusInches = ringInfo.inner.getInches() / 2;
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
            if (spec.ring >= 5 && spec.ring <= 9) {
                this.ctx.fillStyle = spec.fill === 'black' ? 'white' : 'black';
                this.ctx.font = 'bold 10px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(spec.ring.toString(), this.targetCenterX, this.targetCenterY - radiusPixels + 15);
            }
        }

        // Draw X-ring
        const xRingRadius = target.getXRingDiameter().getInches() / 2 * this.targetScale;
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

    drawShotImpact(shot) {
        if (!this.simulator) {
            return;
        }

        // Convert shot position to canvas coordinates
        const xPixels = this.targetCenterX + (shot.impactX.getInches() * this.targetScale);
        const yPixels = this.targetCenterY - (shot.impactY.getInches() * this.targetScale); // Flip Y axis

        // Use actual bullet diameter scaled to pixels
        const bulletDiameter = this.simulator.getBulletDiameter().getInches();
        const holeRadius = (bulletDiameter / 2) * this.targetScale;

        // Draw bullet hole (red circle with black outline)
        this.ctx.beginPath();
        this.ctx.arc(xPixels, yPixels, holeRadius, 0, 2 * Math.PI);
        this.ctx.fillStyle = 'red';
        this.ctx.fill();
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        // Store shot for tooltip
        const shotId = `${xPixels},${yPixels}`;
        this.shotItems.set(shotId, shot);
    }

    redrawTarget() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.shotItems.clear();

        // Draw target
        this.drawTarget();

        // Redraw all shots
        for (const shot of this.allShots) {
            this.drawShotImpact(shot);
        }
    }


    onMouseWheel(e) {
        e.preventDefault();
        
        const zoomSpeed = 0.15;
        const zoomIn = e.deltaY < 0;
        
        if (zoomIn) {
            this.zoomFactor *= 1 + zoomSpeed;
        } else {
            this.zoomFactor *= 1 - zoomSpeed;
        }
        
        this.zoomFactor = Math.max(0.1, Math.min(10.0, this.zoomFactor));
        this.redrawTarget();
    }

    onCanvasMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.offsetX;
        this.lastMouseY = e.offsetY;
        this.canvas.style.cursor = 'grabbing';
        e.preventDefault();
    }

    onCanvasMouseUp(e) {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
    }

    onCanvasMouseLeave() {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
        this.hideTooltip();
    }

    onMouseMove(e) {
        if (this.isDragging) {
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
        for (const [shotId, shot] of this.shotItems) {
            const [shotX, shotY] = shotId.split(',').map(Number);
            const distance = Math.sqrt((x - shotX) ** 2 + (y - shotY) ** 2);
            if (distance < 10) { // Within 10 pixels
                this.showTooltip(e, shot);
                return;
            }
        }
        
        this.hideTooltip();
    }

    // Pointer/touch handlers for drag + pinch zoom
    onPointerDown(e) {
        this.canvas.setPointerCapture(e.pointerId);
        this.activePointers = this.activePointers || new Map();
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.activePointers.size === 1) {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        } else if (this.activePointers.size === 2) {
            this.isDragging = false;
            const pts = Array.from(this.activePointers.values());
            this.pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            this.pinchStartZoom = this.zoomFactor;
        }
    }

    onPointerMove(e) {
        if (!this.activePointers || !this.activePointers.has(e.pointerId)) return;
        const prev = this.activePointers.get(e.pointerId);
        const curr = { x: e.clientX, y: e.clientY };
        this.activePointers.set(e.pointerId, curr);

        if (this.activePointers.size === 1 && this.isDragging) {
            const dx = curr.x - this.lastMouseX;
            const dy = curr.y - this.lastMouseY;
            this.panX += dx;
            this.panY += dy;
            this.lastMouseX = curr.x;
            this.lastMouseY = curr.y;
            this.redrawTarget();
        } else if (this.activePointers.size === 2 && this.pinchStartDist) {
            const pts = Array.from(this.activePointers.values());
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            const scale = dist / this.pinchStartDist;
            this.zoomFactor = Math.max(0.1, Math.min(10.0, this.pinchStartZoom * scale));
            this.redrawTarget();
        }
    }

    onPointerUp(e) {
        if (this.activePointers) {
            this.activePointers.delete(e.pointerId);
        }
        if (!this.activePointers || this.activePointers.size === 0) {
            this.isDragging = false;
            this.pinchStartDist = null;
        }
    }

    showTooltip(e, shot) {
        const tooltip = this.elements.tooltip;
        tooltip.innerHTML = `
            <div><strong>Shot Details:</strong></div>
            <div>Impact: X=${shot.impactX.getInches().toFixed(2)}" Y=${shot.impactY.getInches().toFixed(2)}"</div>
            <div>Score: ${shot.score}${shot.isX ? 'x' : ''}</div>
            <div>MV: ${shot.actualMv.getFps().toFixed(0)} fps | IV: ${shot.impactVelocity.getFps().toFixed(0)} fps</div>
            <div>Wind: (${shot.windDownrange.getMph().toFixed(1)}, ${shot.windCrossrange.getMph().toFixed(1)}, ${shot.windVertical.getMph().toFixed(1)}) mph</div>
            <div>Release: (${shot.releaseAngleH.getMoa().toFixed(2)}, ${shot.releaseAngleV.getMoa().toFixed(2)}) MOA</div>
        `;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.pageX + 15) + 'px';
        tooltip.style.top = (e.pageY + 10) + 'px';
    }

    hideTooltip() {
        this.elements.tooltip.style.display = 'none';
    }




    updateLiveScore() {
        if (this.allShots.length === 0) {
            const totalShotsAllMatches = this.totalShots * this.totalMatches;
            this.elements.liveScore.textContent = `Estimated Avg Match Score: --- | Shots: 0/${totalShotsAllMatches}`;
            return;
        }

        const totalScore = this.allShots.reduce((sum, shot) => sum + shot.score, 0);
        const xCount = this.allShots.filter(shot => shot.isX).length;
        const shotsFired = this.allShots.length;
        const totalShotsAllMatches = this.totalShots * this.totalMatches;

        if (shotsFired > 0) {
            const avgScorePerShot = totalScore / shotsFired;
            const avgXRate = xCount / shotsFired;
            const estimatedMatchScore = Math.round(avgScorePerShot * this.totalShots);
            const estimatedMatchXCount = Math.round(avgXRate * this.totalShots);
            
            this.elements.liveScore.textContent = 
                `Estimated Avg Match Score: ${estimatedMatchScore}-${estimatedMatchXCount}x | Shots: ${shotsFired}/${totalShotsAllMatches}`;
        } else {
            this.elements.liveScore.textContent = `Estimated Avg Match Score: --- | Shots: 0/${totalShotsAllMatches}`;
        }
    }


    updateMousePosition(canvasX, canvasY) {
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


    mean(arr) {
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    }

    median(arr) {
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    stdDev(arr) {
        const mean = this.mean(arr);
        const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
        return Math.sqrt(variance);
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.targetSimulator = new TargetSimulator();
});
