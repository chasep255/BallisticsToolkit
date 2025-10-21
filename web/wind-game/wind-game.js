import BallisticsToolkit from '../ballistics_toolkit_wasm.js';

let btk = null;


// WebGL game instance
let webglGame = null;

// Initialize the game
async function init()
{
  console.log('Wind Game initialized');
}

function setupUI()
{
  // Start button
  document.getElementById('startBtn').addEventListener('click', startGame);

  // Restart button
  document.getElementById('restartBtn').addEventListener('click', restartGame);
}

function startGame()
{
  try
  {
    // Clean up previous game if exists
    if (webglGame)
    {
      webglGame.destroy();
    }

    // Get current parameters
    const params = getGameParams();

    // Create new Three.js game instance (constructor handles all init)
    const canvas = document.getElementById('gameCanvas');
    webglGame = new ThreeJSGame(canvas, params);
    webglGame.start();

    // Update UI
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('restartBtn').style.display = 'inline-block';

    console.log('Game started with params:', params);
  }
  catch (error)
  {
    console.error('Failed to start game:', error);
  }
}

function restartGame()
{
  try
  {
    // Get current parameters
    const params = getGameParams();
    
    // Clean up previous game if exists
    if (webglGame) {
      webglGame.destroy();
    }
    
    // Create new Three.js game instance with updated parameters
    const canvas = document.getElementById('gameCanvas');
    webglGame = new ThreeJSGame(canvas, params);
    webglGame.start();
    
    console.log('Game restarted with params:', params);
  }
  catch (error)
  {
    console.error('Failed to restart game:', error);
  }
}

function getGameParams()
{
  return {
    distance: parseInt(document.getElementById('distanceYd').value),
    target: document.getElementById('target').value,
    windPreset: document.getElementById('windPreset').value
  };
}

function populateTargetDropdown()
{
  const targetSelect = document.getElementById('target');
  targetSelect.innerHTML = '';

  const availableTargets = btk.NRATargets.listTargets();
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

  const defaultTarget = targetNames.includes('MR-1FCA') ? 'MR-1FCA' : targetNames[0];
  if (defaultTarget)
  {
    targetSelect.value = defaultTarget;
  }
}

function populateWindPresetDropdown()
{
  const windSelect = document.getElementById('windPreset');
  if (!windSelect || !btk) return;

  windSelect.innerHTML = '';

  try
  {
    // Get list of available wind presets
    const presetList = btk.WindPresets.listPresets();
    const presetNames = [];
    for (let i = 0; i < presetList.size(); i++)
    {
      presetNames.push(presetList.get(i));
    }

    // Add options with formatted names
    presetNames.forEach(name =>
    {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name.replace(/([A-Z])/g, ' $1').trim();
      windSelect.appendChild(option);
    });

    // Set default selection to first preset
    if (presetNames.length > 0)
    {
      windSelect.value = presetNames[0];
    }

    console.log('Loaded wind presets:', presetNames);
  }
  catch (error)
  {
    console.error('Error loading wind presets:', error);
  }
}

// Three.js Game Renderer Class
class ThreeJSGame
{
  // ===== CONSTANTS =====
  // Range dimensions in yards
  static RANGE_TOTAL_WIDTH = 200;
  static RANGE_LANE_WIDTH = 50;

  // Flag pole dimensions in yards
  static POLE_HEIGHT = 12;
  static POLE_THICKNESS = 0.1;
  static POLE_INTERVAL = 100;

  // Pits dimensions in yards
  static PITS_HEIGHT = 3;
  static PITS_DEPTH = 10;

  // Target animation constants
  static TARGET_MAX_HEIGHT = 0; // No additional height when raised (baseHeight already has the gap)
  static TARGET_HALF_MAST = -(2 + 0.2) / 2; // Halfway between raised and lowered
  static TARGET_MIN_HEIGHT = -(2 + 0.2); // Fully lowered (target size + gap)
  static TARGET_ANIMATION_SPEED = 0.75; // yards per second

  // Camera settings
  static CAMERA_FOV = 30;
  static CAMERA_EYE_HEIGHT = 1.5;

  // ===== INITIALIZATION =====
  constructor(canvas, params = {})
  {
    this.canvas = canvas;
    this.isRunning = false;
    this.animationId = null;

    // Game parameters as instance properties
    this.distance = params.distance || 1000;
    this.target = params.target || 'MR-1FCA';
    this.windPreset = params.windPreset || 'Calm';

    // Game time tracking
    this.gameStartTime = 0;
    this.time = 0;

    // FPS tracking
    this.lastTime = 0;
    this.frameCount = 0;
    this.fps = 0;

    // Three.js setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    
    console.log('Renderer setup complete');
    
    // Setup camera, lighting, and range
    this.setupCamera();
    this.setupLighting();
    // Wind generator
    this.windGenerator = null;
    
    // Wind flag properties
    this.flagMeshes = [];
    this.flagPositions = [];
    
    // Target animation properties
    this.targetFrames = [];
    this.targetAnimationTime = 0;
    this.targetAnimationSpeed = 2.0; // cycles per second
    
    this.setupRange();

    // Initialize
    this.createWindGenerator();
    this.createWindFlags();
    
    console.log('Wind Game initialized');
  }

  createNoiseTexture() {
    // Create a canvas for dense grass texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Create dense grass pattern
    const imageData = ctx.createImageData(512, 512);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % 512;
      const y = Math.floor((i / 4) / 512);
      
      // Generate multiple layers of noise for density
      let noise = 0;
      noise += Math.random() * 0.3;
      noise += Math.random() * 0.2;
      noise += Math.random() * 0.1;
      noise += Math.random() * 0.05;
      noise = Math.min(1, noise);
      
      // Add some grass blade patterns
      const grassPattern = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.1;
      noise += grassPattern;
      
      data[i] = noise * 255;     // R
      data[i + 1] = noise * 255; // G  
      data[i + 2] = noise * 255;  // B
      data[i + 3] = 255;         // A
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Create Three.js texture with higher repeat for density
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8); // More repeats for denser texture
    return texture;
  }

  // ===== SCENE SETUP =====
  setupCamera() {
    // Camera: BTK coords (X=downrange, Y=crossrange, Z=up)
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(ThreeJSGame.CAMERA_FOV, aspect, 0.1, this.distance + 10);
    this.camera.position.set(0, 0, ThreeJSGame.CAMERA_EYE_HEIGHT); // At shooter position, eye level
    this.camera.up.set(0, 0, 1); // Z is up
    this.camera.lookAt(100, 0, ThreeJSGame.CAMERA_EYE_HEIGHT); // Look downrange at eye level initially
    
    console.log('Camera setup complete');
  }

  setupLighting() {
    // Brighter ambient light for late morning
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);
    
    // Directional light simulating late morning sun from behind (south)
    const directionalLight = new THREE.DirectionalLight(0xfff4e6, 1.2); // Warm morning sunlight
    directionalLight.position.set(-100, -50, 150); // Behind and higher for morning sun
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }

  setupRange() {
    const rangeLength = this.distance; // yards
    // Add brown ground that's wider than the range
    const brownGroundGeometry = new THREE.PlaneGeometry(rangeLength, ThreeJSGame.RANGE_TOTAL_WIDTH);
    const brownGroundMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, side: THREE.DoubleSide }); // Brown
    const brownGround = new THREE.Mesh(brownGroundGeometry, brownGroundMaterial);
    brownGround.position.set(rangeLength / 2, 0, 0); // Center it downrange
    this.scene.add(brownGround);
    
    // Add a range plane - just the shooting lanes with grass texture
    const groundGeometry = new THREE.PlaneGeometry(rangeLength, ThreeJSGame.RANGE_LANE_WIDTH);
    
    // Create grass material with dense texture variation
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1a4d1a,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0.0,
      bumpScale: 1.5 // Increased for more visible texture
    });
    
    // Add some noise for texture
    const noiseTexture = this.createNoiseTexture();
    groundMaterial.bumpMap = noiseTexture;
    groundMaterial.normalMap = noiseTexture;
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.set(rangeLength / 2, 0, 0); // Center it downrange
    this.scene.add(ground);
    
    // Add pits at the end of the range
    const pitsGeometry = new THREE.BoxGeometry(ThreeJSGame.PITS_DEPTH, ThreeJSGame.RANGE_LANE_WIDTH, ThreeJSGame.PITS_HEIGHT);
    const pitsMaterial = new THREE.MeshStandardMaterial({ color: 0x8b7355 }); // Grey-brown
    const pits = new THREE.Mesh(pitsGeometry, pitsMaterial);
    
    // Position at the end of the range
    pits.position.set(rangeLength + ThreeJSGame.PITS_DEPTH / 2, 0, ThreeJSGame.PITS_HEIGHT / 2);
    this.scene.add(pits);
    
    // Add target frames above the pits
    this.setupTargets(rangeLength);
    
    console.log('Range setup complete');
  }

  setupTargets(rangeLength) {
    const targetSize = 2; // yards
    const targetSpacing = 1; // yards between targets
    const totalTargetWidth = targetSize + targetSpacing;
    
    // Calculate how many targets fit in the range width
    const rangeWidth = ThreeJSGame.RANGE_LANE_WIDTH;
    const maxTargets = Math.floor(rangeWidth / totalTargetWidth);
    
    // Position targets above the pits - centered on the range width
    const targetHeight = ThreeJSGame.PITS_HEIGHT + 0.2 + targetSize / 2;
    const totalTargetsWidth = maxTargets * targetSize + (maxTargets - 1) * targetSpacing; // Total width including spacing
    const startY = totalTargetsWidth / 2 - targetSize / 2; // Start from left (positive Y), centered
    
    // Create target texture once for all targets
    const targetTexture = this.createTargetTexture();
    
    for (let i = 0; i < maxTargets; i++) {
      const targetGeometry = new THREE.BoxGeometry(0.1, targetSize, targetSize); // Thin frame facing up
      const targetMaterial = new THREE.MeshStandardMaterial({ 
        map: targetTexture
      });
      const target = new THREE.Mesh(targetGeometry, targetMaterial);
      
      // Position target 0.1 yards in front of pits - left to right (positive Y to negative Y)
      const yPos = startY - i * totalTargetWidth;
      target.position.set(rangeLength + 0.1, yPos, targetHeight);
      this.scene.add(target);
      
      // Store target frame for animation
      this.targetFrames.push({
        mesh: target,
        baseHeight: targetHeight,
        targetNumber: i + 1,
        numberBox: null, // Will be set when we create the number box
        currentHeight: 0, // Current offset from baseHeight
        targetHeightGoal: 0, // Where we're animating to
        animating: false
      });
      
      // Add white target number box 0.2 yards above the target with number texture
      // Target 1 is at i=0 (leftmost position)
      const numberGeometry = new THREE.BoxGeometry(0.1, targetSize, targetSize);
      const numberTexture = this.createNumberTexture(i + 1);
      const numberMaterial = new THREE.MeshStandardMaterial({ 
        map: numberTexture,
        transparent: true
      });
      const numberBox = new THREE.Mesh(numberGeometry, numberMaterial);
      numberBox.position.set(rangeLength + 0.1, yPos, targetHeight + targetSize + 0.2); // 0.2 yards above target
      this.scene.add(numberBox);
      
      // Store number box reference for animation
      this.targetFrames[i].numberBox = numberBox;
    }
    
    console.log(`Added ${maxTargets} target frames above pits`);
  }

  createTargetTexture() {
    // Get the actual target from BTK for accurate dimensions
    const target = btk.NRATargets.getTarget(this.target);
    
    // Create canvas - use 1024x1024 for high resolution
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 1024;
    canvas.height = 1024;
    
    const centerX = 512;
    const centerY = 512;
    
    // Scale: 2 yards = 1024 pixels, so 1 yard = 512 pixels
    const pixelsPerYard = 512;
    
    // Fill entire canvas with white background (outside target area)
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1024, 1024);
    
    // Draw concentric circles from outer to inner (white outer, black center)
    const ringSpecs = [
      { ring: 5, fill: 'white' },
      { ring: 6, fill: 'white' },
      { ring: 7, fill: 'black' },
      { ring: 8, fill: 'black' },
      { ring: 9, fill: 'black' },
      { ring: 10, fill: 'black' }
    ];
    
    for (const spec of ringSpecs) {
      const ringDiameterMeters = target.getRingInnerDiameter(spec.ring);
      const ringDiameterYards = ringDiameterMeters * 1.09361; // meters to yards
      const radiusPixels = (ringDiameterYards / 2) * pixelsPerYard;
      
      // Draw filled circle
      context.beginPath();
      context.arc(centerX, centerY, radiusPixels, 0, 2 * Math.PI);
      context.fillStyle = spec.fill;
      context.fill();
      
      // Draw boundary line
      context.strokeStyle = spec.fill === 'black' ? 'white' : 'black';
      context.lineWidth = 2;
      context.stroke();
      
      // Add ring numbers horizontally on white rings
      if (spec.ring >= 5 && spec.ring <= 9 && spec.fill === 'white') {
        context.fillStyle = 'black';
        context.font = 'bold 40px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(spec.ring.toString(), centerX, centerY - radiusPixels + 50);
      }
    }
    
    // Draw X-ring
    const xRingDiameterMeters = target.getXRingDiameter();
    const xRingDiameterYards = xRingDiameterMeters * 1.09361;
    const xRingRadius = (xRingDiameterYards / 2) * pixelsPerYard;
    
    context.beginPath();
    context.arc(centerX, centerY, xRingRadius, 0, 2 * Math.PI);
    context.fillStyle = 'black';
    context.fill();
    context.strokeStyle = 'white';
    context.lineWidth = 2;
    context.stroke();
    
    // Draw white X in center
    const xSize = xRingRadius * 0.5;
    context.strokeStyle = 'white';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(centerX - xSize, centerY - xSize);
    context.lineTo(centerX + xSize, centerY + xSize);
    context.moveTo(centerX - xSize, centerY + xSize);
    context.lineTo(centerX + xSize, centerY - xSize);
    context.stroke();
    
    return new THREE.CanvasTexture(canvas);
  }

  createNumberTexture(number) {
    // Create canvas for number texture
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 256;
    
    // Clear canvas with white background
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 256, 256);
    
    // Rotate canvas 90 degrees to fix orientation
    context.translate(128, 128);
    context.rotate(Math.PI / 2);
    context.translate(-128, -128);
    
    // Draw number on canvas
    context.fillStyle = '#000000'; // Black text
    context.font = 'bold 200px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(number.toString(), 128, 128);
    
    // Create and return texture from canvas
    return new THREE.CanvasTexture(canvas);
  }

  // ===== WIND SIMULATION =====
  createWindGenerator()
  {
    // Create wind generator from preset
    this.windGenerator = btk.WindPresets.getPreset(this.windPreset);
    console.log('Wind generator created for preset:', this.windPreset);
  }

  // ===== RENDERING =====
  render()
  {
    // Calculate game time and FPS
    const currentTime = performance.now();
    this.time = (currentTime - this.gameStartTime) / 1000; // Game time in seconds
    this.frameCount++;

    if (currentTime - this.lastTime >= 1000)
    {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastTime = currentTime;
      // FPS logging removed for cleaner output
    }

    // Update and render flags
    this.updateFlags(this.time);
    
    // Update target frame animations
    this.updateTargetAnimations(this.time);
    
    // Point camera at the flag
    if (this.flagPositions.length > 0)
    {
      const flagPos = this.flagPositions[0];
      this.camera.lookAt(flagPos[0], flagPos[1], 6); // Look at mid-height of flag (6 yards)
    }
    
    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }

  start()
  {
    if (this.isRunning) return;

    this.gameStartTime = performance.now();
    this.time = 0;
    
    this.isRunning = true;
    const gameLoop = () =>
    {
      if (this.isRunning)
      {
        this.render();
        this.animationId = requestAnimationFrame(gameLoop);
      }
    };
    gameLoop();
  }

  stop()
  {
    this.isRunning = false;
    if (this.animationId)
    {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  createWindFlags()
  {
    console.log('Creating wind flags...');
    
    // Create flag poles every 100 yards from 100 to target distance at the border of the 50-yard lane
    const maxDistance = this.distance; // yards
    const laneBorder = ThreeJSGame.RANGE_LANE_WIDTH / 2; // yards from center (border of 50-yard lane)
    
    for (let yds = ThreeJSGame.POLE_INTERVAL; yds < maxDistance; yds += ThreeJSGame.POLE_INTERVAL)
    {
      const poleGeometry = new THREE.BoxGeometry(ThreeJSGame.POLE_THICKNESS, ThreeJSGame.POLE_THICKNESS, ThreeJSGame.POLE_HEIGHT);
      const poleMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 }); // Grey
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      
      pole.position.set(yds, laneBorder, ThreeJSGame.POLE_HEIGHT / 2);
      this.scene.add(pole);
    }
    
    // No main flag pole - just the range markers
    this.flagPositions = [];
    
    // No main flag pole - just the range markers
    this.flagMeshes = [];
    
    console.log('Wind flags setup complete');
  }

  updateFlags(gameTime)
  {
    this.time = gameTime;

    // Update each flag mesh based on wind - FLAG GEOMETRY COMMENTED OUT
    for (let i = 0; i < this.flagMeshes.length; i++)
    {
      const flagMesh = this.flagMeshes[i];
      const pos = flagMesh.position;
      const x_m = pos[0];
      const t_s = this.time;

      // Get wind at this position and time
      const windVector = this.windGenerator.sample(x_m, t_s);
      const windX = windVector.x; // Headwind
      const windY = windVector.y; // Crosswind

      // Calculate wind direction and strength
      const windDir = Math.atan2(windY, windX);
      const windSpeedMps = Math.sqrt(windX * windX + windY * windY);
      const windSpeedMph = btk.Conversions.mpsToMph(windSpeedMps);

      // Log wind info for debugging
      if (i === 0) // Only log for first flag to avoid spam
      {
        console.log(`Wind at ${x_m.toFixed(1)}m: ${windSpeedMph.toFixed(1)} mph, direction: ${(windDir * 180 / Math.PI).toFixed(1)}°`);
      }

      // FLAG GEOMETRY UPDATE COMMENTED OUT
      // if (flagMesh.flag) {
      //   // ... all the flag geometry code ...
      // }
    }
  }

  updateTargetAnimations(gameTime) {
    const deltaTime = 1/60; // Assume 60 FPS for consistent animation
    
    for (let i = 0; i < this.targetFrames.length; i++) {
      const targetFrame = this.targetFrames[i];
      const targetSize = 2; // yards
      
      // If animating, move toward goal
      if (targetFrame.animating) {
        const direction = Math.sign(targetFrame.targetHeightGoal - targetFrame.currentHeight);
        const moveDistance = ThreeJSGame.TARGET_ANIMATION_SPEED * deltaTime * direction;
        const newHeight = targetFrame.currentHeight + moveDistance;
        
        // Check if we've reached or passed the goal
        if ((direction > 0 && newHeight >= targetFrame.targetHeightGoal) ||
            (direction < 0 && newHeight <= targetFrame.targetHeightGoal)) {
          targetFrame.currentHeight = targetFrame.targetHeightGoal;
          targetFrame.animating = false;
        } else {
          targetFrame.currentHeight = newHeight;
        }
      }
      
      // Update target position
      targetFrame.mesh.position.z = targetFrame.baseHeight + targetFrame.currentHeight;
      
      // Update number box position to move with target
      if (targetFrame.numberBox) {
        targetFrame.numberBox.position.z = targetFrame.baseHeight + targetSize + 0.2 + targetFrame.currentHeight;
      }
    }
    
    // Random demo behavior - every ~3-5 seconds, pick a random target
    if (Math.random() < 0.01) { // ~1% chance per frame at 60fps = ~every 1.7 seconds
      const randomTarget = Math.floor(Math.random() * this.targetFrames.length) + 1;
      const randomAction = Math.random();
      
      if (randomAction < 0.33) {
        this.raiseTarget(randomTarget);
      } else if (randomAction < 0.66) {
        this.halfMastTarget(randomTarget);
      } else {
        this.lowerTarget(randomTarget);
      }
    }
  }

  raiseTarget(targetNumber) {
    const target = this.targetFrames[targetNumber - 1];
    target.targetHeightGoal = ThreeJSGame.TARGET_MAX_HEIGHT;
    target.animating = true;
  }

  lowerTarget(targetNumber) {
    const target = this.targetFrames[targetNumber - 1];
    target.targetHeightGoal = ThreeJSGame.TARGET_MIN_HEIGHT;
    target.animating = true;
  }

  halfMastTarget(targetNumber) {
    const target = this.targetFrames[targetNumber - 1];
    target.targetHeightGoal = ThreeJSGame.TARGET_HALF_MAST;
    target.animating = true;
  }

  // ===== CLEANUP =====
  destroy()
  {
    this.stop();
    
    // Clean up Three.js resources
    for (let flagMesh of this.flagMeshes)
    {
      flagMesh.pole.geometry.dispose();
      flagMesh.pole.material.dispose();
      flagMesh.flag.geometry.dispose();
      flagMesh.flag.material.dispose();
      this.scene.remove(flagMesh.pole);
      this.scene.remove(flagMesh.flag);
    }
    
    this.renderer.dispose();
  }
}



// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () =>
{
  try
  {
    btk = await BallisticsToolkit();
    await init();
    setupUI();
    populateTargetDropdown();
    populateWindPresetDropdown();
  }
  catch (err)
  {
    console.error('Failed to initialize:', err);
  }
});