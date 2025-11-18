import BallisticsToolkit from '../ballistics_toolkit_wasm.js';
import * as THREE from 'three';

let btk = null;
let scene, camera, renderer;
let raycaster, mouse;
let animationId = null;
let lastTime = performance.now();

// Array of targets, each with its own physics object, mesh, chains, and impacts
let targets = [];

// ===== COORDINATE CONVERSION UTILITIES =====
// BTK: X=downrange, Y=crossrange-right, Z=up
// Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)

function btkToThreeJs(btkVec) {
  const converted = btkVec.toThreeJs();
  const result = new THREE.Vector3(converted.x, converted.y, converted.z);
  converted.delete(); // Clean up WASM object
  return result;
}

function threeJsToBtk(threeVec) {
  const threeJsVec = new btk.Vector3D(threeVec.x, threeVec.y, threeVec.z);
  const result = btk.Vector3D.fromThreeJs(threeJsVec);
  threeJsVec.delete(); // Clean up WASM object
  return result;
}

// Create a single target and add it to the targets array
function createTarget(
  position = { x: 0, y: 1, z: -10/3 }, // yards (y=1 yard up, z=-10/3 yards downrange)
  width = 18,  // inches
  height = 30, // inches
  thickness = 0.5, // inches
  isOval = false, // true for oval shape, false for rectangle
  chainLength = 1, // feet
  springConstant = 500 // N/m
) {
  // Convert all inputs to meters using BTK conversions
  const position_m = {
    x: btk.Conversions.yardsToMeters(position.x),
    y: btk.Conversions.yardsToMeters(position.y),
    z: btk.Conversions.yardsToMeters(position.z)
  };
  const width_m = btk.Conversions.inchesToMeters(width);
  const height_m = btk.Conversions.inchesToMeters(height);
  const thickness_m = btk.Conversions.inchesToMeters(thickness);
  const chainLength_m = btk.Conversions.yardsToMeters(chainLength / 3); // feet to yards to meters
  
  // Calculate chain offsets (45 degree angle)
  const chainVert = chainLength_m / Math.sqrt(2);
  const chainHoriz = chainLength_m / Math.sqrt(2);
  
  // Calculate attachment points based on shape
  // For ovals: attach at edge of circle at 45° angle from top
  // For rectangles: attach at top corners
  let attachmentY, attachmentZ;
  
  if (isOval) {
    // For circles, attach at 45° from vertical on the circle edge
    // At 45°: y = radius * sin(45°), z = radius * cos(45°)
    const radius = width_m / 2;
    const angle = Math.PI / 4; // 45 degrees
    attachmentY = radius * Math.sin(angle);
    attachmentZ = radius * Math.cos(angle);
  } else {
    // For rectangles, attach at top corners
    attachmentY = width_m / 3;
    attachmentZ = height_m / 2;
  }
  
  // Create BTK steel target at final position (no rotation needed - symmetric target)
  const initialPosThree = new THREE.Vector3(position_m.x, position_m.y, position_m.z);
  const initialPos = threeJsToBtk(initialPosThree);
  const defaultNormal = new btk.Vector3D(1, 0, 0);  // Default orientation (no rotation)
  const steelTarget = new btk.SteelTarget(width_m, height_m, thickness_m, isOval, initialPos, defaultNormal);
  initialPos.delete();
  defaultNormal.delete();
  
  // Add chain anchors - local attachment on target, world fixed on beam
  const leftLocalAttach = new btk.Vector3D(thickness_m / 2, attachmentY, attachmentZ);
  const rightLocalAttach = new btk.Vector3D(thickness_m / 2, -attachmentY, attachmentZ);
  
  // Transform local attachments to world space
  const leftWorldAttach = steelTarget.localToWorld(leftLocalAttach);
  const rightWorldAttach = steelTarget.localToWorld(rightLocalAttach);
  
  // Place fixed anchors above and slightly outward from attachment points
  // This angles the chains outward for a more realistic look
  const beamHeight = 2.5; // meters
  const outwardOffset = 0.25; // meters - how far outward to angle chains
  const leftWorldFixed = new btk.Vector3D(
    leftWorldAttach.x,
    leftWorldAttach.y + outwardOffset,  // Angle left chain outward (left = +Y in BTK)
    beamHeight
  );
  const rightWorldFixed = new btk.Vector3D(
    rightWorldAttach.x,
    rightWorldAttach.y - outwardOffset,  // Angle right chain outward (right = -Y in BTK)
    beamHeight
  );
  
  steelTarget.addChainAnchor(leftLocalAttach, leftWorldFixed, springConstant);
  steelTarget.addChainAnchor(rightLocalAttach, rightWorldFixed, springConstant);
  
  leftWorldAttach.delete();
  rightWorldAttach.delete();
  leftLocalAttach.delete();
  rightLocalAttach.delete();
  leftWorldFixed.delete();
  rightWorldFixed.delete();
  
  // Set damping (fraction remaining after 1 second)
  steelTarget.setDamping(0.1, 0.1);  // 20% linear, 20% angular remains after 1s
  
  // Create Three.js mesh and chain lines
  const targetMesh = createTargetMesh(steelTarget);
  const chainLines = createChainLines(steelTarget);
  
  // Add to targets array
  targets.push({
    steelTarget: steelTarget,
    mesh: targetMesh,
    chainLines: chainLines,
    texture: null, // Will be set when creating mesh
    position: position_m,
    width: width_m,
    height: height_m
  });
  
  return steelTarget;
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
    6, 6, 0.5, true, // 6" circle
    1, 500 // 1 foot chain, 500 N/m spring
  );
  
  // Target 2: Large Rectangle (18" × 30")
  createTarget(
    { x: -spacing * 0.5, y: baseY, z: baseZ },
    18, 30, 0.5, false, // 18" × 30" rectangle
    1.5, 500 // 1.5 foot chain (longer for large rectangle), 500 N/m spring
  );
  
  // Target 3: 12" Circle with closer chains (allows more rotation)
  createTarget(
    { x: spacing * 0.5, y: baseY, z: baseZ },
    12, 12, 0.5, true, // 12" circle
    0.5, 500 // 0.5 foot chain (closer), 500 N/m spring
  );
  
  // Target 4: 12" × 18" Rectangle
  createTarget(
    { x: spacing * 1.5, y: baseY, z: baseZ },
    12, 18, 0.5, false, // 12" × 18" rectangle
    1.2, 500 // 1.2 foot chain (slightly longer for rectangle), 500 N/m spring
  );
}

// Create horizontal beam that chains hang from
function createHorizontalBeam(width, height, depth) {
  const beamGeometry = new THREE.CylinderGeometry(0.05, 0.05, width, 16); // 5cm diameter cylinder
  const beamMaterial = new THREE.MeshStandardMaterial({
    color: 0x444444, // Dark gray steel
    metalness: 0.8,
    roughness: 0.3
  });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  
  // Rotate to horizontal (cylinder is vertical by default)
  beam.rotation.z = Math.PI / 2;
  beam.position.set(0, height, depth);
  beam.castShadow = true;
  beam.receiveShadow = true;
  
  scene.add(beam);
}

function clearAllTargets() {
  for (const target of targets) {
    // Clean up physics object
    if (target.steelTarget) target.steelTarget.delete();
    
    // Clean up mesh
    if (target.mesh) {
      scene.remove(target.mesh);
      if (target.mesh.geometry) target.mesh.geometry.dispose();
      if (target.mesh.material) target.mesh.material.dispose();
    }
    
    // Clean up chain lines
    for (const line of target.chainLines) {
      scene.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    }
  }
  targets = [];
}

async function init() {
  try {
    // Load WASM module
    btk = await BallisticsToolkit();
    
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
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Add grid for reference (ground plane)
  const gridHelper = new THREE.GridHelper(10, 20, 0x444444, 0x222222);
  scene.add(gridHelper);
  
  // Setup raycaster for mouse interaction
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
  
  // Handle mouse clicks
  canvas.addEventListener('click', onCanvasClick);
}


function createTargetMesh(steelTarget) {
  // Ensure display buffer is up to date
  steelTarget.updateDisplay();
  
  // Get vertex buffer as memory view (already in Three.js coordinates)
  const vertexView = steelTarget.getVertices();
  
  // Check if view is valid
  if (!vertexView || vertexView.length === 0) {
    console.error('getVertices returned empty or invalid view');
    return null;
  }
  
  // Vertices are already in Three.js space, just copy directly
  // Create Float32Array from the memory view
  const positions = new Float32Array(vertexView.length);
  positions.set(vertexView);
  
  // Get UV buffer from C++ (already computed)
  const uvView = steelTarget.getUVs();
  if (!uvView || uvView.length === 0) {
    console.error('getUVs returned empty or invalid view');
    return null;
  }
  
  // Copy UVs from memory view
  const uvs = new Float32Array(uvView.length);
  uvs.set(uvView);
  
  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  
  // Get texture from C++ (already initialized with paint color)
  const textureData = steelTarget.getTexture();
  const texWidth = steelTarget.getTextureWidth();
  const texHeight = steelTarget.getTextureHeight();
  
  // Create Three.js DataTexture from C++ buffer
  const imageData = new Uint8ClampedArray(textureData);
  const texture = new THREE.DataTexture(imageData, texWidth, texHeight, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  
  // Create material with texture
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.3,
    roughness: 0.7,
    side: THREE.DoubleSide
  });
  
  // Create mesh
  const targetMesh = new THREE.Mesh(geometry, material);
  targetMesh.castShadow = true;
  targetMesh.receiveShadow = true;
  targetMesh.userData.texture = texture; // Store texture reference
  scene.add(targetMesh);
  
  return targetMesh;
}

function updateTargetMesh(target) {
  if (!target || !target.mesh || !target.steelTarget) return;
  
  // Update display buffer before reading vertices
  target.steelTarget.updateDisplay();
  
  // Get vertex buffer as memory view (already in Three.js coordinates)
  const vertexView = target.steelTarget.getVertices();
  
  // Update position buffer in-place (vertices already in Three.js space)
  const positions = target.mesh.geometry.attributes.position.array;
  positions.set(vertexView);
  
  // Mark buffer as needing update
  target.mesh.geometry.attributes.position.needsUpdate = true;
  target.mesh.geometry.computeVertexNormals();
  target.mesh.geometry.computeBoundingBox();
  target.mesh.geometry.computeBoundingSphere();
}

function createChainLines(steelTarget) {
  // Create line material - steel gray color
  const material = new THREE.LineBasicMaterial({ color: 0x666666, linewidth: 3 });
  
  // Left chain
  const leftGeometry = new THREE.BufferGeometry();
  const leftPositions = new Float32Array(6); // 2 points * 3 coords
  leftGeometry.setAttribute('position', new THREE.BufferAttribute(leftPositions, 3));
  const leftLine = new THREE.Line(leftGeometry, material);
  leftLine.castShadow = true;
  scene.add(leftLine);
  
  // Right chain
  const rightGeometry = new THREE.BufferGeometry();
  const rightPositions = new Float32Array(6);
  rightGeometry.setAttribute('position', new THREE.BufferAttribute(rightPositions, 3));
  const rightLine = new THREE.Line(rightGeometry, material);
  rightLine.castShadow = true;
  scene.add(rightLine);
  
  return [leftLine, rightLine];
}


function updateChainLines(target) {
  if (!target || !target.chainLines || !target.steelTarget) return;
  
  // Get actual anchor data from C++ physics engine (already updated by simulation)
  const anchors = target.steelTarget.getAnchors();
  if (anchors.size() === 0) {
    anchors.delete();
    return;
  }
  
  // Update each chain line for each anchor
  const numAnchors = anchors.size();
  const numChainLines = target.chainLines.length;
  
  for (let i = 0; i < Math.min(numAnchors, numChainLines); i++) {
    const anchor = anchors.get(i);
    
    // Transform local attachment to world space
    const attachWorld = target.steelTarget.localToWorld(anchor.localAttachment);
    
    // Convert BTK positions to Three.js for rendering
    const fixed = btkToThreeJs(anchor.worldFixed);
    const attach = btkToThreeJs(attachWorld);
    
    // Update chain line: connects fixed anchor to attachment point
    const positions = target.chainLines[i].geometry.attributes.position.array;
    positions[0] = fixed.x;
    positions[1] = fixed.y;
    positions[2] = fixed.z;
    positions[3] = attach.x;
    positions[4] = attach.y;
    positions[5] = attach.z;
    target.chainLines[i].geometry.attributes.position.needsUpdate = true;
    
    // Cleanup
    attachWorld.delete();
  }
  
  anchors.delete();
}

function updateTargetTexture(target) {
  if (!target || !target.steelTarget || !target.mesh) return;
  
  // Get texture from mesh
  const texture = target.mesh.userData.texture;
  if (!texture) return;
  
  // Get updated texture data from C++ (already updated incrementally with impacts)
  const textureData = target.steelTarget.getTexture();
  if (!textureData || textureData.length === 0) return;
  
  // Copy data from WASM memory to texture
  const imageData = new Uint8ClampedArray(textureData);
  texture.image.data.set(imageData);
  texture.needsUpdate = true;
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
  if (targets.length === 0) return;
  
  const canvas = document.getElementById('steelCanvas');
  const rect = canvas.getBoundingClientRect();
  
  // Convert mouse position to normalized device coordinates (-1 to +1)
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Cast ray from camera through mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Check intersections with all targets, find closest
  let closestIntersection = null;
  let hitTarget = null;
  
  for (const target of targets) {
    if (!target.mesh || !target.steelTarget) continue;
    
    // Update bounding volumes
    target.mesh.geometry.computeBoundingBox();
    target.mesh.geometry.computeBoundingSphere();
    
    const intersects = raycaster.intersectObject(target.mesh);
    if (intersects.length > 0) {
      const intersection = intersects[0];
      if (!closestIntersection || intersection.distance < closestIntersection.distance) {
        closestIntersection = intersection;
        hitTarget = target;
      }
    }
  }
  
  if (closestIntersection && hitTarget) {
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
    updateTargetTexture(hitTarget);
    
    // Cleanup
    baseBullet.delete();
    bullet.delete();
    bulletPos.delete();
    bulletVel.delete();
  }
}

function resetTarget() {
  // Clean up existing targets
  for (const target of targets) {
    // Clean up physics object
    if (target.steelTarget) target.steelTarget.delete();
    
    // Clean up mesh
    if (target.mesh) {
      scene.remove(target.mesh);
      if (target.mesh.geometry) target.mesh.geometry.dispose();
      if (target.mesh.material) target.mesh.material.dispose();
    }
    
    // Clean up chain lines
    for (const line of target.chainLines) {
      scene.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    }
  }
  targets = [];
  
  // Recreate the rack
  createTargetRack();
}

function animate() {
  animationId = requestAnimationFrame(animate);
  
  const currentTime = performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 1/30); // Cap at 30 FPS
  lastTime = currentTime;
  
  // Update physics for all targets
  for (const target of targets) {
    if (target.steelTarget) {
      target.steelTarget.timeStep(dt);
      updateTargetMesh(target);
      updateChainLines(target);
    }
  }
  
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

