import BallisticsToolkit from '../ballistics_toolkit_wasm.js';

let btk = null;

// F-Class distance to target mapping
const FCLASS_DISTANCE_TO_TARGET = {
  300: 'MR-63FCA',
  500: 'MR-65FCA',
  600: 'MR-1FCA',
  800: 'LR-FCA',
  900: 'LR-FCA',
  1000: 'LR-FCA'
};

// WebGL game instance
let webglGame = null;

// Initialize the game
async function init()
{
  console.log('F-Class Simulator initialized');
}

// Lock canvas size once on page load
function lockCanvasSize()
{
  const canvas = document.getElementById('gameCanvas');

  // Detect mobile devices and small screens
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isTouchOnly = !window.matchMedia('(hover: hover)').matches;
  const screenWidth = window.innerWidth;
  const minRecommendedWidth = FClassSimulator.MIN_SCREEN_WIDTH;

  if (isMobile || isTouchOnly)
  {
    console.warn('Mobile device detected - F-Class Simulator is designed for desktop use');
    showWarning('Mobile Device', 'This simulator is designed for desktop use with keyboard and mouse controls.');
  }

  if (screenWidth < minRecommendedWidth)
  {
    console.warn(`Screen too narrow: ${screenWidth}px (recommended: ${minRecommendedWidth}px+)`);
    showWarning('Screen Too Small', `Please maximize your browser window. Current: ${screenWidth}px, Recommended: ${minRecommendedWidth}px+`);
  }

  // Read canvas size from CSS (will be square due to aspect-ratio: 1)
  const canvasWidth = canvas.clientWidth;
  const canvasHeight = canvas.clientHeight;
  console.log(`Canvas dimensions locked at: ${canvasWidth}x${canvasHeight}`);

  // Lock canvas size permanently - no resizing allowed
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.width = canvasWidth + 'px';
  canvas.style.height = canvasHeight + 'px';
  canvas.style.maxWidth = canvasWidth + 'px';
  canvas.style.maxHeight = canvasHeight + 'px';
  canvas.style.minWidth = canvasWidth + 'px';
  canvas.style.minHeight = canvasHeight + 'px';
  canvas.style.aspectRatio = 'none'; // Override CSS aspect-ratio

  // Store locked dimensions for game instances to use
  canvas.dataset.lockedWidth = canvasWidth;
  canvas.dataset.lockedHeight = canvasHeight;
}

function showWarning(title, message)
{
  const warning = document.createElement('div');
  warning.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: ${FClassSimulator.WARNING_COLOR};
    color: #000;
    padding: 16px;
    text-align: center;
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  warning.innerHTML = `
    <strong>${title}:</strong> ${message}
    <button style="margin-left: 16px; padding: 4px 12px; cursor: pointer;" onclick="this.parentElement.remove()">Dismiss</button>
  `;
  document.body.insertBefore(warning, document.body.firstChild);
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
    webglGame = new FClassSimulator(canvas, params);
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
    if (webglGame)
    {
      webglGame.destroy();
    }

    // Create new Three.js game instance with updated parameters
    const canvas = document.getElementById('gameCanvas');
    webglGame = new FClassSimulator(canvas, params);
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
  const fclassMode = document.getElementById('fclassMode').value;

  // Parse F-Class mode to get distance (format: "fclass-300", "fclass-500", etc.)
  const distance = fclassMode.split('-')[1];
  const distanceYards = parseInt(distance);

  // Map F-Class distances to correct targets
  const targetType = FCLASS_DISTANCE_TO_TARGET[distanceYards];
  if (!targetType)
  {
    throw new Error(`Invalid F-Class distance: ${distanceYards} yards. Valid distances are: 300, 500, 600, 800, 900, 1000`);
  }

  return {
    distance: distanceYards,
    target: targetType,
    windPreset: document.getElementById('windPreset').value,
    fclassMode: fclassMode
  };
}

// Target dropdown no longer needed - targets are determined by F-Class mode

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

// F-Class Shooting Simulator Class
class FClassSimulator
{
  // ===== CONSTANTS =====

  // === RANGE & PHYSICAL DIMENSIONS ===
  static RANGE_TOTAL_WIDTH = 200;
  static RANGE_LANE_WIDTH = 50;
  static POLE_HEIGHT = 12;
  static POLE_THICKNESS = 0.1;
  static POLE_INTERVAL = 100;
  static PITS_HEIGHT = 3;
  static PITS_DEPTH = 1;
  static PITS_OFFSET = 5;

  // === TARGET ANIMATION ===
  static TARGET_SIZE = 2; // yards - size of target frames
  static TARGET_GAP_ABOVE_PITS = 0.2; // Gap between target bottom and pit top when raised
  static TARGET_MAX_HEIGHT = 0; // No additional height when raised (baseHeight already has the gap)
  static TARGET_HALF_MAST = -(FClassSimulator.TARGET_SIZE + FClassSimulator.TARGET_GAP_ABOVE_PITS) / 2; // Halfway between raised and lowered
  static TARGET_MIN_HEIGHT = -(FClassSimulator.TARGET_SIZE + FClassSimulator.TARGET_GAP_ABOVE_PITS); // Fully lowered (target size + gap)
  static TARGET_CENTER_HEIGHT = FClassSimulator.PITS_HEIGHT + FClassSimulator.TARGET_GAP_ABOVE_PITS + FClassSimulator.TARGET_SIZE / 2; // Target center height when raised
  static TARGET_ANIMATION_SPEED = 0.75; // yards per second

  // === WIND VISUALIZATION ===
  // Wind flags (manual conversions since BTK not available at class definition time)
  static FLAG_BASE_WIDTH = 48 / 36; // 48 inches = 1.33 yards (btk.Conversions.inchesToYards(48))
  static FLAG_TIP_WIDTH = 18 / 36; // 18 inches = 0.5 yards (btk.Conversions.inchesToYards(18))
  static FLAG_LENGTH = 12 / 3; // 12 feet = 4 yards (btk.Conversions.feetToYards(12))
  static FLAG_THICKNESS = 0.05; // 2cm thickness for realistic flag
  static FLAG_MIN_ANGLE = 5; // degrees from vertical
  static FLAG_MAX_ANGLE = 90; // degrees from vertical
  static FLAG_DEGREES_PER_MPH = (90 - 5) / 20; // (max - min) / 20 mph = 4 degrees per mph
  static FLAG_FLAP_FREQUENCY_BASE = 2.0; // Hz at 10 mph
  static FLAG_FLAP_FREQUENCY_SCALE = 0.1; // Additional Hz per mph
  static FLAG_FLAP_AMPLITUDE = 0.05; // Max ripple amplitude in yards
  static FLAG_WAVE_LENGTH = 2.0; // Wavelength along flag length


  // === CAMERA SETTINGS ===
  static CAMERA_FOV = 30;
  static CAMERA_EYE_HEIGHT = 0.1;


  // === DEBUG & ANIMATION ===
  static DEBUG = false;
  static RANDOM_ANIMATION_CHANCE = 0.01; // ~1% per frame at 60fps

  // === UI & DISPLAY ===
  static MIN_SCREEN_WIDTH = 800;
  static WARNING_COLOR = '#ff9800';
  static COLOR_X_RING = 0xffff00;
  static COLOR_HIGH_SCORE = 0xff0000;
  static COLOR_LOW_SCORE = 0xff8800;
  static SCORE_THRESHOLD_RED = 9;

  // === MATCH & SCORING ===
  static FCLASS_MATCH_SHOTS = 60;

  // === ANIMATION & TIMING ===
  static FLAG_ANGLE_INTERPOLATION_SPEED = 30; // degrees per second
  static FLAG_DIRECTION_INTERPOLATION_SPEED = 1.0; // radians per second

  // Spotting scope constants (WASD pan, EQ zoom)
  static SPOTTING_SCOPE_DIAMETER_FRACTION = 0.5; // Fraction of screen height
  static SPOTTING_SCOPE_MARGIN = 20; // pixels from screen edges
  static SPOTTING_SCOPE_PAN_SPEED = 0.1; // radians per second
  static SPOTTING_SCOPE_MIN_MAGNIFICATION = 2; // minimum zoom
  static SPOTTING_SCOPE_MAX_MAGNIFICATION = 100; // maximum zoom
  static SPOTTING_SCOPE_MAGNIFICATION_STEP = 0.5; // zoom step size

  // Rifle scope constants (arrow keys pan, fixed zoom for targeting)
  static RIFLE_SCOPE_DIAMETER_FRACTION = 0.5; // Same size as spotting scope
  static RIFLE_SCOPE_MARGIN = 20; // pixels from edge
  static RIFLE_SCOPE_PAN_SPEED = 0.1; // MOA per key press
  static RIFLE_SCOPE_FOV_MULTIPLIER = 1.5; // Show 1.5x target width
  static RIFLE_SCOPE_ZOOM_MIN = 0.5; // Minimum FOV multiplier (zoomed in)
  static RIFLE_SCOPE_ZOOM_MAX = 3.0; // Maximum FOV multiplier (zoomed out)
  static RIFLE_SCOPE_ZOOM_STEP = 0.1; // Zoom change per key press

  // ===== CONSTRUCTOR & INITIALIZATION =====
  constructor(canvas, params = {})
  {
    // ===== CORE STATE =====
    this.canvas = canvas;
    this.isRunning = false;
    this.animationId = null;

    // Game parameters
    this.distance = params.distance || 1000;
    this.target = params.target || 'MR-1FCA';
    this.windPreset = params.windPreset || 'Calm';

    // Time tracking
    this.gameStartTime = 0;
    this.lastTime = 0;
    this.frameCount = 0;
    this.fps = 0;

    // ===== THREE.JS CORE =====
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // Renderer setup
    this.canvasWidth = parseInt(canvas.dataset.lockedWidth) || canvas.clientWidth;
    this.canvasHeight = parseInt(canvas.dataset.lockedHeight) || canvas.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.autoClear = false;

    // Animation clock and cached time values
    this.clock = new THREE.Clock();
    this.currentAbsTime = 0;
    this.currentDeltaTime = 0;

    // Geometry cache for reuse
    this._geoBoxCache = {};

    // ===== OVERLAY SYSTEM =====
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = this.canvasWidth;
    this.overlayCanvas.height = this.canvasHeight;
    this.overlayCtx = this.overlayCanvas.getContext('2d');
    this.overlayTexture = new THREE.CanvasTexture(this.overlayCanvas);

    this.overlayScene = new THREE.Scene();
    this.overlayCamera = new THREE.OrthographicCamera(
      -this.canvasWidth / 2, this.canvasWidth / 2,
      this.canvasHeight / 2, -this.canvasHeight / 2, 0, 10
    );
    this.overlayCamera.position.z = 1;

    const overlayGeom = new THREE.PlaneGeometry(this.canvasWidth, this.canvasHeight);
    const overlayMat = new THREE.MeshBasicMaterial({
      map: this.overlayTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false
    });
    this.overlayMesh = new THREE.Mesh(overlayGeom, overlayMat);
    this.overlayMesh.frustumCulled = false;
    this.overlayMesh.renderOrder = 10;
    this.overlayScene.add(this.overlayMesh);

    // ===== WIND & ENVIRONMENT =====
    this.windGenerator = null;
    this.flagMeshes = [];
    this.flagPositions = [];

    // ===== TARGETS =====
    this.targetFrames = [];
    this.targetAnimationTime = 0;
    this.targetAnimationSpeed = 2.0;

    // ===== BALLISTICS & SHOOTING =====
    this.ballisticSimulator = null;
    this.match = null;
    this.btkTarget = null;
    this.bullet = null;
    this.bulletDiameter = 0;
    this.zeroedBullet = null;
    this.nominalMV = 0;
    this.mvSd = 0;
    this.rifleAccuracyMoa = 0;
    this.lastShotMarker = null;

    // ===== AUDIO =====
    this.audioContext = null;
    this.shotSound = null;
    this.audioMuted = false;

    // ===== HUD =====
    this.hudElements = {
      container: document.getElementById('shotHud'),
      shots: document.getElementById('hudShots'),
      score: document.getElementById('hudScore'),
      dropped: document.getElementById('hudDropped'),
      lastScore: document.getElementById('hudLastScore'),
      mv: document.getElementById('hudMV'),
      impactV: document.getElementById('hudImpactV')
    };

    // ===== SCENE SETUP =====
    this.setupCamera();
    this.setupLighting();
    this.setupRange();

    // ===== SCOPES =====
    this.createSpottingScopeOverlay();
    this.createScopeViewMesh();
    this.createRifleScopeOverlay();
    this.createRifleScopeViewMesh();

    // ===== INPUT =====
    this.setupSpottingScopeControls();
    this.setupRifleScopeControls();
    this.setupShotFiringControls();

    // ===== INITIALIZATION =====
    this.createWindGenerator();
    this.createWindFlags();
    this.initializeAudio();

    console.log('F-Class Simulator initialized');
  }

  // ===== TIME ACCESSORS =====
  getTime()
  {
    return this.currentAbsTime;
  }

  getDeltaTime()
  {
    return this.currentDeltaTime;
  }

  // ===== AUDIO SYSTEM =====

  /**
   * Initialize audio system and load shot sound
   */
  async initializeAudio()
  {
    try
    {
      // Create audio context
      this.audioContext = new(window.AudioContext || window.webkitAudioContext)();

      // Load shot sound
      await this.loadShotSound();

      console.log('Audio system initialized');
    }
    catch (error)
    {
      console.warn('Could not initialize audio system:', error);
    }
  }

  /**
   * Load shot sound from audio file
   */
  async loadShotSound()
  {
    try
    {
      const response = await fetch('audio/shot1.mp3');
      if (!response.ok)
      {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      this.shotSound = await this.audioContext.decodeAudioData(arrayBuffer);

      console.log('Shot sound loaded successfully');
    }
    catch (error)
    {
      console.warn('Could not load shot sound:', error);
      this.shotSound = null;
    }
  }

  /**
   * Play shot sound when firing
   */
  playShotSound()
  {
    if (this.audioMuted || !this.shotSound || !this.audioContext)
    {
      return;
    }

    try
    {
      const source = this.audioContext.createBufferSource();
      source.buffer = this.shotSound;
      source.connect(this.audioContext.destination);
      source.start();

      console.log('Shot sound played');
    }
    catch (error)
    {
      console.warn('Could not play shot sound:', error);
    }
  }

  // ===== SCOPE SYSTEM =====

  createCircularMaskTexture(size)
  {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size;
    maskCanvas.height = size;
    const maskCtx = maskCanvas.getContext('2d');

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 5;

    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, size, size);

    maskCtx.fillStyle = 'white';
    maskCtx.beginPath();
    maskCtx.arc(cx, cy, r, 0, Math.PI * 2);
    maskCtx.fill();

    const maskTexture = new THREE.CanvasTexture(maskCanvas);
    return maskTexture;
  }

  createSpottingScopeOverlay()
  {
    // Add 10px padding on each side to prevent overlap
    const availableWidth = this.canvasWidth - 20; // 10px padding on each side
    const availableHeight = this.canvasHeight - 20; // 10px padding on each side
    const maxScopeSize = Math.min(availableWidth, availableHeight);
    const scopeSize = Math.floor(maxScopeSize * FClassSimulator.SPOTTING_SCOPE_DIAMETER_FRACTION);
    const renderSize = scopeSize * 2;

    this.spottingScopeRenderTarget = new THREE.WebGLRenderTarget(renderSize, renderSize,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      samples: 4
    });

    this.spottingScopeSize = scopeSize;
    this.spottingScopeX = 10; // 10px padding from left edge
    // Position at bottom of screen with padding
    this.spottingScopeY = this.canvasHeight - scopeSize - 10; // 10px padding from bottom

    // Create a temporary canvas for reading render target pixels
    this.spottingScopeTempCanvas = document.createElement('canvas');
    this.spottingScopeTempCanvas.width = renderSize;
    this.spottingScopeTempCanvas.height = renderSize;
    this.spottingScopeTempCtx = this.spottingScopeTempCanvas.getContext('2d');

    // Create spotting scope camera
    const scopeFOV = FClassSimulator.CAMERA_FOV / FClassSimulator.SCOPE_MAGNIFICATION; // 30° / 4 = 7.5°
    this.spottingScopeCamera = new THREE.PerspectiveCamera(scopeFOV, 1.0, 0.5, this.distance * 1.5);
    this.spottingScopeCamera.position.set(-1, 0, FClassSimulator.CAMERA_EYE_HEIGHT);
    this.spottingScopeCamera.up.set(0, 0, 1);
    this.spottingScopeCamera.lookAt(this.distance, 0, FClassSimulator.CAMERA_EYE_HEIGHT);

    // Initialize control state
    this.spottingScopeYaw = 0;
    this.spottingScopePitch = 0;
    this.spottingScopeMagnification = 4;
  }

  /**
   * Creates the rifle scope for precise aiming at user's target
   * FOV is calculated to show 1.5x target frame width
   * Movement is bounded to the target frame boundaries
   */
  createRifleScopeOverlay()
  {
    // Create rifle scope (bottom-right)
    // Add 10px padding on each side to prevent overlap
    const availableWidth = this.canvasWidth - 20; // 10px padding on each side
    const availableHeight = this.canvasHeight - 20; // 10px padding on each side
    const maxScopeSize = Math.min(availableWidth, availableHeight);
    const rifleScopeSize = Math.floor(maxScopeSize * FClassSimulator.RIFLE_SCOPE_DIAMETER_FRACTION);
    const rifleScopeRenderSize = rifleScopeSize * 2;

    this.rifleScopeRenderTarget = new THREE.WebGLRenderTarget(rifleScopeRenderSize, rifleScopeRenderSize,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      samples: 4
    });

    this.rifleScopeSize = rifleScopeSize;
    this.rifleScopeX = this.canvasWidth - rifleScopeSize - 10; // 10px padding from right edge
    this.rifleScopeY = this.canvasHeight - rifleScopeSize - 10; // 10px padding from bottom

    // Calculate FOV for 1.5x target width
    const targetFrameWidth = FClassSimulator.TARGET_SIZE; // yards
    const fovRadians = Math.atan((FClassSimulator.RIFLE_SCOPE_FOV_MULTIPLIER * targetFrameWidth) / this.distance);
    const fovDegrees = fovRadians * 180 / Math.PI;

    // Create rifle scope camera
    this.rifleScopeCamera = new THREE.PerspectiveCamera(fovDegrees, 1.0, 0.5, this.distance * 1.5);
    this.rifleScopeCamera.position.set(0, 0, FClassSimulator.CAMERA_EYE_HEIGHT);

    // Point at user's target center
    const targetCenterX = this.distance;
    const targetCenterY = this.userTarget.mesh.position.y;
    const targetCenterZ = this.userTarget.mesh.position.z;
    this.rifleScopeCamera.lookAt(targetCenterX, targetCenterY, targetCenterZ);

    // Initialize rifle scope control state
    this.rifleScopePitch = 0;
    this.rifleScopeYaw = 0;
    this.rifleScopeZoom = FClassSimulator.RIFLE_SCOPE_FOV_MULTIPLIER; // Current zoom level (FOV multiplier)

    // Calculate movement limits (allow 3x target radius for scope bounding box)
    const scopeBoundingBoxSize = targetFrameWidth * 3; // 3x target size
    const maxYawRadians = Math.atan(scopeBoundingBoxSize / (2 * this.distance));
    const maxPitchRadians = Math.atan(scopeBoundingBoxSize / (2 * this.distance));
    this.rifleScopeMaxYaw = maxYawRadians;
    this.rifleScopeMaxPitch = maxPitchRadians;
  }

  createScopeViewMesh()
  {
    const size = this.spottingScopeSize;
    const x = this.spottingScopeX;
    const y = this.spottingScopeY;

    // Convert screen coordinates to overlay camera coordinates
    // Overlay camera: left=-canvasW/2, right=canvasW/2, top=canvasH/2, bottom=-canvasH/2
    const canvasW = this.canvasWidth;
    const canvasH = this.canvasHeight;
    // Three.js meshes are positioned by center, so offset by half size
    const overlayX = x + size / 2 - canvasW / 2;
    const overlayY = canvasH / 2 - (y + size / 2); // Flip Y coordinate and offset by half size

    // Create circular mask texture
    const maskTexture = this.createCircularMaskTexture(size);

    // Create scope view mesh
    const scopeGeom = new THREE.PlaneGeometry(size, size);
    const scopeMat = new THREE.MeshBasicMaterial(
    {
      map: this.spottingScopeRenderTarget.texture,
      alphaMap: maskTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    this.spottingScopeViewMesh = new THREE.Mesh(scopeGeom, scopeMat);
    this.spottingScopeViewMesh.position.set(overlayX, overlayY, 0.001); // Convert to overlay coordinates
    this.spottingScopeViewMesh.renderOrder = 1; // Render before the canvas overlay
    this.spottingScopeViewMesh.frustumCulled = false;

    this.overlayScene.add(this.spottingScopeViewMesh);
    console.log('Scope view mesh created at position:', overlayX, overlayY, 'size:', size);
  }

  createRifleScopeViewMesh()
  {
    const rifleScopeSize = this.rifleScopeSize;
    const rifleScopeX = this.rifleScopeX;
    const rifleScopeY = this.rifleScopeY;

    // Convert screen coordinates to overlay camera coordinates for rifle scope
    const canvasW = this.canvasWidth;
    const canvasH = this.canvasHeight;
    const rifleScopeOverlayX = rifleScopeX + rifleScopeSize / 2 - canvasW / 2;
    const rifleScopeOverlayY = canvasH / 2 - (rifleScopeY + rifleScopeSize / 2);

    // Create circular mask texture for rifle scope
    const rifleScopeMaskTexture = this.createCircularMaskTexture(rifleScopeSize);

    // Create rifle scope view mesh
    const rifleScopeGeom = new THREE.PlaneGeometry(rifleScopeSize, rifleScopeSize);
    const rifleScopeMat = new THREE.MeshBasicMaterial(
    {
      map: this.rifleScopeRenderTarget.texture,
      alphaMap: rifleScopeMaskTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    this.rifleScopeViewMesh = new THREE.Mesh(rifleScopeGeom, rifleScopeMat);
    this.rifleScopeViewMesh.position.set(rifleScopeOverlayX, rifleScopeOverlayY, 0.001);
    this.rifleScopeViewMesh.renderOrder = 1; // Render before the canvas overlay
    this.rifleScopeViewMesh.frustumCulled = false;

    this.overlayScene.add(this.rifleScopeViewMesh);
    console.log('Rifle scope view mesh created at position:', rifleScopeOverlayX, rifleScopeOverlayY, 'size:', rifleScopeSize);
    console.log('Rifle scope view mesh added to overlay scene. Total children:', this.overlayScene.children.length);
  }

  drawScopeToCanvas()
  {
    const ctx = this.overlayCtx;

    // Draw first scope border (bottom-left)
    const size = this.spottingScopeSize;
    const x = this.spottingScopeX;
    const y = this.spottingScopeY;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const r = size / 2 - 5;

    // Just draw the circular border - scope content will be handled by Three.js mesh
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Draw rifle scope border and crosshair (bottom-right)
    const rifleScopeSize = this.rifleScopeSize;
    const rifleScopeX = this.rifleScopeX;
    const rifleScopeY = this.rifleScopeY;
    const cx2 = rifleScopeX + rifleScopeSize / 2;
    const cy2 = rifleScopeY + rifleScopeSize / 2;
    const r2 = rifleScopeSize / 2 - 5;

    // Draw circular border for rifle scope
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx2, cy2, r2, 0, Math.PI * 2);
    ctx.stroke();

    // Draw rifle scope crosshair
    ctx.strokeStyle = '#808080'; // Medium grey
    ctx.fillStyle = '#808080'; // Medium grey
    ctx.lineWidth = 2;

    // Center dot
    ctx.beginPath();
    ctx.arc(cx2, cy2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Horizontal crosshair lines (left and right of center)
    const crosshairLen = r2 * 0.4; // 40% of radius
    const gap = 8; // Gap around center dot

    // Left horizontal line
    ctx.beginPath();
    ctx.moveTo(cx2 - crosshairLen, cy2);
    ctx.lineTo(cx2 - gap, cy2);
    ctx.stroke();

    // Right horizontal line
    ctx.beginPath();
    ctx.moveTo(cx2 + gap, cy2);
    ctx.lineTo(cx2 + crosshairLen, cy2);
    ctx.stroke();

    // Vertical crosshair lines (above and below center)
    // Top vertical line
    ctx.beginPath();
    ctx.moveTo(cx2, cy2 - crosshairLen);
    ctx.lineTo(cx2, cy2 - gap);
    ctx.stroke();

    // Bottom vertical line
    ctx.beginPath();
    ctx.moveTo(cx2, cy2 + gap);
    ctx.lineTo(cx2, cy2 + crosshairLen);
    ctx.stroke();
  }

  // ===== FLAG SYSTEM =====

  createFlagTexture()
  {
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

  // Helper method - calculates vertex positions for one flag segment
  calculateFlagSegmentPosition(segmentIndex, angleDeg, direction, flapPhase)
  {
    const halfBase = FClassSimulator.FLAG_BASE_WIDTH / 2;
    const halfTip = FClassSimulator.FLAG_TIP_WIDTH / 2;
    const length = FClassSimulator.FLAG_LENGTH;
    const thickness = FClassSimulator.FLAG_THICKNESS;
    const numSegments = 5;

    const t = segmentIndex / (numSegments - 1);
    const halfWidth = halfBase + (halfTip - halfBase) * t;

    // Calculate position with wind angle and flapping
    const angleRad = angleDeg * Math.PI / 180;
    const cosDir = Math.cos(direction);
    const sinDir = Math.sin(direction);
    const cosPitch = Math.cos(angleRad);
    const sinPitch = Math.sin(angleRad);

    const segmentX = sinPitch * length * t * cosDir;
    const segmentY = sinPitch * length * t * sinDir;
    const segmentZ = -cosPitch * length * t;

    // Flapping animation
    const wavePosition = t * FClassSimulator.FLAG_WAVE_LENGTH;
    const waveOffset = Math.sin(flapPhase + wavePosition * 2 * Math.PI) * FClassSimulator.FLAG_FLAP_AMPLITUDE;
    const flapAmplitude = waveOffset * t;

    const perpX = -sinDir;
    const perpY = cosDir;
    const flapX = perpX * flapAmplitude;
    const flapY = perpY * flapAmplitude;
    const flapZ = 0;

    // Return 4 vertices: [topFront, bottomFront, topBack, bottomBack]
    return {
      topFront: [segmentX + flapX + thickness / 2, segmentY + flapY, segmentZ + flapZ + halfWidth],
      bottomFront: [segmentX + flapX + thickness / 2, segmentY + flapY, segmentZ + flapZ - halfWidth],
      topBack: [segmentX + flapX - thickness / 2, segmentY + flapY, segmentZ + flapZ + halfWidth],
      bottomBack: [segmentX + flapX - thickness / 2, segmentY + flapY, segmentZ + flapZ - halfWidth]
    };
  }


  createFlagGeometry()
  {
    // Create thick segmented trapezoid flag with 5 segments for flapping animation
    // Uses helper method for initial positions (no wind, no flapping)
    const geometry = new THREE.BufferGeometry();
    const numSegments = 5;

    // Create vertices for thick flag using multiple layers
    const vertices = [];
    const uvs = [];
    const indices = [];

    // Create front and back faces for each segment using helper
    for (let i = 0; i < numSegments; i++)
    {
      const t = i / (numSegments - 1); // 0 to 1

      // Get initial positions (no wind, no flapping)
      const positions = this.calculateFlagSegmentPosition(i, 0, 0, 0);

      // Add vertices in order: topFront, bottomFront, topBack, bottomBack
      vertices.push(...positions.topFront);
      vertices.push(...positions.bottomFront);
      vertices.push(...positions.topBack);
      vertices.push(...positions.bottomBack);

      // UV coordinates (red top, yellow bottom) for both faces
      uvs.push(t, 0); // Top front
      uvs.push(t, 1); // Bottom front
      uvs.push(t, 0); // Top back
      uvs.push(t, 1); // Bottom back
    }

    // Create indices for front and back faces
    for (let i = 0; i < numSegments - 1; i++)
    {
      const idx = i * 4; // 4 vertices per segment (2 front + 2 back)

      // Front face triangles
      indices.push(idx, idx + 1, idx + 4); // First triangle
      indices.push(idx + 1, idx + 5, idx + 4); // Second triangle

      // Back face triangles (reverse winding)
      indices.push(idx + 2, idx + 6, idx + 3); // First triangle
      indices.push(idx + 3, idx + 6, idx + 7); // Second triangle
    }

    // Add side faces to connect front and back
    for (let i = 0; i < numSegments - 1; i++)
    {
      const idx = i * 4;

      // Top edge side face
      indices.push(idx, idx + 4, idx + 2); // First triangle
      indices.push(idx + 2, idx + 4, idx + 6); // Second triangle

      // Bottom edge side face
      indices.push(idx + 1, idx + 3, idx + 5); // First triangle
      indices.push(idx + 3, idx + 7, idx + 5); // Second triangle
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  // ===== RANGE & SCENE SETUP =====

  createNoiseTexture()
  {
    // Create a canvas for dense grass texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Create dense grass pattern
    const imageData = ctx.createImageData(512, 512);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4)
    {
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

      data[i] = noise * 255; // R
      data[i + 1] = noise * 255; // G  
      data[i + 2] = noise * 255; // B
      data[i + 3] = 255; // A
    }

    ctx.putImageData(imageData, 0, 0);

    // Create Three.js texture with proper wrapping
    const texture = new THREE.CanvasTexture(canvas);
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() || 1;
    texture.anisotropy = maxAniso;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4); // Reduced repeats to avoid visible seams
    return texture;
  }

  // ===== SCENE SETUP =====
  setupCamera()
  {
    // Camera: BTK coords (X=downrange, Y=crossrange, Z=up)
    const aspect = this.canvasWidth / this.canvasHeight;
    // Use logarithmic depth buffer for better precision at long range
    // Near plane at 0.5 yards, far plane well beyond target
    this.camera = new THREE.PerspectiveCamera(FClassSimulator.CAMERA_FOV, aspect, 0.5, this.distance * 1.5);
    // Camera positioned 1 yard behind muzzle, at target center height when raised
    const targetCenterHeight = FClassSimulator.TARGET_CENTER_HEIGHT;
    this.camera.position.set(-1, 0, targetCenterHeight); // 1 yard behind muzzle, at target center height
    this.camera.up.set(0, 0, 1); // Z is up
    this.camera.lookAt(this.distance, 0, targetCenterHeight); // Look at target distance at same height
  }

  setupLighting()
  {
    // Brighter ambient light for overall scene illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    // Strong directional light (sun) for bright scene with vivid shadows
    const directionalLight = new THREE.DirectionalLight(0xfffaf0, 2.5); // Bright warm sunlight
    // Position sun behind and to the left of shooter (7.5 o'clock position)
    directionalLight.position.set(-500, -200, 400); // Behind shooter, high up
    directionalLight.castShadow = true;

    // Configure shadow properties for better quality
    directionalLight.shadow.mapSize.width = 4096; // Higher resolution shadows
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 10;
    directionalLight.shadow.camera.far = 1500;
    // Wider shadow camera to cover the entire range
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 1100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    directionalLight.shadow.bias = -0.0005; // Reduce shadow acne
    directionalLight.shadow.normalBias = 0.02; // Additional bias for smooth surfaces

    this.scene.add(directionalLight);

    // Optional: Add a subtle fill light from the front to soften shadows
    const fillLight = new THREE.DirectionalLight(0xadd8e6, 0.3); // Soft blue fill
    fillLight.position.set(500, 0, 100); // From downrange
    this.scene.add(fillLight);
  }

  setupSpottingScopeControls()
  {
    // Initialize scope key states
    this.spottingScopeKeys = { w: false, a: false, s: false, d: false, e: false, q: false };

    // Unified key handler for spotting scope
    this.spottingScopeKeyHandler = (event) =>
    {
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
      const isKeyDown = (event.type === 'keydown');
      const key = event.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'e' || key === 'q')
      {
        this.spottingScopeKeys[key] = isKeyDown;
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', this.spottingScopeKeyHandler);
    document.addEventListener('keyup', this.spottingScopeKeyHandler);
  }

  setupRifleScopeControls()
  {
    // Initialize rifle scope key states
    this.rifleScopeKeys = { up: false, down: false, left: false, right: false };

    // Unified key handler for rifle scope
    this.rifleScopeKeyHandler = (event) =>
    {
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
      const isKeyDown = (event.type === 'keydown');
      if (event.key === 'ArrowUp') { this.rifleScopeKeys.up = isKeyDown; event.preventDefault(); }
      else if (event.key === 'ArrowDown') { this.rifleScopeKeys.down = isKeyDown; event.preventDefault(); }
      else if (event.key === 'ArrowLeft') { this.rifleScopeKeys.left = isKeyDown; event.preventDefault(); }
      else if (event.key === 'ArrowRight') { this.rifleScopeKeys.right = isKeyDown; event.preventDefault(); }
      else if (isKeyDown && (event.key === '+' || event.key === '=')) { this.rifleScopeZoom = Math.max(FClassSimulator.RIFLE_SCOPE_ZOOM_MIN, this.rifleScopeZoom - FClassSimulator.RIFLE_SCOPE_ZOOM_STEP); this.updateRifleScopeZoom(); event.preventDefault(); }
      else if (isKeyDown && (event.key === '-' || event.key === '_')) { this.rifleScopeZoom = Math.min(FClassSimulator.RIFLE_SCOPE_ZOOM_MAX, this.rifleScopeZoom + FClassSimulator.RIFLE_SCOPE_ZOOM_STEP); this.updateRifleScopeZoom(); event.preventDefault(); }
    };

    document.addEventListener('keydown', this.rifleScopeKeyHandler);
    document.addEventListener('keyup', this.rifleScopeKeyHandler);
  }

  // ===== RANGE SETUP =====
  setupRange()
  {
    const rangeLength = this.distance; // yards
    // Add brown ground that's wider than the range
    const brownGroundGeometry = new THREE.PlaneGeometry(rangeLength, FClassSimulator.RANGE_TOTAL_WIDTH);
    const brownGroundMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x8b4513,
      side: THREE.DoubleSide
    }); // Brown
    const brownGround = new THREE.Mesh(brownGroundGeometry, brownGroundMaterial);
    brownGround.position.set(rangeLength / 2, 0, -0.1); // Center it downrange, slightly lower
    brownGround.receiveShadow = true; // Enable shadow receiving on ground
    brownGround.matrixAutoUpdate = false; brownGround.updateMatrix();
    this.scene.add(brownGround);

    // Add a range plane - just the shooting lanes with grass texture
    const groundGeometry = new THREE.PlaneGeometry(rangeLength, FClassSimulator.RANGE_LANE_WIDTH);

    // Create grass material with dense texture variation
    const groundMaterial = new THREE.MeshStandardMaterial(
    {
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
    ground.receiveShadow = true; // Enable shadow receiving on grass
    ground.matrixAutoUpdate = false; ground.updateMatrix();
    this.scene.add(ground);

    // Add pits at the end of the range
    if (!this._geoBoxCache) this._geoBoxCache = {};
    const pitsBoxKey = `${FClassSimulator.PITS_DEPTH}|${FClassSimulator.RANGE_LANE_WIDTH}|${FClassSimulator.PITS_HEIGHT}`;
    const pitsGeometry = this._geoBoxCache[pitsBoxKey] || (this._geoBoxCache[pitsBoxKey] = new THREE.BoxGeometry(FClassSimulator.PITS_DEPTH, FClassSimulator.RANGE_LANE_WIDTH, FClassSimulator.PITS_HEIGHT));
    const pitsMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x8b7355
    }); // Grey-brown
    const pits = new THREE.Mesh(pitsGeometry, pitsMaterial);

    // Enable shadows on pits
    pits.castShadow = true;
    pits.receiveShadow = true;

    // Position pits at rangeLength - PITS_OFFSET to obscure targets when lowered
    pits.position.set(rangeLength - FClassSimulator.PITS_OFFSET + FClassSimulator.PITS_DEPTH / 2, 0, FClassSimulator.PITS_HEIGHT / 2);
    pits.matrixAutoUpdate = false; this.scene.add(pits); pits.updateMatrix();

    // Add target frames above the pits
    this.setupTargets(rangeLength);

  }

  setupTargets(rangeLength)
  {
    const targetSize = FClassSimulator.TARGET_SIZE; // yards
    const targetSpacing = 1; // yards between targets
    const totalTargetWidth = targetSize + targetSpacing;

    // Calculate how many targets fit in the range width
    const rangeWidth = FClassSimulator.RANGE_LANE_WIDTH;
    const maxTargets = Math.floor(rangeWidth / totalTargetWidth);

    // Position targets above the pits - centered on the range width
    const targetHeight = FClassSimulator.TARGET_CENTER_HEIGHT;
    const totalTargetsWidth = maxTargets * targetSize + (maxTargets - 1) * targetSpacing; // Total width including spacing
    const startY = totalTargetsWidth / 2 - targetSize / 2; // Start from left (positive Y), centered

    // Create target texture once for all targets
    const targetTexture = this.createTargetTexture();

    for (let i = 0; i < maxTargets; i++)
    {
      const targetBoxKey = `0.1|${targetSize}|${targetSize}`;
      const targetGeometry = this._geoBoxCache[targetBoxKey] || (this._geoBoxCache[targetBoxKey] = new THREE.BoxGeometry(0.1, targetSize, targetSize)); // Thin frame facing up
      const targetMaterial = new THREE.MeshStandardMaterial(
      {
        map: targetTexture
      });
      const target = new THREE.Mesh(targetGeometry, targetMaterial);

      // Enable shadows on target
      target.castShadow = true;
      target.receiveShadow = true;

      // Position target at exact distance for accurate ballistic simulation - left to right (positive Y to negative Y)
      const yPos = startY - i * totalTargetWidth;
      target.position.set(rangeLength, yPos, targetHeight);
      target.matrixAutoUpdate = false; this.scene.add(target); target.updateMatrix();

      // Store target frame for animation
      this.targetFrames.push(
      {
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
      const numberGeometry = targetGeometry; // reuse same thin box geometry
      const numberTexture = this.createNumberTexture(i + 1);
      const numberMaterial = new THREE.MeshStandardMaterial(
      {
        map: numberTexture,
        transparent: true
      });
      const numberBox = new THREE.Mesh(numberGeometry, numberMaterial);

      // Enable shadows on number box
      numberBox.castShadow = true;
      numberBox.receiveShadow = true;

      numberBox.position.set(rangeLength, yPos, targetHeight + targetSize + 0.2); // 0.2 yards above target
      numberBox.matrixAutoUpdate = false; this.scene.add(numberBox); numberBox.updateMatrix();

      // Store number box reference for animation
      this.targetFrames[i].numberBox = numberBox;
    }

    // After the loop, find the center target (closest to Y=0)
    let centerTargetIndex = 0;
    let minDistance = Infinity;
    for (let i = 0; i < this.targetFrames.length; i++)
    {
      const yPos = Math.abs(this.targetFrames[i].mesh.position.y);
      if (yPos < minDistance)
      {
        minDistance = yPos;
        centerTargetIndex = i;
      }
    }

    // Store reference to user's target
    this.userTarget = this.targetFrames[centerTargetIndex];
    console.log(`User's target is #${this.userTarget.targetNumber} at Y=${this.userTarget.mesh.position.y.toFixed(2)}`);

  }

  // ===== TARGET SYSTEM =====

  createTargetTexture()
  {
    // Get the actual target from BTK for accurate dimensions
    const target = btk.NRATargets.getTarget(String(this.target));

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
      const ringDiameterMeters = target.getRingInnerDiameter(spec.ring);
      const ringDiameterYards = btk.Conversions.metersToYards(ringDiameterMeters);
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
    const xRingDiameterYards = btk.Conversions.metersToYards(xRingDiameterMeters);
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

  createNumberTexture(number)
  {
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

  // ===== GAME LOOP & LIFECYCLE =====
  createWindGenerator()
  {
    // Create wind generator from preset
    this.windGenerator = btk.WindPresets.getPreset(this.windPreset);
  }

  // ===== RENDERING =====
  render()
  {
    // Update cached time values once per frame
    this.currentDeltaTime = Math.min(0.05, Math.max(0.0005, this.clock.getDelta())); // clamp 0.5ms-50ms
    this.currentAbsTime = this.clock.getElapsedTime();
    this.frameCount++;

    // Update bullet animation (if any)
    this.updateBulletAnimation();

    // Update and render flags
    this.updateFlags();

    // Update target frame animations
    this.updateTargetAnimations();

    // Update scope camera orientations
    this.updateSpottingScopeCamera();
    this.updateRifleScopeCamera();


    // 1) Render main scene first
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // 2) Render scene to scope RTs
    this.renderer.setRenderTarget(this.spottingScopeRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.spottingScopeCamera);
    this.renderer.setRenderTarget(this.rifleScopeRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.rifleScopeCamera);
    this.renderer.setRenderTarget(null);

    // 3) Composite overlay canvas (after scope RT is ready)
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.drawScopeToCanvas(); // Just draws the border
    // Future: this.drawWindIndicator(), this.drawScoreDisplay(), etc.
    this.overlayTexture.needsUpdate = true;

    // 4) Render overlay on top (clear depth only, not color)
    this.renderer.clearDepth();
    this.renderer.render(this.overlayScene, this.overlayCamera);
  }

  async start()
  {
    if (this.isRunning) return;

    this.clock.start();
    this.gameStartTime = performance.now();

    // Setup ballistic system for shot firing
    try
    {
      await this.setupBallisticSystem();
    }
    catch (error)
    {
      console.error('Failed to setup ballistic system:', error);
      throw error;
    }

    // Show HUD
    if (this.hudElements.container)
    {
      this.hudElements.container.style.display = 'block';
    }
    this.updateHUD();

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
    if (this.clock) this.clock.stop();

    // Hide HUD
    if (this.hudElements.container)
    {
      this.hudElements.container.style.display = 'none';
    }
  }

  createWindFlags()
  {

    // Create flag texture once
    const flagTexture = this.createFlagTexture();

    // Create flag poles every 100 yards from 100 to target distance at the border of the 50-yard lane
    const maxDistance = this.distance; // yards
    const laneBorder = FClassSimulator.RANGE_LANE_WIDTH / 2; // yards from center (border of 50-yard lane)

    this.flagMeshes = [];

    for (let yds = FClassSimulator.POLE_INTERVAL; yds < maxDistance; yds += FClassSimulator.POLE_INTERVAL)
    {
      const poleBoxKey = `${FClassSimulator.POLE_THICKNESS}|${FClassSimulator.POLE_THICKNESS}|${FClassSimulator.POLE_HEIGHT}`;
      const poleGeometry = this._geoBoxCache[poleBoxKey] || (this._geoBoxCache[poleBoxKey] = new THREE.BoxGeometry(FClassSimulator.POLE_THICKNESS, FClassSimulator.POLE_THICKNESS, FClassSimulator.POLE_HEIGHT));
      const poleMaterial = new THREE.MeshStandardMaterial(
      {
        color: 0x808080
      }); // Grey
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);

      // Enable shadow casting and receiving
      pole.castShadow = true;
      pole.receiveShadow = true;

      pole.position.set(yds, laneBorder, FClassSimulator.POLE_HEIGHT / 2);
      this.scene.add(pole);

      // Create flag geometry and mesh
      const flagGeometry = this.createFlagGeometry();
      const flagMaterial = new THREE.MeshStandardMaterial(
      {
        map: flagTexture,
        side: THREE.DoubleSide
      });
      const flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);

      // Enable shadow casting and receiving
      flagMesh.castShadow = true;
      flagMesh.receiveShadow = true;

      // Position flag at top of pole (center of base at pole top - half base width)
      const flagZ = FClassSimulator.POLE_HEIGHT - FClassSimulator.FLAG_BASE_WIDTH / 2;
      flagMesh.position.set(yds, laneBorder, flagZ);
      this.scene.add(flagMesh);

      // Store flag data for animation
      this.flagMeshes.push(
      {
        pole: pole,
        flagGeometry: flagGeometry,
        flagMesh: flagMesh,
        position:
        {
          x: yds,
          y: laneBorder,
          z: flagZ
        },
        currentAngle: FClassSimulator.FLAG_MIN_ANGLE,
        targetAngle: FClassSimulator.FLAG_MIN_ANGLE,
        currentDirection: 0, // yaw rotation in radians
        flapPhase: Math.random() * Math.PI * 2 // Random starting phase for variety
      });
    }

  }



  updateFlags()
  {
    // Smooth interpolation speed (radians per second for direction, degrees per second for angle)
    const deltaTime = this.getDeltaTime();
    const angleSpeed = FClassSimulator.FLAG_ANGLE_INTERPOLATION_SPEED; // degrees per second
    const directionSpeed = FClassSimulator.FLAG_DIRECTION_INTERPOLATION_SPEED; // radians per second

    // Update each flag mesh based on wind
    for (let i = 0; i < this.flagMeshes.length; i++)
    {
      const flag = this.flagMeshes[i];
      const pos = flag.position;

      // Get wind at flag position (convert yards to meters for BTK)
      const x_m = btk.Conversions.yardsToMeters(pos.x);
      const y_m = btk.Conversions.yardsToMeters(pos.y);
      const z_m = btk.Conversions.yardsToMeters(pos.z);
      const t_s = this.getTime();

      // Get wind vector at this position and time
      const windVector = this.windGenerator.sample(x_m, t_s);
      const windX = windVector.x; // Downrange (m/s)
      const windY = windVector.y; // Crossrange (m/s)

      // Calculate wind magnitude and direction
      const windSpeedMps = Math.sqrt(windX * windX + windY * windY);
      const windSpeedMph = btk.Conversions.mpsToMph(windSpeedMps);

      // Calculate target angle based on wind speed
      const targetAngleDeg = Math.min(
        FClassSimulator.FLAG_MIN_ANGLE + windSpeedMph * FClassSimulator.FLAG_DEGREES_PER_MPH,
        FClassSimulator.FLAG_MAX_ANGLE
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
      const flapFrequency = FClassSimulator.FLAG_FLAP_FREQUENCY_BASE + windSpeedMph * FClassSimulator.FLAG_FLAP_FREQUENCY_SCALE;
      flag.flapPhase += flapFrequency * 2 * Math.PI * deltaTime;

      // Update flag geometry with flapping
      this.updateFlagVertices(flag, flag.currentAngle, flag.currentDirection, windSpeedMph);
    }
  }


  updateFlagVertices(flag, angleDeg, direction, windSpeedMph)
  {
    // Update all segments with flapping animation for thick flag
    // Uses helper method for position calculations
    const numSegments = 5;

    // Get the position attribute from the geometry
    const positions = flag.flagGeometry.attributes.position.array;

    // Update each segment (4 vertices per segment: 2 front + 2 back)
    for (let i = 0; i < numSegments; i++)
    {
      // Get positions using helper method with actual wind parameters
      const segmentPositions = this.calculateFlagSegmentPosition(i, angleDeg, direction, flag.flapPhase);

      // Update all 4 vertices for this segment (front and back faces)
      const idx = i * 4; // 4 vertices per segment

      // Front face vertices (positive X)
      positions[idx * 3 + 0] = segmentPositions.topFront[0]; // Top front X
      positions[idx * 3 + 1] = segmentPositions.topFront[1]; // Top front Y
      positions[idx * 3 + 2] = segmentPositions.topFront[2]; // Top front Z

      positions[(idx + 1) * 3 + 0] = segmentPositions.bottomFront[0]; // Bottom front X
      positions[(idx + 1) * 3 + 1] = segmentPositions.bottomFront[1]; // Bottom front Y
      positions[(idx + 1) * 3 + 2] = segmentPositions.bottomFront[2]; // Bottom front Z

      // Back face vertices (negative X)
      positions[(idx + 2) * 3 + 0] = segmentPositions.topBack[0]; // Top back X
      positions[(idx + 2) * 3 + 1] = segmentPositions.topBack[1]; // Top back Y
      positions[(idx + 2) * 3 + 2] = segmentPositions.topBack[2]; // Top back Z

      positions[(idx + 3) * 3 + 0] = segmentPositions.bottomBack[0]; // Bottom back X
      positions[(idx + 3) * 3 + 1] = segmentPositions.bottomBack[1]; // Bottom back Y
      positions[(idx + 3) * 3 + 2] = segmentPositions.bottomBack[2]; // Bottom back Z
    }

    // Mark the geometry as needing an update
    flag.flagGeometry.attributes.position.needsUpdate = true;
    flag.flagGeometry.computeVertexNormals();
  }

  updateTargetAnimations()
  {
    const deltaTime = this.getDeltaTime();

    for (let i = 0; i < this.targetFrames.length; i++)
    {
      const targetFrame = this.targetFrames[i];
      const targetSize = 2; // yards

      // If animating, move toward goal
      if (targetFrame.animating)
      {
        const direction = Math.sign(targetFrame.targetHeightGoal - targetFrame.currentHeight);
        const moveDistance = FClassSimulator.TARGET_ANIMATION_SPEED * deltaTime * direction;
        const newHeight = targetFrame.currentHeight + moveDistance;

        // Check if we've reached or passed the goal
        if ((direction > 0 && newHeight >= targetFrame.targetHeightGoal) ||
          (direction < 0 && newHeight <= targetFrame.targetHeightGoal))
        {
          targetFrame.currentHeight = targetFrame.targetHeightGoal;
          targetFrame.animating = false;
        }
        else
        {
          targetFrame.currentHeight = newHeight;
        }
      }

      // Update target position
      targetFrame.mesh.position.z = targetFrame.baseHeight + targetFrame.currentHeight;

      // Update number box position to move with target
      if (targetFrame.numberBox)
      {
        targetFrame.numberBox.position.z = targetFrame.baseHeight + targetSize + 0.2 + targetFrame.currentHeight;
      }
    }

    // Random demo behavior - every ~3-5 seconds, pick a random target
    if (Math.random() < FClassSimulator.RANDOM_ANIMATION_CHANCE)
    { // ~1% chance per frame at 60fps = ~every 1.7 seconds
      const randomTarget = Math.floor(Math.random() * this.targetFrames.length) + 1;
      const target = this.targetFrames[randomTarget - 1];

      // Don't animate the user's target
      if (target === this.userTarget)
      {
        return;
      }

      const randomAction = Math.random();

      if (randomAction < 0.5)
      {
        this.raiseTarget(randomTarget);
      }
      else
      {
        this.lowerTarget(randomTarget);
      }
    }
  }

  // ===== TARGET ANIMATION =====
  /**
   * Animates target to raised position (above pits)
   * @param {number} targetNumber - Target number (1-indexed)
   */
  raiseTarget(targetNumber)
  {
    // Validate target number
    if (targetNumber < 1 || targetNumber > this.targetFrames.length)
    {
      console.warn(`Invalid target number: ${targetNumber}. Valid range: 1-${this.targetFrames.length}`);
      return;
    }

    const target = this.targetFrames[targetNumber - 1];
    target.targetHeightGoal = FClassSimulator.TARGET_MAX_HEIGHT;
    target.animating = true;
  }

  lowerTarget(targetNumber)
  {
    const target = this.targetFrames[targetNumber - 1];
    target.targetHeightGoal = FClassSimulator.TARGET_MIN_HEIGHT;
    target.animating = true;
  }

  halfMastTarget(targetNumber)
  {
    const target = this.targetFrames[targetNumber - 1];
    target.targetHeightGoal = FClassSimulator.TARGET_HALF_MAST;
    target.animating = true;
  }

  updateSpottingScopeCamera()
  {
    const deltaTime = this.getDeltaTime();
    // Calculate pan speed that slows down linearly with magnification
    // At 2x mag: full speed, at 100x mag: 1/50th speed
    const speedFactor = 2.0 / this.spottingScopeMagnification; // 2x = 1.0, 100x = 0.02
    const panSpeed = FClassSimulator.SPOTTING_SCOPE_PAN_SPEED * deltaTime * speedFactor;

    // W/S: adjust pitch (tilt up/down)
    // W = tilt up (positive pitch)
    // S = tilt down (negative pitch)
    if (this.spottingScopeKeys.w) this.spottingScopePitch += panSpeed;
    if (this.spottingScopeKeys.s) this.spottingScopePitch -= panSpeed;

    // A/D: pan left/right (move crossrange position)
    // A = pan left (negative Y in BTK coords)
    // D = pan right (positive Y in BTK coords)
    if (this.spottingScopeKeys.a) this.spottingScopeYaw += panSpeed;
    if (this.spottingScopeKeys.d) this.spottingScopeYaw -= panSpeed;

    // E/Q: adjust magnification (exponential scaling)
    // E = increase magnification
    // Q = decrease magnification
    if (this.spottingScopeKeys.e)
    {
      this.spottingScopeMagnification = Math.min(
        FClassSimulator.SPOTTING_SCOPE_MAX_MAGNIFICATION,
        this.spottingScopeMagnification * Math.pow(1.1, deltaTime * 10) // 10% increase per second
      );
    }
    if (this.spottingScopeKeys.q)
    {
      this.spottingScopeMagnification = Math.max(
        FClassSimulator.SPOTTING_SCOPE_MIN_MAGNIFICATION,
        this.spottingScopeMagnification / Math.pow(1.1, deltaTime * 10) // 10% decrease per second
      );
    }

    // Clamp pitch and yaw to reasonable limits
    this.spottingScopePitch = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, this.spottingScopePitch));
    this.spottingScopeYaw = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, this.spottingScopeYaw));

    // Update scope camera FOV based on current magnification
    const scopeFOV = FClassSimulator.CAMERA_FOV / this.spottingScopeMagnification;
    this.spottingScopeCamera.fov = scopeFOV;
    this.spottingScopeCamera.updateProjectionMatrix();

    // Apply rotation to scope camera
    // Start from main camera position and orientation
    const targetCenterHeight = FClassSimulator.PITS_HEIGHT + FClassSimulator.TARGET_GAP_ABOVE_PITS + 1;
    this.spottingScopeCamera.position.copy(this.camera.position);
    this.spottingScopeCamera.up.set(0, 0, 1);

    // Calculate look-at target with offsets
    // scopeYaw controls horizontal (Y-axis) offset at distance
    // scopePitch controls vertical (Z-axis) offset
    const lookX = this.distance;
    const lookY = this.distance * Math.tan(this.spottingScopeYaw); // Pan left/right
    const lookZ = targetCenterHeight + this.distance * Math.tan(this.spottingScopePitch); // Tilt up/down

    this.spottingScopeCamera.lookAt(lookX, lookY, lookZ);
  }

  /**
   * Updates rifle scope camera position based on arrow key input
   * Pan movement is 0.1 inches linear at target distance
   * Pitch/yaw are clamped to target frame boundaries
   */
  updateRifleScopeCamera()
  {
    // Check if user target exists
    if (!this.userTarget)
    {
      console.warn('User target not found, skipping rifle scope update');
      return;
    }

    // Calculate angular movement in radians from MOA
    const moaIncrement = FClassSimulator.RIFLE_SCOPE_PAN_SPEED; // 0.1 MOA per key press
    const angularIncrement = moaIncrement * (Math.PI / 180) / 60; // Convert MOA to radians

    // Arrow keys: adjust pitch and yaw (per key press, not per frame)
    // Up arrow: increase pitch (tilt up)
    // Down arrow: decrease pitch (tilt down)
    if (this.rifleScopeKeys.up)
    {
      this.rifleScopePitch += angularIncrement;
      this.rifleScopeKeys.up = false; // Reset key state after one press
    }
    if (this.rifleScopeKeys.down)
    {
      this.rifleScopePitch -= angularIncrement;
      this.rifleScopeKeys.down = false; // Reset key state after one press
    }

    // Left arrow: increase yaw (pan left)
    // Right arrow: decrease yaw (pan right)
    if (this.rifleScopeKeys.left)
    {
      this.rifleScopeYaw += angularIncrement;
      this.rifleScopeKeys.left = false; // Reset key state after one press
    }
    if (this.rifleScopeKeys.right)
    {
      this.rifleScopeYaw -= angularIncrement;
      this.rifleScopeKeys.right = false; // Reset key state after one press
    }

    // Clamp pitch and yaw to target frame limits
    this.rifleScopePitch = Math.max(-this.rifleScopeMaxPitch, Math.min(this.rifleScopeMaxPitch, this.rifleScopePitch));
    this.rifleScopeYaw = Math.max(-this.rifleScopeMaxYaw, Math.min(this.rifleScopeMaxYaw, this.rifleScopeYaw));

    // Apply rotation to rifle scope camera
    // Use user's target as the center reference point
    this.rifleScopeCamera.position.copy(this.camera.position);
    this.rifleScopeCamera.up.set(0, 0, 1);

    // Calculate look-at target with offsets relative to user's target
    const lookX = this.distance;
    const lookY = this.userTarget.mesh.position.y + this.distance * Math.tan(this.rifleScopeYaw);
    const lookZ = this.userTarget.mesh.position.z + this.distance * Math.tan(this.rifleScopePitch);

    this.rifleScopeCamera.lookAt(lookX, lookY, lookZ);
  }

  updateRifleScopeZoom()
  {
    if (!this.rifleScopeCamera) return;

    // Recalculate FOV based on current zoom level
    const targetFrameWidth = FClassSimulator.TARGET_SIZE; // yards
    const fovRadians = Math.atan((this.rifleScopeZoom * targetFrameWidth) / this.distance);
    const fovDegrees = fovRadians * 180 / Math.PI;

    // Update camera FOV
    this.rifleScopeCamera.fov = fovDegrees;
    this.rifleScopeCamera.updateProjectionMatrix();

    console.log(`Rifle scope zoom: ${this.rifleScopeZoom.toFixed(2)}x (FOV: ${fovDegrees.toFixed(1)}°)`);
  }


  // ===== BALLISTICS & SHOOTING =====

  /**
   * Setup ballistic system with zeroing
   */
  async setupBallisticSystem()
  {
    try
    {
      // Get bullet parameters from UI
      const mvFps = parseFloat(document.getElementById('mv').value);
      const bc = parseFloat(document.getElementById('bc').value);
      const dragFunction = document.getElementById('dragFunction').value;
      const diameterInches = parseFloat(document.getElementById('diameter').value);
      const mvSdFps = parseFloat(document.getElementById('mvSd').value);
      const rifleAccuracyMoa = parseFloat(document.getElementById('rifleAccuracy').value);

      this.nominalMV = mvFps; // Store in fps
      this.bulletDiameter = diameterInches; // Store in inches
      this.mvSd = mvSdFps; // Store in fps
      this.rifleAccuracyMoa = rifleAccuracyMoa; // Store in MOA

      // Get game parameters
      const gameParams = getGameParams();
      console.log('Getting target:', gameParams.target, typeof gameParams.target);
      this.btkTarget = btk.NRATargets.getTarget(String(gameParams.target));
      const range = btk.Conversions.yardsToMeters(gameParams.distance);

      // Create bullet
      this.bullet = new btk.Bullet(
        btk.Conversions.grainsToKg(0),
        btk.Conversions.inchesToMeters(this.bulletDiameter), // Convert at call
        btk.Conversions.inchesToMeters(0),
        bc,
        dragFunction === 'G1' ? btk.DragFunction.G1 : btk.DragFunction.G7
      );

      // Create atmosphere (default conditions)
      const atmosphere = new btk.Atmosphere(
        btk.Conversions.fahrenheitToKelvin(59),
        btk.Conversions.feetToMeters(0),
        0.5,
        0.0
      );

      // Create ballistic simulator
      this.ballisticSimulator = new btk.BallisticsSimulator();
      this.ballisticSimulator.setInitialBullet(this.bullet);
      this.ballisticSimulator.setAtmosphere(atmosphere);
      this.ballisticSimulator.setWind(new btk.Vector3D(0, 0, 0));

      // Calculate target center coordinates for the selected target
      this.targetCenterCoords = this.calculateTargetCenterCoords();

      // Custom zeroing routine to hit target center (accounting for Y offset)
      const mvMps = btk.Conversions.fpsToMps(this.nominalMV); // Convert to m/s
      this.zeroedBullet = this.computeZeroToTarget(mvMps, range);

      // Create match object for recording shots
      this.match = new btk.Match();

      console.log('Ballistic system zeroed on target at', gameParams.distance, 'yards');
    }
    catch (error)
    {
      console.error('Failed to setup ballistic system:', error);
      throw error;
    }
  }

  /**
   * Calculate the center coordinates of the selected target
   */
  calculateTargetCenterCoords()
  {
    // Get the target position from the 3D scene
    if (!this.userTarget || !this.userTarget.mesh)
    {
      console.error('User target not found');
      return {
        x: this.distance,
        y: 0,
        z: FClassSimulator.TARGET_CENTER_HEIGHT
      };
    }

    // Get the actual position from the 3D mesh
    const mesh = this.userTarget.mesh;
    const position = mesh.position;

    console.log(`Three.js target position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);

    // Convert from Three.js coordinates to BTK coordinates
    // Three.js: X=downrange, Y=crossrange, Z=up (based on actual output)
    // BTK: X=downrange, Y=crossrange, Z=up
    const x = position.x; // Three.js X (downrange) -> BTK X (downrange)
    const y = position.y; // Three.js Y (crossrange) -> BTK Y (crossrange)  
    const z = position.z; // Three.js Z (up) -> BTK Z (up)

    console.log(`Target center coordinates: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) yards`);

    return {
      x,
      y,
      z
    };
  }

  /**
   * Custom zeroing routine to hit target center accounting for Y offset
   */
  computeZeroToTarget(mv, range_m)
  {
    // Use the actual target center coordinates from the 3D scene
    const targetX = btk.Conversions.yardsToMeters(this.targetCenterCoords.x);
    const targetY = btk.Conversions.yardsToMeters(this.targetCenterCoords.y);
    const targetZ = btk.Conversions.yardsToMeters(this.targetCenterCoords.z);

    console.log(`Zeroing to target at (${targetX.toFixed(2)}, ${targetY.toFixed(2)}, ${targetZ.toFixed(2)}) meters`);

    // Initial angles - start with reasonable elevation and windage
    let elevation = 0.1; // Start with 0.1 radian elevation (about 6 degrees)
    let windage = 0.0; // Start with no windage

    const dt = 0.001;
    const maxIterations = 1000;
    const tolerance = 0.001; // 1mm tolerance

    for (let iter = 0; iter < maxIterations; iter++)
    {
      // Create velocity vector from angles
      const vx = mv * Math.cos(elevation) * Math.cos(windage);
      const vy = mv * Math.cos(elevation) * Math.sin(windage);
      const vz = mv * Math.sin(elevation);

      const vel = new btk.Vector3D(vx, vy, vz);
      const pos = new btk.Vector3D(0, 0, 0); // Start at muzzle
      const bullet = new btk.Bullet(this.bullet, pos, vel, 0.0);

      // Simulate trajectory
      this.ballisticSimulator.setInitialBullet(bullet);
      this.ballisticSimulator.resetToInitial();
      this.ballisticSimulator.setWind(new btk.Vector3D(0, 0, 0)); // No wind for zeroing

      const trajectory = this.ballisticSimulator.simulate(range_m * 1.1, dt, 5.0);
      const pointAtRange = trajectory.atDistance(range_m);

      if (!pointAtRange)
      {
        console.log('Trajectory failed at iteration', iter);
        break;
      }

      const bulletPos = pointAtRange.getState().getPosition();
      const errorX = bulletPos.x - targetX;
      const errorY = bulletPos.y - targetY;
      const errorZ = bulletPos.z - targetZ;
      const totalError = Math.sqrt(errorX * errorX + errorY * errorY + errorZ * errorZ);

      if (iter % 10 === 0)
      {
        console.log(`Iter ${iter}: Error=(${errorX.toFixed(3)}, ${errorY.toFixed(3)}, ${errorZ.toFixed(3)}) total=${totalError.toFixed(3)}m`);
        console.log(`  Angles: elevation=${(elevation * 180/Math.PI).toFixed(2)}°, windage=${(windage * 180/Math.PI).toFixed(2)}°`);
      }

      if (totalError < tolerance)
      {
        console.log(`Zeroing converged after ${iter} iterations`);
        console.log(`Final bullet position: (${bulletPos.x.toFixed(2)}, ${bulletPos.y.toFixed(2)}, ${bulletPos.z.toFixed(2)}) meters`);
        console.log(`Target position: (${targetX.toFixed(2)}, ${targetY.toFixed(2)}, ${targetZ.toFixed(2)}) meters`);
        break;
      }

      // Adjust angles based on errors - more aggressive correction
      const correctionFactor = 0.5;
      elevation -= errorZ * correctionFactor / range_m; // Adjust elevation for height error
      windage -= errorY * correctionFactor / range_m; // Adjust windage for crossrange error

      // Keep angles reasonable
      elevation = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, elevation));
      windage = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, windage));
    }

    // Create final velocity from converged angles
    const finalVx = mv * Math.cos(elevation) * Math.cos(windage);
    const finalVy = mv * Math.cos(elevation) * Math.sin(windage);
    const finalVz = mv * Math.sin(elevation);

    const finalVel = new btk.Vector3D(finalVx, finalVy, finalVz);
    const finalPos = new btk.Vector3D(0, 0, 0);
    const zeroedBullet = new btk.Bullet(this.bullet, finalPos, finalVel, 0.0);

    console.log(`Final zeroed velocity: (${finalVx.toFixed(2)}, ${finalVy.toFixed(2)}, ${finalVz.toFixed(2)}) m/s`);
    console.log(`Final angles: elevation=${(elevation * 180/Math.PI).toFixed(2)}°, windage=${(windage * 180/Math.PI).toFixed(2)}°`);
    console.log(`Velocity magnitude: ${finalVel.magnitude().toFixed(2)} m/s`);

    return zeroedBullet;
  }

  // ===== UI & DISPLAY =====

  /**
   * Display a 1" red marker for the last shot
   */
  displayLastShotMarker(relativeX, relativeY)
  {
    // Remove any existing last shot marker
    if (this.lastShotMarker)
    {
      this.scene.remove(this.lastShotMarker);
      this.lastShotMarker.geometry.dispose();
      this.lastShotMarker.material.dispose();
      this.lastShotMarker = null;
    }


    // Parameters are already in yards (no conversion needed)

    // Create 1" red sphere marker (1 inch = 0.02778 yards, so 0.5" radius)
    const markerGeometry = new THREE.SphereGeometry(0.5 * 0.02778, 8, 8); // 1" diameter = 0.5" radius in yards
    const markerMaterial = new THREE.MeshBasicMaterial(
    {
      color: new THREE.Color(1, 0, 0), // Explicit red RGB
      toneMapped: false // Don't apply tone mapping/lighting
    });

    this.lastShotMarker = new THREE.Mesh(markerGeometry, markerMaterial);

    // Position at target center with relative offset
    this.lastShotMarker.position.set(
      this.distance - 0.1, // Slightly in front of target (yards)
      this.targetCenterCoords.y + relativeX, // Target center Y + crossrange offset
      this.targetCenterCoords.z + relativeY // Target center Z + height offset
    );

    console.log(`Shot marker at: (${this.lastShotMarker.position.x.toFixed(2)}, ${this.lastShotMarker.position.y.toFixed(2)}, ${this.lastShotMarker.position.z.toFixed(2)}) yards`);
    console.log(`Relative impact: (${relativeX.toFixed(2)}, ${relativeY.toFixed(2)}) yards`);

    this.scene.add(this.lastShotMarker);
  }

  /**
   * Update the HUD with current shot statistics
   */
  updateHUD()
  {
    if (!this.hudElements.container) return;

    const shotCount = this.match ? this.match.getHitCount() : 0;
    const totalScore = this.match ? this.match.getTotalScore() : 0;
    const xCount = this.match ? this.match.getXCount() : 0;

    // Update shot count and score (F-Class match is 60 shots)
    if (shotCount >= FClassSimulator.FCLASS_MATCH_SHOTS)
    {
      this.hudElements.shots.textContent = `${FClassSimulator.FCLASS_MATCH_SHOTS}/${FClassSimulator.FCLASS_MATCH_SHOTS} (Complete!)`;
      this.hudElements.shots.style.color = '#28a745'; // Green for complete
    }
    else
    {
      this.hudElements.shots.textContent = `${shotCount}/${FClassSimulator.FCLASS_MATCH_SHOTS}`;
      this.hudElements.shots.style.color = ''; // Reset color
    }
    this.hudElements.score.textContent = `${totalScore}-${xCount}x`;

    // Calculate dropped points (10 - score for each shot, 1 - X for each X)
    const maxPossibleScore = shotCount * 10; // 10 points per shot
    const maxPossibleX = shotCount; // 1 X per shot
    const droppedPoints = maxPossibleScore - totalScore;
    const droppedX = maxPossibleX - xCount;
    this.hudElements.dropped.textContent = `${droppedPoints}-${droppedX}x`;

    // Update last shot data
    if (this.lastShotData)
    {
      const scoreText = `${this.lastShotData.score}${this.lastShotData.isX ? 'x' : ''}`;
      this.hudElements.lastScore.textContent = scoreText;
      this.hudElements.mv.textContent = `${Math.round(this.lastShotData.mvFps)} fps`;
      this.hudElements.impactV.textContent = `${Math.round(this.lastShotData.impactVelocityFps)} fps`;
    }
    else
    {
      this.hudElements.lastScore.textContent = '--';
      this.hudElements.mv.textContent = '-- fps';
      this.hudElements.impactV.textContent = '-- fps';
    }
  }

  /**
   * Show match completion notification
   */
  showMatchCompleteNotification()
  {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #28a745;
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: bold;
      text-align: center;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 2px solid #1e7e34;
    `;

    const totalScore = this.match.getTotalScore();
    const xCount = this.match.getXCount();
    const groupSize = btk.Conversions.metersToInches(this.match.getGroupSize()).toFixed(2);
    const shotCount = this.match.getHitCount();
    const maxPossibleScore = shotCount * 10;
    const maxPossibleX = shotCount;
    const droppedPoints = maxPossibleScore - totalScore;
    const droppedX = maxPossibleX - xCount;

    notification.innerHTML = `
      <div style="font-size: 24px; margin-bottom: 10px;">🎯 Match Complete!</div>
      <div>Final Score: ${totalScore}-${xCount}x</div>
      <div>Dropped: ${droppedPoints}-${droppedX}x</div>
      <div>Group Size: ${groupSize}"</div>
      <div style="margin-top: 15px; font-size: 14px; opacity: 0.9;">Click Restart to start a new match</div>
      <button onclick="this.parentElement.remove()" style="
        margin-top: 15px;
        padding: 8px 16px;
        background: #1e7e34;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">Dismiss</button>
    `;

    document.body.appendChild(notification);

    // Auto-dismiss after 10 seconds
    setTimeout(() =>
    {
      if (notification.parentElement)
      {
        notification.remove();
      }
    }, 10000);
  }

  /**
   * Fire a shot and display the impact
   */
  fireShot()
  {
    if (!this.ballisticSimulator || !this.userTarget)
    {
      console.error('Ballistic simulator not initialized');
      return;
    }

    // Check if match is complete (60 shots for F-Class)
    const currentShots = this.match ? this.match.getHitCount() : 0;
    if (currentShots >= FClassSimulator.FCLASS_MATCH_SHOTS)
    {
      console.log(`Match complete! ${FClassSimulator.FCLASS_MATCH_SHOTS} shots fired. Please restart to start a new match.`);
      return;
    }

    // Play shot sound
    this.playShotSound();

    try
    {
      const range = this.distance;
      const dt = 0.001;

      // Apply MV variation in fps, then convert to m/s for BTK
      const mvVariationFps = (Math.random() - 0.5) * 2.0 * this.mvSd; // fps
      const actualMVFps = this.nominalMV + mvVariationFps; // fps
      const actualMV = btk.Conversions.fpsToMps(actualMVFps); // m/s for BTK

      // Rifle accuracy as uniform distribution within a circle (diameter)
      // Generate random point within unit circle using rejection sampling
      let accuracyX, accuracyY;
      do {
        accuracyX = (Math.random() - 0.5) * 2.0; // -1 to 1
        accuracyY = (Math.random() - 0.5) * 2.0; // -1 to 1
      } while (accuracyX * accuracyX + accuracyY * accuracyY > 1.0);

      // Rifle accuracy in MOA, convert to radians for angular error
      const accuracyMoa = this.rifleAccuracyMoa;
      const accuracyRad = btk.Conversions.moaToRadians(accuracyMoa);
      const accuracyRadius = accuracyRad / 2.0; // Convert diameter to radius
      const accuracyErrorH = accuracyX * accuracyRadius; // radians
      const accuracyErrorV = accuracyY * accuracyRadius; // radians

      // Apply scope aim and accuracy errors to the zeroed velocity
      const zeroVel = this.zeroedBullet.getVelocity();
      const zeroVelMag = zeroVel.magnitude();
      const zeroVelNorm = zeroVel.normalized();

      // Apply scope aim as small angular adjustments to the zeroed direction
      const yawAdjustment = this.rifleScopeYaw + accuracyErrorH;
      const pitchAdjustment = -(this.rifleScopePitch + accuracyErrorV); // Invert pitch for correct behavior

      // Create new velocity by rotating the zeroed velocity
      const cosYaw = Math.cos(yawAdjustment);
      const sinYaw = Math.sin(yawAdjustment);
      const cosPitch = Math.cos(pitchAdjustment);
      const sinPitch = Math.sin(pitchAdjustment);

      // Rotate zeroed velocity by scope adjustments
      const rotatedVel = new btk.Vector3D(
        zeroVelNorm.x * cosPitch * cosYaw - zeroVelNorm.y * sinYaw + zeroVelNorm.z * sinPitch * cosYaw,
        zeroVelNorm.x * cosPitch * sinYaw + zeroVelNorm.y * cosYaw + zeroVelNorm.z * sinPitch * sinYaw,
        -zeroVelNorm.x * sinPitch + zeroVelNorm.z * cosPitch
      );

      // Scale by actual MV
      const variedVel = new btk.Vector3D(
        rotatedVel.x * actualMV,
        rotatedVel.y * actualMV,
        rotatedVel.z * actualMV
      );

      // Create bullet with varied initial state - start from muzzle (z=0)
      const bulletStartPos = new btk.Vector3D(0, 0, 0);

      const variedBullet = new btk.Bullet(
        this.zeroedBullet,
        bulletStartPos,
        variedVel,
        this.zeroedBullet.getSpinRate()
      );

      // Reset simulator with varied bullet
      this.ballisticSimulator.setInitialBullet(variedBullet);
      this.ballisticSimulator.resetToInitial();

      // Simulate with wind generator
      const rangeMeters = btk.Conversions.yardsToMeters(range);
      const trajectory = this.ballisticSimulator.simulateWithWind(rangeMeters, dt, 3.0, this.windGenerator, this.getTime());
      // Store for animation
      this.lastTrajectory = trajectory;
      const pointAtTarget = trajectory.atDistance(rangeMeters);

      if (!pointAtTarget)
      {
        console.error('Failed to get trajectory point at target distance');
        return;
      }

      // Get bullet position and velocity at target
      const bulletState = pointAtTarget.getState();
      const bulletPos = bulletState.getPosition();
      const bulletVel = bulletState.getVelocity();
      const impactVelocity = bulletVel.magnitude(); // m/s

      // Calculate impact relative to target center using actual target coordinates
      const targetX = btk.Conversions.yardsToMeters(this.targetCenterCoords.x);
      const targetY = btk.Conversions.yardsToMeters(this.targetCenterCoords.y);
      const targetZ = btk.Conversions.yardsToMeters(this.targetCenterCoords.z);

      // Impact relative to target center
      const relativeX = bulletPos.y - targetY;
      const relativeY = bulletPos.z - targetZ;

      // Store all shot data for processing after animation completes
      this.pendingShotData = {
        relativeX: relativeX, // meters
        relativeY: relativeY, // meters
        mvFps: actualMVFps,
        impactVelocityFps: btk.Conversions.mpsToFps(impactVelocity),
        bulletDiameterMeters: btk.Conversions.inchesToMeters(this.bulletDiameter)
      };

      // Log that animation is starting
      console.log(`Bullet fired - animation starting...`);
    }
    catch (error)
    {
      console.error('Failed to fire shot:', error);
      throw error;
    }
  }

  /**
   * Display shot impact on the target
   * @param {number} relativeX - Crossrange impact position (meters)
   * @param {number} relativeY - Vertical impact position (meters)
   * @param {number} score - Shot score
   * @param {boolean} isX - Whether shot is X-ring
   */
  displayShotImpact(relativeX, relativeY, score, isX)
  {
    if (!this.userTarget) return;

    // Create shot impact marker
    const shotGeometry = new THREE.SphereGeometry(this.bulletDiameter / 2, 8, 8);
    const shotMaterial = new THREE.MeshBasicMaterial(
    {
      color: isX ? FClassSimulator.COLOR_X_RING : (score >= FClassSimulator.SCORE_THRESHOLD_RED ? FClassSimulator.COLOR_HIGH_SCORE : FClassSimulator.COLOR_LOW_SCORE)
    });
    const shotMesh = new THREE.Mesh(shotGeometry, shotMaterial);

    // Position on user target
    shotMesh.position.set(
      this.userTarget.mesh.position.x,
      this.userTarget.mesh.position.y + relativeX,
      this.userTarget.mesh.position.z + relativeY
    );

    this.scene.add(shotMesh);

    if (!this.shotMarkers) this.shotMarkers = [];
    this.shotMarkers.push(shotMesh);
  }

  /**
   * Clear all shot markers from the scene
   */
  clearShotMarkers()
  {
    if (this.shotMarkers)
    {
      this.shotMarkers.forEach(marker =>
      {
        this.scene.remove(marker);
        marker.geometry.dispose();
        marker.material.dispose();
      });
      this.shotMarkers = [];
    }

    // Clear match data
    if (this.match)
    {
      this.match.clear();
    }
  }

  /**
   * Setup shot firing controls (space bar to fire)
   */
  setupShotFiringControls()
  {
    document.addEventListener('keydown', (event) =>
    {
      if (event.code === 'Space')
      {
        if (this.bulletAnim)
        {
          // Bullet animation in progress - ignore spacebar completely
          event.preventDefault();
          return;
        }

        if (this.isRunning && this.ballisticSimulator)
        {
          event.preventDefault();
          this.fireShot();
          // Start bullet animation for this shot if trajectory is available
          this.startBulletAnimation();
        }
      }
    });
  }

  // ===== BULLET ANIMATION =====

  createBulletGlowTexture()
  {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Create radial gradient for motion blur effect
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)'); // Very faint white center
    gradient.addColorStop(0.2, 'rgba(200, 200, 200, 0.2)'); // Light gray
    gradient.addColorStop(0.5, 'rgba(150, 150, 150, 0.1)'); // Faint gray
    gradient.addColorStop(0.8, 'rgba(100, 100, 100, 0.05)'); // Very faint
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Transparent edge

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  startBulletAnimation()
  {
    if (!this.lastTrajectory)
      return;

    if (!this.bulletMaterial)
    {
      // Copper color: #B87333 (RGB: 184, 115, 51)
      this.bulletMaterial = new THREE.MeshBasicMaterial(
      {
        color: new THREE.Color(0.722, 0.451, 0.200), // Copper color
        toneMapped: false
      });
    }

    if (!this.bulletGeometry)
    {
      // Use actual bullet diameter from UI parameters
      const radiusYards = btk.Conversions.inchesToYards(this.bulletDiameter) / 2.0;
      this.bulletGeometry = new THREE.SphereGeometry(radiusYards, 16, 16);
    }

    if (!this.bulletMesh)
    {
      this.bulletMesh = new THREE.Mesh(this.bulletGeometry, this.bulletMaterial);
      this.bulletMesh.castShadow = true;
      this.bulletMesh.receiveShadow = false;
      this.scene.add(this.bulletMesh);
    }

    // Create pressure wave glow sprite
    if (!this.bulletGlowSprite)
    {
      const glowTexture = this.createBulletGlowTexture();
      const glowMaterial = new THREE.SpriteMaterial(
      {
        map: glowTexture,
        transparent: true,
        blending: THREE.NormalBlending, // Subtle blur instead of bright glow
        depthWrite: false
      });
      this.bulletGlowSprite = new THREE.Sprite(glowMaterial);
      // Make blur larger for motion trail effect
      const glowSize = btk.Conversions.inchesToYards(this.bulletDiameter) * 15.0;
      this.bulletGlowSprite.scale.set(glowSize, glowSize, 1);
      this.scene.add(this.bulletGlowSprite);
    }

    // Make bullet and glow visible for new animation
    this.bulletMesh.visible = true;
    this.bulletGlowSprite.visible = true;

    // Animation state
    const totalTimeS = this.lastTrajectory.getTotalTime();
    this.bulletAnim = {
      totalTimeS,
      startTimeMs: performance.now()
    };

    // Initialize position at t=0
    const optPoint0 = this.lastTrajectory.atTime(0);
    if (optPoint0 !== undefined)
    {
      const p0 = optPoint0.getState().getPosition();
      const x = btk.Conversions.metersToYards(p0.x);
      const y = btk.Conversions.metersToYards(p0.y);
      const z = btk.Conversions.metersToYards(p0.z);
      this.bulletMesh.position.set(x, y, z);
    }
  }

  updateBulletAnimation()
  {
    if (!this.bulletAnim || !this.bulletMesh || !this.lastTrajectory) return;

    // Compute elapsed time (1x real-time)
    const now = performance.now();
    const elapsedRealS = (now - this.bulletAnim.startTimeMs) / 1000.0;
    let t = elapsedRealS;
    if (t >= this.bulletAnim.totalTimeS)
    {
      // Clamp to end and stop animating; keep bullet at impact for a brief time
      t = this.bulletAnim.totalTimeS;
    }

    const optPoint = this.lastTrajectory.atTime(t);
    if (optPoint !== undefined)
    {
      const pos = optPoint.getState().getPosition();
      const x = btk.Conversions.metersToYards(pos.x);
      const y = btk.Conversions.metersToYards(pos.y);
      const z = btk.Conversions.metersToYards(pos.z);
      this.bulletMesh.position.set(x, y, z);
      this.bulletGlowSprite.position.set(x, y, z);
    }

    // End animation when time reaches total
    if (t >= this.bulletAnim.totalTimeS)
    {
      // Hide bullet mesh, glow, and end animation
      this.bulletMesh.visible = false;
      this.bulletGlowSprite.visible = false;

      // Process shot completion: score hit, show marker, update HUD
      if (this.pendingShotData)
      {
        const data = this.pendingShotData;

        // NOW score the hit (add to match)
        const hit = this.match.addHit(data.relativeX, data.relativeY, this.btkTarget, data.bulletDiameterMeters);

        // Show the shot marker (convert to yards for display)
        const relativeXYards = btk.Conversions.metersToYards(data.relativeX);
        const relativeYYards = btk.Conversions.metersToYards(data.relativeY);
        this.displayLastShotMarker(relativeXYards, relativeYYards);

        // Update HUD with shot data
        this.lastShotData = {
          score: hit.getScore(),
          isX: hit.isX(),
          mvFps: data.mvFps,
          impactVelocityFps: data.impactVelocityFps
        };
        this.updateHUD();

        // Check if match is complete (60 shots)
        if (this.match.getHitCount() >= FClassSimulator.FCLASS_MATCH_SHOTS)
        {
          this.showMatchCompleteNotification();
        }

        // Log the final results
        console.log(`Shot ${this.match.getHitCount()}: Score=${hit.getScore()}${hit.isX() ? 'x' : ''}, Impact=(${btk.Conversions.metersToInches(data.relativeX).toFixed(2)}", ${btk.Conversions.metersToInches(data.relativeY).toFixed(2)}")`);
        console.log(`Match: ${this.match.getTotalScore()}-${this.match.getXCount()}x, Group=${btk.Conversions.metersToInches(this.match.getGroupSize()).toFixed(2)}"`);

        this.pendingShotData = null;
      }

      this.bulletAnim = null;
    }
  }

  // ===== CLEANUP =====

  destroy()
  {
    this.stop();

    // Clean up flags
    for (let flagMesh of this.flagMeshes)
    {
      flagMesh.pole.geometry.dispose();
      flagMesh.pole.material.dispose();
      flagMesh.flagMesh.geometry.dispose();
      flagMesh.flagMesh.material.dispose();
      if (flagMesh.flagMesh.material.map)
      {
        flagMesh.flagMesh.material.map.dispose();
      }
      this.scene.remove(flagMesh.pole);
      this.scene.remove(flagMesh.flagMesh);
    }
    this.flagMeshes = [];

    // Clean up targets
    for (let targetFrame of this.targetFrames)
    {
      if (targetFrame.mesh)
      {
        this.scene.remove(targetFrame.mesh);
        targetFrame.mesh.geometry.dispose();
        targetFrame.mesh.material.dispose();
        if (targetFrame.mesh.material.map)
        {
          targetFrame.mesh.material.map.dispose();
        }
      }
      if (targetFrame.numberBox)
      {
        this.scene.remove(targetFrame.numberBox);
        targetFrame.numberBox.geometry.dispose();
        targetFrame.numberBox.material.dispose();
        if (targetFrame.numberBox.material.map)
        {
          targetFrame.numberBox.material.map.dispose();
        }
      }
    }
    this.targetFrames = [];

    // Clean up shot markers
    this.clearShotMarkers();

    // Clean up bullet resources
    if (this.bulletMesh)
    {
      this.scene.remove(this.bulletMesh);
      this.bulletMesh.geometry.dispose();
      this.bulletMesh.material.dispose();
      this.bulletMesh = null;
    }
    if (this.bulletGeometry)
    {
      this.bulletGeometry.dispose();
      this.bulletGeometry = null;
    }
    if (this.bulletMaterial)
    {
      this.bulletMaterial.dispose();
      this.bulletMaterial = null;
    }
    if (this.bulletGlowSprite)
    {
      this.scene.remove(this.bulletGlowSprite);
      this.bulletGlowSprite.material.map.dispose();
      this.bulletGlowSprite.material.dispose();
      this.bulletGlowSprite = null;
    }

    // Clean up geometry cache
    for (let key in this._geoBoxCache)
    {
      this._geoBoxCache[key].dispose();
    }
    this._geoBoxCache = {};

    // Clean up scope resources
    if (this.spottingScopeRenderTarget)
    {
      this.spottingScopeRenderTarget.dispose();
      this.spottingScopeRenderTarget = null;
    }
    if (this.rifleScopeRenderTarget)
    {
      this.rifleScopeRenderTarget.dispose();
      this.rifleScopeRenderTarget = null;
    }
    if (this.overlayTexture)
    {
      this.overlayTexture.dispose();
      this.overlayTexture = null;
    }
    if (this.overlayMesh)
    {
      this.overlayMesh.geometry.dispose();
      this.overlayMesh.material.dispose();
      if (this.overlayScene) this.overlayScene.remove(this.overlayMesh);
      this.overlayMesh = null;
    }
    if (this.spottingScopeViewMesh)
    {
      this.spottingScopeViewMesh.geometry.dispose();
      this.spottingScopeViewMesh.material.dispose();
      if (this.overlayScene) this.overlayScene.remove(this.spottingScopeViewMesh);
      this.spottingScopeViewMesh = null;
    }
    if (this.rifleScopeViewMesh)
    {
      this.rifleScopeViewMesh.geometry.dispose();
      this.rifleScopeViewMesh.material.dispose();
      if (this.overlayScene) this.overlayScene.remove(this.rifleScopeViewMesh);
      this.rifleScopeViewMesh = null;
    }

    // Clean up cameras
    this.camera = null;
    this.spottingScopeCamera = null;
    this.rifleScopeCamera = null;
    this.overlayCamera = null;

    // Clean up audio
    if (this.audioContext)
    {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.shotSound = null;

    // Clean up WASM objects
    if (this.windGenerator)
    {
      this.windGenerator.delete();
      this.windGenerator = null;
    }
    if (this.ballisticSimulator)
    {
      this.ballisticSimulator.delete();
      this.ballisticSimulator = null;
    }
    if (this.match)
    {
      this.match.delete();
      this.match = null;
    }
    if (this.btkTarget)
    {
      this.btkTarget.delete();
      this.btkTarget = null;
    }
    if (this.bullet)
    {
      this.bullet.delete();
      this.bullet = null;
    }
    if (this.zeroedBullet)
    {
      this.zeroedBullet.delete();
      this.zeroedBullet = null;
    }

    // Remove event listeners
    if (this.spottingScopeKeyHandler)
    {
      document.removeEventListener('keydown', this.spottingScopeKeyHandler);
      document.removeEventListener('keyup', this.spottingScopeKeyHandler);
      this.spottingScopeKeyHandler = null;
    }
    if (this.rifleScopeKeyHandler)
    {
      document.removeEventListener('keydown', this.rifleScopeKeyHandler);
      document.removeEventListener('keyup', this.rifleScopeKeyHandler);
      this.rifleScopeKeyHandler = null;
    }
    if (this.shotFiringHandler)
    {
      document.removeEventListener('keydown', this.shotFiringHandler);
      this.shotFiringHandler = null;
    }

    // Dispose renderer and scenes
    this.renderer.dispose();
    this.scene = null;
    this.overlayScene = null;
    this.renderer = null;
    this.clock = null;
  }
}





// Help menu functionality
function setupHelpMenu()
{
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.querySelector('.help-close');

  if (helpBtn)
  {
    helpBtn.addEventListener('click', () =>
    {
      if (helpModal)
      {
        helpModal.style.display = 'block';
      }
    });
  }

  if (helpClose)
  {
    helpClose.addEventListener('click', () =>
    {
      if (helpModal)
      {
        helpModal.style.display = 'none';
      }
    });
  }

  // Close modal when clicking outside of it
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
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () =>
{
  try
  {
    btk = await BallisticsToolkit();
    await init();
    setupUI();
    lockCanvasSize(); // Lock canvas size once on page load
    populateWindPresetDropdown();
    setupHelpMenu();
  }
  catch (err)
  {
    console.error('Failed to initialize:', err);
  }
});