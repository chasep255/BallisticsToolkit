// Import BTK wrappers
import {
  initializeBTK,
  getBTK,
  BtkVector3Wrapper,
  BtkVelocityWrapper,
  BtkBulletWrapper,
  BtkTrajectoryPointWrapper,
  BtkTrajectoryWrapper,
  BtkWindGeneratorWrapper,
  BtkBallisticsSimulatorWrapper,
  BtkAtmosphereWrapper,
  BtkMatchWrapper
} from './btk-wrappers.js';

// Import feature modules
import { FlagSystem } from './wind-flags.js';

// BTK module instance
let btk = null;

let createCircularMaskTextureb = null;

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
  // Game initialization is handled by the FClassSimulator constructor
  // This function is kept for compatibility with the existing initialization flow
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

    // Set default selection to "Typical" if available, otherwise first preset
    if (presetNames.includes('Typical'))
    {
      windSelect.value = 'Typical';
    }
    else if (presetNames.length > 0)
    {
      windSelect.value = presetNames[0];
    }

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
  static POLE_THICKNESS = 0.15;
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
  static FLAG_BASE_WIDTH = 60 / 36; // 60 inches = 1.67 yards (larger flags)
  static FLAG_TIP_WIDTH = 24 / 36; // 24 inches = 0.67 yards (larger flags)
  static FLAG_LENGTH = 16 / 3; // 16 feet = 5.33 yards (longer flags)
  static FLAG_THICKNESS = 0.05;
  static FLAG_MIN_ANGLE = 1; // degrees from vertical
  static FLAG_MAX_ANGLE = 90; // degrees from vertical
  static FLAG_DEGREES_PER_MPH = (90 - 1) / 10; 
  static FLAG_FLAP_FREQUENCY_BASE = 0.5; // Hz at 10 mph (faster flapping)
  static FLAG_FLAP_FREQUENCY_SCALE = 0.25; // Additional Hz per mph (more responsive)
  static FLAG_FLAP_AMPLITUDE = 0.3; // Max ripple amplitude in yards (very visible flapping)
  static FLAG_WAVE_LENGTH = 1.5; // Wavelength along flag length
  static FLAG_ANGLE_INTERPOLATION_SPEED = 30; // degrees per second
  static FLAG_DIRECTION_INTERPOLATION_SPEED = 1.0; // radians per second
  static FLAG_SEGMENTS = 10; // Number of segments for flag geometry (more = smoother)
  static FLAG_PHASE_DRIFT_RANGE = Math.PI * 2; // Random phase offset range (0 to 2π)

  // === SCENERY POSITIONING ===
  // Cloud positioning
  static CLOUD_HEIGHT_MIN = 80; // yards
  static CLOUD_HEIGHT_MAX = 330; // yards
  static CLOUD_HORIZONTAL_SPREAD = 600; // yards (-300 to +300)
  static CLOUD_BEHIND_SHOOTER = 200; // yards
  static CLOUD_BEYOND_TARGETS = 500; // yards
  static CLOUD_COUNT = 60;
  static CLOUD_BASE_SCALE_MIN = 60; // yards
  static CLOUD_BASE_SCALE_MAX = 120; // yards

  // Tree positioning
  static TREE_SIDE_MIN_DISTANCE = 30; // yards from center
  static TREE_SIDE_MAX_DISTANCE = 110; // yards from center
  static TREE_BEHIND_TARGET_WIDTH = 80; // yards
  static TREE_BEHIND_TARGET_MIN = 10; // yards behind targets
  static TREE_BEHIND_TARGET_MAX = 130; // yards behind targets
  static TREE_COUNT_SIDES = 160;
  static TREE_COUNT_BEHIND = 80;

  // Mountain positioning
  static MOUNTAIN_DISTANCE_MIN = 1500; // yards
  static MOUNTAIN_DISTANCE_MAX = 2400; // yards (within camera far plane of 2500)
  static MOUNTAIN_HEIGHT_MIN = 50; // yards
  static MOUNTAIN_HEIGHT_MAX = 150; // yards
  static MOUNTAIN_COUNT = 16;

  // Ground/scenery
  static GROUND_EXTENSION_BEYOND_TARGETS = 500; // yards

  // Shadow camera bounds
  static SHADOW_CAMERA_HORIZONTAL = 350; // yards
  static SHADOW_CAMERA_TOP = 100; // yards from shooter
  static SHADOW_CAMERA_NEAR = 100; // yards


  // === CAMERA SETTINGS ===
  static CAMERA_FOV = 30;
  static CAMERA_EYE_HEIGHT = 0.1;

  // === ANIMATION ===
  // Note: RANDOM_ANIMATION_CHANCE removed - target animations now use state-based system

  // === UI & DISPLAY ===
  static MIN_SCREEN_WIDTH = 800;
  static WARNING_COLOR = '#ff9800';
  static COLOR_X_RING = 0xffff00;
  static COLOR_HIGH_SCORE = 0xff0000;
  static COLOR_LOW_SCORE = 0xff8800;
  static SCORE_THRESHOLD_RED = 9;

  // === MATCH & SCORING ===
  static FCLASS_MATCH_SHOTS = 60;

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
    // IMPORTANT: disable logarithmicDepthBuffer; it breaks shadow maps in Three.js
    this.renderer = new THREE.WebGLRenderer(
    {
      canvas,
      antialias: true,
      logarithmicDepthBuffer: false // Required for proper shadow rendering
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft antialiased shadows
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.autoClear = false;

    // Animation clock and cached time values
    this.clock = new THREE.Clock();
    this.currentAbsTime = 0;
    this.currentDeltaTime = 0;

    // Geometry cache for reuse
    this._geoBoxCache = {};

    // ===== RENDER TARGETS =====
    // Main scene render target
    this.mainSceneRenderTarget = new THREE.WebGLRenderTarget(
      this.canvasWidth,
      this.canvasHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        samples: 4
      }
    );
    this.registerResource('renderTargets', this.mainSceneRenderTarget);

    // ===== COMPOSITION SYSTEM =====
    // 2D orthographic scene for compositing all views
    this.compositionScene = new THREE.Scene();
    this.compositionCamera = new THREE.OrthographicCamera(
      -this.canvasWidth / 2, this.canvasWidth / 2,
      this.canvasHeight / 2, -this.canvasHeight / 2,
      0, 10
    );
    this.compositionCamera.position.z = 5; // Position camera at z=5 to see layers 0-3

    // ===== WIND & ENVIRONMENT =====
    this.windGenerator = null;
    this.flagSystem = new FlagSystem({
      scene: this.scene,
      renderer: this.renderer,
      poleHeight: FClassSimulator.POLE_HEIGHT,
      poleThickness: FClassSimulator.POLE_THICKNESS,
      flagBaseWidth: FClassSimulator.FLAG_BASE_WIDTH,
      flagTipWidth: FClassSimulator.FLAG_TIP_WIDTH,
      flagLength: FClassSimulator.FLAG_LENGTH,
      flagThickness: FClassSimulator.FLAG_THICKNESS,
      flagSegments: FClassSimulator.FLAG_SEGMENTS,
      flagMinAngle: FClassSimulator.FLAG_MIN_ANGLE,
      flagMaxAngle: FClassSimulator.FLAG_MAX_ANGLE,
      flagDegreesPerMph: FClassSimulator.FLAG_DEGREES_PER_MPH,
      flagAngleInterpolationSpeed: FClassSimulator.FLAG_ANGLE_INTERPOLATION_SPEED,
      flagDirectionInterpolationSpeed: FClassSimulator.FLAG_DIRECTION_INTERPOLATION_SPEED,
      flagFlapFrequencyBase: FClassSimulator.FLAG_FLAP_FREQUENCY_BASE,
      flagFlapFrequencyScale: FClassSimulator.FLAG_FLAP_FREQUENCY_SCALE,
      flagFlapAmplitude: FClassSimulator.FLAG_FLAP_AMPLITUDE,
      flagWaveLength: FClassSimulator.FLAG_WAVE_LENGTH,
      flagPhaseDriftRange: FClassSimulator.FLAG_PHASE_DRIFT_RANGE
    });

    // ===== TARGETS =====
    this.targetFrames = [];
    this.targetAnimationTime = 0;
    this.targetAnimationSpeed = 2.0;

    // Target animation state tracking
    this.targetAnimationStates = []; // Array of {isUp: bool, timeInState: number, maxDownTime: number}

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
      target: document.getElementById('hudTarget'),
      shots: document.getElementById('hudShots'),
      score: document.getElementById('hudScore'),
      dropped: document.getElementById('hudDropped'),
      lastScore: document.getElementById('hudLastScore'),
      mv: document.getElementById('hudMV'),
      impactV: document.getElementById('hudImpactV'),
      fps: document.getElementById('hudFPS')
    };

    // ===== SCENE SETUP =====
    this.setupCamera();
    this.setupLighting();
    this.setupRange();

    // ===== SCENERY =====
    this.createMountains();
    this.createClouds();
    this.createForestBackdrop();

    // ===== COMPOSITION SETUP =====
    this.createMainViewQuad();
    this.createSpottingScopeOverlay();
    this.createScopeViewMesh();
    this.createSpottingScopeCrosshair();
    this.createRifleScopeOverlay();
    this.createRifleScopeViewMesh();
    this.createRifleScopeCrosshair();

    // ===== INPUT =====
    this.setupSpottingScopeControls();
    this.setupRifleScopeControls();
    this.setupShotFiringControls();

    // ===== INITIALIZATION =====
    this.createWindGenerator();
    this.createWindFlags();
    this.initializeAudio();

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
    this.registerResource('textures', maskTexture);
    return maskTexture;
  }

  // ===== COMPOSITION SYSTEM =====

  createMainViewQuad()
  {
    // Create full-screen quad showing the main scene
    const geometry = new THREE.PlaneGeometry(this.canvasWidth, this.canvasHeight);
    this.registerResource('geometries', geometry);
    const material = new THREE.MeshBasicMaterial(
    {
      map: this.mainSceneRenderTarget.texture,
      toneMapped: false,
      depthTest: false,
      depthWrite: false
    });
    this.registerResource('materials', material);
    this.mainViewQuad = new THREE.Mesh(geometry, material);
    this.mainViewQuad.position.set(0, 0, 0);
    this.mainViewQuad.frustumCulled = false;
    this.compositionScene.add(this.mainViewQuad);
    this.registerResource('meshes', this.mainViewQuad);
  }

  // ===== SCOPE SYSTEM =====

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
    this.registerResource('renderTargets', this.spottingScopeRenderTarget);

    this.spottingScopeSize = scopeSize;
    this.spottingScopeX = 10; // 10px padding from left edge
    // Position at bottom of screen with padding
    this.spottingScopeY = this.canvasHeight - scopeSize - 10; // 10px padding from bottom

    // Create spotting scope camera (use current magnification)
    const scopeFOV = FClassSimulator.CAMERA_FOV / 4; // initial 4x, matches this.spottingScopeMagnification
    this.spottingScopeCamera = new THREE.PerspectiveCamera(scopeFOV, 1.0, 0.5, 2500);
    this.spottingScopeCamera.position.set(0, FClassSimulator.CAMERA_EYE_HEIGHT, 1); // At shooter, slightly behind
    this.spottingScopeCamera.up.set(0, 1, 0); // Y is up
    this.spottingScopeCamera.lookAt(0, FClassSimulator.CAMERA_EYE_HEIGHT, -this.distance); // Look downrange

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
    this.registerResource('renderTargets', this.rifleScopeRenderTarget);

    this.rifleScopeSize = rifleScopeSize;
    this.rifleScopeX = this.canvasWidth - rifleScopeSize - 10; // 10px padding from right edge
    this.rifleScopeY = this.canvasHeight - rifleScopeSize - 10; // 10px padding from bottom

    // Calculate FOV for 1.5x target width
    const targetFrameWidth = FClassSimulator.TARGET_SIZE; // yards
    const fovRadians = Math.atan((FClassSimulator.RIFLE_SCOPE_FOV_MULTIPLIER * targetFrameWidth) / this.distance);
    const fovDegrees = fovRadians * 180 / Math.PI;

    // Create rifle scope camera
    this.rifleScopeCamera = new THREE.PerspectiveCamera(fovDegrees, 1.0, 0.5, 2500);
    this.rifleScopeCamera.position.set(0, FClassSimulator.CAMERA_EYE_HEIGHT, 0); // At muzzle
    this.rifleScopeCamera.up.set(0, 1, 0); // Y is up

    // Point at center target position (will be updated when user target is selected)
    const targetCenterX = 0; // Center horizontally
    const targetCenterY = FClassSimulator.TARGET_CENTER_HEIGHT; // Target height
    const targetCenterZ = -this.distance; // Downrange
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

    // Convert screen coordinates to composition camera coordinates
    // Composition camera: left=-canvasW/2, right=canvasW/2, top=canvasH/2, bottom=-canvasH/2
    const canvasW = this.canvasWidth;
    const canvasH = this.canvasHeight;
    // Three.js meshes are positioned by center, so offset by half size
    const compX = x + size / 2 - canvasW / 2;
    const compY = canvasH / 2 - (y + size / 2); // Flip Y coordinate and offset by half size

    // Create circular mask texture
    const maskTexture = this.createCircularMaskTexture(size);

    // Create scope view mesh
    const scopeGeom = new THREE.PlaneGeometry(size, size);
    this.registerResource('geometries', scopeGeom);
    const scopeMat = new THREE.MeshBasicMaterial(
    {
      map: this.spottingScopeRenderTarget.texture,
      alphaMap: maskTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.registerResource('materials', scopeMat);

    this.spottingScopeViewMesh = new THREE.Mesh(scopeGeom, scopeMat);
    this.spottingScopeViewMesh.position.set(compX, compY, 1); // Layer 1 for scope views
    this.spottingScopeViewMesh.renderOrder = 1; // Render after main view but before crosshairs
    this.spottingScopeViewMesh.frustumCulled = false;

    this.compositionScene.add(this.spottingScopeViewMesh);
    this.registerResource('meshes', this.spottingScopeViewMesh);
  }

  createRifleScopeViewMesh()
  {
    const rifleScopeSize = this.rifleScopeSize;
    const rifleScopeX = this.rifleScopeX;
    const rifleScopeY = this.rifleScopeY;

    // Convert screen coordinates to composition camera coordinates for rifle scope
    const canvasW = this.canvasWidth;
    const canvasH = this.canvasHeight;
    const rifleScopeCompX = rifleScopeX + rifleScopeSize / 2 - canvasW / 2;
    const rifleScopeCompY = canvasH / 2 - (rifleScopeY + rifleScopeSize / 2);

    // Create circular mask texture for rifle scope
    const rifleScopeMaskTexture = this.createCircularMaskTexture(rifleScopeSize);

    // Create rifle scope view mesh
    const rifleScopeGeom = new THREE.PlaneGeometry(rifleScopeSize, rifleScopeSize);
    this.registerResource('geometries', rifleScopeGeom);
    const rifleScopeMat = new THREE.MeshBasicMaterial(
    {
      map: this.rifleScopeRenderTarget.texture,
      alphaMap: rifleScopeMaskTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.registerResource('materials', rifleScopeMat);

    this.rifleScopeViewMesh = new THREE.Mesh(rifleScopeGeom, rifleScopeMat);
    this.rifleScopeViewMesh.position.set(rifleScopeCompX, rifleScopeCompY, 1); // Layer 1 for scope views
    this.rifleScopeViewMesh.renderOrder = 1; // Render after main view but before crosshairs
    this.rifleScopeViewMesh.frustumCulled = false;

    this.compositionScene.add(this.rifleScopeViewMesh);
    this.registerResource('meshes', this.rifleScopeViewMesh);
  }

  createSpottingScopeCrosshair()
  {
    // Create simple crosshair texture for spotting scope
    const size = 1024; // High resolution to avoid blurriness
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Clear to transparent
    ctx.clearRect(0, 0, size, size);

    // Draw black circular border
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8; // Closer to edge (just inside for the stroke)
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 8; // Thinner border
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    this.registerResource('textures', texture);
    const scopeSize = this.spottingScopeSize;
    const x = this.spottingScopeX;
    const y = this.spottingScopeY;
    const canvasW = this.canvasWidth;
    const canvasH = this.canvasHeight;
    const compX = x + scopeSize / 2 - canvasW / 2;
    const compY = canvasH / 2 - (y + scopeSize / 2);

    // Use a plane mesh instead of sprite for proper layering
    const geometry = new THREE.PlaneGeometry(scopeSize, scopeSize);
    this.registerResource('geometries', geometry);
    const material = new THREE.MeshBasicMaterial(
    {
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.registerResource('materials', material);

    this.spottingScopeCrosshairSprite = new THREE.Mesh(geometry, material);
    this.spottingScopeCrosshairSprite.position.set(compX, compY, 2);
    this.spottingScopeCrosshairSprite.renderOrder = 2; // Render after scope views
    this.spottingScopeCrosshairSprite.frustumCulled = false;
    this.compositionScene.add(this.spottingScopeCrosshairSprite);
    this.registerResource('meshes', this.spottingScopeCrosshairSprite);
  }

  createRifleScopeCrosshair()
  {
    // Create precision reticle texture for rifle scope
    const size = 1024; // High resolution to match spotting scope
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Clear to transparent
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8; // Closer to edge (just inside for the stroke)

    // Draw simple dark red crosshair (no center dot)
    ctx.strokeStyle = '#8B0000'; // Dark red
    ctx.lineWidth = 4;

    // Horizontal line (stop at ring edge)
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();

    // Vertical line (stop at ring edge)
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Draw black circular border on top
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 8; // Thinner border to match spotting scope
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    this.registerResource('textures', texture);
    const scopeSize = this.rifleScopeSize;
    const x = this.rifleScopeX;
    const y = this.rifleScopeY;
    const canvasW = this.canvasWidth;
    const canvasH = this.canvasHeight;
    const compX = x + scopeSize / 2 - canvasW / 2;
    const compY = canvasH / 2 - (y + scopeSize / 2);

    // Use a plane mesh instead of sprite for proper layering
    const geometry = new THREE.PlaneGeometry(scopeSize, scopeSize);
    this.registerResource('geometries', geometry);
    const material = new THREE.MeshBasicMaterial(
    {
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.registerResource('materials', material);

    this.rifleScopeCrosshairSprite = new THREE.Mesh(geometry, material);
    this.rifleScopeCrosshairSprite.position.set(compX, compY, 2);
    this.rifleScopeCrosshairSprite.renderOrder = 2; // Render after scope views
    this.rifleScopeCrosshairSprite.frustumCulled = false;
    this.compositionScene.add(this.rifleScopeCrosshairSprite);
    this.registerResource('meshes', this.rifleScopeCrosshairSprite);
  }

  // ===== FLAG SYSTEM =====
  createWindFlags()
  {
    // Initialize flag system
    this.flagSystem.initialize();
    
    // Calculate flag positions and add them
    const laneBorder = -FClassSimulator.RANGE_LANE_WIDTH / 2;
    
    for (let yds = FClassSimulator.POLE_INTERVAL; yds < this.distance; yds += FClassSimulator.POLE_INTERVAL)
    {
      this.flagSystem.addFlag(laneBorder, -yds);
    }
  }

  // ===== SCENE SETUP =====
  setupCamera()
  {
    // Camera: Standard Three.js coords (X=right, Y=up, Z=towards camera, -Z=downrange)
    const aspect = this.canvasWidth / this.canvasHeight;
    // Standard depth buffer with extended far plane for clouds/scenery
    // Near plane at 0.5 yards, far plane at 2500 yards to ensure clouds are visible
    this.camera = new THREE.PerspectiveCamera(FClassSimulator.CAMERA_FOV, aspect, 0.5, 2500);
    // Camera positioned 1 yard behind shooter, at target center height
    const targetCenterHeight = FClassSimulator.TARGET_CENTER_HEIGHT;
    this.camera.position.set(0, targetCenterHeight, 1); // At shooter position (Z=1, slightly behind muzzle)
    this.camera.up.set(0, 1, 0); // Y is up in Three.js
    this.camera.lookAt(0, targetCenterHeight, -this.distance); // Look downrange (negative Z)
  }

  setupLighting()
  {
    // Bright ambient light for well-lit scene
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);

    // Hemisphere light for natural sky/ground lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    this.scene.add(hemiLight);

    // Directional light (sun) for depth and shadows
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(300, 600, 0); // Higher above and in front of shooter for cloud shadows on range
    sun.castShadow = true;

    // Aim the light toward the middle of the range
    sun.target.position.set(0, 0, -this.distance);
    this.scene.add(sun.target);
    this.scene.add(sun);

    // Shadow map quality - maximum for detailed shadows in spotting scope
    // Note: 16384 is typically the max supported by most GPUs
    sun.shadow.mapSize.width = 16384;
    sun.shadow.mapSize.height = 16384;

    // Shadow camera bounds - cover only range area, not mountains
    // Sun is at (300, 600, 0) looking toward targets
    sun.shadow.camera.left = -FClassSimulator.SHADOW_CAMERA_HORIZONTAL;
    sun.shadow.camera.right = FClassSimulator.SHADOW_CAMERA_HORIZONTAL;
    sun.shadow.camera.top = FClassSimulator.SHADOW_CAMERA_TOP;
    sun.shadow.camera.bottom = -this.distance - FClassSimulator.GROUND_EXTENSION_BEYOND_TARGETS;
    sun.shadow.camera.near = FClassSimulator.SHADOW_CAMERA_NEAR;
    sun.shadow.camera.far = this.distance + FClassSimulator.GROUND_EXTENSION_BEYOND_TARGETS + 200;

    // Shadow bias and smoothing
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4; // Increased blur radius for softer cloud shadows

    this.sun = sun;
  }

  setupSpottingScopeControls()
  {
    // Initialize scope key states
    this.spottingScopeKeys = {
      w: false,
      a: false,
      s: false,
      d: false,
      e: false,
      q: false
    };

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
    this.rifleScopeKeys = {
      up: false,
      down: false,
      left: false,
      right: false
    };

    // Unified key handler for rifle scope
    this.rifleScopeKeyHandler = (event) =>
    {
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
      const isKeyDown = (event.type === 'keydown');
      if (event.key === 'ArrowUp')
      {
        this.rifleScopeKeys.up = isKeyDown;
        event.preventDefault();
      }
      else if (event.key === 'ArrowDown')
      {
        this.rifleScopeKeys.down = isKeyDown;
        event.preventDefault();
      }
      else if (event.key === 'ArrowLeft')
      {
        this.rifleScopeKeys.left = isKeyDown;
        event.preventDefault();
      }
      else if (event.key === 'ArrowRight')
      {
        this.rifleScopeKeys.right = isKeyDown;
        event.preventDefault();
      }
      else if (isKeyDown && (event.key === '+' || event.key === '='))
      {
        this.rifleScopeZoom = Math.max(FClassSimulator.RIFLE_SCOPE_ZOOM_MIN, this.rifleScopeZoom - FClassSimulator.RIFLE_SCOPE_ZOOM_STEP);
        this.updateRifleScopeZoom();
        event.preventDefault();
      }
      else if (isKeyDown && (event.key === '-' || event.key === '_'))
      {
        this.rifleScopeZoom = Math.min(FClassSimulator.RIFLE_SCOPE_ZOOM_MAX, this.rifleScopeZoom + FClassSimulator.RIFLE_SCOPE_ZOOM_STEP);
        this.updateRifleScopeZoom();
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', this.rifleScopeKeyHandler);
    document.addEventListener('keyup', this.rifleScopeKeyHandler);
  }

  // ===== RANGE SETUP =====
  setupRange()
  {
    const rangeLength = this.distance; // yards
    const groundLength = rangeLength + FClassSimulator.GROUND_EXTENSION_BEYOND_TARGETS;
    // PlaneGeometry(width, height) - after rotation: width=X, height=Z
    const brownGroundGeometry = new THREE.PlaneGeometry(FClassSimulator.RANGE_TOTAL_WIDTH * 4, groundLength);
    this.registerResource('geometries', brownGroundGeometry);
    
    // Load dirt textures for brown ground
    const dirtLoader = new THREE.TextureLoader();
    const dirtColor = dirtLoader.load('textures/dirt/Ground082S_1K-JPG_Color.jpg');
    const dirtNormal = dirtLoader.load('textures/dirt/Ground082S_1K-JPG_NormalGL.jpg');
    const dirtRoughness = dirtLoader.load('textures/dirt/Ground082S_1K-JPG_Roughness.jpg');
    
    // Configure texture wrapping and repeat
    [dirtColor, dirtNormal, dirtRoughness].forEach(texture => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(FClassSimulator.RANGE_TOTAL_WIDTH * 4 / 20, groundLength / 20); // Repeat every 20 yards
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.registerResource('textures', texture);
    });
    
    const brownGroundMaterial = new THREE.MeshStandardMaterial({
      map: dirtColor,
      normalMap: dirtNormal,
      roughnessMap: dirtRoughness,
      color: 0x8b7355, // Darker brown tint
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.FrontSide // Single-sided to avoid shadow acne
    });
    this.registerResource('materials', brownGroundMaterial);
    const brownGround = new THREE.Mesh(brownGroundGeometry, brownGroundMaterial);
    brownGround.rotation.x = -Math.PI / 2; // Rotate to lie in XZ plane (horizontal)
    brownGround.position.set(0, -0.1, -groundLength / 2); // Center downrange (negative Z), slightly below ground
    brownGround.receiveShadow = true; // Enable shadow receiving on ground
    this.scene.add(brownGround);
    this.registerResource('meshes', brownGround);

    // Add a range plane - just the shooting lanes with grass texture
    // PlaneGeometry(width, height) - after rotation: width=X, height=Z
    const groundGeometry = new THREE.PlaneGeometry(FClassSimulator.RANGE_LANE_WIDTH, rangeLength);
    this.registerResource('geometries', groundGeometry);

    // Load grass textures
    const grassLoader = new THREE.TextureLoader();
    const grassColor = grassLoader.load('textures/grass/Grass004_1K-JPG_Color.jpg');
    const grassNormal = grassLoader.load('textures/grass/Grass004_1K-JPG_NormalGL.jpg');
    const grassRoughness = grassLoader.load('textures/grass/Grass004_1K-JPG_Roughness.jpg');
    
    // Configure texture wrapping and repeat
    [grassColor, grassNormal, grassRoughness].forEach(texture => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(FClassSimulator.RANGE_LANE_WIDTH / 10, rangeLength / 10); // Repeat every 10 yards
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.registerResource('textures', texture);
    });

    // Create grass material with PBR textures
    const groundMaterial = new THREE.MeshStandardMaterial({
      map: grassColor,
      normalMap: grassNormal,
      roughnessMap: grassRoughness,
      color: 0x6b8e23, // Darker green tint
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.FrontSide // Single-sided to avoid shadow acne
    });
    this.registerResource('materials', groundMaterial);

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to lie in XZ plane (horizontal)
    ground.position.set(0, 0, -rangeLength / 2); // Center downrange (negative Z)
    ground.receiveShadow = true; // Enable shadow receiving on grass
    this.scene.add(ground);
    this.registerResource('meshes', ground);

    // Add pits at the end of the range
    // BoxGeometry(width, height, depth) = (X, Y, Z) in Three.js coords
    if (!this._geoBoxCache) this._geoBoxCache = {};
    const pitsBoxKey = `${FClassSimulator.RANGE_LANE_WIDTH}|${FClassSimulator.PITS_HEIGHT}|${FClassSimulator.PITS_DEPTH}`;
    const pitsGeometry = this._geoBoxCache[pitsBoxKey] || (this._geoBoxCache[pitsBoxKey] = new THREE.BoxGeometry(FClassSimulator.RANGE_LANE_WIDTH, FClassSimulator.PITS_HEIGHT, FClassSimulator.PITS_DEPTH));
    
    // Load concrete textures for pits
    const concreteLoader = new THREE.TextureLoader();
    const concreteColor = concreteLoader.load('textures/concrete/Concrete012_1K-JPG_Color.jpg');
    const concreteNormal = concreteLoader.load('textures/concrete/Concrete012_1K-JPG_NormalGL.jpg');
    const concreteRoughness = concreteLoader.load('textures/concrete/Concrete012_1K-JPG_Roughness.jpg');
    
    // Configure texture wrapping and repeat
    [concreteColor, concreteNormal, concreteRoughness].forEach(texture => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(FClassSimulator.RANGE_LANE_WIDTH / 5, FClassSimulator.PITS_DEPTH / 5); // Repeat every 5 yards
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.registerResource('textures', texture);
    });
    
    const pitsMaterial = new THREE.MeshStandardMaterial({
      map: concreteColor,
      normalMap: concreteNormal,
      roughnessMap: concreteRoughness,
      color: 0x8b8b8b, // Lighter gray tint
      roughness: 1.0,
      metalness: 0.0
    });
    this.registerResource('materials', pitsMaterial);
    const pits = new THREE.Mesh(pitsGeometry, pitsMaterial);

    // Enable shadows on pits
    pits.castShadow = true;
    pits.receiveShadow = true;

    // Position pits at rangeLength - PITS_OFFSET to obscure targets when lowered (Three.js coords)
    pits.position.set(0, FClassSimulator.PITS_HEIGHT / 2, -(rangeLength - FClassSimulator.PITS_OFFSET + FClassSimulator.PITS_DEPTH / 2));
    pits.matrixAutoUpdate = false;
    this.scene.add(pits);
    pits.updateMatrix();
    this.registerResource('meshes', pits);

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
    const startX = -totalTargetsWidth / 2 + targetSize / 2; // Start from left (negative X), centered

    // Create target texture once for all targets
    const targetTexture = this.createTargetTexture();

    for (let i = 0; i < maxTargets; i++)
    {
      // BoxGeometry(width, height, depth) for target facing shooter (thin in Z)
      const targetBoxKey = `${targetSize}|${targetSize}|0.1`;
      const targetGeometry = this._geoBoxCache[targetBoxKey] || (this._geoBoxCache[targetBoxKey] = new THREE.BoxGeometry(targetSize, targetSize, 0.1));
      const targetMaterial = new THREE.MeshStandardMaterial({
        map: targetTexture,
        metalness: 0.3,  // Moderate metalness for subtle metallic look
        roughness: 0.4,  // Moderate roughness for realistic metal
        envMapIntensity: 0.8 // Environment map reflection intensity
      });
      this.registerResource('materials', targetMaterial);
      const target = new THREE.Mesh(targetGeometry, targetMaterial);

      // Enable shadows on target
      target.castShadow = true;
      target.receiveShadow = true;

      // Position target at exact distance downrange (Three.js coords: X=horizontal, Y=vertical, Z=downrange)
      // Target #1 at leftmost (most negative X), incrementing to the right
      const xPos = startX + i * totalTargetWidth; // Horizontal position (left to right: #1, #2, #3...)
      target.position.set(xPos, targetHeight, -rangeLength); // Downrange (negative Z)
      target.matrixAutoUpdate = false;
      this.scene.add(target);
      target.updateMatrix();
      this.registerResource('meshes', target);

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
      this.registerResource('materials', numberMaterial);
      const numberBox = new THREE.Mesh(numberGeometry, numberMaterial);

      // Enable shadows on number box
      numberBox.castShadow = true;
      numberBox.receiveShadow = true;

      numberBox.position.set(xPos, targetHeight + targetSize + 0.2, -rangeLength); // 0.2 yards above target
      numberBox.matrixAutoUpdate = false;
      this.scene.add(numberBox);
      numberBox.updateMatrix();
      this.registerResource('meshes', numberBox);

      // Store number box reference for animation
      this.targetFrames[i].numberBox = numberBox;
    }

    // After the loop, find the center target (closest to X=0)
    let centerTargetIndex = 0;
    let minDistance = Infinity;
    for (let i = 0; i < this.targetFrames.length; i++)
    {
      const xPos = Math.abs(this.targetFrames[i].mesh.position.x);
      if (xPos < minDistance)
      {
        minDistance = xPos;
        centerTargetIndex = i;
      }
    }

    // Store reference to user's target
    this.userTarget = this.targetFrames[centerTargetIndex];

    // Initialize animation states for all targets
    this.targetAnimationStates = [];
    for (let i = 0; i < this.targetFrames.length; i++)
    {
      this.targetAnimationStates.push(
      {
        isUp: true, // Start with all targets up
        timeInState: 0, // Time in current state (seconds)
        nextDropTime: Math.random() * 120 + 30 // Random time until next drop (30-150 seconds, avg ~90s)
      });
    }

    // Target animation states initialized

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

    // Fill entire canvas with light buff/tan color
    context.fillStyle = '#F1DD9E'; // Light buff/tan
    context.fillRect(0, 0, 1024, 1024);

    // Draw concentric circles from outer to inner (buff outer, black center)
    const ringSpecs = [
    {
      ring: 5,
      fill: '#F1DD9E' // Light buff/tan
    },
    {
      ring: 6,
      fill: '#F1DD9E' // Light buff/tan
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

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    this.registerResource('textures', texture);
    return texture;
  }

  createNumberTexture(number)
  {
    // Create canvas for number texture
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 256;

    // Clear canvas with white background for number boxes
    context.fillStyle = '#ffffff'; // White
    context.fillRect(0, 0, 256, 256);

    // Draw number on canvas (no rotation needed)
    context.fillStyle = '#000000'; // Black text
    context.font = 'bold 200px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(number.toString(), 128, 128);

    // Create and return texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    this.registerResource('textures', texture);
    return texture;
  }

  // ===== SCENERY =====

  createMountains()
  {
    // Create mountain peaks in the distance
    const mountainCount = FClassSimulator.MOUNTAIN_COUNT;
    const mountainData = [];
    
    for (let i = 0; i < mountainCount; i++)
    {
      const x = (Math.random() - 0.5) * 3000;
      const y = FClassSimulator.MOUNTAIN_HEIGHT_MIN + Math.random() * (FClassSimulator.MOUNTAIN_HEIGHT_MAX - FClassSimulator.MOUNTAIN_HEIGHT_MIN);
      const z = -(FClassSimulator.MOUNTAIN_DISTANCE_MIN + Math.random() * (FClassSimulator.MOUNTAIN_DISTANCE_MAX - FClassSimulator.MOUNTAIN_DISTANCE_MIN));
      
      mountainData.push({
        x: x,
        z: z,
        height: y,
        radius: y * 1.8 // Radius proportional to height
      });
    }

    // Create mountain texture (brown base with white snow cap)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Vertical gradient: brown at bottom, white at top
    const gradient = ctx.createLinearGradient(0, 256, 0, 0);
    gradient.addColorStop(0, '#6b5d4f'); // Brown base
    gradient.addColorStop(0.6, '#8b7d6b'); // Lighter brown
    gradient.addColorStop(0.8, '#c0c0c0'); // Gray
    gradient.addColorStop(1, '#ffffff'); // White snow cap

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    const mountainTexture = new THREE.CanvasTexture(canvas);
    this.registerResource('textures', mountainTexture);

    // Create mountains
    for (const data of mountainData)
    {
      const geometry = new THREE.ConeGeometry(data.radius, data.height, 8);
      this.registerResource('geometries', geometry);

      const material = new THREE.MeshLambertMaterial(
      {
        map: mountainTexture,
        side: THREE.FrontSide
      });
      this.registerResource('materials', material);

      const mountain = new THREE.Mesh(geometry, material);
      // Position mountain so base is at or below ground level (Y=0)
      mountain.position.set(data.x, data.height / 2 - 5, data.z); // Lower by 5 yards to hide sky gap
      mountain.receiveShadow = true;

      this.scene.add(mountain);
      this.registerResource('meshes', mountain);
    }
  }

  createClouds()
  {
    // Create clouds at various positions with varied shapes
    this.clouds = [];

    const cloudCount = FClassSimulator.CLOUD_COUNT;

    for (let i = 0; i < cloudCount; i++)
    {
      // Create fluffy cloud texture with varied shapes
      const canvas = document.createElement('canvas');
      canvas.width = 512; // Higher resolution for smoother edges
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      // Draw fluffy cloud shape with multiple overlapping circles
      ctx.clearRect(0, 0, 512, 256);

      // Randomize cloud shape by varying circle positions and sizes
      const numCircles = 5 + Math.floor(Math.random() * 4); // 5-8 circles per cloud
      const cloudCircles = [];

      // Create overlapping circles across the canvas width
      for (let j = 0; j < numCircles; j++)
      {
        const t = j / (numCircles - 1); // 0 to 1
        cloudCircles.push(
        {
          x: 100 + t * 312 + (Math.random() - 0.5) * 60, // Spread across canvas
          y: 128 + (Math.random() - 0.5) * 80, // Vertical variation
          r: 40 + Math.random() * 40 // Larger, more varied circles
        });
      }

      // Draw with soft gradients to eliminate hard edges
      cloudCircles.forEach(circle =>
      {
        const gradient = ctx.createRadialGradient(circle.x, circle.y, 0, circle.x, circle.y, circle.r);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.7)');
        gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); // Fade to transparent

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
        ctx.fill();
      });

      const cloudTexture = new THREE.CanvasTexture(canvas);
      this.registerResource('textures', cloudTexture);

      // Use MeshStandardMaterial for lighting interaction
      const cloudMaterial = new THREE.MeshStandardMaterial(
      {
        map: cloudTexture,
        transparent: true,
        opacity: 0.85,
        alphaTest: 0.01, // Discard fully transparent pixels
        depthWrite: false, // Prevent z-fighting between clouds
        side: THREE.DoubleSide, // Visible from both sides
        roughness: 1.0, // Fully diffuse
        metalness: 0.0, // Not metallic
        emissive: new THREE.Color(0.95, 0.95, 0.95), // Slight self-illumination
        emissiveIntensity: 0.3 // Subtle glow so clouds aren't too dark
      });
      this.registerResource('materials', cloudMaterial);

      // Use a plane geometry instead of sprite for lighting interaction
      const baseScale = FClassSimulator.CLOUD_BASE_SCALE_MIN + Math.random() * (FClassSimulator.CLOUD_BASE_SCALE_MAX - FClassSimulator.CLOUD_BASE_SCALE_MIN);
      const cloudGeometry = new THREE.PlaneGeometry(baseScale, baseScale / 2);
      this.registerResource('geometries', cloudGeometry);

      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);

      // Enable shadow casting for clouds
      cloud.castShadow = true;
      cloud.receiveShadow = false; // Clouds don't receive shadows from other clouds

      // Position clouds at varying heights over the range
      const x = (Math.random() - 0.5) * FClassSimulator.CLOUD_HORIZONTAL_SPREAD;
      const y = FClassSimulator.CLOUD_HEIGHT_MIN + Math.random() * (FClassSimulator.CLOUD_HEIGHT_MAX - FClassSimulator.CLOUD_HEIGHT_MIN);
      const z = FClassSimulator.CLOUD_BEHIND_SHOOTER - Math.random() * (this.distance + FClassSimulator.CLOUD_BEYOND_TARGETS + FClassSimulator.CLOUD_BEHIND_SHOOTER);

      cloud.position.set(x, y, z);

      // Scale with distance for perspective
      const distanceFactor = Math.abs(z) / 500;
      const scale = 0.5 + distanceFactor * 0.5;
      cloud.scale.set(scale, scale, 1);

      // Store randomness factor for wind variation (each cloud drifts slightly differently)
      const randomnessFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2x wind speed

      this.clouds.push(
      {
        mesh: cloud,
        randomnessFactor: randomnessFactor,
        initialY: y,
        initialZ: z,
        baseScale: baseScale
      });

      this.scene.add(cloud);
      this.registerResource('meshes', cloud);
    }
  }

  updateClouds()
  {
    const deltaTime = this.getDeltaTime();
    const currentTime = this.getTime();

    for (const cloud of this.clouds)
    {
      // Make cloud face the camera (billboard effect)
      cloud.mesh.quaternion.copy(this.camera.quaternion);

      // Get wind at cloud's position using the wrapper (returns mph in Three.js coords)
      const pos = cloud.mesh.position;
      const windVector = this.windGenerator.getWindAt(pos.x, pos.y, pos.z, currentTime);
      
      // Wind crosswind component (x in Three.js coords, in mph)
      // Convert mph to m/s, then m/s to yards/s
      const windCrosswindMps = btk.Conversions.mphToMps(windVector.x);
      const windCrosswindYardsPerSec = btk.Conversions.metersToYards(windCrosswindMps);
      
      // Apply wind speed with randomness factor
      const driftSpeed = windCrosswindYardsPerSec * cloud.randomnessFactor;
      
      // Move cloud based on wind (horizontal drift only)
      cloud.mesh.position.x += driftSpeed * deltaTime;

      // Respawn cloud naturally when it drifts too far off screen
      const maxDrift = FClassSimulator.CLOUD_HORIZONTAL_SPREAD * 0.67;
      if (Math.abs(cloud.mesh.position.x) > maxDrift)
      {
        // Respawn on opposite side with new random position
        cloud.mesh.position.x = -Math.sign(cloud.mesh.position.x) * (FClassSimulator.CLOUD_HORIZONTAL_SPREAD / 2 + Math.random() * 50);
        cloud.mesh.position.y = cloud.initialY + (Math.random() - 0.5) * 40;
        cloud.mesh.position.z = cloud.initialZ + (Math.random() - 0.5) * 100;
        
        // Update scale for new distance
        const distanceFactor = Math.abs(cloud.mesh.position.z) / 500;
        const scale = 0.5 + distanceFactor * 0.5;
        cloud.mesh.scale.set(scale, scale, 1);
      }
    }
  }

  createForestBackdrop()
  {
    // Create trees: dense forest along both sides and behind targets
    const treeCount = FClassSimulator.TREE_COUNT_SIDES + FClassSimulator.TREE_COUNT_BEHIND;

    // Cache tree geometries
    const trunkGeometries = [];
    const foliageGeometries = [];

    for (let i = 0; i < 3; i++)
    {
      const trunkRadius = 0.2 + i * 0.1;
      const trunkHeight = 3 + i * 0.5;
      const trunkGeo = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.2, trunkHeight, 8);
      this.registerResource('geometries', trunkGeo);
      trunkGeometries.push(trunkGeo);

      const foliageRadius = 2 + i * 0.5;
      const foliageHeight = 5 + i * 1;
      const foliageGeo = new THREE.ConeGeometry(foliageRadius, foliageHeight, 8);
      this.registerResource('geometries', foliageGeo);
      foliageGeometries.push(foliageGeo);
    }

    // Create materials
    // Load bark textures for tree trunks
    const barkLoader = new THREE.TextureLoader();
    const barkColor = barkLoader.load('textures/bark/Bark012_1K-JPG_Color.jpg');
    const barkNormal = barkLoader.load('textures/bark/Bark012_1K-JPG_NormalGL.jpg');
    const barkRoughness = barkLoader.load('textures/bark/Bark012_1K-JPG_Roughness.jpg');
    
    // Configure texture wrapping and repeat
    [barkColor, barkNormal, barkRoughness].forEach(texture => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(0.5, 2.0); // Vertical bark pattern
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.registerResource('textures', texture);
    });
    
    const trunkMaterial = new THREE.MeshStandardMaterial({
      map: barkColor,
      normalMap: barkNormal,
      roughnessMap: barkRoughness,
      color: 0x4a3728, // Darker brown tint
      roughness: 1.0,
      metalness: 0.0
    });
    this.registerResource('materials', trunkMaterial);

    // Load grass texture for foliage (color only)
    const foliageLoader = new THREE.TextureLoader();
    const foliageColor = foliageLoader.load('textures/grass/Grass004_1K-JPG_Color.jpg');
    
    // Configure texture wrapping and repeat
    foliageColor.wrapS = THREE.RepeatWrapping;
    foliageColor.wrapT = THREE.RepeatWrapping;
    foliageColor.repeat.set(1.0, 1.0); // Normal repeat
    foliageColor.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.registerResource('textures', foliageColor);
    
    const foliageMaterial = new THREE.MeshStandardMaterial({
      map: foliageColor,
      color: 0x2d5016, // Dark green tint
      roughness: 0.9, // Rough surface for leaves
      metalness: 0.0, // Non-metallic
      side: THREE.DoubleSide // Double-sided to prevent artifacts
    });
    this.registerResource('materials', foliageMaterial);

    for (let i = 0; i < treeCount; i++)
    {
      let x, z;

      // Trees along both sides of the range
      if (i < FClassSimulator.TREE_COUNT_SIDES)
      {
        // Dense trees along both sides
        const side = (i % 2 === 0) ? -1 : 1;
        x = side * (FClassSimulator.TREE_SIDE_MIN_DISTANCE + Math.random() * (FClassSimulator.TREE_SIDE_MAX_DISTANCE - FClassSimulator.TREE_SIDE_MIN_DISTANCE));
        z = -50 - Math.random() * (this.distance + 200);
      }
      else
      {
        // Behind targets - dense backdrop
        x = (Math.random() - 0.5) * FClassSimulator.TREE_BEHIND_TARGET_WIDTH;
        z = -(this.distance + FClassSimulator.TREE_BEHIND_TARGET_MIN + Math.random() * (FClassSimulator.TREE_BEHIND_TARGET_MAX - FClassSimulator.TREE_BEHIND_TARGET_MIN));
      }

      // Vary tree size
      const sizeVariant = Math.floor(Math.random() * 3);
      const trunkGeo = trunkGeometries[sizeVariant];
      const foliageGeo = foliageGeometries[sizeVariant];

      const height = 8 + Math.random() * 7; // 8-15 yards total tree height
      const trunkHeight = height * 0.35; // 35% of total height for trunk
      const foliageHeight = height * 0.65; // 65% of total height for foliage

      // Get actual geometry parameters for precise positioning
      const actualTrunkHeight = 3 + sizeVariant * 0.5;
      const actualFoliageHeight = 5 + sizeVariant * 1;

      // Create trunk - positioned so bottom is at ground (Y=0)
      const trunk = new THREE.Mesh(trunkGeo, trunkMaterial);
      trunk.position.set(x, actualTrunkHeight / 2, z); // Center at half height so bottom is at Y=0
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      this.scene.add(trunk);
      this.registerResource('meshes', trunk);

      // Create foliage - positioned so base (widest part of cone) overlaps with top of trunk
      const foliage = new THREE.Mesh(foliageGeo, foliageMaterial);
      // Cone geometry: center is at middle, base (widest) is at Y - height/2
      // Position so foliage base is slightly below trunk top for solid connection
      // Overlap 25% of foliage height with trunk for solid connection
      foliage.position.set(x, actualTrunkHeight + actualFoliageHeight / 2 - actualFoliageHeight * 0.25, z);
      foliage.castShadow = true;
      foliage.receiveShadow = true;
      this.scene.add(foliage);
      this.registerResource('meshes', foliage);
    }
  }

  // ===== GAME LOOP & LIFECYCLE =====
  createWindGenerator()
  {
    // Create wind generator from preset and wrap it
    const rawWindGen = btk.WindPresets.getPreset(this.windPreset);
    this.windGenerator = new BtkWindGeneratorWrapper(rawWindGen);
  }

  // ===== RENDERING =====
  render()
  {
    // Update cached time values once per frame
    this.currentDeltaTime = Math.min(0.05, Math.max(0.0005, this.clock.getDelta())); // clamp 0.5ms-50ms
    this.currentAbsTime = this.clock.getElapsedTime();
    
    // Calculate FPS by sampling over 1 second
    const currentTime = performance.now();
    this.frameCount++;
    
    if (!this.fpsStartTime)
    {
      this.fpsStartTime = currentTime;
    }
    
    // Update FPS every second
    if (currentTime - this.fpsStartTime >= 1000)
    {
      this.fps = Math.round(this.frameCount * 1000 / (currentTime - this.fpsStartTime));
      this.frameCount = 0;
      this.fpsStartTime = currentTime;
      
      // Update HUD display
      this.hudElements.fps.textContent = this.fps > 0 ? this.fps.toString() : '--';
    }

    // Update bullet animation (if any)
    this.updateBulletAnimation();

    // Update and render flags
    this.flagSystem.updateFlags(this.getDeltaTime(), this.getTime(), this.windGenerator);

    // Update clouds
    this.updateClouds();

    // Update target frame animations
    this.updateTargetAnimations();

    // Update scope camera orientations
    this.updateSpottingScopeCamera();
    this.updateRifleScopeCamera();

    // 4-pass rendering architecture:
    // 1) Render main scene to texture
    this.renderer.setRenderTarget(this.mainSceneRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // 2) Render spotting scope to texture
    this.renderer.setRenderTarget(this.spottingScopeRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.spottingScopeCamera);

    // 3) Render rifle scope to texture
    this.renderer.setRenderTarget(this.rifleScopeRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.rifleScopeCamera);

    // 4) Composite everything to screen
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.compositionScene, this.compositionCamera);
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


  updateTargetAnimations()
  {
    const deltaTime = this.getDeltaTime();

    for (let i = 0; i < this.targetFrames.length; i++)
    {
      const targetFrame = this.targetFrames[i];
      const animationState = this.targetAnimationStates[i];
      const targetSize = 2; // yards

      // Skip user's target - it stays up
      if (targetFrame === this.userTarget)
      {
        continue;
      }

      // Update time in current state
      animationState.timeInState += deltaTime;

      // Handle state transitions
      if (animationState.isUp)
      {
        // Target is up - check if it's time to drop
        if (animationState.timeInState >= animationState.nextDropTime)
        {
          animationState.isUp = false;
          animationState.timeInState = 0;
          // Target dropping down
        }
      }
      else
      {
        // Target is down - stay down for 5 seconds then go back up
        if (animationState.timeInState >= 5.0)
        {
          animationState.isUp = true;
          animationState.timeInState = 0;
          // Set next random drop time (30-150 seconds, avg ~90s = ~1 minute)
          animationState.nextDropTime = Math.random() * 120 + 30;
          // Target going back up
        }
      }

      // Animate to target position
      const targetHeight = animationState.isUp ? 0 : FClassSimulator.TARGET_MIN_HEIGHT;

      if (targetFrame.animating)
      {
        const direction = Math.sign(targetHeight - targetFrame.currentHeight);
        const moveDistance = FClassSimulator.TARGET_ANIMATION_SPEED * deltaTime * direction;
        const newHeight = targetFrame.currentHeight + moveDistance;

        // Check if we've reached or passed the goal
        if ((direction > 0 && newHeight >= targetHeight) ||
          (direction < 0 && newHeight <= targetHeight))
        {
          targetFrame.currentHeight = targetHeight;
          targetFrame.animating = false;
        }
        else
        {
          targetFrame.currentHeight = newHeight;
        }
      }
      else if (Math.abs(targetFrame.currentHeight - targetHeight) > 0.01)
      {
        // Start animating if not at target position
        // Starting target animation
        targetFrame.targetHeightGoal = targetHeight;
        targetFrame.animating = true;
      }

      // Update target position (Three.js coords: Y is height)
      targetFrame.mesh.position.y = targetFrame.baseHeight + targetFrame.currentHeight;
      targetFrame.mesh.updateMatrix(); // Required because matrixAutoUpdate = false

      // Update number box position to move with target (Three.js coords: Y is height)
      if (targetFrame.numberBox)
      {
        targetFrame.numberBox.position.y = targetFrame.baseHeight + targetSize + 0.2 + targetFrame.currentHeight;
        targetFrame.numberBox.updateMatrix(); // Required because matrixAutoUpdate = false
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
    // A = pan left (negative X in Three.js coords)
    // D = pan right (positive X in Three.js coords)
    if (this.spottingScopeKeys.a) this.spottingScopeYaw -= panSpeed;
    if (this.spottingScopeKeys.d) this.spottingScopeYaw += panSpeed;

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
    this.spottingScopeCamera.position.copy(this.camera.position);
    this.spottingScopeCamera.up.set(0, 1, 0); // Y is up in Three.js

    // Calculate look-at target with offsets (Three.js coords: X=right, Y=up, Z=towards camera)
    // scopeYaw controls horizontal (X-axis) offset at distance
    // scopePitch controls vertical (Y-axis) offset
    const targetCenterHeight = FClassSimulator.TARGET_CENTER_HEIGHT; // Use actual target center height
    const lookX = this.distance * Math.tan(this.spottingScopeYaw); // Pan left/right
    const lookY = targetCenterHeight + this.distance * Math.tan(this.spottingScopePitch); // Tilt up/down
    const lookZ = -this.distance; // Downrange (negative Z)

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

    // Left arrow: decrease yaw (pan left)
    // Right arrow: increase yaw (pan right)
    if (this.rifleScopeKeys.left)
    {
      this.rifleScopeYaw -= angularIncrement;
      this.rifleScopeKeys.left = false; // Reset key state after one press
    }
    if (this.rifleScopeKeys.right)
    {
      this.rifleScopeYaw += angularIncrement;
      this.rifleScopeKeys.right = false; // Reset key state after one press
    }

    // Clamp pitch and yaw to target frame limits
    this.rifleScopePitch = Math.max(-this.rifleScopeMaxPitch, Math.min(this.rifleScopeMaxPitch, this.rifleScopePitch));
    this.rifleScopeYaw = Math.max(-this.rifleScopeMaxYaw, Math.min(this.rifleScopeMaxYaw, this.rifleScopeYaw));

    // Apply rotation to rifle scope camera
    // Use user's target as the center reference point
    this.rifleScopeCamera.position.copy(this.camera.position);
    this.rifleScopeCamera.up.set(0, 1, 0); // Y is up in Three.js

    // Calculate look-at target with offsets relative to user's target (Three.js coords)
    const lookX = this.userTarget.mesh.position.x + this.distance * Math.tan(this.rifleScopeYaw); // Horizontal
    const lookY = this.userTarget.mesh.position.y + this.distance * Math.tan(this.rifleScopePitch); // Vertical
    const lookZ = this.userTarget.mesh.position.z; // Downrange position (negative)

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
      this.btkTarget = btk.NRATargets.getTarget(String(gameParams.target));
      const rangeYards = gameParams.distance; // Already in yards

      // Create bullet (wrapper handles unit conversions)
      this.bullet = new BtkBulletWrapper(0, this.bulletDiameter, 0, bc, dragFunction);

      // Create atmosphere (wrapper handles unit conversions)
      const atmosphere = new BtkAtmosphereWrapper(59, 0, 0.5, 0.0);

      // Create ballistic simulator (wrapped for transparent coordinate conversion)
      this.ballisticSimulator = new BtkBallisticsSimulatorWrapper();
      this.ballisticSimulator.setInitialBullet(this.bullet);
      this.ballisticSimulator.setAtmosphere(atmosphere);
      this.ballisticSimulator.setWind(new BtkVector3Wrapper(0, 0, 0));

      // Calculate target center coordinates for the selected target
      this.targetCenterCoords = this.calculateTargetCenterCoords();

      // Custom zeroing routine to hit target center (accounting for Y offset)
      this.zeroedBullet = this.computeZeroToTarget(this.nominalMV, rangeYards);

      // Create match object for recording shots (wrapped)
      this.match = new BtkMatchWrapper();

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
  { // Get the actual position from the 3D mesh (Three.js coords: X=right, Y=up, Z=towards camera)
    const mesh = this.userTarget.mesh;
    const position = mesh.position;
    // Return position as-is (already in Three.js coordinates)
    return {
      x: position.x, // Horizontal position
      y: position.y, // Vertical position (center of target)
      z: position.z // Downrange position (negative)
    };
  }

  /**
   * Custom zeroing routine to hit target center accounting for Y offset
   * @param {number} mv - Muzzle velocity (fps)
   * @param {number} range - Range (yards)
   */
  computeZeroToTarget(mv, range)
  {
    // Target coordinates in yards (Three.js units)
    const targetX = this.targetCenterCoords.x; // Three X (crossrange)
    const targetY = this.targetCenterCoords.y; // Three Y (up)
    const targetZ = this.targetCenterCoords.z; // Three Z (downrange, negative)


    // Initial angles - start with reasonable elevation and windage
    let elevation = 0.01; // Start with 0.01 radian elevation (about 0.57 degrees)
    let windage = 0.0; // Start with no windage

    const dt = 0.001;
    const maxIterations = 1000;
    const tolerance = 0.01; // 0.01 yards (~0.36 inches) tolerance

    for (let iter = 0; iter < maxIterations; iter++)
    {
      // Create velocity vector from angles in Three.js coordinates (fps)
      // Three.js: X=right, Y=up, Z=towards camera (negative Z = downrange)
      // Elevation: angle above horizontal (pitch)
      // Windage: angle left/right from center (yaw)
      const velX = mv * Math.sin(windage) * Math.cos(elevation); // Crossrange (right)
      const velY = mv * Math.sin(elevation); // Vertical (up)
      const velZ = -mv * Math.cos(windage) * Math.cos(elevation); // Downrange (negative Z)

      // First iteration - no special handling needed

      // Create velocity and position using wrappers
      const vel = new BtkVelocityWrapper(velX, velY, velZ);
      const pos = new BtkVector3Wrapper(0, 0, 0); // Start at muzzle

      // Create bullet using wrapper (accepts wrapped pos and vel)
      const bullet = new BtkBulletWrapper(this.bullet, pos, vel, 0.0);

      // Simulate trajectory using wrapper
      this.ballisticSimulator.setInitialBullet(bullet);
      this.ballisticSimulator.resetToInitial();
      this.ballisticSimulator.setWind(new BtkVector3Wrapper(0, 0, 0)); // No wind for zeroing

      const trajectory = this.ballisticSimulator.simulate(range * 1.1, dt, 5.0);
      const pointAtRange = trajectory.atDistance(range);

      if (!pointAtRange)
      {
        break;
      }

      const bulletPos = pointAtRange.getState().getPosition();
      // Both bulletPos and target coordinates are in yards (Three.js units)
      const errorX = bulletPos.x - targetX;
      const errorY = bulletPos.y - targetY;
      const errorZ = bulletPos.z - targetZ;
      // Only consider X and Y errors for convergence (Z is interpolation error)
      const totalError = Math.sqrt(errorX * errorX + errorY * errorY);

      if (totalError < tolerance)
      {
        break;
      }

      // Adjust angles based on errors
      const correctionFactor = 0.5;
      elevation -= errorY * correctionFactor / range; // Adjust elevation for vertical error (Y)
      windage -= errorX * correctionFactor / range; // Adjust windage for crossrange error (X)

      // Keep angles reasonable
      elevation = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, elevation));
      windage = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, windage));
    }

    // Create final velocity from converged angles in Three.js coordinates
    const finalVelX = mv * Math.sin(windage) * Math.cos(elevation); // Crossrange (right)
    const finalVelY = mv * Math.sin(elevation); // Vertical (up)
    const finalVelZ = -mv * Math.cos(windage) * Math.cos(elevation); // Downrange (negative Z)

    // Create final bullet using wrappers
    const finalVel = new BtkVelocityWrapper(finalVelX, finalVelY, finalVelZ);
    const finalPos = new BtkVector3Wrapper(0, 0, 0);
    const zeroedBullet = new BtkBulletWrapper(this.bullet, finalPos, finalVel, 0.0);


    return zeroedBullet; // Return the wrapped bullet
  }

  // ===== UI & DISPLAY =====

  /**
   * Display a 1" red marker for the last shot
   */
  displayLastShotMarker(relativeX, relativeY)
  {
    // Remove any existing last shot marker (cleanup handled by resource system)
    if (this.lastShotMarker)
    {
      this.scene.remove(this.lastShotMarker);
      this.lastShotMarker = null;
    }

    const spotterDiameterYards = this.distance * 0.25 / 3438;
    const spotterRadiusYards = spotterDiameterYards / 2;
    
    const markerGeometry = new THREE.SphereGeometry(spotterRadiusYards, 8, 8);
    const markerMaterial = new THREE.MeshStandardMaterial(
    {
      color: new THREE.Color(1.0, 0.35, 0.0), // Red RGB
      emissive: new THREE.Color(1.0, 0.0, 0.0), // Red emissive glow
      emissiveIntensity: 0.8, // Strong glow
      toneMapped: false // Don't apply tone mapping/lighting
    });

    this.lastShotMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    
    // Enable shadows
    this.lastShotMarker.castShadow = true;
    this.lastShotMarker.receiveShadow = true;

    // Position at target center with relative offset (Three.js coords)
    this.lastShotMarker.position.set(
      this.targetCenterCoords.x + relativeX, // Target center X + horizontal offset
      this.targetCenterCoords.y + relativeY, // Target center Y + vertical offset
      this.targetCenterCoords.z + 0.1 // Slightly in front of target (towards shooter)
    );

    this.scene.add(this.lastShotMarker);
    
    // Register all resources for automatic cleanup
    this.registerResource('geometries', markerGeometry);
    this.registerResource('materials', markerMaterial);
    this.registerResource('meshes', this.lastShotMarker);
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

    // Update target number
    if (this.userTarget)
    {
      this.hudElements.target.textContent = `#${this.userTarget.targetNumber}`;
    }

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
    const groupSize = this.match.getGroupSizeInches().toFixed(2);
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
      return;
    }

    // Play shot sound
    this.playShotSound();

    try
    {
      const range = this.distance;
      const dt = 0.001;

      // Apply MV variation in fps
      const mvVariationFps = (Math.random() - 0.5) * 2.0 * this.mvSd; // fps
      const actualMVFps = this.nominalMV + mvVariationFps; // fps

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
      // Compute true unit direction in fps space (avoid wrapper normalized cross-unit issues)
      const zx = zeroVel.x,
        zy = zeroVel.y,
        zz = zeroVel.z;
      const ux0 = zx / zeroVelMag;
      const uy0 = zy / zeroVelMag;
      const uz0 = zz / zeroVelMag;

      // Apply scope aim as small angular adjustments to the zeroed direction
      const yawAdjustment = this.rifleScopeYaw + accuracyErrorH;
      const pitchAdjustment = -(this.rifleScopePitch + accuracyErrorV); // Invert pitch for correct behavior

      // Create new velocity by rotating the zeroed direction
      const cosYaw = Math.cos(yawAdjustment);
      const sinYaw = Math.sin(yawAdjustment);
      const cosPitch = Math.cos(pitchAdjustment);
      const sinPitch = Math.sin(pitchAdjustment);

      // Rotate unit direction (fps space): yaw around Y, then pitch around X
      const rx = ux0 * cosYaw - uz0 * sinYaw;
      const rz = ux0 * sinYaw + uz0 * cosYaw;
      const ry = uy0;
      const ux = rx;
      const uy = ry * cosPitch + rz * sinPitch;
      const uz = -ry * sinPitch + rz * cosPitch;

      // Scale by actual MV (fps)
      const variedVel = new BtkVelocityWrapper(
        ux * actualMVFps,
        uy * actualMVFps,
        uz * actualMVFps
      );

      // Create bullet with varied initial state - start from muzzle (z=0)
      const bulletStartPos = new BtkVector3Wrapper(0, 0, 0);

      const variedBullet = new BtkBulletWrapper(
        this.zeroedBullet,
        bulletStartPos,
        variedVel,
        this.zeroedBullet.getSpinRate()
      );

      // Reset simulator with varied bullet
      this.ballisticSimulator.setInitialBullet(variedBullet);
      this.ballisticSimulator.resetToInitial();

      // Simulate with wind generator (wrapper handles unit conversion)
      this.lastTrajectory = this.ballisticSimulator.simulateWithWind(range, dt, 5.0, this.windGenerator, this.getTime());
      const pointAtTarget = this.lastTrajectory.atDistance(range); // distance in yards

      if (!pointAtTarget)
      {
        console.error('Failed to get trajectory point at target distance');
        return;
      }

      // Get bullet position and velocity at target (now in Three.js coords, yards)
      const bulletState = pointAtTarget.getState();
      const bulletPos = bulletState.getPosition(); // Three.js coords in yards
      const bulletVel = bulletState.getVelocity(); // Three.js coords in fps
      const impactVelocityFps = Math.sqrt(bulletVel.x ** 2 + bulletVel.y ** 2 + bulletVel.z ** 2); // fps

      // Target coordinates are also in Three.js coords, yards
      const targetX = this.targetCenterCoords.x;
      const targetY = this.targetCenterCoords.y;
      const targetZ = this.targetCenterCoords.z;

      // Impact relative to target center (in target plane: X=horizontal, Y=vertical)
      const relativeX = bulletPos.x - targetX; // Horizontal offset in yards
      const relativeY = bulletPos.y - targetY; // Vertical offset in yards

      // Store all shot data for processing after animation completes
      this.pendingShotData = {
        relativeX: relativeX, // yards (will be converted by match.addHit)
        relativeY: relativeY, // yards (will be converted by match.addHit)
        mvFps: actualMVFps,
        impactVelocityFps: impactVelocityFps
      };

      // Log that animation is starting
    }
    catch (error)
    {
      console.error('Failed to fire shot:', error);
      throw error;
    }
  }

  /**
   * Display shot impact on the target
   * @param {number} relativeX - Crossrange impact position (yards)
   * @param {number} relativeY - Vertical impact position (yards)
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

    // Position on user target (apply crossrange to X, vertical to Y)
    shotMesh.position.set(
      this.userTarget.mesh.position.x + relativeX,
      this.userTarget.mesh.position.y + relativeY,
      this.userTarget.mesh.position.z
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
    this.registerResource('textures', texture);
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
      this.registerResource('materials', this.bulletMaterial);
    }

    if (!this.bulletGeometry)
    {
      // Use actual bullet diameter from UI parameters
      const radiusYards = btk.Conversions.inchesToYards(this.bulletDiameter) / 2.0;
      this.bulletGeometry = new THREE.SphereGeometry(radiusYards, 16, 16);
      this.registerResource('geometries', this.bulletGeometry);
    }

    if (!this.bulletMesh)
    {
      this.bulletMesh = new THREE.Mesh(this.bulletGeometry, this.bulletMaterial);
      this.bulletMesh.castShadow = true;
      this.bulletMesh.receiveShadow = false;
      this.scene.add(this.bulletMesh);
      this.registerResource('meshes', this.bulletMesh);
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
      this.registerResource('materials', glowMaterial);
      this.bulletGlowSprite = new THREE.Sprite(glowMaterial);
      this.registerResource('meshes', this.bulletGlowSprite);
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

    // Initialize position at t=0 (wrapped trajectory returns Three.js coords in yards)
    const optPoint0 = this.lastTrajectory.atTime(0);
    if (optPoint0 !== undefined)
    {
      const pos = optPoint0.getState().getPosition(); // Already Three.js coords, yards!
      this.bulletMesh.position.set(pos.x, pos.y, pos.z);
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
      const pos = optPoint.getState().getPosition(); // Already Three.js coords, yards!
      this.bulletMesh.position.set(pos.x, pos.y, pos.z);
      this.bulletGlowSprite.position.set(pos.x, pos.y, pos.z);
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
        const hit = this.match.addHit(data.relativeX, data.relativeY, this.btkTarget, this.bulletDiameter);

        // Show the shot marker (data is already in yards)
        this.displayLastShotMarker(data.relativeX, data.relativeY);

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

        this.pendingShotData = null;
      }

      this.bulletAnim = null;
    }
  }

  // ===== CLEANUP =====

  // ===== RESOURCE MANAGEMENT =====

  // Register a resource for automatic cleanup
  registerResource(type, resource)
  {
    if (!this.resources) this.resources = {
      geometries: [],
      materials: [],
      textures: [],
      renderTargets: [],
      meshes: [],
      objects: []
    };
    if (this.resources[type])
    {
      this.resources[type].push(resource);
    }
  }

  // Clean up all registered resources
  cleanupResources()
  {
    if (!this.resources) return;

    // Dispose geometries
    this.resources.geometries.forEach(geo =>
    {
      if (geo && !geo.isDisposed)
      {
        try
        {
          geo.dispose();
        }
        catch (_)
        {}
      }
    });

    // Dispose materials
    this.resources.materials.forEach(mat =>
    {
      try
      {
        if (mat && mat.map) mat.map.dispose();
        if (mat) mat.dispose();
      }
      catch (_)
      {}
    });

    // Dispose textures
    this.resources.textures.forEach(tex =>
    {
      try
      {
        tex && tex.dispose();
      }
      catch (_)
      {}
    });

    // Dispose render targets
    this.resources.renderTargets.forEach(rt =>
    {
      try
      {
        rt && rt.dispose();
      }
      catch (_)
      {}
    });

    // Remove meshes from scene and dispose
    this.resources.meshes.forEach(mesh =>
    {
      try
      {
        if (mesh.parent) mesh.parent.remove(mesh);
        if (mesh.geometry)
        {
          try
          {
            mesh.geometry.dispose();
          }
          catch (_)
          {}
        }
        if (mesh.material)
        {
          try
          {
            if (mesh.material.map) mesh.material.map.dispose();
          }
          catch (_)
          {}
          try
          {
            mesh.material.dispose();
          }
          catch (_)
          {}
        }
      }
      catch (_)
      {}
    });

    // Clear all arrays and delete geometry cache
    Object.keys(this.resources).forEach(key => this.resources[key] = []);
    if (this._geoBoxCache)
    {
      Object.values(this._geoBoxCache).forEach(geo =>
      {
        try
        {
          geo.dispose();
        }
        catch (_)
        {}
      });
      this._geoBoxCache = {};
    }
  }

  destroy()
  {
    this.stop();

    // Remove lights and shadow target from scene
    if (this.scene)
    {
      this.scene.children.slice().forEach(child =>
      {
        if (child.isLight)
        {
          this.scene.remove(child);
        }
      });

      // Note: shadowTarget property does not exist in this implementation
      // Shadow casting is handled by individual objects (flags, poles, etc.)
    }

    // Clean up all registered resources automatically
    this.cleanupResources();

    // Clean up audio
    if (this.audioContext)
    {
      this.audioContext.close();
    }

    // Remove event listeners
    if (this.spottingScopeKeyHandler)
    {
      document.removeEventListener('keydown', this.spottingScopeKeyHandler);
      document.removeEventListener('keyup', this.spottingScopeKeyHandler);
    }
    if (this.rifleScopeKeyHandler)
    {
      document.removeEventListener('keydown', this.rifleScopeKeyHandler);
      document.removeEventListener('keyup', this.rifleScopeKeyHandler);
    }

    // Clear all references (let garbage collector handle the rest)
    Object.keys(this).forEach(key =>
    {
      if (key !== 'resources') this[key] = null;
    });
    if (this.shotFiringHandler)
    {
      document.removeEventListener('keydown', this.shotFiringHandler);
    }

    // Dispose renderer
    if (this.renderer)
    {
      this.renderer.dispose();
    }
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
    btk = await initializeBTK();
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