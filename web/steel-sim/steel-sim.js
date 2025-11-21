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

// ===== CONSTANTS =====
const SHOOTER_HEIGHT = 1; // yards
const CAMERA_FOV = 50;
const CAMERA_FAR_PLANE = 3000; // Must be > ground length (2000 yards)

const BULLET_MASS = 0.00907; // 140 grains in kg
const BULLET_DIAMETER = 0.00762; // .308 caliber in meters
const BULLET_LENGTH = 0.0305; // ~30mm typical
const BULLET_BC = 0.3;
const BULLET_SPEED_MPS = 800; // m/s

const WIND_MPH = {
  x: 1.1,
  y: 0.0,
  z: 0.45
}; // Slight crosswind and downrange

const GROUND_DUST_CONFIG = {
  numParticles: 1000,
  color:
  {
    r: 139,
    g: 115,
    b: 85
  }, // Brown/tan
  initialRadius: 0.25, // inches
  growthRate: 0.5, // feet/second
  fadeRate: 0.5,
  particleDiameter: 0.2 // inches
};

const METAL_DUST_CONFIG = {
  numParticles: 1000,
  color:
  {
    r: 192,
    g: 192,
    b: 192
  }, // Silver/gray
  initialRadius: 0.5, // inches
  growthRate: 0.5, // feet/second
  fadeRate: 0.5,
  particleDiameter: 0.2 // inches
};

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
    CAMERA_FOV,
    backgroundElement.pixelWidth / backgroundElement.pixelHeight,
    0.1,
    CAMERA_FAR_PLANE
  );
  backgroundCamera.position.set(0, SHOOTER_HEIGHT, 0);
  backgroundCamera.lookAt(0, 0, -CAMERA_FAR_PLANE);

  // Create landscape
  landscape = new Landscape(scene,
  {
    groundWidth: 100,
    groundLength: 2000,
    brownGroundWidth: 500,
    brownGroundLength: 2000,
    slopeAngle: 5
  });

  // Compute 1000-yard target center height for initial scope aim
  const THOUSAND_YARDS = 1000;
  const THOUSAND_RACK_HEIGHT = 2; // matches createTargetRacks
  const thousandGroundHeight = landscape.getHeightAt(0, -THOUSAND_YARDS) || 0;
  const thousandTargetCenterY = thousandGroundHeight + THOUSAND_RACK_HEIGHT / 2;

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
    initialFOV: 30,
    minFOV: 1,
    maxFOV: 30,
    cameraPosition:
    {
      x: 0,
      y: SHOOTER_HEIGHT,
      z: 0
    },
    initialLookAt:
    {
      x: 0,
      y: thousandTargetCenterY,
      z: -THOUSAND_YARDS
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

  // Create target racks
  createTargetRacks();

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

  addTargetRack(0, -200, 1.5, 1,
  [
    {
      width: 5,
      height: 5,
      thickness: 0.25,
      isOval: false
    },
    {
      width: 4,
      height: 4,
      thickness: 0.25,
      isOval: false
    },

    {
      width: 3,
      height: 3,
      thickness: 0.25,
      isOval: false
    },
    {
      width: 2,
      height: 2,
      thickness: 0.25,
      isOval: false
    }
  ]);

  addTargetRack(10, -225, 1.5, 1,
  [
    {
      width: 5,
      height: 6,
      thickness: 0.25,
      isOval: true
    },
    {
      width: 4,
      height: 6,
      thickness: 0.25,
      isOval: true
    },

    {
      width: 3,
      height: 6,
      thickness: 0.25,
      isOval: true
    },
    {
      width: 2,
      height: 6,
      thickness: 0.25,
      isOval: true
    }
  ]);

  addTargetRack(-5, -1000, 2, 1,
    [
      {
        width: 20,
        height: 20,
        thickness: 0.25,
        isOval: true
      },
      {
        width: 15,
        height: 15,
        thickness: 0.25,
        isOval: true
      },
  
      {
        width: 10,
        height: 10,
        thickness: 0.25,
        isOval: true
      }
    ]);

  // // Create target racks every 100 yards from 100 to 1000 yards
  // // Use alternating crossrange offsets to spread them out visually
  // const crossrangeOffsets = [0, 20, -20, 30, -30, 25, -25, 15, -15, 0]; // Pattern for 10 racks

  // for (let i = 0; i < 10; i++)
  // {
  //   const distanceYards = 100 + (i * 100); // 100, 200, 300, ..., 1000
  //   const crossrangeOffset = crossrangeOffsets[i];

  //   // Target sizes scale with distance for appropriate difficulty
  //   // At 100 yards: 6-12 inch targets
  //   // At 1000 yards: 36 inch (1 yard) targets
  //   const baseSize = 6 + (distanceYards / 1000) * 30; // Linear scaling from 6" to 36"

  //   const targets = [
  //   {
  //     width: baseSize * 1.5,
  //     height: baseSize * 1.5,
  //     thickness: 0.25,
  //     isOval: false
  //   },
  //   {
  //     width: baseSize,
  //     height: baseSize,
  //     thickness: 0.25,
  //     isOval: true
  //   },
  //   {
  //     width: baseSize * 0.75,
  //     height: baseSize * 0.75,
  //     thickness: 0.25,
  //     isOval: false
  //   }];

  //   // Rack width scales with number of targets, height stays consistent
  //   const rackWidth = 8 + (i * 0.5); // Slightly wider racks for longer distances
  //   addTargetRack(crossrangeOffset, -distanceYards, rackWidth, 2, targets);
  // }
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
  const bulletSpeedFps = btk.Conversions.mpsToFps(BULLET_SPEED_MPS);
  const bulletVelThree = direction.multiplyScalar(bulletSpeedFps);

  const bulletPos = window.threeJsToBtkPosition(impactPoint);
  const bulletVel = window.threeJsToBtkVelocity(bulletVelThree);

  const baseBullet = new btk.Bullet(
    BULLET_MASS,
    BULLET_DIAMETER,
    BULLET_LENGTH,
    BULLET_BC,
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
    numParticles: GROUND_DUST_CONFIG.numParticles,
    color: GROUND_DUST_CONFIG.color,
    wind: WIND_MPH,
    initialRadius: btk.Conversions.inchesToYards(GROUND_DUST_CONFIG.initialRadius),
    growthRate: GROUND_DUST_CONFIG.growthRate,
    fadeRate: GROUND_DUST_CONFIG.fadeRate,
    particleDiameter: btk.Conversions.inchesToYards(GROUND_DUST_CONFIG.particleDiameter)
  });
}

function createMetallicDustCloud(impactPointThree)
{
  DustCloudFactory.create(
  {
    position: impactPointThree,
    scene,
    numParticles: METAL_DUST_CONFIG.numParticles,
    color: METAL_DUST_CONFIG.color,
    wind: WIND_MPH,
    initialRadius: btk.Conversions.inchesToYards(METAL_DUST_CONFIG.initialRadius),
    growthRate: METAL_DUST_CONFIG.growthRate,
    fadeRate: METAL_DUST_CONFIG.fadeRate,
    particleDiameter: btk.Conversions.inchesToYards(METAL_DUST_CONFIG.particleDiameter)
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