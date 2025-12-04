import BallisticsToolkit from '../ballistics_toolkit_wasm.js';
import * as THREE from 'three';
import
{
  SteelTargetFactory
}
from './SteelTarget.js';
import
{
  DustCloudFactory
}
from './DustCloud.js';
import
{
  Landscape
}
from './Landscape.js';
import
{
  TargetRackFactory
}
from './TargetRack.js';
import
{
  CompositionRenderer
}
from './CompositionRenderer.js';
import
{
  Scope
}
from './Scope.js';
import
{
  WindFlagFactory
}
from './WindFlag.js';
import
{
  RangeSignFactory
}
from './RangeSign.js';
import
{
  BermFactory
}
from './Berm.js';
import
{
  PrairieDogFactory
}
from './PrairieDog.js';
import
{
  BoarFactory
}
from './Boar.js';
import
{
  HUD
}
from './HUD.js';
import
{
  RenderStats
}
from './RenderStats.js';
import
{
  ImpactDetector
}
from './ImpactDetector.js';
import
{
  Config,
  initConfig,
  DEFAULT_PARAMS
}
from './config.js';
import
{
  TimeManager
}
from './Time.js';
import
{
  ShotFactory
}
from './Shot.js';
import
{
  SettingsCookies
}
from './SettingsCookies.js';
import
{
  AudioManager
}
from './AudioManager.js';
import
{
  TextureManager
}
from './TextureManager.js';
import
{
  ModelManager
}
from './ModelManager.js';
import
{
  BallisticsTable
}
from './BallisticsTable.js';
import
{
  ImpactMarkFactory
}
from './ImpactMark.js';

// ===== COORDINATE SYSTEM =====
// BTK and Three.js use the SAME coordinate system:
// X=crossrange (positive = right), Y=up, Z=-downrange (negative = downrange)
// All internal values are in SI units (meters, m/s, kg, radians)

// ===== PLATFORM DETECTION =====
// Detect iOS (iPad, iPhone, iPod, or iPadOS on Mac)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ===== SHARED RESOURCE MANAGERS =====
// Load resources on page load and reuse across restarts
let sharedTextureManager = null;
let sharedModelManager = null;
let sharedAudioManager = null;
let resourcesReady = false;
let resourceLoadingPromise = null;

/**
 * Initialize shared resource managers (load on page load)
 * @returns {Promise<void>}
 */
async function initializeResources()
{
  // If already loading, return the existing promise
  if (resourceLoadingPromise)
  {
    return resourceLoadingPromise;
  }

  // If already loaded, return immediately
  if (resourcesReady)
  {
    return Promise.resolve();
  }

  resourceLoadingPromise = (async () =>
  {
    console.log('[SteelSim] Loading resources...');

    // Create managers
    sharedTextureManager = new TextureManager();
    sharedModelManager = new ModelManager();
    sharedAudioManager = new AudioManager();

    // Load all resources in parallel
    await Promise.all([
      sharedTextureManager.loadAll(null), // No renderer yet, anisotropy updated later
      sharedModelManager.loadAll(), // Models including prairie dog
      sharedAudioManager.loadAll() // Audio files
    ]);

    resourcesReady = true;
    console.log('[SteelSim] All resources loaded');
  })();

  return resourceLoadingPromise;
}

// ===== STEEL SIMULATOR CLASS =====

class SteelSimulator
{
  constructor(canvas, params = {})
  {
    // Canvas and parameters
    this.canvas = canvas;
    this.params = params;

    // Require all params to be in SI units (no defaults allowed)
    if (params.mv_mps === undefined || params.diameter_m === undefined || params.weight_kg === undefined ||
      params.length_m === undefined || params.twist_mPerTurn === undefined || params.mvSd_mps === undefined ||
      params.rifleAccuracy_rad === undefined || params.bc === undefined || params.dragFunction === undefined ||
      params.windPreset === undefined || params.zeroDistance_m === undefined || params.scopeHeight_m === undefined ||
      params.opticalEffectsEnabled === undefined || params.rangeFinderEnabled === undefined || params.bdcEnabled === undefined || params.scopeType === undefined)
    {
      throw new Error('Constructor requires all SI unit parameters (mv_mps, diameter_m, weight_kg, length_m, twist_mPerTurn, mvSd_mps, rifleAccuracy_rad, bc, dragFunction, windPreset, zeroDistance_m, scopeHeight_m, opticalEffectsEnabled, rangeFinderEnabled, bdcEnabled, scopeType). Use getGameParams() to convert from frontend inputs.');
    }

    // Store all params (all must be in SI units, no defaults)
    this.mv_mps = params.mv_mps;
    this.bc = params.bc;
    this.dragFunction = params.dragFunction;
    this.diameter_m = params.diameter_m;
    this.weight_kg = params.weight_kg;
    this.length_m = params.length_m;
    this.twist_mPerTurn = params.twist_mPerTurn;
    this.mvSd_mps = params.mvSd_mps;
    this.rifleAccuracy_rad = params.rifleAccuracy_rad;
    this.windPreset = params.windPreset;
    this.zeroDistance_m = params.zeroDistance_m;
    this.scopeHeight_m = params.scopeHeight_m;
    this.opticalEffectsEnabled = params.opticalEffectsEnabled;
    this.rangeFinderEnabled = params.rangeFinderEnabled;
    this.bdcEnabled = params.bdcEnabled;
    this.scopeType = params.scopeType;

    // State
    this.isRunning = false;
    this.animationId = null;
    this.btk = null;

    // Scene and rendering
    this.scene = null;
    this.camera = null;
    this.compositionRenderer = null;
    this.scope = null; // Rifle scope
    this.spottingScope = null; // Spotting scope
    this.raycaster = null;
    this.scopeLayer = null;
    this.spottingScopeLayer = null;
    this.landscape = null;

    // Scope and shooting
    this.scopeMode = false;
    this.rifleZero = null;
    this.activeScope = null; // 'rifle' or 'spotting' - tracks which scope is active for desktop mode
    this.pendingActiveScope = null; // Temporary storage for scope clicked before pointer lock succeeds

    // Spotting scope key states (deprecated - no longer used for WASD)
    this.spottingScopeKeys = {
      w: false,
      a: false,
      s: false,
      d: false,
      e: false,
      q: false
    };

    // Touch state for mobile pinch zoom and pan
    this.touchState = {
      active: false,
      lastPinchDistance: 0,
      lastTouchPos:
      {
        x: 0,
        y: 0
      },
      lastThreeFingerPos:
      {
        x: 0,
        y: 0
      }, // For three-finger dial adjustment
      touchStartTime: 0,
      touchMoved: false,
      activeScope: null, // 'rifle' | 'spotting' | null
      activeDialAction: null, // For dial button hold-to-repeat
      focusTriggered: false // Track if long-press focus has been triggered for this touch
    };

    // Dial repeat state
    this.dialRepeatTimeout = null;
    this.dialRepeatInterval = null;

    // HUD
    this.hud = null;

    // Physics and effects
    this.windGenerator = null;
    this.timeManager = null;

    // Audio
    this.audioManager = null;

    // Textures and models (shared, loaded on page load)
    this.textureManager = null;
    this.modelManager = null;

    // Event handler references for cleanup
    this.boundHandlers = {};

    // Render statistics collector (handles both render stats and FPS tracking)
    this.renderStats = new RenderStats();
  }

  // ===== LIFECYCLE METHODS =====

  async start()
  {
    try
    {
      // Load BTK module (reuse if already loaded)
      if (!this.btk)
      {
        this.btk = await BallisticsToolkit();
        window.btk = this.btk;
      }

      // Initialize config with SI unit values
      initConfig();

      // Initialize time manager
      this.timeManager = new TimeManager();
      this.timeManager.start();

      // Reuse shared resource managers (or create if first time)
      if (!sharedTextureManager || !sharedModelManager || !sharedAudioManager)
      {
        await initializeResources();
      }
      this.textureManager = sharedTextureManager;
      this.modelManager = sharedModelManager;
      this.audioManager = sharedAudioManager;

      // Start background noise loop (this unlocks audio context for immediate playback)
      await this.audioManager.startLoop('background_noise', 1.0);

      // Setup ballistics (computes rifle zero)
      await this.setupBallistics();

      // Setup scene (will load textures after renderer is available)
      await this.setupScene();

      // Update HUD with correct scope type after scope is created
      this.updateHudDial();

      // Start animation loop
      this.isRunning = true;
      this.animate();
    }
    catch (e)
    {
      console.error('Failed to initialize:', e);
      showError('Failed to load steel simulator. Please refresh the page.');
      throw e;
    }
  }

  destroy()
  {
    // Stop animation
    this.stop();

    // Stop any active dial repeat
    this.stopDialRepeat();

    // Remove event listeners
    if (this.boundHandlers.onMouseWheel)
    {
      document.removeEventListener('wheel', this.boundHandlers.onMouseWheel);
    }
    if (this.boundHandlers.onMouseMove)
    {
      this.canvas.removeEventListener('mousemove', this.boundHandlers.onMouseMove);
    }
    if (this.boundHandlers.onMouseDown)
    {
      this.canvas.removeEventListener('mousedown', this.boundHandlers.onMouseDown);
    }
    if (this.boundHandlers.onContextMenu)
    {
      this.canvas.removeEventListener('contextmenu', this.boundHandlers.onContextMenu);
    }
    if (this.boundHandlers.onMouseUp)
    {
      window.removeEventListener('mouseup', this.boundHandlers.onMouseUp);
    }
    if (this.boundHandlers.onKeyDown)
    {
      window.removeEventListener('keydown', this.boundHandlers.onKeyDown);
    }
    if (this.boundHandlers.onKeyUp)
    {
      window.removeEventListener('keyup', this.boundHandlers.onKeyUp);
    }
    if (this.boundHandlers.onPointerLockChange)
    {
      document.removeEventListener('pointerlockchange', this.boundHandlers.onPointerLockChange);
    }
    if (this.boundHandlers.onWindowResize)
    {
      window.removeEventListener('resize', this.boundHandlers.onWindowResize);
    }
    if (this.boundHandlers.onFullscreenChange)
    {
      document.removeEventListener('fullscreenchange', this.boundHandlers.onFullscreenChange);
    }

    // Remove touch event listeners
    if (this.boundHandlers.onTouchStart)
    {
      this.canvas.removeEventListener('touchstart', this.boundHandlers.onTouchStart);
    }
    if (this.boundHandlers.onTouchMove)
    {
      this.canvas.removeEventListener('touchmove', this.boundHandlers.onTouchMove);
    }
    if (this.boundHandlers.onTouchEnd)
    {
      this.canvas.removeEventListener('touchend', this.boundHandlers.onTouchEnd);
    }

    // Clean up factories
    ShotFactory.deleteAll();
    SteelTargetFactory.deleteAll();
    TargetRackFactory.deleteAll();
    DustCloudFactory.deleteAll();
    WindFlagFactory.deleteAll();
    RangeSignFactory.deleteAll();
    BermFactory.deleteAll();
    ImpactMarkFactory.dispose();
    PrairieDogFactory.dispose();
    BoarFactory.dispose();

    // Clean up BTK objects
    if (this.rifleZero)
    {
      if (this.rifleZero.bullet) this.rifleZero.bullet.delete();
      if (this.rifleZero.atmosphere) this.rifleZero.atmosphere.delete();
      if (this.rifleZero.zeroedVelocity) this.rifleZero.zeroedVelocity.delete();
      if (this.rifleZero.zeroedBullet) this.rifleZero.zeroedBullet.delete();
      this.rifleZero = null;
    }
    if (this.windGenerator)
    {
      this.windGenerator.delete();
      this.windGenerator = null;
    }
    if (this.impactDetector)
    {
      this.impactDetector.dispose();
      this.impactDetector = null;
    }

    // Clean up Three.js objects
    if (this.landscape)
    {
      this.landscape.dispose();
      this.landscape = null;
    }

    // Clear references to shared managers (but don't dispose them)
    // They persist across restarts for faster reload
    this.textureManager = null;
    this.modelManager = null;
    this.audioManager = null; // Audio manager is shared, don't dispose
    if (this.hud)
    {
      this.hud.dispose();
      this.hud = null;
    }
    if (this.scope)
    {
      this.scope.dispose();
      this.scope = null;
    }
    if (this.spottingScope)
    {
      this.spottingScope.dispose();
      this.spottingScope = null;
    }

    // Dispose CompositionRenderer (handles render targets, composition scene)
    if (this.compositionRenderer)
    {
      this.compositionRenderer.dispose();
      this.compositionRenderer = null;
    }

    // Clear remaining references
    this.scene = null;
    this.camera = null;
    this.timeManager = null;
  }

  stop()
  {
    this.isRunning = false;
    if (this.animationId !== null)
    {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }


  // ===== BALLISTICS SETUP =====

  async setupBallistics()
  {
    const btk = this.btk;
    if (!btk) throw new Error('BTK module not loaded');

    // Bullet parameters are already in SI units
    const bulletMass_kg = this.weight_kg;
    const bulletDiameter_m = this.diameter_m;
    const bulletLength_m = this.length_m;
    const muzzleVel_mps = this.mv_mps;

    // Create base bullet
    const baseBullet = new btk.Bullet(
      bulletMass_kg,
      bulletDiameter_m,
      bulletLength_m,
      this.bc,
      this.dragFunction === 'G1' ? btk.DragFunction.G1 : btk.DragFunction.G7
    );

    // Create atmosphere (standard conditions)
    const atmosphere = new btk.Atmosphere();

    // Zero range and scope height are already in SI units
    const zeroRange_m = this.zeroDistance_m;
    const scopeHeight_m = this.scopeHeight_m;

    // Target position in LOCAL coordinates (origin at bore)
    // Target is at scope height above bore, at zero range downrange
    const targetPos = new btk.Vector3D(0, scopeHeight_m, -zeroRange_m);

    // Use BTK's computeZero to find the launch angle that makes the bullet
    // pass 2" above the bore at 100 yards with NO wind.
    const simulator = new btk.BallisticsSimulator();
    simulator.setInitialBullet(baseBullet);
    simulator.setAtmosphere(atmosphere);

    // Zero with no wind
    const zeroWind = new btk.Vector3D(0, 0, 0);
    simulator.setWind(zeroWind);
    zeroWind.delete();

    // Calculate spin rate from twist rate (already in SI units: m/turn)
    const spinRate = btk.Bullet.computeSpinRateFromTwist(muzzleVel_mps, this.twist_mPerTurn);

    // Compute zero
    const zeroedBullet = simulator.computeZero(
      muzzleVel_mps,
      targetPos,
      0.001, // dt (1ms)
      1000, // max_iterations (increased for spin effects)
      0.001, // tolerance (1mm)
      spinRate // spin_rate
    );

    // Log the zeroed bullet velocity to show elevation and windage
    const zeroVelBtk = zeroedBullet.getVelocity();
    const zeroVelMag = Math.sqrt(zeroVelBtk.x * zeroVelBtk.x + zeroVelBtk.y * zeroVelBtk.y + zeroVelBtk.z * zeroVelBtk.z);

    // Calculate angles from velocity components (X=right, Y=up, Z=towards-camera where negative Z=downrange)
    const elevationRad = Math.asin(zeroVelBtk.y / zeroVelMag);
    const windageRad = Math.atan2(zeroVelBtk.x, -zeroVelBtk.z);
    const elevationMoa = btk.Conversions.radiansToMoa(elevationRad);
    const windageMoa = btk.Conversions.radiansToMoa(windageRad);

    console.log(`[Zero] ${btk.Conversions.metersToYards(this.zeroDistance_m).toFixed(0)}yd @ ${btk.Conversions.mpsToFps(this.mv_mps).toFixed(0)}fps: ${elevationMoa.toFixed(2)} MOA elevation, ${windageMoa.toFixed(3)} MOA windage`);

    // Store the zeroed configuration
    this.rifleZero = {
      bullet: baseBullet,
      zeroedVelocity: zeroVelBtk,
      zeroedBullet: zeroedBullet, // Store full bullet to get spin rate
      atmosphere: atmosphere,
      scopeHeight_m: scopeHeight_m,
      spinRate: spinRate,
      bulletParams:
      {
        mass: bulletMass_kg,
        diameter: bulletDiameter_m,
        length: bulletLength_m,
        bc: this.bc,
        dragFunction: this.dragFunction
      }
    };

    // Cleanup
    targetPos.delete();
    simulator.delete();

    // Build ballistics table (drop table) for estimating impact points
    this.ballisticsTable = new BallisticsTable();
    this.ballisticsTable.build(this.rifleZero,
    {
      maxRange_m: Config.LANDSCAPE_CONFIG.groundLength * 1.25,
      rangeStep_m: btk.Conversions.yardsToMeters(25) // 25 yard steps
    });
  }

  /**
   * Estimate where the shooter is looking based on total scope angle (dial + holdover).
   * @returns {Object} {x, y, z, range} in meters, or null if no valid estimate
   */
  estimateBulletImpactPoint()
  {
    if (!this.ballisticsTable || !this.scope) return null;

    const totalAngle = this.scope.getTotalAngleMRAD();
    return this.ballisticsTable.estimateImpactPoint(
      totalAngle.elevation,
      totalAngle.windage,
      Config.SHOOTER_HEIGHT
    );
  }

  // ===== SCENE SETUP =====

  async setupScene()
  {
    // Check for debug mode once at the start
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.get('debug') === '1';
    
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // Setup lighting first
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(1000, 1000, 1000);
    this.scene.add(directionalLight);

    // Setup composition renderer
    this.compositionRenderer = new CompositionRenderer(
    {
      canvas: this.canvas,
      renderStats: this.renderStats // Pass render stats collector
    });

    // Load textures now that renderer is available
    await this.textureManager.loadAll(this.compositionRenderer.renderer);

    // Get aspect for element positioning
    const compositionAspect = this.compositionRenderer.getAspect();

    // Create HUD overlay
    this.hud = new HUD(
    {
      compositionScene: this.compositionRenderer.compositionScene,
      compositionCamera: this.compositionRenderer.compositionCamera
    });
    this.hud.updatePositions();

    // Create landscape (uses Config.LANDSCAPE_CONFIG defaults)
    this.landscape = new Landscape(this.scene,
    {
      textureManager: this.textureManager,
      modelManager: this.modelManager
    });

    // Create prairie dog hunting targets (uses pre-loaded model) - only if enabled
    const prairieDogsCheckbox = document.getElementById('prairieDogs');
    this.prairieDogsEnabled = prairieDogsCheckbox ? prairieDogsCheckbox.checked : true;
    if (this.prairieDogsEnabled)
    {
      this.landscape.createPrairieDogs();
    }

    // Initialize impact mark factory for bullet holes
    ImpactMarkFactory.init(this.scene);

    // Initialize wind generator
    this.setupWindGenerator();

    // Create wind flags at configured positions
    this.createWindFlags();

    // Create scope layers using unified positioning logic
    const scopePositions = this.calculateScopePositions();

    this.spottingScopeLayer = this.compositionRenderer.createElement(
      scopePositions.spotting.x,
      scopePositions.spotting.y,
      scopePositions.spotting.width,
      scopePositions.spotting.height,
      {
        renderOrder: 1,
        transparent: true
      });

    this.spottingScope = new Scope(
    {
      scene: this.scene,
      renderTarget: this.spottingScopeLayer.renderTarget,
      renderer: this.spottingScopeLayer.getRenderer(),
      layer: this.spottingScopeLayer,
      renderStats: this.renderStats, // Pass render stats collector
      minZoomX: 4.0,
      maxZoomX: 80.0,
      lowFovFeet: 25,
      hasReticle: false, // Spotting scope has no reticle
      hasDials: false, // Spotting scope has no dials
      opticalEffectsEnabled: this.opticalEffectsEnabled,
      rangeFinderEnabled: this.rangeFinderEnabled,
      bdcEnabled: this.bdcEnabled,
      windGenerator: this.windGenerator,
      scopeType: this.scopeType,
      cameraPosition:
      {
        x: 0,
        y: Config.SHOOTER_HEIGHT,
        z: 0
      },
      initialLookAt:
      {
        x: 0,
        y: Config.SHOOTER_HEIGHT, // Look at horizon (same height as camera)
        z: -Config.LANDSCAPE_CONFIG.groundLength
      },
      panSpeedBase: 0.1 // radians per second base speed for keyboard control
    });

    // Rifle scope: centered vertically, max height, padding on left
    this.scopeLayer = this.compositionRenderer.createElement(
      scopePositions.rifle.x,
      scopePositions.rifle.y,
      scopePositions.rifle.width,
      scopePositions.rifle.height,
      {
        renderOrder: 1,
        transparent: true
      });

    this.scope = new Scope(
    {
      scene: this.scene,
      renderTarget: this.scopeLayer.renderTarget,
      renderer: this.scopeLayer.getRenderer(), // Must use the renderer that created the render target
      layer: this.scopeLayer,
      renderStats: this.renderStats, // Pass render stats collector
      audioManager: this.audioManager, // Pass audio manager for scope click sounds
      // Scope optical spec (4–40x, 25 ft @ 100 yd at 4x)
      minZoomX: 4.0,
      maxZoomX: 40.0,
      lowFovFeet: 25,
      opticalEffectsEnabled: this.opticalEffectsEnabled,
      rangeFinderEnabled: this.rangeFinderEnabled,
      bdcEnabled: this.bdcEnabled,
      windGenerator: this.windGenerator,
      scopeType: this.scopeType,
      ballisticsTable: this.ballisticsTable, // For drop indicator
      cameraPosition:
      {
        x: 0,
        y: Config.SHOOTER_HEIGHT,
        z: 0
      },
      initialLookAt:
      {
        x: 0,
        y: Config.SHOOTER_HEIGHT, // Look at horizon (same height as camera)
        z: -Config.LANDSCAPE_CONFIG.groundLength
      }
    });
    this.camera = this.scope.getCamera(); // For raycasting

    // Initialize scope borders (no active scope initially)
    this.updateScopeBorders();

    // Create target racks (each rack builds its targets immediately)
    this.createTargetRacks();

    // Initialize instanced post mesh for all racks
    TargetRackFactory.initializePostInstancing(this.scene);

    // Initialize merged geometry for all steel targets (1 draw call)
    SteelTargetFactory.initializeMergedMesh(this.scene);

    // Initialize instanced chain mesh for all targets
    SteelTargetFactory.initializeChainInstancing(this.scene);

    // Create impact detector and register steel targets
    this.setupImpactDetector();

    // Initialize wild boar factory (uses pre-loaded model) - must be after impactDetector is created
    // Only create boars if enabled
    const hogsCheckbox = document.getElementById('hogs');
    this.hogsEnabled = hogsCheckbox ? hogsCheckbox.checked : true;
    if (this.hogsEnabled)
    {
      const boarModel = this.modelManager.getModel('wild_boar');
      if (boarModel)
      {
        BoarFactory.init(this.scene, Config.BOAR_CONFIG, boarModel, this.impactDetector);

        // Create boars that spawn at random locations and do random walk
        const boarCount = Config.BOAR_CONFIG.count || 3;
        for (let i = 0; i < boarCount; i++)
        {
          const boar = BoarFactory.create(); // No path provided = random spawn and random walk
          if (!boar)
          {
            console.warn(`[SteelSimulator] Failed to create boar ${i + 1}/${boarCount}`);
          }
        }

        // Create debug boar at 75 yards, offset to the left (static, rotatable) - only in debug mode
        if (debugMode)
        {
          const btk = window.btk;
          const debugZ = -btk.Conversions.yardsToMeters(75); // 75 yards downrange
          const debugX = -10; // 10 meters to the left
          const debugPath = [
            {
              x: debugX,
              z: debugZ
            },
            {
              x: debugX,
              z: debugZ
            } // Same point so it doesn't move
          ];
          this.debugBoar = BoarFactory.create(debugPath);
          if (this.debugBoar)
          {
            this.debugBoar.isDebugBoar = true; // Mark as debug boar
            this.debugBoar.speed = 0; // Make it static
            this.debugBoar.randomWalk = false; // Disable random walk
          }
        }
      }
    }

    // Create debug cubes at 1000 yards for reticle scale verification (always in debug mode, regardless of hunting)
    if (debugMode)
    {
      const btk = window.btk;
      const range1000yd = btk.Conversions.yardsToMeters(1000);
      const cubeZ = -range1000yd; // 1000 yards downrange
      
      // 8 MRAD square at 1000 yards
      // angle = 8 mrad = 8 / 1000 rad, size = angle * distance
      const cube8MradSize = range1000yd * (8.0 / 1000.0);
      const cube8MradGeom = new THREE.PlaneGeometry(cube8MradSize, cube8MradSize);
      const cube4YardMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00, // Bright green
        wireframe: false, // Solid for visibility
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      });
      const cube8Mrad = new THREE.Mesh(cube8MradGeom, cube4YardMat);
      cube8Mrad.position.set(0, Config.SHOOTER_HEIGHT, cubeZ); // Dead center, at shooter height
      cube8Mrad.renderOrder = 1000; // Render on top
      this.scene.add(cube8Mrad);
      this.debugCube4Yard = cube8Mrad;
      
      // 10 MOA square at 1000 yards
      // angle = moaToRadians(10), size = angle * distance
      const angle10MoaRad = btk.Conversions.moaToRadians(10.0);
      const cube10MoaSize = angle10MoaRad * range1000yd;
      const cube4MOAGeom = new THREE.PlaneGeometry(cube10MoaSize, cube10MoaSize);
      const cube4MOAMat = new THREE.MeshBasicMaterial({
        color: 0xff00ff, // Bright magenta
        wireframe: false, // Solid for visibility
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      });
      const cube4MOA = new THREE.Mesh(cube4MOAGeom, cube4MOAMat);
      cube4MOA.position.set(0, Config.SHOOTER_HEIGHT, cubeZ); // Dead center, at shooter height
      cube4MOA.renderOrder = 1000; // Render on top
      this.scene.add(cube4MOA);
      this.debugCube4MOA = cube4MOA;
      
      console.log(`[Debug] Created 8 mrad square (${cube8MradSize.toFixed(3)}m) at 1000 yards, position (${cube8Mrad.position.x.toFixed(1)}, ${cube8Mrad.position.y.toFixed(1)}, ${cubeZ.toFixed(1)})`);
      console.log(`[Debug] Created 10 MOA square (${cube10MoaSize.toFixed(3)}m) at 1000 yards, position (${cube4MOA.position.x.toFixed(1)}, ${cube4MOA.position.y.toFixed(1)}, ${cubeZ.toFixed(1)})`);
    }

    // Setup raycaster for scope-based shooting
    this.raycaster = new THREE.Raycaster();

    // Setup event listeners
    this.setupEventListeners();

    // Ensure renderer uses the final CSS size on first layout
    this.onWindowResize();

    // Set all materials to wireframe for debugging if debug=1 is in URL
    // Do this at the end so it includes all objects (targets, berms, etc.)
    if (debugMode)
    {
      console.log('[SteelSim] Debug mode enabled - wireframe rendering active');
      this.scene.traverse((object) =>
      {
        if (object.isMesh)
        {
          if (Array.isArray(object.material))
          {
            object.material.forEach(mat =>
            {
              mat.wireframe = true;
              mat.transparent = true;
              mat.opacity = 0.8;
            });
          }
          else if (object.material)
          {
            object.material.wireframe = true;
            object.material.transparent = true;
            object.material.opacity = 0.8;
          }
        }
      });
    }

    const vertexCount = this.countSceneVertices(this.scene);
    console.log(`[Debug] Total scene vertices: ${vertexCount.toLocaleString()}`);
  }

  /**
   * Count total vertices in a Three.js scene by traversing all meshes
   * @param {THREE.Scene} scene - The scene to count vertices in
   * @returns {number} Total vertex count
   */
  countSceneVertices(scene)
  {
    let totalVertices = 0;

    scene.traverse((object) =>
    {
      if (object.isMesh && object.geometry)
      {
        const geometry = object.geometry;
        const positionAttribute = geometry.getAttribute('position');
        if (positionAttribute)
        {
          // Count unique vertices (position attribute length / 3)
          totalVertices += positionAttribute.count;
        }
      }
    });

    return totalVertices;
  }

  /**
   * Calculate scope positions and sizes using unified logic.
   * Returns positions in normalized coordinates (-1 to 1 for Y, -aspect to +aspect for X).
   * @returns {Object} Object with 'spotting' and 'rifle' properties, each containing {x, y, width, height}
   */
  calculateScopePositions()
  {
    const aspect = this.compositionRenderer.getAspect();
    const padding = 0.05; // Padding for scopes

    // Spotting scope: bottom-left corner, 60% of screen height
    const spottingHeight = 1.3;
    const spottingWidth = spottingHeight; // square
    const spottingY = -1 + spottingHeight / 2 + padding; // bottom + half height
    const spottingX = -aspect + padding + spottingWidth / 2; // Left edge + padding + half width

    // Rifle scope: centered vertically, max height, padding on left
    const rifleHeight = 2.0 - padding * 2; // Full height (100% of vertical span)
    const rifleWidth = rifleHeight; // square (circle)
    const rifleY = 0; // Centered vertically
    const rifleX = aspect - padding - rifleWidth / 2; // Right edge - padding - half width

    return {
      spotting:
      {
        x: spottingX,
        y: spottingY,
        width: spottingWidth,
        height: spottingHeight
      },
      rifle:
      {
        x: rifleX,
        y: rifleY,
        width: rifleWidth,
        height: rifleHeight
      }
    };
  }

  setupWindGenerator()
  {
    const btk = this.btk;
    // All config values are in meters (SI units)
    const halfWidth = Config.LANDSCAPE_CONFIG.groundWidth / 2;

    // Calculate wind box corners in BTK coordinates (meters) - same coordinate system as Three.js
    const minCorner = new btk.Vector3D(
      -Config.WIND_CONFIG.boxPadding, // X = crossrange (left edge)
      0, // Y = up (ground level)
      Config.WIND_CONFIG.boxPadding // Z = -downrange (near edge, positive = towards camera)
    );
    const maxCorner = new btk.Vector3D(
      halfWidth + Config.WIND_CONFIG.boxPadding, // X = crossrange (right edge)
      Config.WIND_CONFIG.boxHeight, // Y = up (top of box)
      -(Config.LANDSCAPE_CONFIG.groundLength + Config.WIND_CONFIG.boxPadding) // Z = -downrange (far edge, negative = downrange)
    );

    // Get available wind presets and use configured default (or first available)
    if (!btk.WindPresets)
    {
      minCorner.delete();
      maxCorner.delete();
      throw new Error('WindPresets not available in BTK module');
    }

    const presetList = btk.WindPresets.listPresets();
    const presetNames = [];
    for (let i = 0; i < presetList.size(); i++)
    {
      presetNames.push(presetList.get(i));
    }
    if (presetNames.length === 0)
    {
      minCorner.delete();
      maxCorner.delete();
      throw new Error('No wind presets available');
    }

    const windPresetName = presetNames.includes(this.windPreset) ? this.windPreset : presetNames[0];
    this.windGenerator = btk.WindPresets.getPreset(windPresetName, minCorner, maxCorner);

    // Clean up temporary vectors
    minCorner.delete();
    maxCorner.delete();
  }

  setupEventListeners()
  {
    // Bind event handlers to this context
    this.boundHandlers.onMouseWheel = (e) => this.onMouseWheel(e);
    this.boundHandlers.onMouseMove = (e) => this.onMouseMove(e);
    this.boundHandlers.onMouseDown = (e) => this.onMouseDown(e);
    this.boundHandlers.onMouseUp = (e) => this.onMouseUp(e);
    this.boundHandlers.onContextMenu = (e) => this.onContextMenu(e);
    this.boundHandlers.onKeyDown = (e) => this.onKeyDown(e);
    this.boundHandlers.onKeyUp = (e) => this.onKeyUp(e);
    this.boundHandlers.onPointerLockChange = () => this.onPointerLockChange();
    this.boundHandlers.onWindowResize = () => this.onWindowResize();

    // Add event listeners
    document.addEventListener('wheel', this.boundHandlers.onMouseWheel,
    {
      passive: false
    });
    this.canvas.addEventListener('mousemove', this.boundHandlers.onMouseMove);
    this.canvas.addEventListener('mousedown', this.boundHandlers.onMouseDown);
    this.canvas.addEventListener('contextmenu', this.boundHandlers.onContextMenu);
    window.addEventListener('mouseup', this.boundHandlers.onMouseUp);
    window.addEventListener('keydown', this.boundHandlers.onKeyDown);
    window.addEventListener('keyup', this.boundHandlers.onKeyUp);
    document.addEventListener('pointerlockchange', this.boundHandlers.onPointerLockChange);
    window.addEventListener('resize', this.boundHandlers.onWindowResize);

    // Fullscreen change needs delayed resize to let layout update
    this.boundHandlers.onFullscreenChange = async () =>
    {
      // Lock orientation when entering fullscreen
      if (document.fullscreenElement)
      {
        await lockOrientationLandscape();
      }
      else
      {
        unlockOrientation();
      }

      // Wait for layout to update before resizing
      requestAnimationFrame(() =>
      {
        requestAnimationFrame(() =>
        {
          this.onWindowResize();
        });
      });
    };
    document.addEventListener('fullscreenchange', this.boundHandlers.onFullscreenChange);

    // Touch event listeners for mobile
    this.boundHandlers.onTouchStart = (e) => this.onTouchStart(e);
    this.boundHandlers.onTouchMove = (e) => this.onTouchMove(e);
    this.boundHandlers.onTouchEnd = (e) => this.onTouchEnd(e);
    this.canvas.addEventListener('touchstart', this.boundHandlers.onTouchStart,
    {
      passive: false
    });
    this.canvas.addEventListener('touchmove', this.boundHandlers.onTouchMove,
    {
      passive: false
    });
    this.canvas.addEventListener('touchend', this.boundHandlers.onTouchEnd,
    {
      passive: false
    });
  }

  onWindowResize()
  {
    if (!this.canvas || !this.compositionRenderer) return;

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    // Resize main renderer, composition camera, and all layer render targets.
    // Layer-specific resize callbacks (like Scope) are invoked by the
    // CompositionRenderer itself.
    this.compositionRenderer.handleResize(width, height);

    // Reposition scopes using unified positioning logic
    const scopePositions = this.calculateScopePositions();

    if (this.spottingScopeLayer)
    {
      this.compositionRenderer.setElementPosition(
        this.spottingScopeLayer,
        scopePositions.spotting.x,
        scopePositions.spotting.y
      );
    }

    if (this.scopeLayer)
    {
      this.compositionRenderer.setElementPosition(
        this.scopeLayer,
        scopePositions.rifle.x,
        scopePositions.rifle.y
      );
    }

    // Update HUD positions (reads from updated camera bounds)
    if (this.hud)
    {
      this.hud.updatePositions();
    }
  }

  // ===== TARGET RACK CREATION =====

  addTargetRack(x, z, rackWidth, rackHeight, targets)
  {
    if (!this.landscape) throw new Error('Landscape must be initialized');

    const groundHeight = this.landscape.getHeightAt(x, z) || 0;
    const halfWidth = rackWidth / 2;

    const rack = TargetRackFactory.create(
    {
      bottomLeft:
      {
        x: x - halfWidth,
        y: groundHeight,
        z
      },
      topRight:
      {
        x: x + halfWidth,
        y: groundHeight + rackHeight,
        z
      },
      scene: this.scene
    });

    targets.forEach(target => rack.addTarget(target));
    rack.buildTargets();
    return rack;
  }

  createTargetRacks()
  {
    if (!this.landscape) return;

    const btk = this.btk;

    // Create target racks from configuration
    for (const rackConfig of Config.TARGET_RACKS_CONFIG)
    {
      this.addTargetRack(rackConfig.x, rackConfig.z, rackConfig.rackWidth, rackConfig.rackHeight, rackConfig.targets);

      // Create range sign next to each rack
      const distanceYards = Math.round(btk.Conversions.metersToYards(-rackConfig.z));
      const groundHeight = this.landscape.getHeightAt(rackConfig.x, rackConfig.z) || 0;

      // Position sign to the right of the rack, slightly behind it
      const signOffset = rackConfig.rackWidth / 2 + 0.5; // 0.5m to the right of rack edge
      const signPosition = new THREE.Vector3(
        rackConfig.x + signOffset,
        groundHeight,
        rackConfig.z + 0.3 // Slightly behind rack (towards shooter)
      );

      RangeSignFactory.create(
      {
        position: signPosition,
        text: `${distanceYards}`,
        scene: this.scene,
        textureManager: this.textureManager
      });

      // Create berm behind rack if enabled (default true)
      const hasBerm = rackConfig.hasBerm !== false; // Default to true
      if (hasBerm)
      {
        // Position berm 2 yards behind rack (towards shooter, positive Z)
        const bermOffsetZ = btk.Conversions.yardsToMeters(2);
        const bermPosition = new THREE.Vector3(
          rackConfig.x,
          groundHeight,
          rackConfig.z - bermOffsetZ // Behind rack (towards shooter)
        );

        // Berm dimensions: flat top matches rack width, height matches rack height
        const bermDepth = btk.Conversions.yardsToMeters(3); // 3 yards deep

        BermFactory.create(
        {
          position: bermPosition,
          width: rackConfig.rackWidth * 1.1, // Flat top width matches rack
          height: rackConfig.rackHeight * 1.1, // Same height as rack
          depth: bermDepth,
          scene: this.scene,
          textureManager: this.textureManager
        });
      }
    }
  }

  createWindFlags()
  {
    if (!this.landscape) return;

    // Collect flag positions from configuration
    const positions = Config.WIND_FLAGS.map(flagConfig => ({
      x: flagConfig.x,
      y: this.landscape.getHeightAt(flagConfig.x, flagConfig.z) || 0,
      z: flagConfig.z
    }));

    // Create all instanced flags at once
    WindFlagFactory.createFlagsAtPositions(this.scene, positions);
  }

  setupImpactDetector()
  {
    // Create impact detector with world bounds
    const halfWidth = Config.LANDSCAPE_CONFIG.groundWidth / 2;
    const groundLength = Config.LANDSCAPE_CONFIG.groundLength;

    this.impactDetector = new ImpactDetector(
    {
      binSize: 10.0, // 10 meter bins
      minX: -halfWidth,
      maxX: halfWidth,
      minZ: -groundLength,
      maxZ: 50.0 // A bit in front of shooter
    });

    // Register all steel targets from factory
    const STEEL_RADIUS = 5.0; // 5m radius for binning (covers swing arc)

    const targets = SteelTargetFactory.getAll();
    for (const target of targets)
    {
      this.impactDetector.addSteelTarget(
        target.steelTarget,
        STEEL_RADIUS,
        {
          target: target,
          soundName: 'ping1',
          onImpact: (impactPosition, normal, velocity, scene, windGenerator) =>
          {
            const pos = new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z);
            DustCloudFactory.create(
            {
              position: pos,
              scene: scene,
              numParticles: Config.METAL_DUST_CONFIG.numParticles,
              color: Config.METAL_DUST_CONFIG.color,
              initialRadius: Config.METAL_DUST_CONFIG.initialRadius,
              growthRate: Config.METAL_DUST_CONFIG.growthRate,
              particleDiameter: Config.METAL_DUST_CONFIG.particleDiameter
            });
            // No impact mark on steel targets
          }
        }
      );
    }

    // Let landscape register its objects
    if (this.landscape)
    {
      this.landscape.registerWithImpactDetector(this.impactDetector);
    }

    // Merge all berms into a single mesh and register for impact detection
    BermFactory.mergeBerms(this.scene, this.impactDetector);

    // Merge all range signs into single meshes with texture atlas and register for impact detection
    RangeSignFactory.mergeSigns(this.scene, this.impactDetector);

    // Register target rack frames (beam and posts)
    const racks = TargetRackFactory.getAll();
    for (const rack of racks)
    {
      rack.registerWithImpactDetector(this.impactDetector);
    }

    // Register wind flag poles
    WindFlagFactory.registerWithImpactDetector(this.impactDetector);

    // Register prairie dog hunting targets
    const prairieDogs = PrairieDogFactory.getAll();
    const sharedGeometry = PrairieDogFactory.getGeometry();
    if (sharedGeometry && prairieDogs.length > 0)
    {
      // Use computed scale (calculated to achieve target height)
      const scale = PrairieDogFactory.computedScale;

      // Create rotation matrix for 90 degrees around X axis (same as instance rendering)
      const rotationMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);

      for (const prairieDog of prairieDogs)
      {
        // Clone geometry and apply transforms to match instance rendering
        const geometry = sharedGeometry.clone();
        const basePos = prairieDog.basePosition;

        // Apply scale first
        geometry.scale(scale, scale, scale);

        // Apply rotation (90 degrees around X axis to stand up)
        geometry.applyMatrix4(rotationMatrix);

        // Position geometry at the same raised height used by the instanced mesh.
        // Visual prairie dog position is basePos.y + PrairieDogFactory.raisedOffset,
        // so we use that here to keep the collider in sync.
        geometry.translate(basePos.x, basePos.y + PrairieDogFactory.raisedOffset, basePos.z);

        // Register with ImpactDetector
        // Store prairie dog index in userData for impact handling
        const objectId = this.impactDetector.addMeshFromGeometry(geometry,
        {
          type: 'prairieDog',
          index: prairieDog.instanceIndex
        });
        prairieDog.objectId = objectId;
      }

      // Store impactDetector reference for respawn re-enabling
      PrairieDogFactory.impactDetector = this.impactDetector;

      // Disable colliders for prairie dogs that start lowered
      for (const prairieDog of prairieDogs)
      {
        if (!prairieDog.isRaised() && prairieDog.objectId >= 0)
        {
          this.impactDetector.setColliderEnabled(prairieDog.objectId, false);
        }
      }
    }

    const signs = RangeSignFactory.getAll();
    const flags = WindFlagFactory.getAll();
    console.log(`[SteelSim] ImpactDetector initialized with ${targets.length} steel targets, ${racks.length} racks, ${signs.length} signs, ${flags.length} flags, ${prairieDogs.length} prairie dogs`);
    console.log('[SteelSim] ImpactDetector stats:', this.impactDetector.getStats());
  }

  // ===== EVENT HANDLERS =====

  onMouseWheel(event)
  {
    const locked = document.pointerLockElement === this.canvas;

    // Only intercept wheel when the scope has pointer lock (scope mode)
    if (!locked || !this.scopeMode)
    {
      return; // allow normal page scrolling
    }

    event.preventDefault();

    // Zoom the active scope
    const scopeToZoom = this.activeScope === 'spotting' ? this.spottingScope : this.scope;
    if (scopeToZoom)
    {
      if (event.deltaY < 0)
      {
        scopeToZoom.zoomIn();
      }
      else
      {
        scopeToZoom.zoomOut();
      }
    }
  }

  onMouseMove(event)
  {
    if (this.scopeMode && document.pointerLockElement === this.canvas)
    {
      // Pan active scope based on relative mouse movement:
      // 1) pixels → normalized composition delta
      // 2) normalized delta → yaw/pitch via Scope
      const deltaX = event.movementX || 0;
      const deltaY = event.movementY || 0;
      if (deltaX !== 0 || deltaY !== 0)
      {
        const scopeToControl = this.activeScope === 'spotting' ? this.spottingScope : this.scope;
        if (scopeToControl)
        {
          const normDelta = this.compositionRenderer.movementToNormalized(deltaX, deltaY);
          const
          {
            deltaYaw,
            deltaPitch
          } = scopeToControl.normalizedDeltaToAngles(normDelta.x, normDelta.y);
          scopeToControl.panBy(deltaYaw, deltaPitch);
        }
      }
    }
  }

  onMouseDown(event)
  {
    const norm = this.compositionRenderer.screenToNormalized(event.clientX, event.clientY);
    const locked = document.pointerLockElement === this.canvas;

    if (event.button === 0) // Left click
    {
      // Check if clicking a dial button first
      const dialAction = this.hud.getDialButtonHit(norm.x, norm.y);
      if (dialAction)
      {
        this.handleDialAction(dialAction);
        this.startDialRepeat(dialAction);
        return;
      }

      if (locked)
      {
        // Fire when clicking in scope mode (only from rifle scope, never from spotting scope)
        if (this.activeScope === 'rifle')
        {
          this.fireFromScope();
        }
      }
      else
      {
        // Check which scope was clicked and request pointer lock
        // activeScope will be set in onPointerLockChange when lock succeeds
        if (this.scope.isPointInside(norm.x, norm.y))
        {
          // Store which scope was clicked so we can set activeScope when lock succeeds
          this.pendingActiveScope = 'rifle';
          // Enter scope mode when clicking on rifle scope.
          // Let pointerlockchange handler update scopeMode and activeScope.
          this.canvas.requestPointerLock();
        }
        else if (this.spottingScope && this.spottingScope.isPointInside(norm.x, norm.y))
        {
          // Store which scope was clicked so we can set activeScope when lock succeeds
          this.pendingActiveScope = 'spotting';
          // Enter scope mode when clicking on spotting scope.
          this.canvas.requestPointerLock();
        }
      }
    }
    else if (event.button === 2) // Right click
    {
      // Focus the active scope on right-click (same logic as firing, but focus instead)
      if (locked && this.activeScope)
      {
        const scopeToFocus = this.activeScope === 'spotting' ? this.spottingScope : this.scope;
        if (scopeToFocus)
        {
          this.setFocalDistanceFromRaycast(scopeToFocus);
        }
      }
      event.preventDefault(); // Prevent context menu
    }
  }

  onContextMenu(event)
  {
    // Prevent context menu when right-clicking on scopes
    const norm = this.compositionRenderer.screenToNormalized(event.clientX, event.clientY);
    if ((this.scope && this.scope.isPointInside(norm.x, norm.y)) ||
        (this.spottingScope && this.spottingScope.isPointInside(norm.x, norm.y)))
    {
      event.preventDefault();
    }
  }

  /**
   * Update scope border styling to show which scope is active (desktop mode)
   * Adds a dull red border to the active scope layer
   */
  updateScopeBorders()
  {
    // Only update borders in desktop mode (not mobile)
    if (!this.scopeLayer || !this.spottingScopeLayer) return;
    
    const activeBorderColor = 0x8b0000; // Dull red (dark red)
    const inactiveBorderColor = 0x000000; // Black (default)
    const borderWidth = 0.015; // Border width in normalized coordinates
    
    // Update rifle scope border
    const rifleBorderColor = this.activeScope === 'rifle' ? activeBorderColor : inactiveBorderColor;
    this.updateScopeLayerBorder(this.scopeLayer, rifleBorderColor, borderWidth);
    
    // Update spotting scope border
    const spottingBorderColor = this.activeScope === 'spotting' ? activeBorderColor : inactiveBorderColor;
    this.updateScopeLayerBorder(this.spottingScopeLayer, spottingBorderColor, borderWidth);
  }

  /**
   * Add or update border overlay on a scope layer
   */
  updateScopeLayerBorder(layer, borderColor, borderWidth)
  {
    if (!layer || !layer._mesh) return;
    
    // Remove existing border if present
    if (layer._borderMesh)
    {
      if (layer._mesh.parent)
      {
        layer._mesh.parent.remove(layer._borderMesh);
      }
      if (layer._borderMesh.geometry) layer._borderMesh.geometry.dispose();
      if (layer._borderMesh.material) layer._borderMesh.material.dispose();
      layer._borderMesh = null;
    }
    
    // Only add border if it's the active scope (dull red)
    if (borderColor === 0x000000) return;
    
    // Create border ring geometry
    const positions = layer._mesh.position;
    const width = layer.width;
    const height = layer.height;
    
    // Create a ring geometry for the border (using normalized coordinates)
    const outerRadius = Math.min(width, height) / 2;
    const innerRadius = Math.max(0.01, outerRadius - borderWidth);
    const borderGeometry = new THREE.RingGeometry(innerRadius, outerRadius, 64);
    
    const borderMaterial = new THREE.MeshBasicMaterial({
      color: borderColor,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    
    const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial);
    borderMesh.position.set(positions.x, positions.y, positions.z + 0.001); // Slightly in front
    borderMesh.renderOrder = layer._mesh.renderOrder + 1;
    borderMesh.frustumCulled = false;
    
    // Add to composition scene (same parent as the scope layer mesh)
    if (layer._mesh.parent)
    {
      layer._mesh.parent.add(borderMesh);
      layer._borderMesh = borderMesh;
    }
  }

  handleDialAction(action)
  {
    if (!this.scope) return;
    switch (action)
    {
      case 'dialUp':
        this.scope.dialUp(1);
        break;
      case 'dialDown':
        this.scope.dialDown(1);
        break;
      case 'dialLeft':
        this.scope.dialLeft(1);
        break;
      case 'dialRight':
        this.scope.dialRight(1);
        break;
      case 'dialReset':
        this.scope.resetDial();
        break;
    }
    // Update HUD after dial change
    this.updateHudDial();
  }

  updateHudDial()
  {
    if (this.hud && this.scope)
    {
      const dialPos = this.scope.getDialPositionMRAD();
      this.hud.updateDial(dialPos.elevation, dialPos.windage, this.scope.scopeType);
    }
  }

  startDialRepeat(action)
  {
    // Don't repeat the reset action
    if (action === 'dialReset') return;

    // Initial delay before repeat starts (250ms), then repeat every 55ms
    this.dialRepeatTimeout = setTimeout(() =>
    {
      this.dialRepeatInterval = setInterval(() =>
      {
        this.handleDialAction(action);
      }, 55);
    }, 250);
  }

  stopDialRepeat()
  {
    if (this.dialRepeatTimeout)
    {
      clearTimeout(this.dialRepeatTimeout);
      this.dialRepeatTimeout = null;
    }
    if (this.dialRepeatInterval)
    {
      clearInterval(this.dialRepeatInterval);
      this.dialRepeatInterval = null;
    }
  }

  onMouseUp(event)
  {
    // Stop dial repeat on any mouse up
    this.stopDialRepeat();
  }

  onPointerLockChange()
  {
    const locked = document.pointerLockElement === this.canvas;
    this.scopeMode = locked;
    this.canvas.style.cursor = locked ? 'none' : 'default';
    
    if (locked)
    {
      // When entering scope mode, set activeScope from pendingActiveScope (set by click handler)
      // If no pending scope, default to rifle
      this.activeScope = this.pendingActiveScope || 'rifle';
      this.pendingActiveScope = null; // Clear pending
    }
    else
    {
      // When exiting scope mode, clear active scope selection
      this.activeScope = null;
      this.pendingActiveScope = null; // Also clear pending in case lock failed
    }
    
    this.updateScopeBorders();
  }

  onKeyDown(event)
  {
    // Tab key: Switch between rifle and spotting scope (only when in pointer lock/scope mode)
    if (event.key === 'Tab')
    {
      if (!this.scopeMode || document.pointerLockElement !== this.canvas)
      {
        return; // Only work when in pointer lock mode
      }
      
      event.preventDefault();
      if (this.activeScope === 'rifle')
      {
        this.activeScope = 'spotting';
      }
      else if (this.activeScope === 'spotting')
      {
        this.activeScope = 'rifle';
      }
      else
      {
        // If no scope is active, default to rifle
        this.activeScope = 'rifle';
      }
      this.updateScopeBorders();
      return;
    }

    // Exit scope mode with Escape
    if (event.key === 'Escape')
    {
      if (this.scopeMode)
      {
        document.exitPointerLock();
      }
      return;
    }

    // Debug boar rotation with < and > keys (comma and period)
    if (this.debugBoar && (event.key === ',' || event.key === '.' || event.key === '<' || event.key === '>'))
    {
      const rotationSpeed = 0.1; // radians per keypress
      if (event.key === ',' || event.key === '<')
      {
        // Rotate left (counter-clockwise)
        this.debugBoar.facingAngle -= rotationSpeed;
      }
      else if (event.key === '.' || event.key === '>')
      {
        // Rotate right (clockwise)
        this.debugBoar.facingAngle += rotationSpeed;
      }

      // Normalize angle
      while (this.debugBoar.facingAngle > Math.PI) this.debugBoar.facingAngle -= Math.PI * 2;
      while (this.debugBoar.facingAngle < -Math.PI) this.debugBoar.facingAngle += Math.PI * 2;

      // Update visual rotation
      this.debugBoar.boarGroup.rotation.y = this.debugBoar.facingAngle;
      this.debugBoar.updateColliderTransform();
      event.preventDefault();
      return;
    }

    // Scope controls (only when in scope mode)
    if (this.scopeMode)
    {
      // Zoom controls: +/- or =/- keys (works on active scope)
      if (event.key === '=' || event.key === '+')
      {
        event.preventDefault();
        const scopeToZoom = this.activeScope === 'spotting' ? this.spottingScope : this.scope;
        if (scopeToZoom)
        {
          scopeToZoom.zoomIn();
        }
        return;
      }
      if (event.key === '-' || event.key === '_')
      {
        event.preventDefault();
        const scopeToZoom = this.activeScope === 'spotting' ? this.spottingScope : this.scope;
        if (scopeToZoom)
        {
          scopeToZoom.zoomOut();
        }
        return;
      }

      // R key: Reset scope dial to zero (rifle scope only - spotting scope has no dials)
      if (event.key === 'r' || event.key === 'R')
      {
        event.preventDefault();
        this.scope.resetDial();
        this.updateHudDial();
        return;
      }

      // Arrow keys: Dial adjustments
      // Arrow alone: minor click - small adjustment
      // Shift + Arrow: major click - large adjustment
      const isMajor = event.shiftKey;

      if (event.key === 'ArrowUp')
      {
        event.preventDefault();
        this.scope.dialUp(1, isMajor);
        this.updateHudDial();
        return;
      }
      if (event.key === 'ArrowDown')
      {
        event.preventDefault();
        this.scope.dialDown(1, isMajor);
        this.updateHudDial();
        return;
      }
      if (event.key === 'ArrowLeft')
      {
        event.preventDefault();
        this.scope.dialLeft(1, isMajor);
        this.updateHudDial();
        return;
      }
      if (event.key === 'ArrowRight')
      {
        event.preventDefault();
        this.scope.dialRight(1, isMajor);
        this.updateHudDial();
        return;
      }

      // F key: Set focal distance for active scope
      if (event.key === 'f' || event.key === 'F')
      {
        event.preventDefault();
        const scopeToFocus = this.activeScope === 'spotting' ? this.spottingScope : this.scope;
        if (scopeToFocus)
        {
          this.setFocalDistanceFromRaycast(scopeToFocus);
        }
        return;
      }
    }

    // F key: Set focal distance for active scope (works outside scope mode too)
    if (event.key === 'f' || event.key === 'F')
    {
      event.preventDefault();
      const scopeToFocus = this.activeScope === 'spotting' ? this.spottingScope : this.scope;
      if (scopeToFocus)
      {
        this.setFocalDistanceFromRaycast(scopeToFocus);
      }
      return;
    }
  }

  setFocalDistanceFromRaycast(scope, normX = null, normY = null)
  {
    if (!scope || !this.scene) return;

    // Get the scope's camera
    const camera = scope.getCamera();
    if (!camera) return;

    // Convert normalized composition coordinates to NDC coordinates for the scope camera
    let ndcX = 0;
    let ndcY = 0;

    if (normX !== null && normY !== null && scope.layer)
    {
      // Get scope layer position and size in normalized composition space
      const layerPos = scope.layer.getPosition();
      // Layer stores width and height as properties (normalized composition units)
      const layerWidth = scope.layer.width || 2.0;
      const layerHeight = scope.layer.height || 2.0;

      // Convert from composition coordinates to relative position within scope layer
      // Composition: X spans [-aspect, +aspect], Y spans [-1, +1]
      // Layer: centered at layerPos, with size layerWidth x layerHeight
      const relativeX = (normX - layerPos.x) / (layerWidth / 2);
      const relativeY = (normY - layerPos.y) / (layerHeight / 2);

      // Clamp to scope circle (scope radius is 0.98 in normalized layer space)
      const scopeRadius = 0.98;
      const distFromCenter = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
      if (distFromCenter > scopeRadius)
      {
        // Clamp to circle edge
        const scale = scopeRadius / distFromCenter;
        ndcX = relativeX * scale;
        ndcY = relativeY * scale;
      }
      else
      {
        ndcX = relativeX;
        ndcY = relativeY;
      }
    }

    // Raycast from camera through the specified point (or center if not provided)
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

    // Intersect with all objects in the scene (recursive = true to check all children)
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length > 0)
    {
      const hit = intersects[0];
      const distanceMeters = hit.distance;

      // Update the scope's focal distance
      scope.setFocalDistance(distanceMeters);

      const scopeName = scope === this.scope ? 'rifle' : 'spotting';
      const distanceYards = btk.Conversions.metersToYards(distanceMeters);
      console.log(`[SteelSim] ${scopeName} scope focal distance set to ${distanceYards.toFixed(1)} yards (${distanceMeters.toFixed(2)}m) at ${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}, ${hit.point.z.toFixed(2)}`);
    }
    else
    {
      const scopeName = scope === this.scope ? 'rifle' : 'spotting';
      console.log(`[SteelSim] No intersection found for ${scopeName} scope focal distance`);
    }
  }

  onKeyUp(event)
  {
    // WASD controls removed - no key releases to handle
  }

  // ===== TOUCH HANDLERS (Mobile) =====

  /**
   * Calculate distance between two touch points
   */
  getPinchDistance(touch1, touch2)
  {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  onTouchStart(event)
  {
    const touches = event.touches;
    if (touches.length === 0) return;

    // Get first touch position in normalized coordinates
    const touch = touches[0];
    const norm = this.compositionRenderer.screenToNormalized(touch.clientX, touch.clientY);

    // Check if touching a dial button first
    const dialAction = this.hud.getDialButtonHit(norm.x, norm.y);
    if (dialAction)
    {
      event.preventDefault(); // Prevent default for dial buttons
      this.handleDialAction(dialAction);
      this.startDialRepeat(dialAction);
      this.touchState.activeDialAction = dialAction;
      return;
    }

    // Detect scope immediately for long-press detection (even if finger is held still)
    // Also detect in onTouchMove for iOS delay handling, but we need it here too
    let activeScope = null;
    if (this.scope && this.scope.isPointInside(norm.x, norm.y))
    {
      activeScope = 'rifle';
    }
    else if (this.spottingScope && this.spottingScope.isPointInside(norm.x, norm.y))
    {
      activeScope = 'spotting';
    }

    // Store start position and time for all touches (for dial buttons too)
    this.touchState.active = true;
    this.touchState.activeScope = activeScope; // Set immediately for long-press detection
    this.touchState.activeDialAction = null;

    // Prevent default iOS long-press context menu when touching a scope
    if (activeScope !== null)
    {
      event.preventDefault();
    }
    this.touchState.touchStartTime = performance.now();
    this.touchState.touchMoved = false;
    this.touchState.focusTriggered = false; // Reset focus trigger flag
    this.touchState.touchStartPos = {
      x: touch.clientX,
      y: touch.clientY
    };
    this.touchState.lastTouchPos = {
      x: touch.clientX,
      y: touch.clientY
    };

    // Track pinch distance if two fingers
    if (touches.length >= 2)
    {
      this.touchState.lastPinchDistance = this.getPinchDistance(touches[0], touches[1]);
    }
  }

  onTouchMove(event)
  {
    if (!this.touchState.active) return;

    // If not touching a scope or dial, allow browser default behavior
    if (this.touchState.activeScope === null && this.touchState.activeDialAction === null)
    {
      return;
    }

    // Prevent default for scope/dial interactions
    event.preventDefault();

    const touches = event.touches;
    if (touches.length === 0) return;

    // Get the active scope object
    let scopeObj;
    if (this.touchState.activeScope === 'rifle')
    {
      scopeObj = this.scope;
    }
    else if (this.touchState.activeScope === 'spotting')
    {
      scopeObj = this.spottingScope;
    }
    else
    {
      return; // No scope selected, ignore gesture
    }

    if (touches.length >= 2)
    {
      // Pinch zoom - proportional to finger spread
      const newPinchDistance = this.getPinchDistance(touches[0], touches[1]);

      if (this.touchState.lastPinchDistance > 0)
      {
        // Calculate zoom ratio from pinch ratio
        const pinchRatio = newPinchDistance / this.touchState.lastPinchDistance;
        const currentZoom = scopeObj.getZoomX();
        const newZoom = currentZoom * pinchRatio;
        scopeObj.setZoomX(newZoom); // setZoomX clamps to min/max
      }

      this.touchState.lastPinchDistance = newPinchDistance;
      this.touchState.touchMoved = true;
    }
    else if (touches.length === 1)
    {
      // Single finger - pan immediately (no distance threshold)
      const touch = touches[0];

      // Pan the view
      const deltaX = touch.clientX - this.touchState.lastTouchPos.x;
      const deltaY = touch.clientY - this.touchState.lastTouchPos.y;

      const normDelta = this.compositionRenderer.movementToNormalized(-deltaX, -deltaY);
      const
      {
        deltaYaw,
        deltaPitch
      } = scopeObj.normalizedDeltaToAngles(normDelta.x, normDelta.y);
      scopeObj.panBy(deltaYaw, deltaPitch);

      this.touchState.touchMoved = true;

      this.touchState.lastTouchPos = {
        x: touch.clientX,
        y: touch.clientY
      };
    }
  }

  onTouchEnd(event)
  {
    // Only prevent default if we were interacting with something
    if (this.touchState.activeScope !== null || this.touchState.activeDialAction !== null)
    {
      event.preventDefault();
    }

    // Always stop dial repeat on touch end
    this.stopDialRepeat();

    // If dial button was being held, we're done
    if (this.touchState.activeDialAction)
    {
      this.touchState.activeDialAction = null;
      return;
    }

    if (!this.touchState.active) return;

    // Check for tap on scope to fire (under duration AND minimal movement)
    // Note: Long-press focus is handled in onTouchMove, not here
    const elapsed = performance.now() - this.touchState.touchStartTime;
    const TAP_MAX_DURATION = 200; // milliseconds
    const TAP_MAX_DISTANCE = 5; // pixels - maximum movement allowed for a tap

    // Calculate distance moved from start position
    const touch = event.changedTouches[0];
    if (touch)
    {
      const deltaXFromStart = touch.clientX - this.touchState.touchStartPos.x;
      const deltaYFromStart = touch.clientY - this.touchState.touchStartPos.y;
      const distanceFromStart = Math.sqrt(deltaXFromStart * deltaXFromStart + deltaYFromStart * deltaYFromStart);

      // Only fire if it was a quick tap (not a long-press that already triggered focus)
      if (elapsed < TAP_MAX_DURATION && distanceFromStart <= TAP_MAX_DISTANCE && !this.touchState.focusTriggered)
      {
        if (this.touchState.activeScope === 'rifle')
        {
          // Quick tap on rifle scope with minimal movement - fire!
          this.fireFromScope();
        }
      }
    }

    // Reset touch state
    this.touchState.active = false;
    this.touchState.activeScope = null;
    this.touchState.touchMoved = false;
    this.touchState.focusTriggered = false;
    this.touchState.lastPinchDistance = 0; // Reset pinch distance
  }

  // ===== TOUCH GESTURES =====

  /**
   * Check for long-press focus gesture (handles both still and moving touches)
   * This runs every frame, so it works even if onTouchMove doesn't fire (perfectly still finger)
   * Don't trigger during pinch zoom (two fingers) or if touch has moved significantly
   */
  checkLongPressFocus()
  {
    if (!this.touchState.active || this.touchState.focusTriggered || this.touchState.activeDialAction)
    {
      return;
    }

    // Skip if pinch zoom is active (two fingers detected via lastPinchDistance)
    if (this.touchState.lastPinchDistance > 0)
    {
      return; // Don't trigger focus during pinch zoom
    }

    const elapsed = performance.now() - this.touchState.touchStartTime;
    const FOCUS_MIN_HOLD_MS = 450; // milliseconds - minimum hold time for focus gesture
    const FOCUS_MAX_MOVE_PX = 5; // pixels - maximum movement allowed for focus

    // Check movement distance first - if moved too far, cancel long-press entirely
    let distanceFromStart = 0;
    let touchX = this.touchState.touchStartPos.x;
    let touchY = this.touchState.touchStartPos.y;

    if (this.touchState.touchMoved && this.touchState.lastTouchPos)
    {
      const deltaX = this.touchState.lastTouchPos.x - this.touchState.touchStartPos.x;
      const deltaY = this.touchState.lastTouchPos.y - this.touchState.touchStartPos.y;
      distanceFromStart = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      touchX = this.touchState.lastTouchPos.x;
      touchY = this.touchState.lastTouchPos.y;

      // If moved beyond threshold, cancel long-press (prevent triggering even if they come back)
      if (distanceFromStart > FOCUS_MAX_MOVE_PX)
      {
        this.touchState.focusTriggered = true; // Cancel long-press
        return;
      }
    }

    if (elapsed < FOCUS_MIN_HOLD_MS)
    {
      return;
    }

    // Check if we're touching a scope
    let scopeObj = null;
    if (this.touchState.activeScope === 'rifle' && this.scope && this.scope.opticalEffectsEnabled)
    {
      scopeObj = this.scope;
    }
    else if (this.touchState.activeScope === 'spotting' && this.spottingScope && this.spottingScope.opticalEffectsEnabled)
    {
      scopeObj = this.spottingScope;
    }

    if (!scopeObj)
    {
      return;
    }

    // At this point, elapsed time is sufficient and movement is within threshold
    const norm = this.compositionRenderer.screenToNormalized(touchX, touchY);
    this.setFocalDistanceFromRaycast(scopeObj, norm.x, norm.y);
    this.touchState.focusTriggered = true; // Prevent multiple triggers

    // Vibrate on long-press focus detection
    if (navigator.vibrate)
    {
      navigator.vibrate(50); // 50ms vibration for tactile feedback
    }
  }

  // ===== SHOOTING =====

  fireFromScope()
  {
    if (!this.rifleZero)
    {
      console.warn('[fireFromScope] Rifle not zeroed yet');
      return;
    }

    // Play shot sound immediately
    if (this.audioManager)
    {
      this.audioManager.playSound('long_shot');
    }

    // Vibrate on fire (fast double pulse)
    if (navigator.vibrate)
    {
      navigator.vibrate([10, 20]); // Fast double pulse: 10ms on, 20ms off, 10ms on
    }

    const btk = this.btk;
    const borePos = new btk.Vector3D(
      0,
      Config.SHOOTER_HEIGHT - this.rifleZero.scopeHeight_m,
      0
    );

    // Apply MV variation (already in SI: m/s)
    const mvVariationMps = (Math.random() - 0.5) * 2.0 * this.mvSd_mps;
    const actualMVMps = this.mv_mps + mvVariationMps;

    // Get scope dial position (in MRAD)
    const scopeAngle = this.scope.getTotalAngleMRAD();
    const scopeElevationRad = scopeAngle.elevation * 0.001; // MRAD to radians
    const scopeWindageRad = scopeAngle.windage * 0.001; // MRAD to radians

    // Rifle accuracy as uniform distribution within a circle (diameter)
    // Generate random point within unit circle using rejection sampling
    let accuracyX, accuracyY;
    do {
      accuracyX = (Math.random() - 0.5) * 2.0; // -1 to 1
      accuracyY = (Math.random() - 0.5) * 2.0; // -1 to 1
    }
    while (accuracyX * accuracyX + accuracyY * accuracyY > 1.0);

    // Rifle accuracy already in radians
    const accuracyRadius = this.rifleAccuracy_rad / 2.0; // Convert diameter to radius
    const accuracyErrorH = accuracyX * accuracyRadius; // radians (horizontal/yaw)
    const accuracyErrorV = accuracyY * accuracyRadius; // radians (vertical/pitch)

    const totalYawAdjustment = -scopeWindageRad + accuracyErrorH;
    const totalPitchAdjustment = -scopeElevationRad + accuracyErrorV;

    const cosYaw = Math.cos(totalYawAdjustment);
    const sinYaw = Math.sin(totalYawAdjustment);
    const cosPitch = Math.cos(totalPitchAdjustment);
    const sinPitch = Math.sin(totalPitchAdjustment);

    // Rotate unit direction: yaw around Y, then pitch around X
    const unitDir = this.rifleZero.zeroedVelocity.normalized();
    const rx = unitDir.x * cosYaw - unitDir.z * sinYaw;
    const rz = unitDir.x * sinYaw + unitDir.z * cosYaw;
    const ry = unitDir.y;
    const ux = rx;
    const uy = ry * cosPitch + rz * sinPitch;
    const uz = -ry * sinPitch + rz * cosPitch;
    unitDir.delete();

    // Scale by actual MV (already in m/s) and create BTK velocity vector
    const initialVelocity = new btk.Vector3D(
      ux * actualMVMps,
      uy * actualMVMps,
      uz * actualMVMps
    );

    // Recompute spin rate based on actual MV (spin rate varies with MV, already in SI units)
    const spinRate = btk.Bullet.computeSpinRateFromTwist(actualMVMps, this.twist_mPerTurn);

    // Create shot from bore position (2" below scope)
    ShotFactory.create(
    {
      initialPosition: borePos,
      initialVelocity: initialVelocity,
      bulletParams:
      {
        ...this.rifleZero.bulletParams,
        spinRate: spinRate
      },
      atmosphere: this.rifleZero.atmosphere,
      windGenerator: this.windGenerator,
      scene: this.scene,
      shadowsEnabled: true
    });
  }

  // ===== DUST CLOUD EFFECTS =====

  createDustCloud(impactPoint)
  {
    // Three.js scene is in meters - convert btk.Vector3D to THREE.Vector3
    const impactPointThree = new THREE.Vector3(
      impactPoint.x,
      impactPoint.y,
      impactPoint.z
    );

    DustCloudFactory.create(
    {
      position: impactPointThree, // Already in meters
      scene: this.scene,
      numParticles: Config.GROUND_DUST_CONFIG.numParticles,
      color: Config.GROUND_DUST_CONFIG.color,
      initialRadius: Config.GROUND_DUST_CONFIG.initialRadius, // Already in meters from config
      growthRate: Config.GROUND_DUST_CONFIG.growthRate, // Already in m/s from config
      particleDiameter: Config.GROUND_DUST_CONFIG.particleDiameter // Already in meters from config
    });
  }

  createMetallicDustCloud(impactPoint)
  {
    // Three.js scene is in meters - convert btk.Vector3D to THREE.Vector3
    const impactPointThree = new THREE.Vector3(
      impactPoint.x,
      impactPoint.y,
      impactPoint.z
    );

    DustCloudFactory.create(
    {
      position: impactPointThree, // Already in meters
      scene: this.scene,
      numParticles: Config.METAL_DUST_CONFIG.numParticles,
      color: Config.METAL_DUST_CONFIG.color,
      initialRadius: Config.METAL_DUST_CONFIG.initialRadius, // Already in meters from config
      growthRate: Config.METAL_DUST_CONFIG.growthRate, // Already in m/s from config
      particleDiameter: Config.METAL_DUST_CONFIG.particleDiameter // Already in meters from config
    });
  }


  // ===== COLLISION DETECTION =====

  checkBulletTargetCollisions()
  {
    const shots = ShotFactory.getShots();

    for (const shot of shots)
    {
      // Get the time range since last check
      const timeRange = shot.getCollisionCheckTimeRange();
      if (!timeRange) continue;

      const trajectory = shot.getTrajectory();
      if (!trajectory) continue;

      // Only check the new time range since last frame
      const impact = this.impactDetector.findFirstImpact(trajectory, timeRange.t0 - 0.001, timeRange.t1 + 0.001);

      // If we hit something, handle it
      if (impact && impact.userData)
      {
        const userData = impact.userData;

        // Get the bullet state at impact time
        const impactPoint = trajectory.atTime(impact.time);
        if (!impactPoint) continue;

        const impactBullet = impactPoint.getState();
        const impactPosition = impactBullet.getPosition();

        // If userData has a target, apply impact
        if (userData.target)
        {
          userData.target.hit(impactBullet);

          // Update HUD with hit status
          if (this.hud)
          {
            this.hud.updateImpactStatus(
            {
              type: 'hit'
            });
          }
        }
        // Handle boar hits
        else if (userData.type === 'boar')
        {
          const boar = BoarFactory.getByObjectId(userData.boarObjectId);
          if (boar && !boar.isDead)
          {
            console.log(`[Boar] HIT! objectId=${userData.boarObjectId}, position=(${impactPosition.x.toFixed(2)}, ${impactPosition.y.toFixed(2)}, ${impactPosition.z.toFixed(2)}), velocity=(${impactBullet.getVelocity().x.toFixed(2)}, ${impactBullet.getVelocity().y.toFixed(2)}, ${impactBullet.getVelocity().z.toFixed(2)})`);

            // Create red dust cloud at impact point
            const impactPointThree = new THREE.Vector3(
              impactPosition.x,
              impactPosition.y,
              impactPosition.z
            );

            DustCloudFactory.create(
            {
              position: impactPointThree,
              scene: this.scene,
              numParticles: 250,
              color:
              {
                r: 255,
                g: 0,
                b: 0
              }, // Red color
              initialRadius: 0.05,
              growthRate: 0.5,
              particleDiameter: 0.2
            });

            // Only kill non-debug boars
            if (!boar.isDebugBoar)
            {
              // Kill the boar
              boar.die();

              // Disable this collider so it won't block future shots
              if (boar.colliderHandle >= 0)
              {
                this.impactDetector.setColliderEnabled(boar.colliderHandle, false);
              }
            }

            // Update HUD with hit status
            if (this.hud)
            {
              this.hud.updateImpactStatus(
              {
                type: 'hit'
              });
            }
          }
        }
        // Handle prairie dog hits
        else if (userData.type === 'prairieDog')
        {
          // Only process impact if prairie dog is raised (if lowered, no impact)
          const prairieDog = PrairieDogFactory.getAt(userData.index);
          if (prairieDog && prairieDog.isRaised())
          {
            // Create red dust cloud at impact point
            const impactPointThree = new THREE.Vector3(
              impactPosition.x,
              impactPosition.y,
              impactPosition.z
            );

            DustCloudFactory.create(
            {
              position: impactPointThree,
              scene: this.scene,
              numParticles: 250,
              color:
              {
                r: 255,
                g: 0,
                b: 0
              }, // Red color
              initialRadius: 0.05,
              growthRate: 0.5,
              particleDiameter: 0.2
            });

            // Handle hit: shoot up then lower quickly
            PrairieDogFactory.hit(userData.index);

            // Disable this collider so it won't block future shots
            if (prairieDog.objectId >= 0)
            {
              this.impactDetector.setColliderEnabled(prairieDog.objectId, false);
            }

            // Update HUD with hit status
            if (this.hud)
            {
              this.hud.updateImpactStatus(
              {
                type: 'hit'
              });
            }
          }
        }
        else
        {
          // Hit something that's not a target (berm, ground) - count as miss
          if (this.hud)
          {
            this.hud.updateImpactStatus(
            {
              type: 'miss'
            });
          }
        }

        // Create dust effect and impact mark via callback
        if (userData.onImpact)
        {
          const normalVec = new THREE.Vector3(impact.normal.x, impact.normal.y, impact.normal.z);
          const velocity = impactBullet.getVelocity();
          const velocityVec = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
          userData.onImpact(impactPosition, normalVec, velocityVec, this.scene, this.windGenerator, userData.mesh);
          velocity.delete();
        }

        // Play sound if sound name provided
        if (userData.soundName && this.audioManager)
        {
          // Shooter position (scope/camera position)
          const shooterPos = new THREE.Vector3(0, Config.SHOOTER_HEIGHT, 0);

          // Impact position in Three.js coordinates
          const impactPosThree = new THREE.Vector3(
            impactPosition.x,
            impactPosition.y,
            impactPosition.z
          );

          // Calculate distance from target to shooter
          const distance_m = impactPosThree.distanceTo(shooterPos);

          // Speed of sound: ~343 m/s at sea level, 20°C
          const SPEED_OF_SOUND_MPS = 343.0;

          // Calculate delay: time for sound to travel from target to shooter
          const delaySeconds = distance_m / SPEED_OF_SOUND_MPS;

          // Volume attenuation: linear interpolation from 100% at 100 yards to 10% at max range distance
          const minDistance_m = btk.Conversions.yardsToMeters(100.0); // Full volume at 100 yards
          const maxDistance_m = Config.LANDSCAPE_CONFIG.groundLength; // Max range distance

          let volume;
          if (distance_m <= minDistance_m)
          {
            volume = 1.0; // Full volume at or closer than 100 yards
          }
          else if (distance_m >= maxDistance_m)
          {
            volume = 0.1; // Minimum volume at or beyond max distance
          }
          else
          {
            // Linear interpolation between minDistance and maxDistance
            const t = (distance_m - minDistance_m) / (maxDistance_m - minDistance_m);
            volume = 1.0 - t * (1.0 - 0.1); // Interpolate from 1.0 to 0.1
          }

          // Play sound with delay and volume
          this.audioManager.playSoundDelayed(userData.soundName, delaySeconds,
          {
            volume
          });
        }

        // Mark shot as dead
        shot.markDead();

        // Cleanup
        impactPosition.delete();
        impactBullet.delete();
        impactPoint.delete();
      }
    }
  }

  checkBulletGroundCollisions()
  {
    const shots = ShotFactory.getShots();
    const btk = this.btk;

    for (const shot of shots)
    {
      // Skip shots that already hit something (short-circuit ground check)
      if (!shot.alive) continue;

      const trajectory = shot.getTrajectory();
      if (!trajectory) continue;

      const pointCount = trajectory.getPointCount();
      if (pointCount === 0) continue;

      // Get the last point from trajectory (has time and bullet state)
      const lastPoint = trajectory.getPoint(pointCount - 1);
      const lastPos = lastPoint.getState().getPosition();

      // Check if bullet is below ground (y < 0)
      if (lastPos.y < 0)
      {
        // Get time from last point
        const currentTime = lastPoint.getTime();
        const searchStep = 0.001; // 1ms steps backward
        let impactPoint = null;
        let impactVelocity = null;

        // Search backward from current time
        for (let t = currentTime; t >= 0; t -= searchStep)
        {
          const optPoint = trajectory.atTime(t);
          if (optPoint !== undefined && optPoint !== null)
          {
            const bulletState = optPoint.getState();
            const testPos = bulletState.getPosition();
            if (testPos.y >= 0)
            {
              // Found the crossing point - use this position and velocity
              impactPoint = new btk.Vector3D(testPos.x, 0, testPos.z); // Clamp y to 0
              const vel = bulletState.getVelocity();
              impactVelocity = new THREE.Vector3(vel.x, vel.y, vel.z);
              vel.delete();

              testPos.delete();
              optPoint.delete();
              break;
            }
            testPos.delete();
            optPoint.delete();
          }
        }

        // Create dust cloud at impact point
        if (!impactPoint)
        {
          throw new Error('Trajectory search failed to find ground impact point for bullet');
        }

        this.createDustCloud(impactPoint);

        // Note: No decal mark for ground impacts - dust cloud only

        impactPoint.delete();

        // Update HUD with miss status (ground hit = miss)
        if (this.hud && shot.alive)
        {
          this.hud.updateImpactStatus(
          {
            type: 'miss'
          });
        }

        // Mark shot as dead (will be disposed by ShotFactory.updateAll)
        shot.markDead();
      }
    }
  }

  // ===== MAIN ANIMATION LOOP =====

  animate()
  {
    if (!this.isRunning) return;

    const frameStartTime = performance.now();

    // Mark frame start in render stats
    if (this.renderStats)
    {
      this.renderStats.frameStart();
    }

    this.animationId = requestAnimationFrame(() => this.animate());

    // Update time manager
    this.timeManager.update();
    const dt = this.timeManager.getDeltaTime();

    this.windGenerator.advanceTime(this.timeManager.getElapsedTime());

    //Update the shot
    ShotFactory.updateAll(dt);
    this.checkBulletTargetCollisions();
    this.checkBulletGroundCollisions();
    ShotFactory.cleanupDeadShots();
    ShotFactory.updateAnimations();

    SteelTargetFactory.stepPhysics(dt);
    SteelTargetFactory.updateDisplay();

    DustCloudFactory.updateAll(dt);
    WindFlagFactory.updateAll(this.windGenerator, dt);

    // Update hunting targets only if enabled
    if (this.prairieDogsEnabled)
    {
      PrairieDogFactory.updateAll(dt);
    }
    if (this.hogsEnabled)
    {
      BoarFactory.updateAll(dt);
    }

    // Check for long-press focus gesture
    this.checkLongPressFocus();

    // WASD controls removed - scopes are controlled via mouse/pointer lock

    this.spottingScope.render(dt);
    this.scope.render(dt);

    // Composite everything to screen
    this.compositionRenderer.render();

    // Mark frame complete in render stats
    if (this.renderStats)
    {
      this.renderStats.frameComplete();

      // Update HUD FPS every second
      const now = performance.now();
      if (!this.lastHudUpdateTime) this.lastHudUpdateTime = now;
      if (now - this.lastHudUpdateTime >= 1000 && this.hud)
      {
        const elapsedSeconds = (now - this.lastHudUpdateTime) / 1000.0;
        const framesSinceLastUpdate = this.renderStats.getTotalFrameCount() - (this.lastHudFrameCount || 0);
        const fps = framesSinceLastUpdate / elapsedSeconds;
        this.hud.updateFrameRate(fps);
        this.lastHudUpdateTime = now;
        this.lastHudFrameCount = this.renderStats.getTotalFrameCount();
      }

      // Log render statistics every 300 frames
      if (this.renderStats.getFrameCount() >= 300)
      {
        this.renderStats.logStats();
        this.renderStats.reset();
      }
    }
  }
}

// ===== TOP-LEVEL FUNCTIONS =====

let steelSimulator = null;

function showError(message)
{
  const errorDiv = document.getElementById('error');
  if (errorDiv)
  {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

function getGameParams()
{
  // Require BTK to be loaded
  const btk = window.btk;
  if (!btk || !btk.Conversions)
  {
    throw new Error('BTK module must be loaded before calling getGameParams()');
  }

  // Parse raw values from frontend
  const mvFps = parseFloat(document.getElementById('mv').value);
  const bc = parseFloat(document.getElementById('bc').value);
  const dragFunction = document.getElementById('dragFunction').value;
  const diameterInches = parseFloat(document.getElementById('diameter').value);
  const weightGrains = parseFloat(document.getElementById('weight').value);
  const lengthInches = parseFloat(document.getElementById('length').value);
  const twistInchesPerTurn = parseFloat(document.getElementById('twist').value) || 0;
  const mvSdFps = parseFloat(document.getElementById('mvSd').value) || 0;
  const rifleAccuracyMoa = parseFloat(document.getElementById('rifleAccuracy').value) || 0;
  const windPreset = document.getElementById('windPreset').value;
  const zeroDistanceYards = parseFloat(document.getElementById('zeroDistance').value);
  const scopeHeightInches = parseFloat(document.getElementById('scopeHeight').value);
  const opticalEffectsCheckbox = document.getElementById('opticalEffects');
  const opticalEffectsEnabled = opticalEffectsCheckbox ? opticalEffectsCheckbox.checked : true;
  const rangeFinderCheckbox = document.getElementById('rangeFinder');
  const rangeFinderEnabled = rangeFinderCheckbox ? rangeFinderCheckbox.checked : true;
  const bdcCheckbox = document.getElementById('bdc');
  const bdcEnabled = bdcCheckbox ? bdcCheckbox.checked : true;
  const scopeTypeSelect = document.getElementById('scopeType');
  const scopeType = scopeTypeSelect ? scopeTypeSelect.value : 'mrad';

  // Convert to SI units (all parameters required, no defaults)
  return {
    mv_mps: btk.Conversions.fpsToMps(mvFps),
    bc: bc,
    dragFunction: dragFunction,
    diameter_m: btk.Conversions.inchesToMeters(diameterInches),
    weight_kg: btk.Conversions.grainsToKg(weightGrains),
    length_m: btk.Conversions.inchesToMeters(lengthInches),
    twist_mPerTurn: btk.Conversions.inchesToMeters(twistInchesPerTurn),
    mvSd_mps: btk.Conversions.fpsToMps(mvSdFps),
    rifleAccuracy_rad: btk.Conversions.moaToRadians(rifleAccuracyMoa),
    windPreset: windPreset,
    zeroDistance_m: btk.Conversions.yardsToMeters(zeroDistanceYards),
    scopeHeight_m: btk.Conversions.inchesToMeters(scopeHeightInches),
    opticalEffectsEnabled: opticalEffectsEnabled,
    rangeFinderEnabled: rangeFinderEnabled,
    bdcEnabled: bdcEnabled,
    scopeType: scopeType
  };
}

function populateWindPresetDropdown()
{
  const windSelect = document.getElementById('windPreset');
  if (!windSelect)
  {
    throw new Error('windPreset element not found');
  }

  // Require BTK to be loaded
  const btk = window.btk;
  if (!btk || !btk.WindPresets)
  {
    throw new Error('BTK module and WindPresets must be loaded before calling populateWindPresetDropdown()');
  }

  // Save the current cookie value before clearing dropdown
  const savedValue = SettingsCookies.get('steel_sim_windPreset') || windSelect.value;

  const presetList = btk.WindPresets.listPresets();
  windSelect.innerHTML = '';
  const presetNames = [];
  for (let i = 0; i < presetList.size(); i++)
  {
    const presetName = presetList.get(i);
    presetNames.push(presetName);
    const option = document.createElement('option');
    option.value = presetName;
    option.textContent = presetName;
    windSelect.appendChild(option);
  }

  // Restore saved value if it exists and is valid, otherwise use default
  if (presetNames.includes(savedValue))
  {
    windSelect.value = savedValue;
  }
  else if (presetNames.includes('Moderate'))
  {
    windSelect.value = 'Moderate';
  }
  else if (presetNames.length > 0)
  {
    windSelect.value = presetNames[0];
  }
}

async function startGame()
{
  try
  {
    // BTK should already be loaded from DOMContentLoaded, but check just in case
    if (!window.btk)
    {
      window.btk = await BallisticsToolkit();
    }

    // Explicitly save current UI values to cookies (in case auto-save didn't fire)
    SettingsCookies.saveAll();

    // Clean up previous game if exists
    if (steelSimulator)
    {
      steelSimulator.destroy();
    }

    // Get current parameters (requires BTK to be loaded)
    const params = getGameParams();

    // Create new simulator instance
    const canvas = document.getElementById('steelCanvas');
    steelSimulator = new SteelSimulator(canvas, params);
    await steelSimulator.start();

    // Update UI
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('restartBtn').style.display = 'inline-block';

    // Enable fullscreen button now that sim is running
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn && fullscreenBtn.disabled)
    {
      fullscreenBtn.disabled = false;
      fullscreenBtn.style.opacity = '1';
      fullscreenBtn.style.cursor = 'pointer';
    }
  }
  catch (error)
  {
    console.error('Failed to start game:', error);
    showError('Failed to start simulator. Please check the console for details.');
  }
}

async function restartGame()
{
  try
  {
    // Explicitly save current UI values to cookies (in case auto-save didn't fire)
    SettingsCookies.saveAll();
    
    // Get current parameters
    const params = getGameParams();

    // Clean up previous game if exists
    if (steelSimulator)
    {
      steelSimulator.destroy();
    }

    // Create new simulator instance with updated parameters
    const canvas = document.getElementById('steelCanvas');
    steelSimulator = new SteelSimulator(canvas, params);
    await steelSimulator.start();
  }
  catch (error)
  {
    console.error('Failed to restart game:', error);
    showError('Failed to restart simulator. Please check the console for details.');
  }
}

function setupUI()
{
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.querySelector('.help-close');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');

  if (startBtn)
  {
    startBtn.addEventListener('click', startGame);
  }
  if (restartBtn)
  {
    restartBtn.addEventListener('click', restartGame);
    restartBtn.style.display = 'none'; // Initially hidden
  }
  if (helpBtn)
  {
    helpBtn.addEventListener('click', () => helpModal.style.display = 'block');
  }

  // Reset to defaults button
  const resetDefaultsBtn = document.getElementById('resetDefaults');
  if (resetDefaultsBtn)
  {
    resetDefaultsBtn.addEventListener('click', (e) =>
    {
      e.preventDefault();
      setDefaultValues();
      SettingsCookies.saveAll(); // Explicitly save defaults to cookies
      console.log('[UI] Reset all parameters to defaults and saved to cookies');
    });
  }

  if (helpClose)
  {
    helpClose.addEventListener('click', () => helpModal.style.display = 'none');
  }

  if (helpModal)
  {
    helpModal.addEventListener('click', (e) =>
    {
      if (e.target === helpModal) helpModal.style.display = 'none';
    });
  }

  // Fullscreen button (hide on iOS since fullscreen doesn't work well)
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  if (fullscreenBtn)
  {
    if (isIOS)
    {
      // Hide fullscreen button on iOS
      fullscreenBtn.style.display = 'none';
    }
    else
    {
      // Initially disabled until sim starts
      fullscreenBtn.disabled = true;
      fullscreenBtn.style.opacity = '0.5';
      fullscreenBtn.style.cursor = 'not-allowed';
      fullscreenBtn.addEventListener('click', toggleFullscreen);

      // Update button text when fullscreen changes
      document.addEventListener('fullscreenchange', () =>
      {
        if (document.fullscreenElement)
        {
          fullscreenBtn.textContent = '⛶ Exit Fullscreen';
        }
        else
        {
          fullscreenBtn.textContent = '⛶ Fullscreen';
        }
      });
    }
  }

}

/**
 * Lock screen orientation to landscape
 */
async function lockOrientationLandscape()
{
  try
  {
    if (screen.orientation && screen.orientation.lock)
    {
      await screen.orientation.lock('landscape');
    }
    else if (screen.lockOrientation)
    {
      // Legacy API
      screen.lockOrientation('landscape');
    }
    else if (screen.mozLockOrientation)
    {
      // Firefox legacy
      screen.mozLockOrientation('landscape');
    }
    else if (screen.msLockOrientation)
    {
      // IE/Edge legacy
      screen.msLockOrientation('landscape');
    }
  }
  catch (err)
  {
    // Orientation lock may fail (e.g., user gesture required, not supported)
    // This is expected on some browsers/devices - silently ignore
  }
}

/**
 * Unlock screen orientation
 */
function unlockOrientation()
{
  try
  {
    if (screen.orientation && screen.orientation.unlock)
    {
      screen.orientation.unlock();
    }
    else if (screen.unlockOrientation)
    {
      screen.unlockOrientation();
    }
    else if (screen.mozUnlockOrientation)
    {
      screen.mozUnlockOrientation();
    }
    else if (screen.msUnlockOrientation)
    {
      screen.msUnlockOrientation();
    }
  }
  catch (err)
  {
    console.warn('Could not unlock orientation:', err);
  }
}

/**
 * Toggle fullscreen mode for the canvas container
 */
async function toggleFullscreen()
{
  const canvasContainer = document.querySelector('.canvas-container');

  if (!document.fullscreenElement)
  {
    // Enter fullscreen
    try
    {
      if (canvasContainer.requestFullscreen)
      {
        await canvasContainer.requestFullscreen();
      }
      else if (canvasContainer.webkitRequestFullscreen)
      {
        await canvasContainer.webkitRequestFullscreen(); // Safari
      }
      else if (canvasContainer.msRequestFullscreen)
      {
        await canvasContainer.msRequestFullscreen(); // IE/Edge
      }

      // Lock orientation to landscape after entering fullscreen
      await lockOrientationLandscape();
    }
    catch (err)
    {
      console.error('Fullscreen error:', err);
    }
  }
  else
  {
    // Unlock orientation before exiting fullscreen
    unlockOrientation();

    // Exit fullscreen
    if (document.exitFullscreen)
    {
      document.exitFullscreen();
    }
    else if (document.webkitExitFullscreen)
    {
      document.webkitExitFullscreen(); // Safari
    }
    else if (document.msExitFullscreen)
    {
      document.msExitFullscreen(); // IE/Edge
    }
  }
}

// ===== START =====

/**
 * Set default values for all HTML inputs
 * Called early, before BTK loads or cookies are loaded
 * Also used by "Reset to Defaults" button
 */
function setDefaultValues()
{
  for (const [key, value] of Object.entries(DEFAULT_PARAMS))
  {
    const element = document.getElementById(key);
    if (element)
    {
      if (element.type === 'checkbox')
      {
        element.checked = value;
      }
      else
      {
        element.value = value;
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', async () =>
{
  try
  {
    // Set default values immediately (before BTK loads)
    setDefaultValues();
    
    // Get start button and show loading state
    const startBtn = document.getElementById('startBtn');
    if (startBtn)
    {
      startBtn.disabled = true;
      startBtn.textContent = 'Loading...';
    }

    // Load BTK module first
    if (!window.btk)
    {
      window.btk = await BallisticsToolkit();
    }

    // Populate wind preset dropdown now that BTK is loaded
    populateWindPresetDropdown();

    // Load saved settings from cookies (after wind presets are populated, before resources load)
    // This will overwrite defaults with saved values
    SettingsCookies.loadAll();
    SettingsCookies.attachAutoSave();

    // Initialize shared resource managers (load textures and models on page load)
    await initializeResources();

    // Setup UI
    setupUI();

    // Attach auto-save listeners to all settings inputs
    

    // Try to lock orientation to landscape (may require user gesture on some browsers)
    // Also try on first user interaction since many browsers require a gesture
    let orientationLockAttempted = false;
    const tryLockOrientation = async () =>
    {
      if (!orientationLockAttempted)
      {
        orientationLockAttempted = true;
        await lockOrientationLandscape();
      }
    };

    // Try immediately (may fail without user gesture)
    await lockOrientationLandscape();

    // Also try on first click/touch (user gesture required on some browsers)
    document.addEventListener('click', tryLockOrientation,
    {
      once: true
    });
    document.addEventListener('touchstart', tryLockOrientation,
    {
      once: true
    });

    // Enable start button now that resources are loaded
    if (startBtn)
    {
      startBtn.disabled = false;
      startBtn.textContent = 'Start';
    }
  }
  catch (error)
  {
    console.error('Failed to initialize:', error);
    showError('Failed to initialize. Please check the console for details.');
  }
});