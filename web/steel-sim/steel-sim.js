import BallisticsToolkit from '../ballistics_toolkit_wasm.js';
import * as THREE from 'three';
import { SteelTargetFactory } from './SteelTarget.js';
import { DustCloudFactory } from './DustCloud.js';
import { Landscape } from './Landscape.js';
import { TargetRackFactory } from './TargetRack.js';
import { CompositionRenderer, VirtualCoordinates as VC } from './CompositionRenderer.js';

// ===== CONSTANTS =====
const SHOOTER_HEIGHT = 1; // yards
const CAMERA_FOV = 50;
const CAMERA_FAR_PLANE = 1000;

const BULLET_MASS = 0.00907; // 140 grains in kg
const BULLET_DIAMETER = 0.00762; // .308 caliber in meters
const BULLET_LENGTH = 0.0305; // ~30mm typical
const BULLET_BC = 0.3;
const BULLET_SPEED_MPS = 800; // m/s

const WIND_MPH = { x: 1.1, y: 0.0, z: 0.45 }; // Slight crosswind and downrange

const GROUND_DUST_CONFIG = {
  numParticles: 1000,
  color: { r: 139, g: 115, b: 85 }, // Brown/tan
  initialRadius: 0.25, // inches
  growthRate: 0.5, // feet/second
  fadeRate: 0.5,
  particleDiameter: 0.2 // inches
};

const METAL_DUST_CONFIG = {
  numParticles: 1000,
  color: { r: 192, g: 192, b: 192 }, // Silver/gray
  initialRadius: 0.5, // inches
  growthRate: 0.5, // feet/second
  fadeRate: 0.5,
  particleDiameter: 0.2 // inches
};

// ===== GLOBAL STATE =====
let btk = null;
let scene, camera, renderer;
let compositionRenderer = null;
let sceneRenderTarget = null;
let raycaster, mouse;
let animationId = null;
let lastTime = performance.now();
let landscape = null;

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
window.btkToThreeJsPosition = function(btkVec) {
  // Coordinate system conversion and meters to yards
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: BTK (x, y, z) → Three.js (y, z, -x)
  return new THREE.Vector3(
    btk.Conversions.metersToYards(btkVec.y),   // BTK Y (crossrange-right) → Three.js X (right)
    btk.Conversions.metersToYards(btkVec.z),   // BTK Z (up) → Three.js Y (up)
    -btk.Conversions.metersToYards(btkVec.x)   // BTK X (downrange) → Three.js -Z (downrange)
  );
};

/**
 * Convert THREE.Vector3 position (yards, Three.js coords) to BTK Vector3D (meters, BTK coords)
 * @param {THREE.Vector3|Object} threeVec - Position vector in Three.js coordinates (yards)
 * @returns {btk.Vector3D} Position vector in BTK coordinates (meters)
 */
window.threeJsToBtkPosition = function(threeVec) {
  // Convert yards to meters and coordinate system conversion
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: Three.js (x, y, z) → BTK (-z, x, y)
  return new btk.Vector3D(
    -btk.Conversions.yardsToMeters(threeVec.z), // Three.js Z (downrange) → BTK X (downrange)
    btk.Conversions.yardsToMeters(threeVec.x),   // Three.js X (right) → BTK Y (crossrange-right)
    btk.Conversions.yardsToMeters(threeVec.y)    // Three.js Y (up) → BTK Z (up)
  );
};

// ===== VELOCITY CONVERSIONS =====
// Velocities: BTK uses m/s, Three.js uses fps or mph

/**
 * Convert BTK Vector3D velocity (m/s, BTK coords) to THREE.Vector3 (fps, Three.js coords)
 * @param {btk.Vector3D} btkVec - Velocity vector in BTK coordinates (m/s)
 * @returns {THREE.Vector3} Velocity vector in Three.js coordinates (fps)
 */
window.btkToThreeJsVelocity = function(btkVec) {
  // Coordinate system conversion and m/s to fps
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: BTK (x, y, z) → Three.js (y, z, -x)
  return new THREE.Vector3(
    btk.Conversions.mpsToFps(btkVec.y),   // BTK Y (crossrange-right) → Three.js X (right)
    btk.Conversions.mpsToFps(btkVec.z),   // BTK Z (up) → Three.js Y (up)
    -btk.Conversions.mpsToFps(btkVec.x)   // BTK X (downrange) → Three.js -Z (downrange)
  );
};

/**
 * Convert THREE.Vector3 velocity (fps, Three.js coords) to BTK Vector3D (m/s, BTK coords)
 * @param {THREE.Vector3|Object} threeVec - Velocity vector in Three.js coordinates (fps)
 * @returns {btk.Vector3D} Velocity vector in BTK coordinates (m/s)
 */
window.threeJsToBtkVelocity = function(threeVec) {
  // Convert fps to m/s and coordinate system conversion
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: Three.js (x, y, z) → BTK (-z, x, y)
  return new btk.Vector3D(
    -btk.Conversions.fpsToMps(threeVec.z), // Three.js Z (downrange) → BTK X (downrange)
    btk.Conversions.fpsToMps(threeVec.x),  // Three.js X (right) → BTK Y (crossrange-right)
    btk.Conversions.fpsToMps(threeVec.y)   // Three.js Y (up) → BTK Z (up)
  );
};

/**
 * Convert BTK Vector3D velocity (m/s, BTK coords) to THREE.Vector3 (mph, Three.js coords)
 * @param {btk.Vector3D} btkVec - Velocity vector in BTK coordinates (m/s)
 * @returns {THREE.Vector3} Velocity vector in Three.js coordinates (mph)
 */
window.btkToThreeJsVelocityMph = function(btkVec) {
  // Coordinate system conversion and m/s to mph
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: BTK (x, y, z) → Three.js (y, z, -x)
  return new THREE.Vector3(
    btk.Conversions.mpsToMph(btkVec.y),   // BTK Y (crossrange-right) → Three.js X (right)
    btk.Conversions.mpsToMph(btkVec.z),   // BTK Z (up) → Three.js Y (up)
    -btk.Conversions.mpsToMph(btkVec.x)   // BTK X (downrange) → Three.js -Z (downrange)
  );
};

/**
 * Convert THREE.Vector3 velocity (mph, Three.js coords) to BTK Vector3D (m/s, BTK coords)
 * @param {THREE.Vector3|Object} threeVec - Velocity vector in Three.js coordinates (mph)
 * @returns {btk.Vector3D} Velocity vector in BTK coordinates (m/s)
 */
window.threeJsToBtkVelocityMph = function(threeVec) {
  // Convert mph to m/s and coordinate system conversion
  // BTK: X=downrange, Y=crossrange-right, Z=up
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  // Conversion: Three.js (x, y, z) → BTK (-z, x, y)
  return new btk.Vector3D(
    -btk.Conversions.mphToMps(threeVec.z), // Three.js Z (downrange) → BTK X (downrange)
    btk.Conversions.mphToMps(threeVec.x),  // Three.js X (right) → BTK Y (crossrange-right)
    btk.Conversions.mphToMps(threeVec.y)   // Three.js Y (up) → BTK Z (up)
  );
};

// ===== INITIALIZATION =====

function lockCanvasSize() {
  const canvas = document.getElementById('steelCanvas');
  
  // Detect mobile devices
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isTouchOnly = !window.matchMedia('(hover: hover)').matches;
  
  if (isMobile || isTouchOnly) {
    console.warn('Mobile device detected - Steel Sim is designed for desktop use');
  }
  
  // Calculate canvas size with max constraints
  const maxWidth = 1600;
  const maxHeightVh = 0.90; // 90vh
  
  const availableWidth = Math.min(canvas.clientWidth, maxWidth);
  const availableHeight = window.innerHeight * maxHeightVh;
  
  // Use smaller of the two to fit on screen
  const canvasWidth = Math.floor(Math.min(availableWidth, canvas.clientWidth));
  const canvasHeight = Math.floor(Math.min(availableHeight, canvas.clientHeight));
  
  // Lock canvas size permanently
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.width = canvasWidth + 'px';
  canvas.style.height = canvasHeight + 'px';
  canvas.style.maxWidth = canvasWidth + 'px';
  canvas.style.maxHeight = canvasHeight + 'px';
  canvas.style.minWidth = canvasWidth + 'px';
  canvas.style.minHeight = canvasHeight + 'px';
  
  // Store locked dimensions
  canvas.dataset.lockedWidth = canvasWidth;
  canvas.dataset.lockedHeight = canvasHeight;
  
  console.log(`Canvas locked at ${canvasWidth}x${canvasHeight}`);
}

async function init() {
  try {
    lockCanvasSize();
    
    btk = await BallisticsToolkit();
    window.btk = btk;
    
    setupScene();
    setupUI();
    animate();
  } catch (e) {
    console.error('Failed to initialize:', e);
    showError('Failed to load steel simulator. Please refresh the page.');
  }
}

// ===== SCENE SETUP =====

function setupScene() {
  const canvas = document.getElementById('steelCanvas');
  
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  
  // Setup camera at shooter position
  camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    CAMERA_FAR_PLANE
  );
  camera.position.set(0, SHOOTER_HEIGHT, 0);
  camera.lookAt(0, 0, -CAMERA_FAR_PLANE);
  
  // Setup composition renderer
  compositionRenderer = new CompositionRenderer({ canvas });
  renderer = compositionRenderer.getRenderer();
  
  sceneRenderTarget = new THREE.WebGLRenderTarget(canvas.clientWidth, canvas.clientHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    samples: 4
  });
  
  const sceneGeometry = new THREE.PlaneGeometry(VC.WIDTH, VC.HEIGHT);
  const sceneMaterial = new THREE.MeshBasicMaterial({
    map: sceneRenderTarget.texture,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  compositionRenderer.addElement(new THREE.Mesh(sceneGeometry, sceneMaterial), {
    x: 0, y: 0, z: 0, renderOrder: 0
  });
  
  // Setup lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(0, 0, 1000);
  scene.add(directionalLight);
  
  // Create landscape
  landscape = new Landscape(scene, {
    groundWidth: 100,
    groundLength: 2000,
    brownGroundWidth: 500,
    brownGroundLength: 2000,
    slopeAngle: 5
  });
  
  // Create target racks
  createTargetRacks();
  
  // Setup raycaster
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Event listeners (no resize - canvas is locked)
  canvas.addEventListener('click', onCanvasClick);
}

// ===== TARGET RACK CREATION =====

function addTargetRack(x, z, rackWidth, rackHeight, targets) {
  if (!landscape) throw new Error('Landscape must be initialized');
  
  const groundHeight = landscape.getHeightAt(x, z) || 0;
  const halfWidth = rackWidth / 2;
  
  const rack = TargetRackFactory.create({
    bottomLeft: { x: x - halfWidth, y: groundHeight, z },
    topRight: { x: x + halfWidth, y: groundHeight + rackHeight, z },
    scene
  });
  
  targets.forEach(target => rack.addTarget(target));
  return rack;
}

function createTargetRacks() {
  if (!landscape) return;
  
  addTargetRack(0, -10, 6, 1.5, [
    { width: 12, height: 12, thickness: 0.5, isOval: false },
    { width: 10, height: 10, thickness: 0.5, isOval: true },
    { width: 8, height: 8, thickness: 0.5, isOval: false }
  ]);
  
  addTargetRack(15, -25, 8, 2, [
    { width: 18, height: 18, thickness: 0.5, isOval: false },
    { width: 16, height: 16, thickness: 0.5, isOval: true },
    { width: 14, height: 14, thickness: 0.5, isOval: false }
  ]);
  
  addTargetRack(-15, -40, 10, 2, [
    { width: 24, height: 30, thickness: 0.5, isOval: false },
    { width: 20, height: 20, thickness: 0.5, isOval: true },
    { width: 18, height: 24, thickness: 0.5, isOval: false }
  ]);
}

// ===== UI SETUP =====

function setupUI() {
  const resetBtn = document.getElementById('resetBtn');
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.querySelector('.help-close');
  
  resetBtn.addEventListener('click', resetTarget);
  helpBtn.addEventListener('click', () => helpModal.style.display = 'block');
  
  if (helpClose) {
    helpClose.addEventListener('click', () => helpModal.style.display = 'none');
  }
  
  if (helpModal) {
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) helpModal.style.display = 'none';
    });
  }
}

// ===== EVENT HANDLERS =====

function createBullet(impactPoint, shooterPos) {
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

function onCanvasClick(event) {
  const allTargets = TargetRackFactory.getAllTargets();
  if (allTargets.length === 0) return;
  
  const canvas = document.getElementById('steelCanvas');
  const rect = canvas.getBoundingClientRect();
  
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  // Check for target hit
  const intersects = raycaster.intersectObjects(allTargets.map(t => t.mesh));
  if (intersects.length > 0) {
    const hitTarget = allTargets.find(t => t.mesh === intersects[0].object);
    if (hitTarget) {
      const impactPoint = intersects[0].point;
      const bullet = createBullet(impactPoint, camera.position);
      
      hitTarget.hitBullet(bullet);
      hitTarget.updateTexture();
      createMetallicDustCloud(impactPoint);
      
      bullet.delete();
      return;
    }
  }
  
  // No target hit - check landscape
  if (landscape) {
    const landscapeIntersect = landscape.intersectRaycaster(raycaster);
    if (landscapeIntersect) {
      createDustCloud(landscapeIntersect.point);
    }
  }
}

// ===== DUST CLOUD EFFECTS =====

function createDustCloud(impactPointThree) {
  DustCloudFactory.create({
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

function createMetallicDustCloud(impactPointThree) {
  DustCloudFactory.create({
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

function resetTarget() {
  TargetRackFactory.deleteAll();
  DustCloudFactory.deleteAll();
  createTargetRacks();
}

// ===== ANIMATION LOOP =====

function animate() {
  animationId = requestAnimationFrame(animate);
  
  const currentTime = performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 1/30);
  lastTime = currentTime;
  
  SteelTargetFactory.updateAll(dt);
  DustCloudFactory.updateAll(dt);
  
  // Render 3D scene to target
  renderer.setRenderTarget(sceneRenderTarget);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  
  // Composite to screen
  compositionRenderer.render();
}

// ===== ERROR HANDLING =====

function showError(message) {
  const errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

// ===== START =====

document.addEventListener('DOMContentLoaded', init);

