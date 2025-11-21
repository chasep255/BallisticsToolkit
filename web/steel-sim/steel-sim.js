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
import * as Config from './config.js';

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

// ===== COORDINATE CONVERSION UTILITIES =====
// BTK: X=downrange, Y=crossrange-right, Z=up
// Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)

// ===== POSITION CONVERSIONS (Distance) =====
// Positions: BTK uses meters, Three.js uses yards

/**
 * Convert BTK Vector3D position (meters, BTK coords) to THREE.Vector3 (yards, Three.js coords)
 * @param {btk.Vector3D} btkVec - Position vector in BTK coordinates (meters)
 * @returns {THREE.Vector3} Position vector in Three.js coordinates (yards)
 */
window.btkToThreeJsPosition = function(btkVec)
{
  // Coordinate system conversion and meters to yards
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: BTK (x, y, z) → Three.js (y, z, -x)
  return new THREE.Vector3(
    btk.Conversions.metersToYards(btkVec.y), // BTK Y (crossrange-right) → Three.js X (right)
    btk.Conversions.metersToYards(btkVec.z), // BTK Z (up) → Three.js Y (up)
    -btk.Conversions.metersToYards(btkVec.x) // BTK X (downrange) → Three.js -Z (downrange)
  );
};

/**
 * Convert THREE.Vector3 position (yards, Three.js coords) to BTK Vector3D (meters, BTK coords)
 * @param {THREE.Vector3|Object} threeVec - Position vector in Three.js coordinates (yards)
 * @returns {btk.Vector3D} Position vector in BTK coordinates (meters)
 */
window.threeJsToBtkPosition = function(threeVec)
{
  // Convert yards to meters and coordinate system conversion
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: Three.js (x, y, z) → BTK (-z, x, y)
  return new btk.Vector3D(
    -btk.Conversions.yardsToMeters(threeVec.z), // Three.js Z (downrange) → BTK X (downrange)
    btk.Conversions.yardsToMeters(threeVec.x), // Three.js X (right) → BTK Y (crossrange-right)
    btk.Conversions.yardsToMeters(threeVec.y) // Three.js Y (up) → BTK Z (up)
  );
};

// ===== VELOCITY CONVERSIONS =====
// Velocities: BTK uses m/s, Three.js uses fps or mph

/**
 * Convert BTK Vector3D velocity (m/s, BTK coords) to THREE.Vector3 (fps, Three.js coords)
 * @param {btk.Vector3D} btkVec - Velocity vector in BTK coordinates (m/s)
 * @returns {THREE.Vector3} Velocity vector in Three.js coordinates (fps)
 */
window.btkToThreeJsVelocity = function(btkVec)
{
  // Coordinate system conversion and m/s to fps
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: BTK (x, y, z) → Three.js (y, z, -x)
  return new THREE.Vector3(
    btk.Conversions.mpsToFps(btkVec.y), // BTK Y (crossrange-right) → Three.js X (right)
    btk.Conversions.mpsToFps(btkVec.z), // BTK Z (up) → Three.js Y (up)
    -btk.Conversions.mpsToFps(btkVec.x) // BTK X (downrange) → Three.js -Z (downrange)
  );
};

/**
 * Convert THREE.Vector3 velocity (fps, Three.js coords) to BTK Vector3D (m/s, BTK coords)
 * @param {THREE.Vector3|Object} threeVec - Velocity vector in Three.js coordinates (fps)
 * @returns {btk.Vector3D} Velocity vector in BTK coordinates (m/s)
 */
window.threeJsToBtkVelocity = function(threeVec)
{
  // Convert fps to m/s and coordinate system conversion
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: Three.js (x, y, z) → BTK (-z, x, y)
  return new btk.Vector3D(
    -btk.Conversions.fpsToMps(threeVec.z), // Three.js Z (downrange) → BTK X (downrange)
    btk.Conversions.fpsToMps(threeVec.x), // Three.js X (right) → BTK Y (crossrange-right)
    btk.Conversions.fpsToMps(threeVec.y) // Three.js Y (up) → BTK Z (up)
  );
};

/**
 * Convert BTK Vector3D velocity (m/s, BTK coords) to THREE.Vector3 (mph, Three.js coords)
 * @param {btk.Vector3D} btkVec - Velocity vector in BTK coordinates (m/s)
 * @returns {THREE.Vector3} Velocity vector in Three.js coordinates (mph)
 */
window.btkToThreeJsVelocityMph = function(btkVec)
{
  // Coordinate system conversion and m/s to mph
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: BTK (x, y, z) → Three.js (y, z, -x)
  return new THREE.Vector3(
    btk.Conversions.mpsToMph(btkVec.y), // BTK Y (crossrange-right) → Three.js X (right)
    btk.Conversions.mpsToMph(btkVec.z), // BTK Z (up) → Three.js Y (up)
    -btk.Conversions.mpsToMph(btkVec.x) // BTK X (downrange) → Three.js -Z (downrange)
  );
};

/**
 * Convert THREE.Vector3 velocity (mph, Three.js coords) to BTK Vector3D (m/s, BTK coords)
 * @param {THREE.Vector3|Object} threeVec - Velocity vector in Three.js coordinates (mph)
 * @returns {btk.Vector3D} Velocity vector in BTK coordinates (m/s)
 */
window.threeJsToBtkVelocityMph = function(threeVec)
{
  // Convert mph to m/s and coordinate system conversion
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: Three.js (x, y, z) → BTK (-z, x, y)
  return new btk.Vector3D(
    -btk.Conversions.mphToMps(threeVec.z), // Three.js Z (downrange) → BTK X (downrange)
    btk.Conversions.mphToMps(threeVec.x), // Three.js X (right) → BTK Y (crossrange-right)
    btk.Conversions.mphToMps(threeVec.y) // Three.js Y (up) → BTK Z (up)
  );
};

// ===== INITIALIZATION =====

async function init()
{
  try
  {
    btk = await BallisticsToolkit();
    window.btk = btk;

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

  // Create target racks first to determine max range
  createTargetRacks();

  // Find furthest target rack position (most negative Z = furthest downrange)
  const allRacks = TargetRackFactory.getAll();
  let maxRangeDistance = 0;
  let maxRangeRackHeight = 2; // Default rack height
  if (allRacks.length > 0)
  {
    maxRangeDistance = Math.min(...allRacks.map(rack => rack.center.z)); // Most negative Z
    maxRangeRackHeight = Math.max(...allRacks.map(rack => rack.height)); // Use tallest rack height
  }

  // Compute max range target center height for initial scope aim
  const maxRangeGroundHeight = landscape.getHeightAt(0, maxRangeDistance) || 0;
  const maxRangeTargetCenterY = maxRangeGroundHeight + maxRangeRackHeight / 2;

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
      y: maxRangeTargetCenterY,
      z: maxRangeDistance
    },
    centerNormalized:
    {
      x: 0,
      y: scopeY
    },
    heightNormalized: scopeHeightNorm
  });
  camera = scope.getCamera(); // For raycasting

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
  const direction = impactPoint.clone().sub(shooterPos).normalize();
  const bulletSpeedFps = btk.Conversions.mpsToFps(Config.BULLET_SPEED_MPS);
  const bulletVelThree = direction.multiplyScalar(bulletSpeedFps);

  const bulletPos = window.threeJsToBtkPosition(impactPoint);
  const bulletVel = window.threeJsToBtkVelocity(bulletVelThree);

  const baseBullet = new btk.Bullet(
    Config.BULLET_MASS,
    Config.BULLET_DIAMETER,
    Config.BULLET_LENGTH,
    Config.BULLET_BC,
    btk.DragFunction.G7
  );

  const bullet = new btk.Bullet(baseBullet, bulletPos, bulletVel, 0);

  // Cleanup base objects
  baseBullet.delete();
  bulletPos.delete();
  bulletVel.delete();

  return bullet;
}

function fireFromScope()
{
  const allTargets = TargetRackFactory.getAllTargets();
  if (allTargets.length === 0) return;

  // Cast ray from scope camera center (reticle crosshair)
  const scopeCamera = scope.getCamera();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), scopeCamera);

  // Check for target hit
  const intersects = raycaster.intersectObjects(allTargets.map(t => t.mesh));
  if (intersects.length > 0)
  {
    const hitTarget = allTargets.find(t => t.mesh === intersects[0].object);
    if (hitTarget)
    {
      const impactPoint = intersects[0].point;
      const bullet = createBullet(impactPoint, scopeCamera.position);

      hitTarget.hitBullet(bullet);
      hitTarget.updateTexture();
      createMetallicDustCloud(impactPoint);

      bullet.delete();
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

function createDustCloud(impactPointThree)
{
  DustCloudFactory.create(
  {
    position: impactPointThree,
    scene,
    numParticles: Config.GROUND_DUST_CONFIG.numParticles,
    color: Config.GROUND_DUST_CONFIG.color,
    wind: Config.WIND_MPH,
    initialRadius: btk.Conversions.inchesToYards(Config.GROUND_DUST_CONFIG.initialRadius),
    growthRate: Config.GROUND_DUST_CONFIG.growthRate,
    particleDiameter: btk.Conversions.inchesToYards(Config.GROUND_DUST_CONFIG.particleDiameter)
  });
}

function createMetallicDustCloud(impactPointThree)
{
  DustCloudFactory.create(
  {
    position: impactPointThree,
    scene,
    numParticles: Config.METAL_DUST_CONFIG.numParticles,
    color: Config.METAL_DUST_CONFIG.color,
    wind: Config.WIND_MPH,
    initialRadius: btk.Conversions.inchesToYards(Config.METAL_DUST_CONFIG.initialRadius),
    growthRate: Config.METAL_DUST_CONFIG.growthRate,
    particleDiameter: btk.Conversions.inchesToYards(Config.METAL_DUST_CONFIG.particleDiameter)
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

  SteelTargetFactory.updateAll(dt);
  DustCloudFactory.updateAll(dt);

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