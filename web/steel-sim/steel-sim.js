import BallisticsToolkit from '../ballistics_toolkit_wasm.js';
import * as THREE from 'three';
import { SteelTarget, SteelTargetFactory } from './SteelTarget.js';
import { DustCloudFactory } from './DustCloud.js';

let btk = null;
let scene, camera, renderer;
let raycaster, mouse;
let animationId = null;
let lastTime = performance.now();

let groundMesh = null;
let beamMesh = null; // Track beam for cleanup

// ===== COORDINATE CONVERSION UTILITIES =====
// BTK: X=downrange, Y=crossrange-right, Z=up
// Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)

// Attach coordinate conversion utilities to window for global access
window.btkToThreeJs = function(btkVec) {
  const converted = btkVec.toThreeJs();
  const result = new THREE.Vector3(converted.x, converted.y, converted.z);
  converted.delete(); // Clean up WASM object
  return result;
};

window.threeJsToBtk = function(threeVec) {
  const threeJsVec = new btk.Vector3D(threeVec.x, threeVec.y, threeVec.z);
  const result = btk.Vector3D.fromThreeJs(threeJsVec);
  threeJsVec.delete(); // Clean up WASM object
  return result;
};

// Keep local functions for backward compatibility
function btkToThreeJs(btkVec) {
  return window.btkToThreeJs(btkVec);
}

function threeJsToBtk(threeVec) {
  return window.threeJsToBtk(threeVec);
}

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
    beamHeight: 2.5, // meters
    scene
  });
  
  return target;
}

// Create a rack of 4 different targets
function createTargetRack() {
  // Clear any existing targets
  clearAllTargets();
  
  // Create horizontal beam across the top
  const beamHeight = 2.5; // meters (about 8 feet high)
  const beamWidth = 8; // meters (spans all targets)
  const beamDepth = btk.Conversions.yardsToMeters(-10/3); // Same Z as targets
  createHorizontalBeam(beamWidth, beamHeight, beamDepth);
  
  // Target spacing in yards (side by side)
  const spacing = 2; // 2 yards between targets
  const baseY = 2; // 2 yards up (1.83m)
  const baseZ = -10/3; // -10/3 yards downrange
  
  // All chains hang from the beam at beamHeight
  // Target 1: 6" Circle (oval)
  createTarget(
    { x: -spacing * 1.5, y: baseY, z: baseZ },
    6, 6, 0.5, true // 6" circle
  );
  
  // Target 2: Large Rectangle (18" × 30")
  createTarget(
    { x: -spacing * 0.5, y: baseY, z: baseZ },
    18, 30, 0.5, false // 18" × 30" rectangle
  );
  
  // Target 3: 12" Circle
  createTarget(
    { x: spacing * 0.5, y: baseY, z: baseZ },
    12, 12, 0.5, true // 12" circle
  );
  
  // Target 4: 12" × 18" Rectangle
  createTarget(
    { x: spacing * 1.5, y: baseY, z: baseZ },
    12, 18, 0.5, false // 12" × 18" rectangle
  );
}

// Create horizontal beam that chains hang from
function createHorizontalBeam(width, height, depth) {
  // Remove existing beam if present
  if (beamMesh) {
    scene.remove(beamMesh);
    if (beamMesh.geometry) beamMesh.geometry.dispose();
    if (beamMesh.material) beamMesh.material.dispose();
    beamMesh = null;
  }
  
  const beamGeometry = new THREE.CylinderGeometry(0.05, 0.05, width, 16); // 5cm diameter cylinder
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
    
    // Setup Three.js scene
    setupScene();
    
    // Create rack of 4 targets
    createTargetRack();
    
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
  
  // Position camera to view all targets in the rack
  // Targets are spaced 2 yards apart, centered around x=0
  // Position camera back and up to see all 4 targets
  camera.position.set(0, 1.5, 2);
  camera.lookAt(0, 1, -3);
  
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
  directionalLight.position.set(5, 5, 5);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.camera.left = -10;
  directionalLight.shadow.camera.right = 10;
  directionalLight.shadow.camera.top = 10;
  directionalLight.shadow.camera.bottom = -10;
  directionalLight.shadow.bias = -0.0001;
  scene.add(directionalLight);
  
  // Add ground plane that receives shadows
  const groundGeometry = new THREE.PlaneGeometry(20, 20);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.8,
    metalness: 0.2
  });
  groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.5;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  
  // Setup raycaster for mouse interaction
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
  
  // Handle mouse clicks
  canvas.addEventListener('click', onCanvasClick);
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
  if (SteelTargetFactory.getCount() === 0) return;
  
  const canvas = document.getElementById('steelCanvas');
  const rect = canvas.getBoundingClientRect();
  
  // Convert mouse position to normalized device coordinates (-1 to +1)
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Cast ray from camera through mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Check intersections with all targets, find closest
  const hitResult = SteelTargetFactory.findClosestHit(raycaster);
  
  if (hitResult) {
    const { target: hitTarget, intersection: closestIntersection } = hitResult;
    const impactPoint = closestIntersection.point; // Three.js coords
    
    // Get camera position (shooter position) in Three.js coords
    const shooterPos = camera.position.clone();
    
    // Calculate direction from shooter to impact point (for velocity calculation)
    const direction = impactPoint.clone().sub(shooterPos).normalize();
    
    // Bullet velocity: 800 m/s towards impact point (from shooter)
    const bulletSpeed = 800; // m/s
    const bulletVelThree = direction.multiplyScalar(bulletSpeed);
    
    // Convert impact point and velocity to BTK coordinates
    const bulletPos = threeJsToBtk(impactPoint);
    const bulletVel = threeJsToBtk(bulletVelThree);
    
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
    hitTarget.steelTarget.hitBullet(bullet);
    
    // Update texture immediately after impact
    hitTarget.updateTexture();
    
    // Create metallic dust cloud at impact point
    createMetallicDustCloud(impactPoint);
    
    // Note: C++ automatically marks target as moving when impulse is applied
    
    // Cleanup
    baseBullet.delete();
    bullet.delete();
    bulletPos.delete();
    bulletVel.delete();
  } else if (groundMesh) {
    // No target hit - check for ground intersection
    const groundIntersects = raycaster.intersectObject(groundMesh);
    if (groundIntersects.length > 0) {
      const groundImpact = groundIntersects[0].point; // Three.js coords
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
    wind: { x: 0.5, y: 0.0, z: 0.2 }, // Wind: slight crosswind (x), no updraft (y), slight downrange (z)
    initialRadius: 0.01, // 10cm initial radius
    growthRate: 0.05, // 0.5 m/s growth rate
    fadeRate: 0.25, 
    particleDiameter: 0.01 // 1cm particle diameter (increased from 6mm)
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
    wind: { x: 0.5, y: 0.0, z: 0.2 }, // Wind: slight crosswind (x), no updraft (y), slight downrange (z)
    initialRadius: 0.005, // 5mm initial radius (smaller than ground dust)
    growthRate: 0.1, // 0.1 m/s growth rate (higher than ground dust)
    fadeRate: 0.5, // Faster fade rate (fades faster than ground dust)
    particleDiameter: 0.005 // 5mm particle diameter (smaller than ground dust)
  });
}

function resetTarget() {
  // Clean up existing targets
  SteelTargetFactory.deleteAll();
  
  // Clean up dust clouds
  DustCloudFactory.deleteAll();
  
  // Recreate the rack
  createTargetRack();
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

