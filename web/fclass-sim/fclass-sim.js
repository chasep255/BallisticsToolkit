// Import BTK wrappers
import {
  initializeBTK,
  BtkWindGeneratorWrapper
} from './btk-wrappers.js';

// Import feature modules
import { FlagSystem } from './wind-flags.js';
import { TargetSystem } from './target-system.js';
import { EnvironmentSystem } from './environment-system.js';
import { BallisticsSystem } from './ballistics-system.js';
import { ScopeSystem } from './scope-system.js';

// BTK module instance
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
  // Flag configuration is now in FlagSystem class

  // === SCENERY POSITIONING ===
  // Environment constants moved to EnvironmentSystem class

  // Ground/scenery
  static GROUND_EXTENSION_BEYOND_TARGETS = 2500; // yards (extends to mountains)

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
    this.targetType = params.target || 'MR-1FCA';
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
      renderer: this.renderer
      // Uses FlagSystem defaults for all flag parameters
    });

    // ===== TARGETS =====
    this.targetSystem = new TargetSystem({
      scene: this.scene,
      rangeDistance: this.distance,
      rangeWidth: FClassSimulator.RANGE_LANE_WIDTH,
      pitsHeight: FClassSimulator.PITS_HEIGHT,
      pitsDepth: FClassSimulator.PITS_DEPTH,
      pitsOffset: FClassSimulator.PITS_OFFSET,
      targetType: this.targetType
    });

    // ===== ENVIRONMENT =====
    this.environmentSystem = new EnvironmentSystem({
      scene: this.scene,
      renderer: this.renderer,
      rangeDistance: this.distance,
      rangeWidth: FClassSimulator.RANGE_LANE_WIDTH,
      rangeTotalWidth: FClassSimulator.RANGE_TOTAL_WIDTH,
      groundExtension: FClassSimulator.GROUND_EXTENSION_BEYOND_TARGETS
    });

    // ===== BALLISTICS & SHOOTING =====
    this.ballisticsSystem = new BallisticsSystem({
      scene: this.scene,
      targetSystem: this.targetSystem,
      windGenerator: this.windGenerator,
      getTime: () => this.getTime(),
      distance: this.distance,
      onShotComplete: (shotData) => this.onShotComplete(shotData)
    });

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

    // ===== ENVIRONMENT =====
    this.environmentSystem.createEnvironment();

    // ===== COMPOSITION SETUP =====
    this.createMainViewQuad();
    
    // ===== SCOPE SYSTEM =====
    this.scopeSystem = new ScopeSystem({
      scene: this.scene,
      compositionScene: this.compositionScene,
      renderer: this.renderer,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      cameraPosition: { x: 0, y: FClassSimulator.CAMERA_EYE_HEIGHT, z: 1 },
      rangeDistance: this.distance,
      targetSize: FClassSimulator.TARGET_SIZE,
      targetCenterHeight: FClassSimulator.TARGET_CENTER_HEIGHT,
      scopes: [
        {
          type: 'spotting',
          position: 'bottom-left',
          sizeFraction: FClassSimulator.SPOTTING_SCOPE_DIAMETER_FRACTION,
          initialFOV: FClassSimulator.CAMERA_FOV / 4,
          minMagnification: FClassSimulator.SPOTTING_SCOPE_MIN_MAGNIFICATION,
          maxMagnification: FClassSimulator.SPOTTING_SCOPE_MAX_MAGNIFICATION,
          crosshairType: 'simple'
        },
        {
          type: 'rifle',
          position: 'bottom-right',
          sizeFraction: FClassSimulator.RIFLE_SCOPE_DIAMETER_FRACTION,
          fovMultiplier: FClassSimulator.RIFLE_SCOPE_FOV_MULTIPLIER,
          crosshairType: 'reticle',
          crosshairColor: '#8B0000'
        }
      ]
    });

    // ===== INPUT =====
    this.setupSpottingScopeControls();
    this.setupRifleScopeControls();
    this.setupShotFiringControls();

    // ===== INITIALIZATION =====
    this.initializeWind();
    // Audio will be initialized when needed (user interaction required)

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
        const scope = this.scopeSystem.getScope('rifle');
        if (scope)
        {
          scope.zoom = Math.max(FClassSimulator.RIFLE_SCOPE_ZOOM_MIN, scope.zoom - FClassSimulator.RIFLE_SCOPE_ZOOM_STEP);
          this.updateRifleScopeZoom();
        }
        event.preventDefault();
      }
      else if (isKeyDown && (event.key === '-' || event.key === '_'))
      {
        const scope = this.scopeSystem.getScope('rifle');
        if (scope)
        {
          scope.zoom = Math.min(FClassSimulator.RIFLE_SCOPE_ZOOM_MAX, scope.zoom + FClassSimulator.RIFLE_SCOPE_ZOOM_STEP);
          this.updateRifleScopeZoom();
        }
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', this.rifleScopeKeyHandler);
    document.addEventListener('keyup', this.rifleScopeKeyHandler);
  }

  // ===== SCENERY =====

  // Environment methods moved to EnvironmentSystem class
  // Range setup (ground, pits) moved to EnvironmentSystem and TargetSystem

  // ===== GAME LOOP & LIFECYCLE =====
  
  initializeWind()
  {
    // Create wind generator from preset and wrap it
    const rawWindGen = btk.WindPresets.getPreset(this.windPreset);
    this.windGenerator = new BtkWindGeneratorWrapper(rawWindGen);
    
    // Create wind flags
    this.createWindFlags();
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
    if (this.ballisticsSystem)
    {
      this.ballisticsSystem.updateBulletAnimation();
    }

    // Update and render flags
    this.flagSystem.updateFlags(this.getDeltaTime(), this.getTime(), this.windGenerator);

    // Update clouds
    this.environmentSystem.updateClouds(this.getDeltaTime(), this.windGenerator, this.getTime());

    // Update target frame animations
    if (this.targetSystem)
    {
      this.targetSystem.updateAnimations(this.getDeltaTime());
    }

    // Update scope camera orientations
    this.updateSpottingScopeCamera();
    this.updateRifleScopeCamera();

    // 3-pass rendering architecture:
    // 1) Render main scene to texture
    this.renderer.setRenderTarget(this.mainSceneRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // 2) Render all scopes to their textures
    this.scopeSystem.renderScopes();

    // 3) Composite everything to screen
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.compositionScene, this.compositionCamera);
  }

  async start()
  {
    if (this.isRunning) return;

    this.clock.start();
    this.gameStartTime = performance.now();

    // Create targets (requires BTK to be loaded)
    try
    {
      this.targetSystem.createTargets();
    }
    catch (error)
    {
      console.error('Failed to create targets:', error);
      throw error;
    }

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



  // ===== TARGET ANIMATION =====
  /**
   * Animates target to raised position (above pits)
   * @param {number} targetNumber - Target number (1-indexed)
   */
  raiseTarget(targetNumber)
  {
    if (this.targetSystem)
    {
      this.targetSystem.raiseTarget(targetNumber);
    }
  }

  lowerTarget(targetNumber)
  {
    if (this.targetSystem)
    {
      this.targetSystem.lowerTarget(targetNumber);
    }
  }

  halfMastTarget(targetNumber)
  {
    if (this.targetSystem)
    {
      this.targetSystem.halfMastTarget(targetNumber);
    }
  }

  updateSpottingScopeCamera()
  {
    const scope = this.scopeSystem.getScope('spotting');
    if (!scope) return;

    const deltaTime = this.getDeltaTime();
    // Calculate pan speed that slows down linearly with magnification
    // At 2x mag: full speed, at 100x mag: 1/50th speed
    const speedFactor = 2.0 / scope.magnification; // 2x = 1.0, 100x = 0.02
    const panSpeed = FClassSimulator.SPOTTING_SCOPE_PAN_SPEED * deltaTime * speedFactor;

    // W/S: adjust pitch (tilt up/down)
    if (this.spottingScopeKeys.w) scope.pitch += panSpeed;
    if (this.spottingScopeKeys.s) scope.pitch -= panSpeed;

    // A/D: pan left/right
    if (this.spottingScopeKeys.a) scope.yaw -= panSpeed;
    if (this.spottingScopeKeys.d) scope.yaw += panSpeed;

    // E/Q: adjust magnification (exponential scaling)
    if (this.spottingScopeKeys.e)
    {
      scope.magnification = Math.min(
        scope.maxMagnification,
        scope.magnification * Math.pow(1.1, deltaTime * 10)
      );
    }
    if (this.spottingScopeKeys.q)
    {
      scope.magnification = Math.max(
        scope.minMagnification,
        scope.magnification / Math.pow(1.1, deltaTime * 10)
      );
    }

    // Clamp pitch and yaw to reasonable limits
    scope.pitch = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, scope.pitch));
    scope.yaw = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, scope.yaw));

    // Update scope camera
    this.scopeSystem.updateScopeCamera(scope);
  }

  /**
   * Updates rifle scope camera position based on arrow key input
   * Pan movement is 0.1 inches linear at target distance
   * Pitch/yaw are clamped to target frame boundaries
   */
  updateRifleScopeCamera()
  {
    const scope = this.scopeSystem.getScope('rifle');
    if (!scope) return;

    // Check if target system and user target exist
    if (!this.targetSystem || !this.targetSystem.userTarget)
    {
      return; // Silently skip if targets not created yet
    }

    // Calculate angular movement in radians from MOA
    const moaIncrement = FClassSimulator.RIFLE_SCOPE_PAN_SPEED;
    const angularIncrement = moaIncrement * (Math.PI / 180) / 60;

    // Arrow keys: adjust pitch and yaw (per key press, not per frame)
    if (this.rifleScopeKeys.up)
    {
      scope.pitch += angularIncrement;
      this.rifleScopeKeys.up = false;
    }
    if (this.rifleScopeKeys.down)
    {
      scope.pitch -= angularIncrement;
      this.rifleScopeKeys.down = false;
    }
    if (this.rifleScopeKeys.left)
    {
      scope.yaw -= angularIncrement;
      this.rifleScopeKeys.left = false;
    }
    if (this.rifleScopeKeys.right)
    {
      scope.yaw += angularIncrement;
      this.rifleScopeKeys.right = false;
    }

    // Clamp pitch and yaw to target frame limits
    scope.pitch = Math.max(-scope.maxPitch, Math.min(scope.maxPitch, scope.pitch));
    scope.yaw = Math.max(-scope.maxYaw, Math.min(scope.maxYaw, scope.yaw));

    // Update scope camera
    const userTarget = this.targetSystem.userTarget;
    this.scopeSystem.updateScopeCamera(scope, userTarget.mesh.position);
  }

  updateRifleScopeZoom()
  {
    const scope = this.scopeSystem.getScope('rifle');
    if (!scope || !this.targetSystem || !this.targetSystem.userTarget) return;

    // Update scope camera with new zoom
    const userTarget = this.targetSystem.userTarget;
    this.scopeSystem.updateScopeCamera(scope, userTarget.mesh.position);
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

      // Initialize ballistic system with bullet parameters
      await this.ballisticsSystem.setupBallisticSystem({
        mvFps: mvFps,
        bc: bc,
        dragFunction: dragFunction,
        diameterInches: diameterInches,
        mvSdFps: mvSdFps,
        rifleAccuracyMoa: rifleAccuracyMoa
      });
    }
    catch (error)
    {
      console.error('Failed to setup ballistic system:', error);
      throw error;
    }
  }

  /**
   * Custom zeroing routine to hit target center accounting for Y offset
   * @param {number} mv - Muzzle velocity (fps)
   * @param {number} range - Range (yards)
   */
  // ===== UI & DISPLAY =====

  /**
   * Update the HUD with current shot statistics
   */
  updateHUD()
  {
    if (!this.hudElements.container) return;

    const match = this.ballisticsSystem ? this.ballisticsSystem.getMatch() : null;
    const shotCount = match ? match.getHitCount() : 0;
    const totalScore = match ? match.getTotalScore() : 0;
    const xCount = match ? match.getXCount() : 0;

    // Update target number
    if (this.targetSystem && this.targetSystem.userTarget)
    {
      this.hudElements.target.textContent = `#${this.targetSystem.userTarget.targetNumber}`;
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

    const match = this.ballisticsSystem.getMatch();
    const totalScore = match.getTotalScore();
    const xCount = match.getXCount();
    const groupSize = match.getGroupSizeInches().toFixed(2);
    const shotCount = match.getHitCount();
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
    if (!this.ballisticsSystem)
    {
      console.error('Ballistics system not initialized');
      return;
    }

    // Get rifle scope aim
    const rifleScope = this.scopeSystem.getScope('rifle');
    if (!rifleScope)
    {
      console.error('Rifle scope not found');
      return;
    }

    // Update ballistics system with current rifle scope aim
    this.ballisticsSystem.setRifleScopeAim(rifleScope.yaw, rifleScope.pitch);

    // Fire shot through ballistics system (handles audio internally)
    this.ballisticsSystem.fireShot();

    // Start bullet animation
    this.ballisticsSystem.startBulletAnimation();
  }

  /**
   * Handle shot completion (called by BallisticsSystem after bullet animation)
   */
  onShotComplete(shotData)
  {
    // Show the shot marker via TargetSystem
    this.targetSystem.markLastShot(shotData.relativeX, shotData.relativeY, this.distance);

    // Update HUD with shot data
    this.lastShotData = {
      score: shotData.score,
      isX: shotData.isX,
      mvFps: shotData.mvFps,
      impactVelocityFps: shotData.impactVelocityFps
    };
    this.updateHUD();

    // Check if match is complete (60 shots for F-Class)
    if (shotData.hitCount >= FClassSimulator.FCLASS_MATCH_SHOTS)
    {
      this.showMatchCompleteNotification();
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
        if (this.ballisticsSystem && this.ballisticsSystem.isBulletAnimating())
        {
          // Bullet animation in progress - ignore spacebar completely
          event.preventDefault();
          return;
        }

        if (this.isRunning && this.ballisticsSystem)
        {
          event.preventDefault();
          this.fireShot();
        }
      }
    });
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

    // Clear all arrays
    Object.keys(this.resources).forEach(key => this.resources[key] = []);
  }

  destroy()
  {
    this.stop();

    // Remove event listeners first (before nulling references)
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
    if (this.shotFiringHandler)
    {
      document.removeEventListener('keydown', this.shotFiringHandler);
    }

    // Dispose all system modules
    if (this.flagSystem)
    {
      this.flagSystem.dispose();
    }
    if (this.targetSystem)
    {
      this.targetSystem.dispose();
    }
    if (this.environmentSystem)
    {
      this.environmentSystem.dispose();
    }
    if (this.ballisticsSystem)
    {
      this.ballisticsSystem.dispose();
    }
    if (this.scopeSystem)
    {
      this.scopeSystem.dispose();
    }

    // Clean up all registered resources automatically
    this.cleanupResources();

    // Dispose renderer
    if (this.renderer)
    {
      this.renderer.dispose();
    }

    // Clear all references (let garbage collector handle the rest)
    Object.keys(this).forEach(key =>
    {
      if (key !== 'resources') this[key] = null;
    });
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
    window.btk = btk; // Make BTK globally accessible for modules
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