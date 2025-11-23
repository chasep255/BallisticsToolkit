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

// ===== GLOBAL STATE =====
let btk = null;
let scene, camera;
let compositionRenderer = null;
let backgroundElement = null;
let scope = null;
let backgroundCamera = null; // Fixed camera for background scene
let raycaster;
let animationId = null;
let timeManager = null;
let landscape = null;
let scopeMode = false; // Whether mouse is controlling the scope
let scopeLayer = null; // Store scope layer for bounds checking
let windGenerator = null; // BTK WindGenerator instance
let rifleZero = null; // Zeroed bullet configuration

// ===== COORDINATE SYSTEM =====
// BTK and Three.js use the SAME coordinate system:
// X=crossrange (positive = right), Y=up, Z=-downrange (negative = downrange)
// All internal values are in SI units (meters, m/s, kg, radians)

// ===== INITIALIZATION =====

async function init()
{
  try
  {
    btk = await BallisticsToolkit();
    window.btk = btk;

    // Initialize config with SI unit values
    initConfig();

    // Initialize time manager
    timeManager = new TimeManager();
    timeManager.start();

    // Compute rifle zero
    computeRifleZero();

    setupScene();
    setupUI();
    animate();
  }
  catch (e)
  {
    console.error('Failed to initialize:', e);
    showError('Failed to load steel simulator. Please refresh the page.');
  }
}

// ===== SCENE SETUP =====

function setupScene()
{
  const canvas = document.getElementById('steelCanvas');

  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  // Setup lighting first
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(0, 0, 1000);
  scene.add(directionalLight);

  // Setup composition renderer
  compositionRenderer = new CompositionRenderer(
  {
    canvas
  });

  // Create background 3D scene layer (covers full screen)
  const aspect = compositionRenderer.getAspect();
  backgroundElement = compositionRenderer.createElement(0, 0, 2 * aspect, 2,
  {
    renderOrder: 0
  });

  // Create fixed background camera (aspect ratio matches render target)
  backgroundCamera = new THREE.PerspectiveCamera(
    Config.CAMERA_FOV,
    backgroundElement.pixelWidth / backgroundElement.pixelHeight,
    0.1,
    Config.CAMERA_FAR_PLANE
  );
  backgroundCamera.position.set(0, Config.SHOOTER_HEIGHT, 0);
  backgroundCamera.lookAt(0, 0, -Config.CAMERA_FAR_PLANE);

  // Create landscape (uses Config.LANDSCAPE_CONFIG defaults)
  landscape = new Landscape(scene);

  // Initialize wind generator
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

  const windPresetName = presetNames.includes(Config.WIND_CONFIG.defaultPreset) ? Config.WIND_CONFIG.defaultPreset : presetNames[0];
  windGenerator = btk.WindPresets.getPreset(windPresetName, minCorner, maxCorner);

  // Clean up temporary vectors
  minCorner.delete();
  maxCorner.delete();

  // Create wind flags along the range
  // All values in meters (SI units) - conversion to yards happens inside createFlags
  WindFlagFactory.createFlags(scene, landscape,
  {
    maxRange: Config.LANDSCAPE_CONFIG.groundLength, // meters
    interval: Config.WIND_FLAG_CONFIG.interval, // meters
    sideOffset: Config.LANDSCAPE_CONFIG.groundWidth / 2 // meters
  });

  // Create scope layer (bottom-center, ~80% of screen height)
  const scopeHeightNorm = 1.6; // 80% of vertical span (2)
  const scopeWidthNorm = scopeHeightNorm; // square in virtual units
  const scopeY = -1 + scopeHeightNorm / 2; // bottom + half height
  scopeLayer = compositionRenderer.createElement(0, scopeY, scopeWidthNorm, scopeHeightNorm,
  {
    renderOrder: 1,
    transparent: true
  });

  scope = new Scope(
  {
    scene,
    renderTarget: scopeLayer.renderTarget,
    renderer: scopeLayer.getRenderer(), // Must use the renderer that created the render target
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
  camera = scope.getCamera(); // For raycasting

  // Create target racks (independent of scope setup)
  createTargetRacks();

  // When the scope layer's render target is resized by the composition
  // renderer, update the scope's internal render targets and camera aspect.
  scopeLayer.setResizeHandler((w, h) =>
  {
    scope.resizeRenderTargets(w, h);
  });

  // Setup raycaster for scope-based shooting
  raycaster = new THREE.Raycaster();

  // Event listeners
  document.addEventListener('wheel', onMouseWheel,
  {
    passive: false
  });
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  window.addEventListener('resize', onWindowResize);

  // Initialize time manager
  timeManager = new TimeManager();
  timeManager.start();

  // Ensure renderer uses the final CSS size on first layout
  onWindowResize();
}

function onWindowResize()
{
  const canvas = document.getElementById('steelCanvas');
  if (!canvas || !compositionRenderer) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  // Resize main renderer, composition camera, and all layer render targets.
  // Layer-specific resize callbacks (like Scope) are invoked by the
  // CompositionRenderer itself.
  compositionRenderer.handleResize(width, height);
}

// ===== TARGET RACK CREATION =====

function addTargetRack(x, z, rackWidth, rackHeight, targets)
{
  if (!landscape) throw new Error('Landscape must be initialized');

  const groundHeight = landscape.getHeightAt(x, z) || 0;
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
    scene
  });

  targets.forEach(target => rack.addTarget(target));
  return rack;
}

function createTargetRacks()
{
  if (!landscape) return;

  // Create target racks from configuration
  for (const rackConfig of Config.TARGET_RACKS_CONFIG)
  {
    addTargetRack(rackConfig.x, rackConfig.z, rackConfig.rackWidth, rackConfig.rackHeight, rackConfig.targets);
  }
}

// ===== UI SETUP =====

function setupUI()
{
  const resetBtn = document.getElementById('resetBtn');
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.querySelector('.help-close');

  resetBtn.addEventListener('click', resetTarget);
  helpBtn.addEventListener('click', () => helpModal.style.display = 'block');

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

// ===== EVENT HANDLERS =====

function onMouseWheel(event)
{
  const canvas = document.getElementById('steelCanvas');
  const locked = document.pointerLockElement === canvas;

  // Only intercept wheel when the scope has pointer lock (scope mode)
  if (!locked || !scopeMode)
  {
    return; // allow normal page scrolling
  }

  event.preventDefault();

  if (event.deltaY < 0)
  {
    scope.zoomIn();
  }
  else
  {
    scope.zoomOut();
  }
}

function onMouseMove(event)
{
  const canvas = event.target;

  if (scopeMode && document.pointerLockElement === canvas)
  {
    // Pan scope based on relative mouse movement:
    // 1) pixels → normalized composition delta
    // 2) normalized delta → yaw/pitch via Scope
    const deltaX = event.movementX || 0;
    const deltaY = event.movementY || 0;
    if (deltaX !== 0 || deltaY !== 0)
    {
      const normDelta = compositionRenderer.movementToNormalized(deltaX, deltaY);
      const
      {
        deltaYaw,
        deltaPitch
      } = scope.normalizedDeltaToAngles(normDelta.x, normDelta.y);
      scope.panBy(deltaYaw, deltaPitch);
    }
  }
}

function onMouseDown(event)
{
  const canvas = event.target;
  const norm = compositionRenderer.screenToNormalized(event.clientX, event.clientY);
  const locked = document.pointerLockElement === canvas;

  if (event.button === 0) // Left click
  {
    if (locked)
    {
      // Fire when clicking in scope mode
      fireFromScope();
    }
    else if (scope.isPointInside(norm.x, norm.y))
    {
      // Enter scope mode when clicking on scope.
      // Let pointerlockchange handler update scopeMode.
      canvas.requestPointerLock();
    }
  }
}

function onPointerLockChange()
{
  const canvas = document.getElementById('steelCanvas');
  const locked = document.pointerLockElement === canvas;
  scopeMode = locked;
  canvas.style.cursor = locked ? 'none' : 'default';
}

function onKeyDown(event)
{
  // Toggle scope display with S key
  if (event.key === 's' || event.key === 'S')
  {
    if (scopeLayer && scopeLayer._mesh)
    {
      scopeLayer._mesh.visible = !scopeLayer._mesh.visible;
    }
    return;
  }

  // Exit scope mode with Escape
  if (event.key === 'Escape')
  {
    if (scopeMode)
    {
      document.exitPointerLock();
    }
    return;
  }

  // Zoom controls: +/- or =/- keys (only when in scope mode)
  if (scopeMode)
  {
    if (event.key === '=' || event.key === '+')
    {
      event.preventDefault();
      scope.zoomIn();
      return;
    }
    if (event.key === '-' || event.key === '_')
    {
      event.preventDefault();
      scope.zoomOut();
      return;
    }
  }
}

// ===== RIFLE ZEROING =====

/**
 * Compute rifle zero at 100 yards with 2" scope height
 * Stores a zeroed bullet configuration that can be rotated for shots
 */
function computeRifleZero()
{
  // Create base bullet from config
  const baseBullet = new btk.Bullet(
    Config.BULLET_MASS,
    Config.BULLET_DIAMETER,
    Config.BULLET_LENGTH,
    Config.BULLET_BC,
    btk.DragFunction.G7
  );

  // Create atmosphere (standard conditions)
  const atmosphere = new btk.Atmosphere();

  // Zero range: 100 yards downrange
  const zeroRange_m = btk.Conversions.yardsToMeters(100);
  
  // Scope height: 2 inches above bore
  const scopeHeight_m = btk.Conversions.inchesToMeters(2);

  // Target position in LOCAL coordinates (origin at bore)
  // Target is at scope height above bore, at zero range downrange
  const targetPos = new btk.Vector3D(0, scopeHeight_m, -zeroRange_m);

  // Muzzle velocity from config
  const muzzleVel_mps = Config.BULLET_SPEED_MPS;

  // Use BTK's computeZero to find the launch angle that makes the bullet
  // pass 2" above the bore at 100 yards with NO wind.
  const simulator = new btk.BallisticsSimulator();
  simulator.setInitialBullet(baseBullet);
  simulator.setAtmosphere(atmosphere);

  // Zero with no wind
  const zeroWind = new btk.Vector3D(0, 0, 0);
  simulator.setWind(zeroWind);
  zeroWind.delete();

  const zeroedBullet = simulator.computeZero(
    muzzleVel_mps,
    targetPos,
    0.001,  // dt (1ms)
    20,     // max_iterations
    0.001,  // tolerance (1mm)
    0.0     // spin_rate
  );

  // Store the zeroed configuration
  rifleZero = {
    bullet: baseBullet,
    zeroedVelocity: zeroedBullet.getVelocity(),
    atmosphere: atmosphere,
    scopeHeight_m: scopeHeight_m
  };


  // Cleanup
  targetPos.delete();
  simulator.delete();
}


function fireFromScope()
{
  if (!rifleZero)
  {
    console.warn('[fireFromScope] Rifle not zeroed yet');
    return;
  }

  // Get scope camera
  const scopeCamera = scope.getCamera();

  // Scope position (eye level)
  const scopePosThree = scopeCamera.position;
  
  // Bore position is 2" below scope (bullet launches from bore, not scope)
  const boreOffset_m = -rifleZero.scopeHeight_m; // Negative Y because bore is below scope
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

  // Rotate the zeroed velocity by the scope's orientation.
  // Zeroed velocity is defined in local bore frame pointing "straight ahead" for the zero.
  const zeroVel = rifleZero.zeroedVelocity;
  const zeroVelThree = new THREE.Vector3(zeroVel.x, zeroVel.y, zeroVel.z);
  zeroVelThree.applyQuaternion(scopeCamera.quaternion);
  const initialVelocity = new btk.Vector3D(zeroVelThree.x, zeroVelThree.y, zeroVelThree.z);

  // Create bullet params
  const bulletParams = {
    mass: Config.BULLET_MASS,
    diameter: Config.BULLET_DIAMETER,
    length: Config.BULLET_LENGTH,
    bc: Config.BULLET_BC,
    dragFunction: 'G7'
  };

  // Create shot from bore position (2" below scope)
  ShotFactory.create({
    initialPosition: borePos,
    initialVelocity: initialVelocity,
    bulletParams: bulletParams,
    atmosphere: rifleZero.atmosphere,
    windGenerator: windGenerator,
    scene: scene,
    shadowsEnabled: true
  });

}

// ===== DUST CLOUD EFFECTS =====

function createDustCloud(impactPoint)
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
    scene,
    numParticles: Config.GROUND_DUST_CONFIG.numParticles,
    color: Config.GROUND_DUST_CONFIG.color,
    windGenerator: windGenerator,
    initialRadius: Config.GROUND_DUST_CONFIG.initialRadius, // Already in meters from config
    growthRate: Config.GROUND_DUST_CONFIG.growthRate, // Already in m/s from config
    particleDiameter: Config.GROUND_DUST_CONFIG.particleDiameter // Already in meters from config
  });
}

function createMetallicDustCloud(impactPoint)
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
    scene,
    numParticles: Config.METAL_DUST_CONFIG.numParticles,
    color: Config.METAL_DUST_CONFIG.color,
    windGenerator: windGenerator,
    initialRadius: Config.METAL_DUST_CONFIG.initialRadius, // Already in meters from config
    growthRate: Config.METAL_DUST_CONFIG.growthRate, // Already in m/s from config
    particleDiameter: Config.METAL_DUST_CONFIG.particleDiameter // Already in meters from config
  });
}

// ===== RESET =====

function resetTarget()
{
  TargetRackFactory.deleteAll();
  DustCloudFactory.deleteAll();
  createTargetRacks();
}

// ===== ANIMATION LOOP =====

// ===== COLLISION DETECTION =====

/**
 * Check for bullet-target collisions
 */
function checkBulletTargetCollisions()
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
      const hit = target.steelTarget.intersectTrajectory(trajectory);
      if (hit !== undefined && hit !== null)
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

      // Debug: Print first point in trajectory
      const trajectory = shot.getTrajectory();

      // Apply impact to target
      earliestTarget.steelTarget.hit(impactBullet);
      earliestTarget.updateTexture();

      // Create dust cloud at impact position
      createMetallicDustCloud(impactPosition);

      // Mark shot as dead
      shot.markDead();

      // Cleanup
      impactPosition.delete();
      earliestHit.delete();
    }
  }
}

/**
 * Check for bullet-ground collisions
 */
function checkBulletGroundCollisions()
{
  const shots = ShotFactory.getShots();

  for (const shot of shots)
  {
    const currentBullet = shot.getCurrentBullet();
    if (!currentBullet) continue;

    const pos = currentBullet.getPosition();
    
    // Check if bullet is below ground (y < 0)
    if (pos.y < 0)
    {
      // Step back through trajectory to find where it crossed y=0
      const trajectory = shot.getTrajectory();
      if (trajectory)
      {
        
        const currentTime = shot.currentTime;
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
        if (impactPoint)
        {
          createDustCloud(impactPoint);
          impactPoint.delete();
        }
        else
        {
          // Fallback: use current position clamped to ground
          const fallbackPoint = new btk.Vector3D(pos.x, 0, pos.z);
          createDustCloud(fallbackPoint);
          fallbackPoint.delete();
        }
      }

      // Mark shot as dead (will be disposed by ShotFactory.updateAll)
      shot.markDead();
    }

    pos.delete();
  }
}

// ===== MAIN ANIMATION LOOP =====

function animate()
{
  animationId = requestAnimationFrame(animate);

  // Update time manager
  timeManager.update();
  const dt = timeManager.getDeltaTime();

  // Break dt into fixed-size substeps (max 5ms each)
  const numSubsteps = Math.ceil(dt / Config.INTEGRATION_STEP_S);
  const stepDt = dt / numSubsteps;

  for (let i = 0; i < numSubsteps; i++)
  {
    // Update wind generator time
    if (windGenerator)
    {
      windGenerator.advanceTime(timeManager.getElapsedTime());
    }

    // Update active bullets (physics)
    ShotFactory.updateAll(stepDt);

    // Check collisions
    checkBulletTargetCollisions();
    checkBulletGroundCollisions();

    // Clean up dead shots
    ShotFactory.cleanupDeadShots();

    // Step all steel target physics
    SteelTargetFactory.stepPhysics(stepDt);
  }

  // Update visual animations
  ShotFactory.updateAnimations();
  SteelTargetFactory.updateDisplay();
  DustCloudFactory.updateAll(windGenerator, dt);
  WindFlagFactory.updateAll(windGenerator, dt);

  // Render background scene into element's render target
  backgroundElement.render(scene, backgroundCamera,
  {
    clear: true,
    clearColor: 0x87ceeb
  });

  // Render scope (composites 3D scene + reticle into its render target)
  scope.render();

  // Composite everything to screen
  compositionRenderer.render();
}

// ===== ERROR HANDLING =====

function showError(message)
{
  const errorDiv = document.getElementById('error');
  if (errorDiv)
  {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

// ===== START =====

document.addEventListener('DOMContentLoaded', init);