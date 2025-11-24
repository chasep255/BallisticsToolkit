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
  HUD
}
from './HUD.js';
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
    this.backgroundElement = null;
    this.scope = null;
    this.backgroundCamera = null;
    this.raycaster = null;
    this.scopeLayer = null;
    this.landscape = null;

    // Scope and shooting
    this.scopeMode = false;
    this.rifleZero = null;
    
    // HUD
    this.hud = null;

    // Physics and effects
    this.windGenerator = null;
    this.timeManager = null;

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

      // Setup ballistics (computes rifle zero)
      await this.setupBallistics();

      // Setup scene
      this.setupScene();

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
    if (this.boundHandlers.onKeyDown)
    {
      window.removeEventListener('keydown', this.boundHandlers.onKeyDown);
    }
    if (this.boundHandlers.onPointerLockChange)
    {
      document.removeEventListener('pointerlockchange', this.boundHandlers.onPointerLockChange);
    }
    if (this.boundHandlers.onWindowResize)
    {
      window.removeEventListener('resize', this.boundHandlers.onWindowResize);
    }

    // Clean up factories
    ShotFactory.deleteAll();
    SteelTargetFactory.deleteAll();
    TargetRackFactory.deleteAll();
    DustCloudFactory.deleteAll();
    WindFlagFactory.deleteAll();
    RangeSignFactory.deleteAll();

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

    // Clean up Three.js objects
    if (this.landscape)
    {
      this.landscape.dispose();
      this.landscape = null;
    }
    
    // Dispose modules that own their own resources
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
      0.001,  // dt (1ms)
      1000,    // max_iterations (increased for spin effects)
      0.001,  // tolerance (1mm)
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
      bulletParams: {
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
  }

  // ===== SCENE SETUP =====

  setupScene()
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
    
    // Get aspect for element positioning
    const aspect = this.compositionRenderer.getAspect();
    
    // Create HUD overlay
    this.hud = new HUD({
      compositionScene: this.compositionRenderer.compositionScene,
      compositionCamera: this.compositionRenderer.compositionCamera
    });
    this.hud.updatePositions();

    // Create background 3D scene layer (covers full screen)
    this.backgroundElement = this.compositionRenderer.createElement(0, 0, 2 * aspect, 2,
    {
      renderOrder: 0
    });

    // Create fixed background camera (aspect ratio matches render target)
    this.backgroundCamera = new THREE.PerspectiveCamera(
      Config.CAMERA_FOV,
      this.backgroundElement.pixelWidth / this.backgroundElement.pixelHeight,
      0.1,
      Config.CAMERA_FAR_PLANE
    );
    this.backgroundCamera.position.set(0, Config.SHOOTER_HEIGHT, 0);
    this.backgroundCamera.lookAt(0, 0, -Config.CAMERA_FAR_PLANE);

    // Create landscape (uses Config.LANDSCAPE_CONFIG defaults)
    this.landscape = new Landscape(this.scene);


    // Initialize wind generator
    this.setupWindGenerator();

    // Create wind flags at configured positions
    this.createWindFlags();

    // Create scope layer (bottom-center, ~80% of screen height)
    const scopeHeightNorm = 1.6; // 80% of vertical span (2)
    const scopeWidthNorm = scopeHeightNorm; // square in virtual units
    const scopeY = -1 + scopeHeightNorm / 2; // bottom + half height
    this.scopeLayer = this.compositionRenderer.createElement(0, scopeY, scopeWidthNorm, scopeHeightNorm,
    {
      renderOrder: 1,
      transparent: true
    });

    this.scope = new Scope(
    {
      scene: this.scene,
      renderTarget: this.scopeLayer.renderTarget,
      renderer: this.scopeLayer.getRenderer(), // Must use the renderer that created the render target
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
        x: 0,
        y: scopeY
      },
      heightNormalized: scopeHeightNorm
    });
    this.camera = this.scope.getCamera(); // For raycasting

    // Create target racks (independent of scope setup)
    this.createTargetRacks();

    // When the scope layer's render target is resized by the composition
    // renderer, update the scope's internal render targets and camera aspect.
    this.scopeLayer.setResizeHandler((w, h) =>
    {
      this.scope.resizeRenderTargets(w, h);
    });

    // Setup raycaster for scope-based shooting
    this.raycaster = new THREE.Raycaster();

    // Setup event listeners
    this.setupEventListeners();

    // Ensure renderer uses the final CSS size on first layout
    this.onWindowResize();
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
    this.boundHandlers.onKeyDown = (e) => this.onKeyDown(e);
    this.boundHandlers.onPointerLockChange = () => this.onPointerLockChange();
    this.boundHandlers.onWindowResize = () => this.onWindowResize();

    // Add event listeners
    document.addEventListener('wheel', this.boundHandlers.onMouseWheel,
    {
      passive: false
    });
    this.canvas.addEventListener('mousemove', this.boundHandlers.onMouseMove);
    this.canvas.addEventListener('mousedown', this.boundHandlers.onMouseDown);
    window.addEventListener('keydown', this.boundHandlers.onKeyDown);
    document.addEventListener('pointerlockchange', this.boundHandlers.onPointerLockChange);
    window.addEventListener('resize', this.boundHandlers.onWindowResize);
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
      
      RangeSignFactory.create({
        position: signPosition,
        text: `${distanceYards} YD`,
        scene: this.scene
      });
    }
  }

  createWindFlags()
  {
    if (!this.landscape) return;

    // Create flags from configuration
    for (const flagConfig of Config.WIND_FLAGS)
    {
      const groundHeight = this.landscape.getHeightAt(flagConfig.x, flagConfig.z) || 0;
      
      WindFlagFactory.create({
        position: {
          x: flagConfig.x,
          y: groundHeight,
          z: flagConfig.z
        },
        scene: this.scene,
        config: flagConfig.config || {}
      });
    }
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

  onPointerLockChange()
  {
    const locked = document.pointerLockElement === this.canvas;
    this.scopeMode = locked;
    this.canvas.style.cursor = locked ? 'none' : 'default';
  }

  onKeyDown(event)
  {
    // Toggle scope display with S key
    if (event.key === 's' || event.key === 'S')
    {
      if (this.scopeLayer && this.scopeLayer._mesh)
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

    // Zoom controls: +/- or =/- keys (only when in scope mode)
    if (this.scopeMode)
    {
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
      // Shift + Arrow: 1.0 MRAD (10 clicks)
      // Arrow alone: 0.1 MRAD (1 click)
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

  // ===== SHOOTING =====

  fireFromScope()
  {
    if (!this.rifleZero)
    {
      console.warn('[fireFromScope] Rifle not zeroed yet');
      return;
    }

    const btk = this.btk;

    // Get scope camera
    const scopeCamera = this.scope.getCamera();

    // Scope position (eye level)
    const scopePosThree = scopeCamera.position;

    // Bore position is 2" below scope (bullet launches from bore, not scope)
    const boreOffset_m = -this.rifleZero.scopeHeight_m; // Negative Y because bore is below scope
    const borePosThree = new THREE.Vector3(
      scopePosThree.x,
      scopePosThree.y + boreOffset_m,
      scopePosThree.z
    );
    const borePos = new btk.Vector3D(
      borePosThree.x,
      borePosThree.y,
      borePosThree.z
    );

    // Apply MV variation (already in SI: m/s)
    const mvVariationMps = (Math.random() - 0.5) * 2.0 * this.mvSd_mps;
    const actualMVMps = this.mv_mps + mvVariationMps;

    // Get scope dial position (in MRAD)
    const dialPos = this.scope.getDialPositionMRAD();
    const dialElevationRad = dialPos.elevation * 0.001; // MRAD to radians
    const dialWindageRad = dialPos.windage * 0.001;     // MRAD to radians

    // Rifle accuracy as uniform distribution within a circle (diameter)
    // Generate random point within unit circle using rejection sampling
    let accuracyX, accuracyY;
    do
    {
      accuracyX = (Math.random() - 0.5) * 2.0; // -1 to 1
      accuracyY = (Math.random() - 0.5) * 2.0; // -1 to 1
    }
    while (accuracyX * accuracyX + accuracyY * accuracyY > 1.0);

    // Rifle accuracy already in radians
    const accuracyRadius = this.rifleAccuracy_rad / 2.0; // Convert diameter to radius
    const accuracyErrorH = accuracyX * accuracyRadius; // radians (horizontal/yaw)
    const accuracyErrorV = accuracyY * accuracyRadius; // radians (vertical/pitch)


    // Get zeroed velocity and rotate by scope orientation
    const zeroVel = this.rifleZero.zeroedVelocity;
    const zeroVelThree = new THREE.Vector3(zeroVel.x, zeroVel.y, zeroVel.z);
    zeroVelThree.applyQuaternion(scopeCamera.quaternion);

    // Normalize to get unit direction
    const zeroVelMag = zeroVelThree.length();
    const unitDir = zeroVelThree.normalize();

    // Apply dial and accuracy errors as small angular adjustments
    // Combine dial adjustments with accuracy errors
    // Note: Invert elevation sign - dialing up should raise impact point
    const totalYawAdjustment = dialWindageRad + accuracyErrorH;
    const totalPitchAdjustment = -dialElevationRad + accuracyErrorV;
    
    const cosYaw = Math.cos(totalYawAdjustment);
    const sinYaw = Math.sin(totalYawAdjustment);
    const cosPitch = Math.cos(totalPitchAdjustment);
    const sinPitch = Math.sin(totalPitchAdjustment);

    // Rotate unit direction: yaw around Y, then pitch around X
    const rx = unitDir.x * cosYaw - unitDir.z * sinYaw;
    const rz = unitDir.x * sinYaw + unitDir.z * cosYaw;
    const ry = unitDir.y;
    const ux = rx;
    const uy = ry * cosPitch + rz * sinPitch;
    const uz = -ry * sinPitch + rz * cosPitch;

    // Scale by actual MV (already in m/s) and create BTK velocity vector
    const initialVelocity = new btk.Vector3D(
      ux * actualMVMps,
      uy * actualMVMps,
      uz * actualMVMps
    );

    // Recompute spin rate based on actual MV (spin rate varies with MV, already in SI units)
    const spinRate = btk.Bullet.computeSpinRateFromTwist(actualMVMps, this.twist_mPerTurn);

    // Create shot from bore position (2" below scope)
    ShotFactory.create({
      initialPosition: borePos,
      initialVelocity: initialVelocity,
      bulletParams: {
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
    const targets = SteelTargetFactory.getAll();

    for (const shot of shots)
    {
      const trajectory = shot.getTrajectory();
      if (!trajectory) continue;

      let earliestHit = null;
      let earliestTarget = null;

      // Check against all targets
      for (const target of targets)
      {
        const hit = target.intersectTrajectory(trajectory);
        if (hit)
        {
          if (!earliestHit || hit.time_s_ < earliestHit.time_s_)
          {
            earliestHit = hit;
            earliestTarget = target;
          }
        }
      }

      // Apply earliest hit
      if (earliestHit && earliestTarget)
      {
        // Get the bullet state at impact from the TrajectoryPoint
        const impactBullet = earliestHit.getState();
        const impactPosition = impactBullet.getPosition();

        // Apply impact to target
        earliestTarget.hit(impactBullet);

        // Create dust cloud at impact position
        this.createMetallicDustCloud(impactPosition);

        // Mark shot as dead
        shot.markDead();

        // Cleanup
        impactPosition.delete();
        earliestHit.delete();
      }
    }
  }

  checkBulletGroundCollisions()
  {
    const shots = ShotFactory.getShots();
    const btk = this.btk;

    for (const shot of shots)
    {
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

        // Search backward from current time
        for (let t = currentTime; t >= 0; t -= searchStep)
        {
          const optPoint = trajectory.atTime(t);
          if (optPoint !== undefined && optPoint !== null)
          {
            const testPos = optPoint.getState().getPosition();
            if (testPos.y >= 0)
            {
              // Found the crossing point - use this position
              impactPoint = new btk.Vector3D(testPos.x, 0, testPos.z); // Clamp y to 0

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
        impactPoint.delete();

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

    // Render background scene into element's render target
    this.backgroundElement.render(this.scene, this.backgroundCamera,
    {
      clear: true,
      clearColor: 0x87ceeb
    });

    // Render scope (composites 3D scene + reticle into its render target)
    this.scope.render();

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
    // Load BTK if not already loaded (required for getGameParams)
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

    // Populate wind preset dropdown now that BTK is loaded
    populateWindPresetDropdown();
    
    // Reload cookies after dropdown is populated to restore saved wind preset
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

    // Populate wind preset dropdown now that BTK is loaded
    populateWindPresetDropdown();
    
    // Reload cookies after dropdown is populated to restore saved wind preset
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
}

// ===== START =====

document.addEventListener('DOMContentLoaded', () =>
{
  setupUI();
  
  // Load saved settings from cookies (after wind presets are populated)
  SettingsCookies.loadAll();
  
  // Attach auto-save listeners to all settings inputs
  SettingsCookies.attachAutoSave();
  
  // Don't auto-start - wait for Start button
});
