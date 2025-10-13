/**
 * Target Simulator - Monte Carlo Match Simulation
 * Web GUI for ballistic match simulation using WebAssembly
 */

class TargetSimulator {
    constructor() {
        this.Module = null;
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
            this.Module = await BallisticsToolkit();
            
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
            status: document.getElementById('status'),
            liveScore: document.getElementById('liveScore'),
            logContent: document.getElementById('logContent'),
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
        
        // Zoom controls
        document.getElementById('resetZoom').addEventListener('click', () => this.resetZoom());
        
        // Canvas interactions
        this.canvas.addEventListener('wheel', (e) => this.onMouseWheel(e));
        this.canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this.onCanvasMouseLeave());
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
            humidity: parseFloat(document.getElementById('humidity').value)
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
            this.elements.status.textContent = 'Starting simulation...';
            
            // Start simulation
            this.isRunning = true;
            this.addLogText(`\n${'═'.repeat(60)}\n`);
            this.addLogText(`🎯 MATCH ${this.currentMatch} STARTING\n`);
            this.addLogText(`${'═'.repeat(60)}\n`);
            this.fireNextShot();
            
        } catch (error) {
            console.error('Simulation setup failed:', error);
            alert('Simulation setup failed: ' + error.message);
            this.stopSimulation();
        }
    }

    stopSimulation() {
        this.isRunning = false;
        this.elements.status.textContent = 'Simulation stopped';
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
        const humidity = parseFloat(document.getElementById('humidity').value);
        // Create bullet
        const bullet = new this.Module.Bullet(
            this.Module.Weight.grains(0), // Weight not used in 3DOF
            this.Module.Distance.inches(diameter),
            this.Module.Distance.inches(0), // Length not used
            bc,
            document.getElementById('dragFunction').value === 'G1' ? 
                this.Module.DragFunction.G1 : this.Module.DragFunction.G7
        );

        // Create atmosphere
        const temp = this.Module.Temperature.fahrenheit(temperature);
        const alt = this.Module.Distance.feet(altitude);
        // Use automatic pressure calculation at altitude
        const press = this.Module.Pressure.zero(); // This will be calculated automatically
        
        const atmosphere = new this.Module.Atmosphere(temp, alt, humidity, press);

        // Get target
        const target = this.Module.NRATargets.getTarget(targetName);
        if (!target) {
            throw new Error(`Unknown target: ${targetName}`);
        }

        // Update ring sizes display
        this.updateRingSizesDisplay(target);

        // Create simulator
        const rifleAccuracyMrad = this.Module.Angle.moa(rifleAccuracy).getMrad();
        
        this.simulator = new this.Module.MatchSimulator(
            bullet,
            this.Module.Velocity.fps(mv),
            target,
            this.Module.Distance.yards(range),
            atmosphere,
            this.Module.Velocity.fps(mvSd),
            this.Module.Velocity.mph(windSd),
            this.Module.Velocity.mph(headwindSd),
            this.Module.Velocity.mph(updraftSd),
            this.Module.Angle.mrad(rifleAccuracyMrad),
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
            this.logShot(shot, this.currentShot);
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
        this.logMatchResult(this.currentMatch, result);

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
            this.elements.status.textContent = `Match ${this.currentMatch}/${this.totalMatches}`;

            // Log match header
            this.addLogText(`\n${'═'.repeat(60)}\n`);
            this.addLogText(`🎯 MATCH ${this.currentMatch} STARTING\n`);
            this.addLogText(`${'═'.repeat(60)}\n`);

            // Schedule next shot
            setTimeout(() => this.fireNextShot(), 50);
        }
    }

    finishSimulation() {
        this.isRunning = false;
        this.elements.status.textContent = 'Simulation complete!';
        this.elements.runBtn.disabled = false;
        this.elements.stopBtn.disabled = true;

        // Show results in log
        this.showResultsInLog();
    }

    clearResults() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.elements.logContent.innerHTML = '';
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
        
        // Calculate scale
        const ring8Info = this.Module.getRingInfoWrapper(target, 8);
        const referenceDiameter = ring8Info.inner.getInches() * 2; // 8-ring diameter
        const baseScale = Math.min(this.canvas.width, this.canvas.height) * 0.85 / referenceDiameter;
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
            const ringInfo = this.Module.getRingInfoWrapper(target, spec.ring);
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

    resetZoom() {
        this.zoomFactor = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.redrawTarget();
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

    addLogText(text) {
        // Create a span element for better formatting control
        const span = document.createElement('span');
        span.textContent = text;
        this.elements.logContent.appendChild(span);
        this.elements.logContent.scrollTop = this.elements.logContent.scrollHeight;
    }

    logShot(shot, shotNum) {
        const scoreDisplay = shot.isX ? `${shot.score}x` : shot.score.toString();
        const xPos = shot.impactX.getInches().toFixed(2);
        const yPos = shot.impactY.getInches().toFixed(2);
        const mv = shot.actualMv.getFps().toFixed(0);
        const iv = shot.impactVelocity.getFps().toFixed(0);
        
        let text = `Shot ${shotNum.toString().padStart(2)}: `;
        text += `X=${xPos}" Y=${yPos}" `;
        text += `Score=${scoreDisplay} `;
        text += `MV=${mv} IV=${iv} `;
        text += `Wind=(${shot.windDownrange.getMph().toFixed(1)},${shot.windCrossrange.getMph().toFixed(1)},${shot.windVertical.getMph().toFixed(1)}) mph\n`;
        this.addLogText(text);
    }

    logMatchResult(matchNum, result) {
        let text = `\n${'─'.repeat(50)}\n`;
        text += `🎯 Match ${matchNum} Summary\n`;
        text += `${'─'.repeat(50)}\n`;
        text += `  Total Score: ${result.totalScore}-${result.xCount}x\n`;
        text += `  Group Size: ${result.groupSize.getInches().toFixed(2)}"\n`;
        text += `\n`;
        this.addLogText(text);
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

    updateRingSizesDisplay(target) {
        const ringSizesBox = document.getElementById('ringSizesBox');
        const ringSizesContent = document.getElementById('ringSizesContent');
        if (!ringSizesBox || !ringSizesContent) return;

        try {
            // Get X ring diameter directly
            const xRingDiameter = target.getXRingDiameter();
            const ring10 = this.Module.getRingInfoWrapper(target, 10);
            const ring9 = this.Module.getRingInfoWrapper(target, 9);
            const ring8 = this.Module.getRingInfoWrapper(target, 8);
            const ring7 = this.Module.getRingInfoWrapper(target, 7);
            const ring6 = this.Module.getRingInfoWrapper(target, 6);
            const ring5 = this.Module.getRingInfoWrapper(target, 5);
            const ring4 = this.Module.getRingInfoWrapper(target, 4);
            const ring3 = this.Module.getRingInfoWrapper(target, 3);
            const ring2 = this.Module.getRingInfoWrapper(target, 2);
            const ring1 = this.Module.getRingInfoWrapper(target, 1);

            // Build ring sizes display, only showing non-zero rings
            let ringSizesHtml = '';
            
            // Add X ring if it exists
            const xDiameter = xRingDiameter.getInches();
            if (xDiameter > 0) {
                ringSizesHtml += `<div>X: ${xDiameter.toFixed(2)}"</div>`;
            }
            
            const rings = [
                { num: 10, info: ring10 },
                { num: 9, info: ring9 },
                { num: 8, info: ring8 },
                { num: 7, info: ring7 },
                { num: 6, info: ring6 },
                { num: 5, info: ring5 },
                { num: 4, info: ring4 },
                { num: 3, info: ring3 },
                { num: 2, info: ring2 },
                { num: 1, info: ring1 }
            ];
            
            rings.forEach(ring => {
                const diameter = ring.info.inner.getInches();
                if (diameter > 0) {
                    ringSizesHtml += `<div>${ring.num}: ${diameter.toFixed(2)}"</div>`;
                }
            });
            
            ringSizesContent.innerHTML = ringSizesHtml;
            
            // Show the ring sizes box
            ringSizesBox.style.display = 'block';
        } catch (error) {
            ringSizesContent.textContent = 'Error loading ring sizes';
            console.error('Error updating ring sizes:', error);
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
        const worldX = (canvasX - centerX - this.panX) / (this.zoomFactor * this.targetScale);
        const worldY = (canvasY - centerY - this.panY) / (this.zoomFactor * this.targetScale);
        
        // Convert to inches (assuming 1 unit = 1 inch at scale 1.0)
        const inchesX = worldX;
        const inchesY = -worldY; // Flip Y axis (canvas Y increases downward)
        
        // Update display
        mousePositionContent.innerHTML = `
            ${inchesX.toFixed(1)}", ${inchesY.toFixed(1)}"
        `;
    }

    showResultsInLog() {
        if (!this.allResults || this.allResults.length === 0) {
            return;
        }

        const totalShots = this.allResults.reduce((sum, result) => sum + result.shots.length, 0);
        const scores = this.allResults.map(result => result.totalScore);
        const xCounts = this.allResults.map(result => result.xCount);
        const groupSizes = this.allResults.map(result => result.groupSize.getInches());

        let text = '='.repeat(60) + '\n';
        text += 'FINAL SUMMARY\n';
        text += '='.repeat(60) + '\n';
        text += `Matches Simulated: ${this.allResults.length}\n`;
        text += `Total Shots: ${totalShots}\n\n`;

        text += 'SCORE STATISTICS:\n';
        text += `  Mean:   ${this.mean(scores).toFixed(1)}\n`;
        text += `  Median: ${this.median(scores).toFixed(1)}\n`;
        text += `  StdDev: ${this.stdDev(scores).toFixed(2)}\n`;
        text += `  Min:    ${Math.min(...scores)}\n`;
        text += `  Max:    ${Math.max(...scores)}\n\n`;

        text += 'X-COUNT STATISTICS:\n';
        text += `  Mean:   ${this.mean(xCounts).toFixed(1)}\n`;
        text += `  Median: ${this.median(xCounts).toFixed(1)}\n`;
        text += `  StdDev: ${this.stdDev(xCounts).toFixed(2)}\n`;
        text += `  Min:    ${Math.min(...xCounts)}\n`;
        text += `  Max:    ${Math.max(...xCounts)}\n\n`;

        text += 'GROUP SIZE STATISTICS (inches):\n';
        text += `  Mean:   ${this.mean(groupSizes).toFixed(2)}\n`;
        text += `  Median: ${this.median(groupSizes).toFixed(2)}\n`;
        text += `  StdDev: ${this.stdDev(groupSizes).toFixed(2)}\n`;
        text += `  Min:    ${Math.min(...groupSizes).toFixed(2)}\n`;
        text += `  Max:    ${Math.max(...groupSizes).toFixed(2)}\n\n`;

        text += 'INDIVIDUAL MATCH RESULTS:\n';
        text += '-'.repeat(40) + '\n';
        this.allResults.forEach((result, i) => {
            text += `Match ${i + 1}: ${result.totalScore}-${result.xCount}x (Group: ${result.groupSize.getInches().toFixed(2)}")\n`;
        });

        this.addLogText('\n' + text);
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
