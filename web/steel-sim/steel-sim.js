import BallisticsToolkit from '../ballistics_toolkit_wasm.js';
import * as THREE from 'three';
import { SteelTarget, SteelTargetFactory } from './SteelTarget.js';
import { DustCloudFactory } from './DustCloud.js';
import { Landscape } from './Landscape.js';
import { TargetRack, TargetRackFactory } from './TargetRack.js';

let btk = null;
let scene, camera, renderer;
let raycaster, mouse;
let animationId = null;
let lastTime = performance.now();

let landscape = null; // Landscape instance
let beamMesh = null; // Track beam for cleanup

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

// Create a single target and add it to the targets array
function createTarget(
  position = { x: 0, y: 1, z: -10/3 }, // yards (y=1 yard up, z=-10/3 yards downrange)
  width = 18,  // inches
  height = 30, // inches
  thickness = 0.5, // inches
  isOval = false // true for oval shape, false for rectangle
) {
  // Create SteelTarget instance using factory (it creates and owns all its resources)
  const target = SteelTargetFactory.create({
    position,
    width,
    height,
    thickness,
    isOval,
    beamHeight: 2.5, // yards
    scene
  });
  
  return target;
}

// Create a rack of 4 different targets
function createTargetRack() {
  // Clear any existing targets
  clearAllTargets();
  
  // Create horizontal beam across the top (all values in yards)
  const beamHeight = 2.5; // yards (about 7.5 feet high)
  const beamWidth = 8; // yards (spans all targets)
  const targetZ = -10/3; // yards downrange
  createHorizontalBeam(beamWidth, beamHeight, targetZ);
  
  // Target spacing (side by side)
  const spacing = 2; // yards between targets
  const baseY = 2; // yards up
  const baseZ = -10/3; // yards downrange
  
  // All chains hang from the beam at beamHeight
  // Target 1: 6" Circle (oval)
  createTarget(
    { x: -spacing * 1.5, y: baseY, z: baseZ },
    6, 6, 0.5, true // inches: 6" circle
  );
  
  // Target 2: Large Rectangle (18" × 30")
  createTarget(
    { x: -spacing * 0.5, y: baseY, z: baseZ },
    18, 30, 0.5, false // inches: 18" × 30" rectangle
  );
  
  // Target 3: 12" Circle
  createTarget(
    { x: spacing * 0.5, y: baseY, z: baseZ },
    12, 12, 0.5, true // inches: 12" circle
  );
  
  // Target 4: 12" × 18" Rectangle
  createTarget(
    { x: spacing * 1.5, y: baseY, z: baseZ },
    12, 18, 0.5, false // inches: 12" × 18" rectangle
  );
}

// Create horizontal beam that chains hang from
// @param {number} width - Beam width (yards)
// @param {number} height - Beam height Y position (yards)
// @param {number} depth - Beam depth Z position (yards)
function createHorizontalBeam(width, height, depth) {
  // Remove existing beam if present
  if (beamMesh) {
    scene.remove(beamMesh);
    if (beamMesh.geometry) beamMesh.geometry.dispose();
    if (beamMesh.material) beamMesh.material.dispose();
    beamMesh = null;
  }
  
  // Beam radius: 2 inches diameter (1 inch radius)
  const beamRadius = btk.Conversions.inchesToYards(1);
  
  const beamGeometry = new THREE.CylinderGeometry(beamRadius, beamRadius, width, 16);
  const beamMaterial = new THREE.MeshStandardMaterial({
    color: 0x444444, // Dark gray steel
    metalness: 0.8,
    roughness: 0.3
  });
  beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
  
  // Rotate to horizontal (cylinder is vertical by default)
  beamMesh.rotation.z = Math.PI / 2;
  beamMesh.position.set(0, height, depth);
  beamMesh.castShadow = true;
  beamMesh.receiveShadow = true;
  
  scene.add(beamMesh);
}


function clearAllTargets() {
  SteelTargetFactory.deleteAll();
}

async function init() {
  try {
    // Load WASM module and attach to window for global access
    btk = await BallisticsToolkit();
    window.btk = btk;
    
    // Setup Three.js scene (includes creating target racks)
    setupScene();
    
    // Setup UI event listeners
    setupUI();
    
    // Start animation loop
    animate();
  } catch (e) {
    console.error('Failed to initialize:', e);
    showError('Failed to load steel simulator. Please refresh the page.');
  }
}

function setupScene() {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue for visibility
  
  // Setup camera (3D perspective view)
  const canvas = document.getElementById('steelCanvas');
  camera = new THREE.PerspectiveCamera(
    50, // FOV
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000
  );
  
  // Position camera at shooter position (all values in yards)
  // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
  camera.position.set(0, 1, 0); // Shooter at origin, 1 yard up (Y is up in Three.js)
  camera.lookAt(0, 0, -1000); // Look downrange (negative Z is downrange in Three.js)
  
  // Setup renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x87ceeb, 1.0); // Sky blue background, fully opaque
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(0, 0, 1000);
  directionalLight.castShadow = true;
  // Shadow map size will be set by landscape.configureShadowCamera()
  directionalLight.shadow.bias = -0.0001;
  scene.add(directionalLight);
  
  // Create landscape
  landscape = new Landscape(scene, {
    groundWidth: 100, // yards
    groundLength: 2000, // yards
    brownGroundWidth: 500, // yards
    brownGroundLength: 2000, // yards
    slopeAngle: 5 // degrees (uphill downrange)
  });
  
  // Configure shadow camera to match landscape dimensions
  landscape.configureShadowCamera(directionalLight);
  
  // Create target racks within 50 yards of shooter, max 2 yards high
  createTargetRacks();
  
  // Setup raycaster for mouse interaction
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
  
  // Handle mouse clicks
  canvas.addEventListener('click', onCanvasClick);
}

/**
 * Add a target rack at a specific XZ position
 * @param {number} x - X position in yards (crossrange)
 * @param {number} z - Z position in yards (downrange, negative = downrange)
 * @param {number} rackWidth - Width of rack in yards
 * @param {number} rackHeight - Height of rack in yards
 * @param {Array} targets - Array of target definitions {width, height, thickness, isOval}
 * @returns {TargetRack} The created rack instance
 */
function addTargetRack(x, z, rackWidth, rackHeight, targets) {
  if (!landscape) {
    throw new Error('Landscape must be initialized before creating target racks');
  }
  
  // Calculate terrain height at center position
  const groundHeight = landscape.getHeightAt(x, z) || 0;
  
  // Calculate bottom-left and top-right corners
  const halfWidth = rackWidth / 2;
  const bottomLeft = { x: x - halfWidth, y: groundHeight, z: z };
  const topRight = { x: x + halfWidth, y: groundHeight + rackHeight, z: z };
  
  // Create rack
  const rack = TargetRackFactory.create({
    bottomLeft,
    topRight,
    scene: scene
  });
  
  // Add all targets
  for (const target of targets) {
    rack.addTarget(target);
  }
  
  return rack;
}

/**
 * Create target racks with different targets within 50 yards
 */
function createTargetRacks() {
  if (!landscape) return;
  
  // Rack 1: Close range (10 yards), small targets
  addTargetRack(0, -10, 6, 1.5, [
    { width: 12, height: 12, thickness: 0.5, isOval: false }, // 12" square
    { width: 10, height: 10, thickness: 0.5, isOval: true }, // 10" round
    { width: 8, height: 8, thickness: 0.5, isOval: false } // 8" square
  ]);
  
  // Rack 2: Mid range (25 yards), medium targets
  addTargetRack(15, -25, 8, 2, [
    { width: 18, height: 18, thickness: 0.5, isOval: false }, // 18" square
    { width: 16, height: 16, thickness: 0.5, isOval: true }, // 16" round
    { width: 14, height: 14, thickness: 0.5, isOval: false } // 14" square
  ]);
  
  // Rack 3: Far range (40 yards), larger targets
  addTargetRack(-15, -40, 10, 2, [
    { width: 24, height: 30, thickness: 0.5, isOval: false }, // 24"x30" rectangle
    { width: 20, height: 20, thickness: 0.5, isOval: true }, // 20" round
    { width: 18, height: 24, thickness: 0.5, isOval: false } // 18"x24" rectangle
  ]);
}

function setupUI() {
  const resetBtn = document.getElementById('resetBtn');
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.querySelector('.help-close');
  
  resetBtn.addEventListener('click', resetTarget);
  
  helpBtn.addEventListener('click', () => {
    helpModal.style.display = 'block';
  });
  
  if (helpClose) {
    helpClose.addEventListener('click', () => {
      helpModal.style.display = 'none';
    });
  }
  
  if (helpModal) {
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        helpModal.style.display = 'none';
      }
    });
  }
}

function onWindowResize() {
  const canvas = document.getElementById('steelCanvas');
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  
  renderer.setSize(width, height);
  
  // Update camera aspect ratio
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function onCanvasClick(event) {
  const allTargets = TargetRackFactory.getAllTargets();
  if (allTargets.length === 0) return;
  
  const canvas = document.getElementById('steelCanvas');
  const rect = canvas.getBoundingClientRect();
  
  // Convert mouse position to normalized device coordinates (-1 to +1)
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Cast ray from camera through mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Check intersections with all targets, find closest
  const intersects = raycaster.intersectObjects(allTargets.map(t => t.mesh));
  let hitResult = null;
  if (intersects.length > 0) {
    const hitTarget = allTargets.find(t => t.mesh === intersects[0].object);
    if (hitTarget) {
      hitResult = { steelTarget: hitTarget, point: intersects[0].point };
    }
  }
  
  if (hitResult) {
    const impactPoint = hitResult.point; // Three.js coords
    
    // Get camera position (shooter position) in Three.js coords
    const shooterPos = camera.position.clone();
    
    // Calculate direction from shooter to impact point (for velocity calculation)
    const direction = impactPoint.clone().sub(shooterPos).normalize();
    
    // Bullet velocity: 800 m/s = ~2625 fps towards impact point (from shooter)
    const bulletSpeedMps = 800; // m/s
    const bulletSpeedFps = btk.Conversions.mpsToFps(bulletSpeedMps); // Convert to fps
    const bulletVelThree = direction.multiplyScalar(bulletSpeedFps); // fps in Three.js coords
    
    // Convert impact point (yards) and velocity (fps) to BTK coordinates (meters, m/s)
    const bulletPos = window.threeJsToBtkPosition(impactPoint);
    const bulletVel = window.threeJsToBtkVelocity(bulletVelThree);
    
    // Create bullet with realistic parameters
    const bulletMass = 0.00907; // 140 grains = 0.00907 kg
    const bulletDiameter = 0.00762; // .308 = 7.62mm
    const bulletLength = 0.0305; // ~30mm typical
    const bulletBC = 0.3; // Typical
    
    // Create base bullet (static properties only)
    const baseBullet = new btk.Bullet(
      bulletMass,
      bulletDiameter,
      bulletLength,
      bulletBC,
      btk.DragFunction.G7
    );
    
    // Create flying bullet with position and velocity
    const bullet = new btk.Bullet(
      baseBullet,
      bulletPos,
      bulletVel,
      0 // spin rate
    );
    
    // Apply hit to target
    hitResult.steelTarget.hitBullet(bullet);
    
    // Update texture immediately after impact
    hitResult.steelTarget.updateTexture();
    
    // Create metallic dust cloud at impact point
    createMetallicDustCloud(impactPoint);
    
    // Note: C++ automatically marks target as moving when impulse is applied
    
    // Cleanup
    baseBullet.delete();
    bullet.delete();
    bulletPos.delete();
    bulletVel.delete();
  } else if (landscape) {
    // No target hit - check for landscape intersection
    const landscapeIntersect = landscape.intersectRaycaster(raycaster);
    if (landscapeIntersect) {
      const groundImpact = landscapeIntersect.point; // Three.js coords
      createDustCloud(groundImpact);
    }
  }
}

// Create dust cloud at impact point
function createDustCloud(impactPointThree) {
  // Create dust cloud using factory
  // Particles have relative positions from cloud center (Gaussian distribution)
  // Cloud radius grows linearly, center advects with wind
  // Alpha fades exponentially over time (independent of radius growth)
  DustCloudFactory.create({
    position: impactPointThree,
    scene: scene,
    numParticles: 1000,
    color: { r: 139, g: 115, b: 85 }, // Brown/tan (base color, each particle gets jitter)
    wind: { x: 1.1, y: 0.0, z: 0.45 }, // Wind in mph: slight crosswind (x), no updraft (y), slight downrange (z)
    initialRadius: btk.Conversions.inchesToYards(0.25), // yards (0.25 inches)
    growthRate: 0.5, // feet/second growth rate
    fadeRate: 0.5, 
    particleDiameter: btk.Conversions.inchesToYards(0.2) // yards (0.5 inches)
  });
}

// Create metallic dust cloud at target impact point
function createMetallicDustCloud(impactPointThree) {
  // Create metallic dust cloud with higher growth, faster fade, smaller size
  // Particles have relative positions from cloud center (Gaussian distribution)
  // Cloud radius grows linearly, center advects with wind
  // Alpha fades exponentially over time (independent of radius growth)
  DustCloudFactory.create({
    position: impactPointThree,
    scene: scene,
    numParticles: 1000,
    color: { r: 192, g: 192, b: 192 }, // Silver/gray metallic color
    wind: { x: 1.1, y: 0.0, z: 0.45 }, // Wind in mph: slight crosswind (x), no updraft (y), slight downrange (z)
    initialRadius: btk.Conversions.inchesToYards(0.5), // yards (0.5 inches, smaller than ground dust)
    growthRate: 0.5, // feet/second growth rate (higher than ground dust)
    fadeRate: 0.5, // Faster fade rate (fades faster than ground dust)
    particleDiameter: btk.Conversions.inchesToYards(0.2) // yards (0.25 inches, smaller than ground dust)
  });
}

function resetTarget() {
  // Clean up existing target racks
  TargetRackFactory.deleteAll();
  
  // Clean up dust clouds
  DustCloudFactory.deleteAll();
  
  // Recreate the racks
  createTargetRacks();
}

function animate() {
  animationId = requestAnimationFrame(animate);
  
  const currentTime = performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 1/30); // Cap at 30 FPS
  lastTime = currentTime;
  
  // Update physics for all targets
  SteelTargetFactory.updateAll(dt);
  
  // Update dust clouds (factory automatically disposes when done)
  DustCloudFactory.updateAll(dt);
  
  // Render
  renderer.render(scene, camera);
}

function showError(message) {
  const errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

