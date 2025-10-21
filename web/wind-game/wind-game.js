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
  static PITS_DEPTH = 1;
  static PITS_OFFSET = 5;

  // Target animation constants
  static TARGET_GAP_ABOVE_PITS = 0.2; // Gap between target bottom and pit top when raised
  static TARGET_MAX_HEIGHT = 0; // No additional height when raised (baseHeight already has the gap)
  static TARGET_HALF_MAST = -(2 + ThreeJSGame.TARGET_GAP_ABOVE_PITS) / 2; // Halfway between raised and lowered
  static TARGET_MIN_HEIGHT = -(2 + ThreeJSGame.TARGET_GAP_ABOVE_PITS); // Fully lowered (target size + gap)
  static TARGET_ANIMATION_SPEED = 0.75; // yards per second

  // Wind flag constants
  static FLAG_BASE_WIDTH = 48 / 36; // 48 inches = 1.33 yards
  static FLAG_TIP_WIDTH = 18 / 36;  // 18 inches = 0.5 yards
  static FLAG_LENGTH = 12 / 3;      // 12 feet = 4 yards
  static FLAG_MIN_ANGLE = 5;        // degrees from vertical
  static FLAG_MAX_ANGLE = 90;       // degrees from vertical
  static FLAG_DEGREES_PER_MPH = (90 - 5) / 20;  // (max - min) / 20 mph = 4 degrees per mph
  static FLAG_FLAP_FREQUENCY_BASE = 2.0; // Hz at 10 mph
  static FLAG_FLAP_FREQUENCY_SCALE = 0.1; // Additional Hz per mph
  static FLAG_FLAP_AMPLITUDE = 0.05; // Max ripple amplitude in yards
  static FLAG_WAVE_LENGTH = 2.0; // Wavelength along flag length

  // Camera settings
  static CAMERA_FOV = 30;
  static CAMERA_EYE_HEIGHT = 1.5;

  // Spotting scope constants
  static SCOPE_DIAMETER_FRACTION = 0.5; // 1/3 of screen height (smaller scope)
  static SCOPE_MARGIN = 20; // pixels from screen edges
  static SCOPE_MAGNIFICATION = 4; // 4x zoom relative to main camera
  static SCOPE_PAN_SPEED = 0.1; // radians per second (much slower)
  static SCOPE_MIN_MAGNIFICATION = 2; // minimum 2x zoom
  static SCOPE_MAX_MAGNIFICATION = 100; // maximum 10x zoom
  static SCOPE_MAGNIFICATION_STEP = 0.5; // zoom step size

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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.autoClear = false; // We'll clear manually

    // Create 2D overlay canvas
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = this.canvas.clientWidth;
    this.overlayCanvas.height = this.canvas.clientHeight;
    this.overlayCtx = this.overlayCanvas.getContext('2d');
    this.overlayTexture = new THREE.CanvasTexture(this.overlayCanvas);

    // Create overlay scene with single full-screen quad
    this.overlayScene = new THREE.Scene();
    this.overlayCamera = new THREE.OrthographicCamera(
      -this.canvas.clientWidth / 2, this.canvas.clientWidth / 2,
      this.canvas.clientHeight / 2, -this.canvas.clientHeight / 2,
      0, 10
    );
    this.overlayCamera.position.z = 1;

    // Single full-screen mesh for overlay
    const overlayGeom = new THREE.PlaneGeometry(
      this.canvas.clientWidth, 
      this.canvas.clientHeight
    );
    const overlayMat = new THREE.MeshBasicMaterial({
      map: this.overlayTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.overlayMesh = new THREE.Mesh(overlayGeom, overlayMat);
    this.overlayMesh.frustumCulled = false;
    this.overlayScene.add(this.overlayMesh);
    
    // Create scope overlay
    this.createScopeOverlay();
    
    // Setup resize handler
    window.addEventListener('resize', () => this.onResize());
    
    // Setup camera, lighting, and range
    this.setupCamera();
    this.setupLighting();
    this.setupScopeControls();
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

  createScopeOverlay() {
    const scopeSize = Math.floor(this.canvas.clientHeight * ThreeJSGame.SCOPE_DIAMETER_FRACTION);
    const renderSize = scopeSize * 2;
    
    this.scopeRenderTarget = new THREE.WebGLRenderTarget(renderSize, renderSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      samples: 4
    });
    
    this.scopeSize = scopeSize;
    this.scopeX = ThreeJSGame.SCOPE_MARGIN;
    // Position at bottom of screen instead of top
    this.scopeY = this.canvas.clientHeight - scopeSize - ThreeJSGame.SCOPE_MARGIN;
    
    // Create a temporary canvas for reading render target pixels
    this.scopeTempCanvas = document.createElement('canvas');
    this.scopeTempCanvas.width = renderSize;
    this.scopeTempCanvas.height = renderSize;
    this.scopeTempCtx = this.scopeTempCanvas.getContext('2d');
  }

  drawScopeToCanvas() {
    const ctx = this.overlayCtx;
    const size = this.scopeSize;
    const x = this.scopeX;
    const y = this.scopeY;
    const cx = x + size/2;
    const cy = y + size/2;
    const r = size/2 - 5;
    
    // Create circular clipping path
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    
    // Draw scope render target texture
    // Read pixels from render target
    const pixels = new Uint8Array(this.scopeRenderTarget.width * this.scopeRenderTarget.height * 4);
    this.renderer.readRenderTargetPixels(
      this.scopeRenderTarget, 
      0, 0, 
      this.scopeRenderTarget.width, 
      this.scopeRenderTarget.height, 
      pixels
    );
    
    // Convert to image data and draw
    const imageData = this.scopeTempCtx.createImageData(
      this.scopeTempCanvas.width, 
      this.scopeTempCanvas.height
    );
    imageData.data.set(pixels);
    this.scopeTempCtx.putImageData(imageData, 0, 0);
    
    // Flip vertically (WebGL has origin at bottom-left)
    ctx.save();
    ctx.translate(x + size/2, y + size/2);
    ctx.scale(1, -1);
    ctx.drawImage(this.scopeTempCanvas, -size/2, -size/2, size, size);
    ctx.restore();
    
    ctx.restore();
    
    // Draw circular border
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  onResize() {
    this.overlayCanvas.width = this.canvas.clientWidth;
    this.overlayCanvas.height = this.canvas.clientHeight;
    this.overlayTexture.needsUpdate = true;
    
    // Update overlay camera
    this.overlayCamera.left = -this.canvas.clientWidth / 2;
    this.overlayCamera.right = this.canvas.clientWidth / 2;
    this.overlayCamera.top = this.canvas.clientHeight / 2;
    this.overlayCamera.bottom = -this.canvas.clientHeight / 2;
    this.overlayCamera.updateProjectionMatrix();
    
    // Update overlay mesh size
    this.overlayMesh.geometry.dispose();
    this.overlayMesh.geometry = new THREE.PlaneGeometry(
      this.canvas.clientWidth, 
      this.canvas.clientHeight
    );
    
    // Recalculate scope position/size (bottom-left corner)
    this.scopeSize = Math.floor(this.canvas.clientHeight * ThreeJSGame.SCOPE_DIAMETER_FRACTION);
    this.scopeX = ThreeJSGame.SCOPE_MARGIN;
    this.scopeY = this.canvas.clientHeight - this.scopeSize - ThreeJSGame.SCOPE_MARGIN;
  }

  createFlagTexture() {
    // Create a canvas for red/yellow flag
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Top half red
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 256, 128);
    
    // Bottom half yellow
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(0, 128, 256, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  createFlagGeometry() {
    // Create thick segmented trapezoid flag with 5 segments for flapping animation
    // 48" base (1.33 yds), 18" tip (0.5 yds), 12' long (4 yds)
    const geometry = new THREE.BufferGeometry();
    
    const halfBase = ThreeJSGame.FLAG_BASE_WIDTH / 2;  // 0.67 yards
    const halfTip = ThreeJSGame.FLAG_TIP_WIDTH / 2;    // 0.25 yards
    const length = ThreeJSGame.FLAG_LENGTH;            // 4 yards
    const thickness = 0.05; // 2cm thickness for realistic flag
    const numSegments = 5; // Base + 3 intermediate + tip
    
    // Create vertices for thick flag using multiple layers
    const vertices = [];
    const uvs = [];
    const indices = [];
    
    // Create front and back faces for each segment
    for (let i = 0; i < numSegments; i++) {
      const t = i / (numSegments - 1); // 0 to 1
      
      // Interpolate width from base to tip
      const halfWidth = halfBase + (halfTip - halfBase) * t;
      
      // Position along flag length (hanging down initially)
      const yPos = -length * t;
      
      // Front face vertices (positive X)
      vertices.push(thickness/2, yPos, halfWidth);   // Top front
      vertices.push(thickness/2, yPos, -halfWidth);  // Bottom front
      
      // Back face vertices (negative X)
      vertices.push(-thickness/2, yPos, halfWidth);  // Top back
      vertices.push(-thickness/2, yPos, -halfWidth); // Bottom back
      
      // UV coordinates (red top, yellow bottom) for both faces
      uvs.push(t, 0); // Top front
      uvs.push(t, 1); // Bottom front
      uvs.push(t, 0); // Top back
      uvs.push(t, 1); // Bottom back
    }
    
    // Create indices for front and back faces
    for (let i = 0; i < numSegments - 1; i++) {
      const idx = i * 4; // 4 vertices per segment (2 front + 2 back)
      
      // Front face triangles
      indices.push(idx, idx + 1, idx + 4);     // First triangle
      indices.push(idx + 1, idx + 5, idx + 4);  // Second triangle
      
      // Back face triangles (reverse winding)
      indices.push(idx + 2, idx + 6, idx + 3);  // First triangle
      indices.push(idx + 3, idx + 6, idx + 7);  // Second triangle
    }
    
    // Add side faces to connect front and back
    for (let i = 0; i < numSegments - 1; i++) {
      const idx = i * 4;
      
      // Top edge side face
      indices.push(idx, idx + 4, idx + 2);      // First triangle
      indices.push(idx + 2, idx + 4, idx + 6);  // Second triangle
      
      // Bottom edge side face
      indices.push(idx + 1, idx + 3, idx + 5);  // First triangle
      indices.push(idx + 3, idx + 7, idx + 5);  // Second triangle
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    return geometry;
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
    
    // Create Three.js texture with proper wrapping
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4); // Reduced repeats to avoid visible seams
    return texture;
  }

  // ===== SCENE SETUP =====
  setupCamera() {
    // Camera: BTK coords (X=downrange, Y=crossrange, Z=up)
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(ThreeJSGame.CAMERA_FOV, aspect, 0.1, this.distance + 10);
    // Camera positioned 1 yard behind muzzle, at target center height when raised
    const targetCenterHeight = ThreeJSGame.PITS_HEIGHT + ThreeJSGame.TARGET_GAP_ABOVE_PITS + 1; // pits + gap + half target height
    this.camera.position.set(-1, 0, targetCenterHeight); // 1 yard behind muzzle, at target center height
    this.camera.up.set(0, 0, 1); // Z is up
    this.camera.lookAt(this.distance, 0, targetCenterHeight); // Look at target distance at same height
    
    // Scope camera setup
    const scopeFOV = ThreeJSGame.CAMERA_FOV / ThreeJSGame.SCOPE_MAGNIFICATION; // 30° / 4 = 7.5°
    this.scopeCamera = new THREE.PerspectiveCamera(scopeFOV, 1.0, 0.1, this.distance + 10);
    this.scopeCamera.position.copy(this.camera.position); // Same position as main camera
    this.scopeCamera.up.set(0, 0, 1); // Z is up
    this.scopeCamera.lookAt(this.distance, 0, targetCenterHeight); // Same initial look direction
    
    // Initialize scope viewing angles to match current camera direction
    // Calculate initial yaw (looking straight downrange = 0)
    this.scopeYaw = 0;
    // Calculate initial pitch (looking straight ahead = 0)
    this.scopePitch = 0;
    // Initialize scope magnification
    this.scopeMagnification = ThreeJSGame.SCOPE_MAGNIFICATION;
  }

  setupLighting() {
    // Brighter ambient light for overall scene illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);
    
    // Strong directional light (sun) for bright scene with vivid shadows
    const directionalLight = new THREE.DirectionalLight(0xfffaf0, 2.5); // Bright warm sunlight
    // Position sun behind and to the left of shooter (7.5 o'clock position)
    directionalLight.position.set(-500, -200, 400); // Behind shooter, high up
    directionalLight.castShadow = true;
    
    // Configure shadow properties for better quality
    directionalLight.shadow.mapSize.width = 4096;  // Higher resolution shadows
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 10;
    directionalLight.shadow.camera.far = 1500;
    // Wider shadow camera to cover the entire range
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 1100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    directionalLight.shadow.bias = -0.0005;  // Reduce shadow acne
    directionalLight.shadow.normalBias = 0.02; // Additional bias for smooth surfaces
    
    this.scene.add(directionalLight);
    
    // Optional: Add a subtle fill light from the front to soften shadows
    const fillLight = new THREE.DirectionalLight(0xadd8e6, 0.3); // Soft blue fill
    fillLight.position.set(500, 0, 100); // From downrange
    this.scene.add(fillLight);
  }

  setupScopeControls() {
    // Initialize scope key states
    this.scopeKeys = { w: false, a: false, s: false, d: false, e: false, q: false };
    
    // Add keyboard event listeners for scope controls
    this.scopeKeyDownHandler = (event) => {
      // Only handle scope keys if no modifier keys are pressed
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
        return; // Let browser handle shortcuts
      }
      
      const key = event.key.toLowerCase();
      if (key === 'w') {
        this.scopeKeys.w = true;
        event.preventDefault(); // Prevent page scrolling
      } else if (key === 'a') {
        this.scopeKeys.a = true;
        event.preventDefault(); // Prevent page scrolling
      } else if (key === 's') {
        this.scopeKeys.s = true;
        event.preventDefault(); // Prevent page scrolling
      } else if (key === 'd') {
        this.scopeKeys.d = true;
        event.preventDefault(); // Prevent page scrolling
      } else if (key === 'e') {
        this.scopeKeys.e = true;
        event.preventDefault(); // Prevent page scrolling
      } else if (key === 'q') {
        this.scopeKeys.q = true;
        event.preventDefault(); // Prevent page scrolling
      }
      // All other keys pass through to browser normally
    };
    
    this.scopeKeyUpHandler = (event) => {
      // Only handle scope keys if no modifier keys are pressed
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
        return; // Let browser handle shortcuts
      }
      
      const key = event.key.toLowerCase();
      if (key === 'w') {
        this.scopeKeys.w = false;
        event.preventDefault(); // Prevent page scrolling
      } else if (key === 'a') {
        this.scopeKeys.a = false;
        event.preventDefault(); // Prevent page scrolling
      } else if (key === 's') {
        this.scopeKeys.s = false;
        event.preventDefault(); // Prevent page scrolling
      } else if (key === 'd') {
        this.scopeKeys.d = false;
        event.preventDefault(); // Prevent page scrolling
      } else if (key === 'e') {
        this.scopeKeys.e = false;
        event.preventDefault(); // Prevent page scrolling
      } else if (key === 'q') {
        this.scopeKeys.q = false;
        event.preventDefault(); // Prevent page scrolling
      }
      // All other keys pass through to browser normally
    };
    
    // Add event listeners
    document.addEventListener('keydown', this.scopeKeyDownHandler);
    document.addEventListener('keyup', this.scopeKeyUpHandler);
  }

  setupRange() {
    const rangeLength = this.distance; // yards
    // Add brown ground that's wider than the range
    const brownGroundGeometry = new THREE.PlaneGeometry(rangeLength, ThreeJSGame.RANGE_TOTAL_WIDTH);
    const brownGroundMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, side: THREE.DoubleSide }); // Brown
    const brownGround = new THREE.Mesh(brownGroundGeometry, brownGroundMaterial);
    brownGround.position.set(rangeLength / 2, 0, -0.1); // Center it downrange, slightly lower
    brownGround.receiveShadow = true;  // Enable shadow receiving on ground
    this.scene.add(brownGround);
    
    // Add a range plane - just the shooting lanes with grass texture
    const groundGeometry = new THREE.PlaneGeometry(rangeLength, ThreeJSGame.RANGE_LANE_WIDTH);
    
    // Create grass material with dense texture variation
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x5a9a5a, // Bright, vibrant grass green
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0.0,
      bumpScale: 0.8 // Subtle texture for grass blades
    });
    
    // Add some noise for texture
    const noiseTexture = this.createNoiseTexture();
    groundMaterial.bumpMap = noiseTexture;
    groundMaterial.normalMap = noiseTexture;
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.set(rangeLength / 2, 0, 0); // Center it downrange
    ground.receiveShadow = true;  // Enable shadow receiving on grass
    this.scene.add(ground);
    
    // Add pits at the end of the range
    const pitsGeometry = new THREE.BoxGeometry(ThreeJSGame.PITS_DEPTH, ThreeJSGame.RANGE_LANE_WIDTH, ThreeJSGame.PITS_HEIGHT);
    const pitsMaterial = new THREE.MeshStandardMaterial({ color: 0x8b7355 }); // Grey-brown
    const pits = new THREE.Mesh(pitsGeometry, pitsMaterial);
    
    // Enable shadows on pits
    pits.castShadow = true;
    pits.receiveShadow = true;
    
    // Position pits at rangeLength - PITS_OFFSET to obscure targets when lowered
    pits.position.set(rangeLength - ThreeJSGame.PITS_OFFSET + ThreeJSGame.PITS_DEPTH / 2, 0, ThreeJSGame.PITS_HEIGHT / 2);
    this.scene.add(pits);
    
    // Add target frames above the pits
    this.setupTargets(rangeLength);
    
  }

  setupTargets(rangeLength) {
    const targetSize = 2; // yards
    const targetSpacing = 1; // yards between targets
    const totalTargetWidth = targetSize + targetSpacing;
    
    // Calculate how many targets fit in the range width
    const rangeWidth = ThreeJSGame.RANGE_LANE_WIDTH;
    const maxTargets = Math.floor(rangeWidth / totalTargetWidth);
    
    // Position targets above the pits - centered on the range width
    const targetHeight = ThreeJSGame.PITS_HEIGHT + ThreeJSGame.TARGET_GAP_ABOVE_PITS + targetSize / 2;
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
      
      // Enable shadows on target
      target.castShadow = true;
      target.receiveShadow = true;
      
      // Position target at exact distance for accurate ballistic simulation - left to right (positive Y to negative Y)
      const yPos = startY - i * totalTargetWidth;
      target.position.set(rangeLength, yPos, targetHeight);
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
      
      // Enable shadows on number box
      numberBox.castShadow = true;
      numberBox.receiveShadow = true;
      
      numberBox.position.set(rangeLength, yPos, targetHeight + targetSize + 0.2); // 0.2 yards above target
      this.scene.add(numberBox);
      
      // Store number box reference for animation
      this.targetFrames[i].numberBox = numberBox;
    }
    
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
    
    // Update scope camera orientation
    const deltaTime = 1/60; // Assume 60 FPS for consistent updates
    this.updateScopeCamera(deltaTime);
    
    // Point camera at the flag
    // if (this.flagPositions.length > 0)
    // {
    //   const flagPos = this.flagPositions[0];
    //   this.camera.lookAt(flagPos[0], flagPos[1], 6); // Look at mid-height of flag (6 yards)
    // }
    
    // 1) Render main scene first
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // 2) Render scene to scope RT
    this.renderer.setRenderTarget(this.scopeRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.scopeCamera);
    this.renderer.setRenderTarget(null);

    // 3) Composite overlay canvas (after scope RT is ready)
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.drawScopeToCanvas();
    // Future: this.drawWindIndicator(), this.drawScoreDisplay(), etc.
    this.overlayTexture.needsUpdate = true;

    // 4) Render overlay on top (clear depth only, not color)
    this.renderer.clearDepth();
    this.renderer.render(this.overlayScene, this.overlayCamera);
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
    
    // Create flag texture once
    const flagTexture = this.createFlagTexture();
    
    // Create flag poles every 100 yards from 100 to target distance at the border of the 50-yard lane
    const maxDistance = this.distance; // yards
    const laneBorder = ThreeJSGame.RANGE_LANE_WIDTH / 2; // yards from center (border of 50-yard lane)
    
    this.flagMeshes = [];
    
    for (let yds = ThreeJSGame.POLE_INTERVAL; yds < maxDistance; yds += ThreeJSGame.POLE_INTERVAL)
    {
      const poleGeometry = new THREE.BoxGeometry(ThreeJSGame.POLE_THICKNESS, ThreeJSGame.POLE_THICKNESS, ThreeJSGame.POLE_HEIGHT);
      const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 }); // Grey
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      
      // Enable shadow casting and receiving
      pole.castShadow = true;
      pole.receiveShadow = true;
      
      pole.position.set(yds, laneBorder, ThreeJSGame.POLE_HEIGHT / 2);
      this.scene.add(pole);
      
    // Create flag geometry and mesh
    const flagGeometry = this.createFlagGeometry();
    const flagMaterial = new THREE.MeshStandardMaterial({ 
      map: flagTexture,
      side: THREE.DoubleSide
    });
    const flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
    
    // Enable shadow casting and receiving
    flagMesh.castShadow = true;
    flagMesh.receiveShadow = true;
      
      // Position flag at top of pole (center of base at pole top - half base width)
      const flagZ = ThreeJSGame.POLE_HEIGHT - ThreeJSGame.FLAG_BASE_WIDTH / 2;
      flagMesh.position.set(yds, laneBorder, flagZ);
      this.scene.add(flagMesh);
      
      // Store flag data for animation
      this.flagMeshes.push({
        pole: pole,
        flagGeometry: flagGeometry,
        flagMesh: flagMesh,
        position: {x: yds, y: laneBorder, z: flagZ},
        currentAngle: ThreeJSGame.FLAG_MIN_ANGLE,
        targetAngle: ThreeJSGame.FLAG_MIN_ANGLE,
        currentDirection: 0, // yaw rotation in radians
        flapPhase: Math.random() * Math.PI * 2 // Random starting phase for variety
      });
    }
    
  }

  updateFlags(gameTime)
  {
    this.time = gameTime;

    // Smooth interpolation speed (radians per second for direction, degrees per second for angle)
    const deltaTime = 1/60; // Assume 60 FPS
    const angleSpeed = 30; // degrees per second
    const directionSpeed = 1.0; // radians per second

    // Update each flag mesh based on wind
    for (let i = 0; i < this.flagMeshes.length; i++)
    {
      const flag = this.flagMeshes[i];
      const pos = flag.position;
      
      // Get wind at flag position (convert yards to meters for BTK)
      const x_m = btk.Conversions.yardsToMeters(pos.x);
      const y_m = btk.Conversions.yardsToMeters(pos.y);
      const z_m = btk.Conversions.yardsToMeters(pos.z);
      const t_s = this.time;

      // Get wind vector at this position and time
      const windVector = this.windGenerator.sample(x_m, t_s);
      const windX = windVector.x; // Downrange (m/s)
      const windY = windVector.y; // Crossrange (m/s)

      // Calculate wind magnitude and direction
      const windSpeedMps = Math.sqrt(windX * windX + windY * windY);
      const windSpeedMph = btk.Conversions.mpsToMph(windSpeedMps);
      
      // Calculate target angle based on wind speed
      const targetAngleDeg = Math.min(
        ThreeJSGame.FLAG_MIN_ANGLE + windSpeedMph * ThreeJSGame.FLAG_DEGREES_PER_MPH,
        ThreeJSGame.FLAG_MAX_ANGLE
      );
      
      // Calculate wind direction (yaw)
      const targetDirection = Math.atan2(windY, windX);
      
      // Smooth interpolate current angle toward target
      const angleDiff = targetAngleDeg - flag.currentAngle;
      const angleStep = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), angleSpeed * deltaTime);
      flag.currentAngle += angleStep;
      
      // Smooth interpolate current direction toward target
      let dirDiff = targetDirection - flag.currentDirection;
      // Normalize to [-PI, PI]
      while (dirDiff > Math.PI) dirDiff -= 2 * Math.PI;
      while (dirDiff < -Math.PI) dirDiff += 2 * Math.PI;
      const dirStep = Math.sign(dirDiff) * Math.min(Math.abs(dirDiff), directionSpeed * deltaTime);
      flag.currentDirection += dirStep;
      
      // Update flap phase based on wind speed
      const flapFrequency = ThreeJSGame.FLAG_FLAP_FREQUENCY_BASE + windSpeedMph * ThreeJSGame.FLAG_FLAP_FREQUENCY_SCALE;
      flag.flapPhase += flapFrequency * 2 * Math.PI * deltaTime;
      
      // Update flag geometry with flapping
      this.updateFlagGeometry(flag, flag.currentAngle, flag.currentDirection, windSpeedMph);
    }
  }

  updateFlagGeometry(flag, angleDeg, direction, windSpeedMph) {
    // Update all segments with flapping animation for thick flag
    const halfBase = ThreeJSGame.FLAG_BASE_WIDTH / 2;
    const halfTip = ThreeJSGame.FLAG_TIP_WIDTH / 2;
    const length = ThreeJSGame.FLAG_LENGTH;
    const thickness = 0.05; // Same as in createFlagGeometry
    const numSegments = 5;
    
    // Convert angle from degrees to radians
    const angleRad = angleDeg * Math.PI / 180;
    
    // Get the position attribute from the geometry
    const positions = flag.flagGeometry.attributes.position.array;
    
    // Calculate flag's local coordinate system
    // The flag extends in the direction of the wind, then ripples perpendicular to that
    const cosDir = Math.cos(direction);
    const sinDir = Math.sin(direction);
    const cosPitch = Math.cos(angleRad);
    const sinPitch = Math.sin(angleRad);
    
    // Update each segment (4 vertices per segment: 2 front + 2 back)
    for (let i = 0; i < numSegments; i++) {
      const t = i / (numSegments - 1); // 0 to 1 from base to tip
      
      // Interpolate width from base to tip
      const halfWidth = halfBase + (halfTip - halfBase) * t;
      
      // Base position along flag (before flapping)
      const segmentX = sinPitch * length * t * cosDir;
      const segmentY = sinPitch * length * t * sinDir;
      const segmentZ = -cosPitch * length * t; // Negative because hanging down
      
      // Calculate flapping offset
      // Wave travels along the flag, amplitude increases from base to tip
      const wavePosition = t * ThreeJSGame.FLAG_WAVE_LENGTH;
      const waveOffset = Math.sin(flag.flapPhase + wavePosition * 2 * Math.PI) * ThreeJSGame.FLAG_FLAP_AMPLITUDE;
      const flapAmplitude = waveOffset * t; // Scale from 0 at base to full at tip
      
      // Flapping is perpendicular to the flag surface
      // Calculate perpendicular direction (cross product of flag direction and up vector)
      const perpX = -sinDir;
      const perpY = cosDir;
      const perpZ = 0;
      
      // Apply flapping offset
      const flapX = perpX * flapAmplitude;
      const flapY = perpY * flapAmplitude;
      const flapZ = perpZ * flapAmplitude;
      
      // Update all 4 vertices for this segment (front and back faces)
      const idx = i * 4; // 4 vertices per segment
      
      // Front face vertices (positive X)
      positions[idx * 3 + 0] = segmentX + flapX + thickness/2;  // Top front X
      positions[idx * 3 + 1] = segmentY + flapY;               // Top front Y
      positions[idx * 3 + 2] = segmentZ + flapZ + halfWidth;  // Top front Z
      
      positions[(idx + 1) * 3 + 0] = segmentX + flapX + thickness/2;  // Bottom front X
      positions[(idx + 1) * 3 + 1] = segmentY + flapY;               // Bottom front Y
      positions[(idx + 1) * 3 + 2] = segmentZ + flapZ - halfWidth;  // Bottom front Z
      
      // Back face vertices (negative X)
      positions[(idx + 2) * 3 + 0] = segmentX + flapX - thickness/2;  // Top back X
      positions[(idx + 2) * 3 + 1] = segmentY + flapY;              // Top back Y
      positions[(idx + 2) * 3 + 2] = segmentZ + flapZ + halfWidth; // Top back Z
      
      positions[(idx + 3) * 3 + 0] = segmentX + flapX - thickness/2;  // Bottom back X
      positions[(idx + 3) * 3 + 1] = segmentY + flapY;              // Bottom back Y
      positions[(idx + 3) * 3 + 2] = segmentZ + flapZ - halfWidth;  // Bottom back Z
    }
    
    // Mark the geometry as needing an update
    flag.flagGeometry.attributes.position.needsUpdate = true;
    flag.flagGeometry.computeVertexNormals();
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

  updateScopeCamera(deltaTime) {
    // Calculate pan speed that slows down linearly with magnification
    // At 2x mag: full speed, at 100x mag: 1/50th speed
    const speedFactor = 2.0 / this.scopeMagnification; // 2x = 1.0, 100x = 0.02
    const panSpeed = ThreeJSGame.SCOPE_PAN_SPEED * deltaTime * speedFactor;
    
    // W/S: adjust pitch (tilt up/down)
    // W = tilt up (positive pitch)
    // S = tilt down (negative pitch)
    if (this.scopeKeys.w) this.scopePitch += panSpeed;
    if (this.scopeKeys.s) this.scopePitch -= panSpeed;
    
    // A/D: pan left/right (move crossrange position)
    // A = pan left (negative Y in BTK coords)
    // D = pan right (positive Y in BTK coords)
    if (this.scopeKeys.a) this.scopeYaw += panSpeed;
    if (this.scopeKeys.d) this.scopeYaw -= panSpeed;
    
    // E/Q: adjust magnification (exponential scaling)
    // E = increase magnification
    // Q = decrease magnification
    if (this.scopeKeys.e) {
      this.scopeMagnification = Math.min(
        ThreeJSGame.SCOPE_MAX_MAGNIFICATION,
        this.scopeMagnification * Math.pow(1.1, deltaTime * 10) // 10% increase per second
      );
    }
    if (this.scopeKeys.q) {
      this.scopeMagnification = Math.max(
        ThreeJSGame.SCOPE_MIN_MAGNIFICATION,
        this.scopeMagnification / Math.pow(1.1, deltaTime * 10) // 10% decrease per second
      );
    }
    
    // Clamp pitch and yaw to reasonable limits
    this.scopePitch = Math.max(-Math.PI/6, Math.min(Math.PI/6, this.scopePitch));
    this.scopeYaw = Math.max(-Math.PI/6, Math.min(Math.PI/6, this.scopeYaw));
    
    // Update scope camera FOV based on current magnification
    const scopeFOV = ThreeJSGame.CAMERA_FOV / this.scopeMagnification;
    this.scopeCamera.fov = scopeFOV;
    this.scopeCamera.updateProjectionMatrix();
    
    // Apply rotation to scope camera
    // Start from main camera position and orientation
    const targetCenterHeight = ThreeJSGame.PITS_HEIGHT + ThreeJSGame.TARGET_GAP_ABOVE_PITS + 1;
    this.scopeCamera.position.copy(this.camera.position);
    this.scopeCamera.up.set(0, 0, 1);
    
    // Calculate look-at target with offsets
    // scopeYaw controls horizontal (Y-axis) offset at distance
    // scopePitch controls vertical (Z-axis) offset
    const lookX = this.distance;
    const lookY = this.distance * Math.tan(this.scopeYaw); // Pan left/right
    const lookZ = targetCenterHeight + this.distance * Math.tan(this.scopePitch); // Tilt up/down
    
    this.scopeCamera.lookAt(lookX, lookY, lookZ);
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
      flagMesh.flagMesh.geometry.dispose();
      flagMesh.flagMesh.material.dispose();
      this.scene.remove(flagMesh.pole);
      this.scene.remove(flagMesh.flagMesh);
    }
    
    // Clean up scope resources
    if (this.scopeRenderTarget) {
      this.scopeRenderTarget.dispose();
    }
    if (this.overlayTexture) {
      this.overlayTexture.dispose();
    }
    if (this.overlayMesh) {
      this.overlayMesh.geometry.dispose();
      this.overlayMesh.material.dispose();
    }
    
    // Remove scope keyboard event listeners
    if (this.scopeKeyDownHandler) {
      document.removeEventListener('keydown', this.scopeKeyDownHandler);
    }
    if (this.scopeKeyUpHandler) {
      document.removeEventListener('keyup', this.scopeKeyUpHandler);
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