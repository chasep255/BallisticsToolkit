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
  SpottingScope
}
from './SpottingScope.js';
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
  HUD
}
from './HUD.js';
import
{
  ImpactDetector
}
from './ImpactDetector.js';
import
{
  Config,
  initConfig
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
      params.windPreset === undefined || params.zeroDistance_m === undefined || params.scopeHeight_m === undefined)
    {
      throw new Error('Constructor requires all SI unit parameters (mv_mps, diameter_m, weight_kg, length_m, twist_mPerTurn, mvSd_mps, rifleAccuracy_rad, bc, dragFunction, windPreset, zeroDistance_m, scopeHeight_m). Use getGameParams() to convert from frontend inputs.');
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

    // Spotting scope key states
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
      lastTouchPos: { x: 0, y: 0 },
      lastThreeFingerPos: { x: 0, y: 0 }, // For three-finger dial adjustment
      touchStartTime: 0,
      touchMoved: false,
      activeScope: null, // 'rifle' | 'spotting' | null
      activeDialAction: null // For dial button hold-to-repeat
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

    // Textures
    this.textureManager = null;

    // Event handler references for cleanup
    this.boundHandlers = {};

    // FPS tracking
    this.fpsFrameCount = 0;
    this.fpsStartTime = null;
    this.fpsLastLogTime = null;
    this.fpsTotalFrameTime = 0;
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

      // Initialize and load audio
      this.audioManager = new AudioManager();
      await this.audioManager.loadAll();

      // Start background noise loop (this unlocks audio context for immediate playback)
      await this.audioManager.startLoop('background_noise', 1.0);

      // Initialize texture manager
      this.textureManager = new TextureManager();

      // Setup ballistics (computes rifle zero)
      await this.setupBallistics();

      // Setup scene (will load textures after renderer is available)
      await this.setupScene();

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

    // Dispose modules that own their own resources
    if (this.textureManager)
    {
      this.textureManager.dispose();
      this.textureManager = null;
    }
    if (this.audioManager)
    {
      this.audioManager.dispose();
      this.audioManager = null;
    }
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
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // Setup lighting first
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 0, 1000);
    this.scene.add(directionalLight);

    // Setup composition renderer
    this.compositionRenderer = new CompositionRenderer(
    {
      canvas: this.canvas
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
      textureManager: this.textureManager
    });

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

    this.spottingScope = new SpottingScope(
    {
      scene: this.scene,
      renderTarget: this.spottingScopeLayer.renderTarget,
      renderer: this.spottingScopeLayer.getRenderer(),
      // Scope optical spec (4–40x, 25 ft @ 100 yd at 4x)
      minZoomX: 4.0,
      maxZoomX: 40.0,
      lowFovFeet: 25,
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
      centerNormalized:
      {
        x: scopePositions.spotting.x,
        y: scopePositions.spotting.y
      },
      heightNormalized: scopePositions.spotting.height,
      panSpeedBase: 0.1 // radians per second base speed
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
      audioManager: this.audioManager, // Pass audio manager for scope click sounds
      // Scope optical spec (4–40x, 25 ft @ 100 yd at 4x)
      minZoomX: 4.0,
      maxZoomX: 40.0,
      lowFovFeet: 25,
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
      centerNormalized:
      {
        x: scopePositions.rifle.x,
        y: scopePositions.rifle.y
      },
      heightNormalized: scopePositions.rifle.height
    });
    this.camera = this.scope.getCamera(); // For raycasting

    // Create target racks (independent of scope setup)
    this.createTargetRacks();

    // Create impact detector and register steel targets
    this.setupImpactDetector();

    // When the scope layers' render targets are resized by the composition
    // renderer, update the scopes' internal render targets and camera aspects.
    this.scopeLayer.setResizeHandler((w, h) =>
    {
      this.scope.resizeRenderTargets(w, h);
    });
    this.spottingScopeLayer.setResizeHandler((w, h) =>
    {
      this.spottingScope.resizeRenderTargets(w, h);
    });

    // Setup raycaster for scope-based shooting
    this.raycaster = new THREE.Raycaster();

    // Setup event listeners
    this.setupEventListeners();

    // Ensure renderer uses the final CSS size on first layout
    this.onWindowResize();
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
      spotting: { x: spottingX, y: spottingY, width: spottingWidth, height: spottingHeight },
      rifle: { x: rifleX, y: rifleY, width: rifleWidth, height: rifleHeight }
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
    window.addEventListener('mouseup', this.boundHandlers.onMouseUp);
    window.addEventListener('keydown', this.boundHandlers.onKeyDown);
    window.addEventListener('keyup', this.boundHandlers.onKeyUp);
    document.addEventListener('pointerlockchange', this.boundHandlers.onPointerLockChange);
    window.addEventListener('resize', this.boundHandlers.onWindowResize);
    
    // Fullscreen change needs delayed resize to let layout update
    this.boundHandlers.onFullscreenChange = async () => {
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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.onWindowResize();
        });
      });
    };
    document.addEventListener('fullscreenchange', this.boundHandlers.onFullscreenChange);

    // Touch event listeners for mobile
    this.boundHandlers.onTouchStart = (e) => this.onTouchStart(e);
    this.boundHandlers.onTouchMove = (e) => this.onTouchMove(e);
    this.boundHandlers.onTouchEnd = (e) => this.onTouchEnd(e);
    this.canvas.addEventListener('touchstart', this.boundHandlers.onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.boundHandlers.onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.boundHandlers.onTouchEnd, { passive: false });
  }

  onWindowResize()
  {
    if (!this.canvas || !this.compositionRenderer) return;

    // In fullscreen, use viewport dimensions; otherwise use CSS-computed size
    let width, height;
    if (document.fullscreenElement)
    {
      width = window.innerWidth;
      height = window.innerHeight;
      // Also update canvas CSS to match viewport exactly
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
    }
    else
    {
      // Reset to CSS-controlled sizing
      this.canvas.style.width = '';
      this.canvas.style.height = '';
      width = this.canvas.clientWidth;
      height = this.canvas.clientHeight;
    }

    // Resize main renderer, composition camera, and all layer render targets.
    // Layer-specific resize callbacks (like Scope) are invoked by the
    // CompositionRenderer itself.
    this.compositionRenderer.handleResize(width, height);

    // Reposition scopes using unified positioning logic
    const scopePositions = this.calculateScopePositions();
    
    if (this.spottingScopeLayer && this.spottingScope)
    {
      this.compositionRenderer.setElementPosition(
        this.spottingScopeLayer, 
        scopePositions.spotting.x, 
        scopePositions.spotting.y
      );
      this.compositionRenderer.resizeElement(
        this.spottingScopeLayer,
        scopePositions.spotting.width,
        scopePositions.spotting.height
      );
      this.spottingScope.centerNormalized.x = scopePositions.spotting.x;
      this.spottingScope.centerNormalized.y = scopePositions.spotting.y;
      this.spottingScope.heightNormalized = scopePositions.spotting.height;
    }
    
    if (this.scopeLayer && this.scope)
    {
      this.compositionRenderer.setElementPosition(
        this.scopeLayer, 
        scopePositions.rifle.x, 
        scopePositions.rifle.y
      );
      this.compositionRenderer.resizeElement(
        this.scopeLayer,
        scopePositions.rifle.width,
        scopePositions.rifle.height
      );
      this.scope.centerNormalized.x = scopePositions.rifle.x;
      this.scope.centerNormalized.y = scopePositions.rifle.y;
      this.scope.heightNormalized = scopePositions.rifle.height;
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
        text: `${distanceYards} YD`,
        scene: this.scene
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

    // Create flags from configuration
    for (const flagConfig of Config.WIND_FLAGS)
    {
      const groundHeight = this.landscape.getHeightAt(flagConfig.x, flagConfig.z) || 0;

      WindFlagFactory.create(
      {
        position:
        {
          x: flagConfig.x,
          y: groundHeight,
          z: flagConfig.z
        },
        scene: this.scene,
        config: flagConfig.config ||
        {}
      });
    }
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
              windGenerator: windGenerator,
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

    // Register all berms with impact detector
    const berms = BermFactory.getAll();
    for (const berm of berms)
    {
      const bermMesh = berm.getMesh();
      if (bermMesh)
      {
        // Clone geometry and apply the berm's world transform
        const transformedGeometry = bermMesh.geometry.clone();
        bermMesh.updateMatrixWorld();
        transformedGeometry.applyMatrix4(bermMesh.matrixWorld);

        this.impactDetector.addMeshFromGeometry(
          transformedGeometry,
          {
            name: 'Berm',
            soundName: null, // Berms are silent
            mesh: bermMesh, // Store mesh reference for decal projection
            onImpact: (impactPosition, normal, velocity, scene, windGenerator, targetMesh) =>
            {
              const pos = new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z);

              // Sand dust for berm impacts
              const dustColor = {
                r: 245,
                g: 220,
                b: 170
              }; // Light sandy/yellow-tan
              DustCloudFactory.create(
              {
                position: pos,
                scene: scene,
                numParticles: 1000,
                color: dustColor,
                windGenerator: windGenerator,
                initialRadius: 0.05,
                growthRate: 0.15,
                particleDiameter: 0.5
              });

              // Impact mark - stretched based on impact angle
              ImpactMarkFactory.create(
              {
                position: pos,
                normal: normal,
                velocity: velocity,
                mesh: targetMesh,
                color: 0x8b7a65, // Sandy tan
                size: 1.0
              });
            }
          }
        );
      }
    }

    // Register target rack frames (beam and posts)
    const racks = TargetRackFactory.getAll();
    for (const rack of racks)
    {
      rack.registerWithImpactDetector(this.impactDetector);
    }

    // Register range signs (post and sign board)
    const signs = RangeSignFactory.getAll();
    for (const sign of signs)
    {
      sign.registerWithImpactDetector(this.impactDetector);
    }

    // Register wind flag poles
    const flags = WindFlagFactory.getAll();
    for (const flag of flags)
    {
      flag.registerWithImpactDetector(this.impactDetector);
    }

    console.log(`[SteelSim] ImpactDetector initialized with ${targets.length} steel targets, ${racks.length} racks, ${signs.length} signs, ${flags.length} flags`);
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

    if (event.deltaY < 0)
    {
      this.scope.zoomIn();
    }
    else
    {
      this.scope.zoomOut();
    }
  }

  onMouseMove(event)
  {
    if (this.scopeMode && document.pointerLockElement === this.canvas)
    {
      // Pan scope based on relative mouse movement:
      // 1) pixels → normalized composition delta
      // 2) normalized delta → yaw/pitch via Scope
      const deltaX = event.movementX || 0;
      const deltaY = event.movementY || 0;
      if (deltaX !== 0 || deltaY !== 0)
      {
        const normDelta = this.compositionRenderer.movementToNormalized(deltaX, deltaY);
        const
        {
          deltaYaw,
          deltaPitch
        } = this.scope.normalizedDeltaToAngles(normDelta.x, normDelta.y);
        this.scope.panBy(deltaYaw, deltaPitch);
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
        // Fire when clicking in scope mode
        this.fireFromScope();
      }
      else if (this.scope.isPointInside(norm.x, norm.y))
      {
        // Enter scope mode when clicking on scope.
        // Let pointerlockchange handler update scopeMode.
        this.canvas.requestPointerLock();
      }
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
  }

  startDialRepeat(action)
  {
    // Don't repeat the reset action
    if (action === 'dialReset') return;
    
    // Initial delay before repeat starts (250ms), then repeat every 55ms
    this.dialRepeatTimeout = setTimeout(() => {
      this.dialRepeatInterval = setInterval(() => {
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
  }

  onKeyDown(event)
  {
    // Spotting scope controls (always active, no pointer lock needed)
    const key = event.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'e' || key === 'q')
    {
      // Don't prevent default if modifier keys are pressed (allow shortcuts)
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey)
      {
        return;
      }

      this.spottingScopeKeys[key] = true;

      // Handle zoom keys immediately (E/Q)
      if (key === 'e' && this.spottingScope)
      {
        event.preventDefault();
        this.spottingScope.zoomIn();
      }
      else if (key === 'q' && this.spottingScope)
      {
        event.preventDefault();
        this.spottingScope.zoomOut();
      }
      else
      {
        event.preventDefault(); // Prevent default for WASD
      }
      return;
    }

    // Toggle scope display with S key (only if not using spotting scope S key)
    if (event.key === 's' || event.key === 'S')
    {
      if (!this.scopeMode && this.scopeLayer && this.scopeLayer._mesh)
      {
        this.scopeLayer._mesh.visible = !this.scopeLayer._mesh.visible;
      }
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

    // Rifle scope controls (only when in scope mode)
    if (this.scopeMode)
    {
      // Zoom controls: +/- or =/- keys
      if (event.key === '=' || event.key === '+')
      {
        event.preventDefault();
        this.scope.zoomIn();
        return;
      }
      if (event.key === '-' || event.key === '_')
      {
        event.preventDefault();
        this.scope.zoomOut();
        return;
      }

      // R key: Reset scope dial to zero
      if (event.key === 'r' || event.key === 'R')
      {
        event.preventDefault();
        this.scope.resetDial();
        return;
      }

      // Arrow keys: Dial adjustments
      // Arrow alone: 0.1 MRAD (1 click) - small adjustment
      // Shift + Arrow: 1.0 MRAD (10 clicks) - large adjustment
      const clicks = event.shiftKey ? 10 : 1;

      if (event.key === 'ArrowUp')
      {
        event.preventDefault();
        this.scope.dialUp(clicks);
        return;
      }
      if (event.key === 'ArrowDown')
      {
        event.preventDefault();
        this.scope.dialDown(clicks);
        return;
      }
      if (event.key === 'ArrowLeft')
      {
        event.preventDefault();
        this.scope.dialLeft(clicks);
        return;
      }
      if (event.key === 'ArrowRight')
      {
        event.preventDefault();
        this.scope.dialRight(clicks);
        return;
      }
    }
  }

  onKeyUp(event)
  {
    // Handle spotting scope key releases
    const key = event.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'e' || key === 'q')
    {
      if (!event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey)
      {
        this.spottingScopeKeys[key] = false;
        event.preventDefault();
      }
    }
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
    // Prevent default to stop page scrolling/zooming
    event.preventDefault();

    const touches = event.touches;
    if (touches.length === 0) return;

    // Get first touch position in normalized coordinates
    const touch = touches[0];
    const norm = this.compositionRenderer.screenToNormalized(touch.clientX, touch.clientY);

    // Check if touching a dial button first
    const dialAction = this.hud.getDialButtonHit(norm.x, norm.y);
    if (dialAction)
    {
      this.handleDialAction(dialAction);
      this.startDialRepeat(dialAction);
      this.touchState.activeDialAction = dialAction;
      return;
    }

    // Determine which scope is being touched
    let activeScope = null;
    
    // Check spotting scope first (it's on the left)
    if (this.spottingScope && this.spottingScope.isPointInside(norm.x, norm.y))
    {
      activeScope = 'spotting';
    }
    else if (this.scope && this.scope.isPointInside(norm.x, norm.y))
    {
      activeScope = 'rifle';
    }

    // Store start position and time for all touches (for dial buttons too)
    this.touchState.active = true;
    this.touchState.activeScope = activeScope; // may be null if outside scopes
    this.touchState.activeDialAction = null;
    this.touchState.touchStartTime = performance.now();
    this.touchState.touchMoved = false;
    this.touchState.touchStartPos = { x: touch.clientX, y: touch.clientY };
    this.touchState.lastTouchPos = { x: touch.clientX, y: touch.clientY };

    // Track pinch distance if two fingers
    if (touches.length >= 2)
    {
      this.touchState.lastPinchDistance = this.getPinchDistance(touches[0], touches[1]);
    }
  }

  onTouchMove(event)
  {
    if (!this.touchState.active) return;

    event.preventDefault();

    const touches = event.touches;
    if (touches.length === 0) return;

    // Get the active scope object
    const scopeObj = this.touchState.activeScope === 'rifle' ? this.scope : this.spottingScope;
    if (!scopeObj) return;

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
      // Single finger - pan if moved enough distance
      const touch = touches[0];
      const DRAG_DISTANCE_THRESHOLD = 5; // pixels - start dragging if moved this far
      
      // Calculate distance moved from start position
      const deltaXFromStart = touch.clientX - this.touchState.touchStartPos.x;
      const deltaYFromStart = touch.clientY - this.touchState.touchStartPos.y;
      const distanceFromStart = Math.sqrt(deltaXFromStart * deltaXFromStart + deltaYFromStart * deltaYFromStart);
      
      // Start panning if moved enough distance
      if (distanceFromStart > DRAG_DISTANCE_THRESHOLD)
      {
        // It's a drag now - pan the view
        const deltaX = touch.clientX - this.touchState.lastTouchPos.x;
        const deltaY = touch.clientY - this.touchState.lastTouchPos.y;

        const normDelta = this.compositionRenderer.movementToNormalized(-deltaX, -deltaY);
        const { deltaYaw, deltaPitch } = scopeObj.normalizedDeltaToAngles(normDelta.x, normDelta.y);
        scopeObj.panBy(deltaYaw, deltaPitch);

        this.touchState.touchMoved = true;
      }
      
      this.touchState.lastTouchPos = { x: touch.clientX, y: touch.clientY };
    }
  }

  onTouchEnd(event)
  {
    event.preventDefault();

    // Always stop dial repeat on touch end
    this.stopDialRepeat();

    // If dial button was being held, we're done
    if (this.touchState.activeDialAction)
    {
      this.touchState.activeDialAction = null;
      return;
    }

    if (!this.touchState.active) return;

    // Check for tap on scope to fire
    const elapsed = performance.now() - this.touchState.touchStartTime;
    const TAP_MAX_DURATION = 300; // milliseconds

    if (!this.touchState.touchMoved && elapsed < TAP_MAX_DURATION)
    {
      if (this.touchState.activeScope === 'rifle')
      {
        // Quick tap on rifle scope - fire!
        this.fireFromScope();
      }
    }

    // Reset touch state
    this.touchState.active = false;
    this.touchState.activeScope = null;
    this.touchState.touchMoved = false;
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
      windGenerator: this.windGenerator,
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
      windGenerator: this.windGenerator,
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
        else
        {
          // Hit something that's not a target (berm, rock, ground) - count as miss
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

        // Create impact mark on ground - stretched based on impact angle
        ImpactMarkFactory.create(
        {
          position: new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z),
          normal: new THREE.Vector3(0, 1, 0),
          velocity: impactVelocity,
          color: 0x4d4837, // Dark brown
          size: 1.5 // Ground marks are bigger
        });

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

    this.animationId = requestAnimationFrame(() => this.animate());

    // Update time manager
    this.timeManager.update();
    const dt = this.timeManager.getDeltaTime();

    // Break dt into fixed-size substeps (max 5ms each)
    const numSubsteps = Math.ceil(dt / Config.INTEGRATION_STEP_S);
    const stepDt = dt / numSubsteps;

    for (let i = 0; i < numSubsteps; i++)
    {
      // Update wind generator time
      if (this.windGenerator)
      {
        this.windGenerator.advanceTime(this.timeManager.getElapsedTime());
      }

      // Update active bullets (physics)
      ShotFactory.updateAll(stepDt);

      // Check collisions
      this.checkBulletTargetCollisions();
      this.checkBulletGroundCollisions();

      // Clean up dead shots
      ShotFactory.cleanupDeadShots();

      // Step all steel target physics
      SteelTargetFactory.stepPhysics(stepDt);
    }

    // // Update visual animations
    ShotFactory.updateAnimations();
    SteelTargetFactory.updateDisplay();
    DustCloudFactory.updateAll(this.windGenerator, dt);
    WindFlagFactory.updateAll(this.windGenerator, dt);

    // Update spotting scope camera from key states (only update WASD, not E/Q which are handled immediately)
    if (this.spottingScope)
    {
      const panKeys = {
        w: this.spottingScopeKeys.w,
        a: this.spottingScopeKeys.a,
        s: this.spottingScopeKeys.s,
        d: this.spottingScopeKeys.d
      };
      this.spottingScope.updateFromKeys(panKeys, dt);
    }

    // Render scopes (composites 3D scene + reticle into their render targets)
    if (this.spottingScope)
    {
      this.spottingScope.render(dt);
    }
    this.scope.render(dt);

    // Composite everything to screen
    this.compositionRenderer.render();

    // Update HUD with current scope dial position
    if (this.hud && this.scope)
    {
      const dialPos = this.scope.getDialPositionMRAD();
      this.hud.updateDial(dialPos.elevation, dialPos.windage);
    }

    // Track FPS
    const frameEndTime = performance.now();
    const frameTime = frameEndTime - frameStartTime;
    this.fpsTotalFrameTime += frameTime;
    this.fpsFrameCount++;

    // Initialize timing on first frame
    if (this.fpsStartTime === null)
    {
      this.fpsStartTime = frameStartTime;
      this.fpsLastLogTime = frameStartTime;
    }

    // Log FPS at configured interval
    const timeSinceLastLog = (frameEndTime - this.fpsLastLogTime) / 1000.0;
    if (timeSinceLastLog >= Config.FPS_LOG_INTERVAL_S)
    {
      // Calculate actual FPS (frames rendered over wall clock time)
      const actualFps = this.fpsFrameCount / timeSinceLastLog;

      // Calculate theoretical FPS (if we rendered as fast as possible)
      const avgFrameTime = this.fpsTotalFrameTime / this.fpsFrameCount;
      const theoreticalFps = 1000.0 / avgFrameTime;

      console.log(`FPS: Actual=${actualFps.toFixed(1)} (limited by requestAnimationFrame), Theoretical=${theoreticalFps.toFixed(1)} (if unlimited)`);

      // Reset counters
      this.fpsFrameCount = 0;
      this.fpsLastLogTime = frameEndTime;
      this.fpsTotalFrameTime = 0;
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
    scopeHeight_m: btk.Conversions.inchesToMeters(scopeHeightInches)
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

    // Wind presets already populated during initialization
    // Just reload cookies to restore saved wind preset
    SettingsCookies.loadAll();
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

    // Wind presets already populated during initialization
    // Just reload cookies to restore saved wind preset
    SettingsCookies.loadAll();
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

  // Fullscreen button
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  if (fullscreenBtn)
  {
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
    // This is expected on some browsers/devices
    console.warn('Could not lock orientation to landscape:', err);
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
 * Also starts the game if it hasn't started yet
 */
async function toggleFullscreen()
{
  const canvasContainer = document.querySelector('.canvas-container');
  
  if (!document.fullscreenElement)
  {
    // Start the game if it hasn't started yet
    if (!steelSimulator)
    {
      await startGame();
    }
    
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

document.addEventListener('DOMContentLoaded', async () =>
{
  try
  {
    // Load BTK module first
    if (!window.btk)
    {
      window.btk = await BallisticsToolkit();
    }

    // Setup UI
    setupUI();

    // Populate wind preset dropdown now that BTK is loaded
    populateWindPresetDropdown();

    // Load saved settings from cookies (after wind presets are populated)
    SettingsCookies.loadAll();

    // Attach auto-save listeners to all settings inputs
    SettingsCookies.attachAutoSave();

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
    document.addEventListener('click', tryLockOrientation, { once: true });
    document.addEventListener('touchstart', tryLockOrientation, { once: true });

    // Don't auto-start - wait for Start button
  }
  catch (error)
  {
    console.error('Failed to initialize:', error);
    showError('Failed to initialize. Please check the console for details.');
  }
});