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

// ===== GLOBAL STATE =====
let btk = null;
let scene, camera;
let compositionRenderer = null;
let backgroundElement = null;
let scope = null;
let backgroundCamera = null; // Fixed camera for background scene
let raycaster;
let animationId = null;
let lastTime = performance.now();
let landscape = null;
let scopeMode = false; // Whether mouse is controlling the scope
let scopeLayer = null; // Store scope layer for bounds checking
let windGenerator = null; // BTK WindGenerator instance
let windStartTime = null; // Track elapsed time for wind generator

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
  windStartTime = performance.now() / 1000; // Track start time in seconds

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
      y: 0,
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

function createBullet(impactPoint, shooterPos)
{
  // All positions are btk.Vector3D (SI units)
  const direction = new btk.Vector3D(
    impactPoint.x - shooterPos.x,
    impactPoint.y - shooterPos.y,
    impactPoint.z - shooterPos.z
  );
  const directionNorm = direction.normalized();
  // Velocity is already in m/s from Config, just scale direction vector
  const bulletVel = new btk.Vector3D(
    directionNorm.x * Config.BULLET_SPEED_MPS,
    directionNorm.y * Config.BULLET_SPEED_MPS,
    directionNorm.z * Config.BULLET_SPEED_MPS
  );

  const bulletPos = new btk.Vector3D(impactPoint.x, impactPoint.y, impactPoint.z);

  const baseBullet = new btk.Bullet(
    Config.BULLET_MASS,
    Config.BULLET_DIAMETER,
    Config.BULLET_LENGTH,
    Config.BULLET_BC,
    btk.DragFunction.G7
  );

  const bullet = new btk.Bullet(baseBullet, bulletPos, bulletVel, 0);

  // Cleanup temporary objects (bullet owns bulletPos and bulletVel)
  baseBullet.delete();
  direction.delete();
  directionNorm.delete();

  return bullet;
}

function fireFromScope()
{
  // Cast ray from scope camera center (reticle crosshair)
  const scopeCamera = scope.getCamera();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), scopeCamera);

  // Check for target hit
  const allTargets = TargetRackFactory.getAllTargets();
  const intersects = allTargets.length > 0 ? raycaster.intersectObjects(allTargets.map(t => t.mesh)) : [];
  if (intersects.length > 0)
  {
    const hitTarget = allTargets.find(t => t.mesh === intersects[0].object);
    if (hitTarget)
    {
      // Three.js scene is in meters (SI units) - no conversion needed
      const impactPointThree = intersects[0].point;
      const impactPoint = new btk.Vector3D(
        impactPointThree.x,
        impactPointThree.y,
        impactPointThree.z
      );
      const shooterPos = new btk.Vector3D(
        scopeCamera.position.x,
        scopeCamera.position.y,
        scopeCamera.position.z
      );

      const bullet = createBullet(impactPoint, shooterPos);

      hitTarget.hitBullet(bullet);
      hitTarget.updateTexture();
      createMetallicDustCloud(impactPoint);

      // Cleanup
      bullet.delete();
      impactPoint.delete();
      shooterPos.delete();
      return;
    }
  }

  // No target hit - check landscape
  if (landscape)
  {
    const landscapeIntersect = landscape.intersectRaycaster(raycaster);
    if (landscapeIntersect)
    {
      createDustCloud(landscapeIntersect.point);
    }
  }
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

function animate()
{
  animationId = requestAnimationFrame(animate);

  const currentTime = performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 1 / 30);
  lastTime = currentTime;

  // Advance wind generator time
  if (windGenerator && windStartTime !== null)
  {
    const elapsedTime = (currentTime / 1000) - windStartTime;
    windGenerator.advanceTime(elapsedTime);
  }

  SteelTargetFactory.updateAll(dt);
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