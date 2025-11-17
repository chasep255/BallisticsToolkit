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
  springConstant = 500, // N/m
  leftAnchor = null,  // Three.js coords in meters (or null to auto-calculate)
  rightAnchor = null  // Three.js coords in meters (or null to auto-calculate)
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
  
  // Attach chains with some lateral separation for ALL shapes so they can resist twisting
  // Use 1/3 of the width as lateral offset on the plate, and keep anchors roughly at 45°
  const attachmentY = width_m / 3;
  const anchorOffsetX = attachmentY + chainHoriz;
  
  // Calculate anchor positions if not provided (in Three.js coordinates, meters)
  // Anchors should be above the target's top
  // Target will be at position_m, with top at +height_m/2
  if (!leftAnchor) {
    leftAnchor = {
      x: position_m.x - anchorOffsetX,
      y: position_m.y + height_m / 2 + chainVert,  // Above the top
      z: position_m.z
    };
  }
  if (!rightAnchor) {
    rightAnchor = {
      x: position_m.x + anchorOffsetX,
      y: position_m.y + height_m / 2 + chainVert,  // Above the top
      z: position_m.z
    };
  }
  
  // Create BTK steel target with single shape
  const steelTarget = new btk.SteelTarget(width_m, height_m, thickness_m, isOval);
  
  // Add chain anchors
  // Fixed anchor positions (convert from Three.js to BTK) - these stay fixed in world space
  const leftAnchorThree = new THREE.Vector3(leftAnchor.x, leftAnchor.y, leftAnchor.z);
  const leftAnchorFixed = threeJsToBtk(leftAnchorThree);
  // Attachment points on target - these move with the target
  // Target is centered at origin, so top is at +height_m/2 in Z direction
  // For ovals, attach at top center edge (y=0). For rectangles, attach at top corners
  const leftAttach = new btk.Vector3D(0, attachmentY, height_m / 2);
  steelTarget.addChainAnchor(leftAnchorFixed, leftAttach, chainLength_m, springConstant);
  
  const rightAnchorThree = new THREE.Vector3(rightAnchor.x, rightAnchor.y, rightAnchor.z);
  const rightAnchorFixed = threeJsToBtk(rightAnchorThree);
  const rightAttach = new btk.Vector3D(0, -attachmentY, height_m / 2);
  steelTarget.addChainAnchor(rightAnchorFixed, rightAttach, chainLength_m, springConstant);
  
  // Rotate to face shooter (normal should be -X in BTK, which is towards shooter)
  // This will rotate the attachment points, but anchors stay fixed
  const normalBtk = new btk.Vector3D(-1, 0, 0);
  steelTarget.rotate(normalBtk);
  normalBtk.delete();
  
  // Translate to final position (convert from Three.js to BTK)
  // This will translate the attachment points, but anchors stay fixed
  const initialPosThree = new THREE.Vector3(position_m.x, position_m.y, position_m.z);
  const initialPos = threeJsToBtk(initialPosThree);
  steelTarget.translate(initialPos);
  initialPos.delete();
  
  // Cleanup
  leftAnchorFixed.delete();
  rightAnchorFixed.delete();
  
  // Set damping
  steelTarget.setDamping(0.95, 0.92);
  
  // Create Three.js mesh and chain lines
  const targetMesh = createTargetMesh(steelTarget);
  const chainLines = createChainLines(steelTarget);
  
  // Add to targets array
  targets.push({
    steelTarget: steelTarget,
    mesh: targetMesh,
    chainLines: chainLines,
    impactMarkers: [],
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
  
  // Target spacing in yards (side by side)
  const spacing = 2; // 2 yards between targets
  const baseY = 1; // 1 yard up
  const baseZ = -10/3; // -10/3 yards downrange
  
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
    
    // Clean up impact markers
    for (const marker of target.impactMarkers) {
      scene.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material) marker.material.dispose();
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
  
  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  
  // Create material (metallic steel)
  const material = new THREE.MeshStandardMaterial({
    color: 0x808080,
    metalness: 0.8,
    roughness: 0.3,
    side: THREE.DoubleSide
  });
  
  // Create mesh
  const targetMesh = new THREE.Mesh(geometry, material);
  targetMesh.castShadow = true;
  targetMesh.receiveShadow = true;
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
  // Create line material
  const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
  
  // Left chain
  const leftGeometry = new THREE.BufferGeometry();
  const leftPositions = new Float32Array(6); // 2 points * 3 coords
  leftGeometry.setAttribute('position', new THREE.BufferAttribute(leftPositions, 3));
  const leftLine = new THREE.Line(leftGeometry, material);
  scene.add(leftLine);
  
  // Right chain
  const rightGeometry = new THREE.BufferGeometry();
  const rightPositions = new Float32Array(6);
  rightGeometry.setAttribute('position', new THREE.BufferAttribute(rightPositions, 3));
  const rightLine = new THREE.Line(rightGeometry, material);
  scene.add(rightLine);
  
  return [leftLine, rightLine];
}


function updateChainLines(target) {
  if (!target || target.chainLines.length !== 2 || !target.steelTarget) return;
  
  // Get actual anchor data from C++ physics engine (already updated by simulation)
  const anchors = target.steelTarget.getAnchors();
  if (anchors.size() < 2) return;
  
  // Get the two anchors (left=0, right=1 based on creation order)
  const leftAnchor = anchors.get(0);
  const rightAnchor = anchors.get(1);
  
  // Convert BTK positions to Three.js for rendering
  const leftFixed = btkToThreeJs(leftAnchor.fixed);
  const leftAttach = btkToThreeJs(leftAnchor.attachment);
  const rightFixed = btkToThreeJs(rightAnchor.fixed);
  const rightAttach = btkToThreeJs(rightAnchor.attachment);
  
  // Update left chain line: connects leftAnchor.fixed to leftAnchor.attachment
  const leftPositions = target.chainLines[0].geometry.attributes.position.array;
  leftPositions[0] = leftFixed.x;
  leftPositions[1] = leftFixed.y;
  leftPositions[2] = leftFixed.z;
  leftPositions[3] = leftAttach.x;
  leftPositions[4] = leftAttach.y;
  leftPositions[5] = leftAttach.z;
  target.chainLines[0].geometry.attributes.position.needsUpdate = true;
  
  // Update right chain line: connects rightAnchor.fixed to rightAnchor.attachment
  const rightPositions = target.chainLines[1].geometry.attributes.position.array;
  rightPositions[0] = rightFixed.x;
  rightPositions[1] = rightFixed.y;
  rightPositions[2] = rightFixed.z;
  rightPositions[3] = rightAttach.x;
  rightPositions[4] = rightAttach.y;
  rightPositions[5] = rightAttach.z;
  target.chainLines[1].geometry.attributes.position.needsUpdate = true;
  
  // Cleanup
  anchors.delete();
}

function updateImpactMarkers(target) {
  if (!target || !target.steelTarget) return;
  
  // Get impacts from target
  const impacts = target.steelTarget.getImpacts();
  const currentCount = impacts.size();
  
  // Remove excess markers if impacts were cleared
  while (target.impactMarkers.length > currentCount) {
    const marker = target.impactMarkers.pop();
    scene.remove(marker);
    if (marker.geometry) marker.geometry.dispose();
    if (marker.material) marker.material.dispose();
  }
  
  // Add new markers for new impacts
  while (target.impactMarkers.length < currentCount) {
    const geometry = new THREE.SphereGeometry(0.01, 8, 8); // 1cm radius sphere
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red impact marker
    const marker = new THREE.Mesh(geometry, material);
    marker.castShadow = true;
    scene.add(marker);
    target.impactMarkers.push(marker);
  }
  
  // Update marker positions
  for (let i = 0; i < currentCount; i++) {
    const impact = impacts.get(i);
    const impactPos = btkToThreeJs(impact.position);
    target.impactMarkers[i].position.set(impactPos.x, impactPos.y, impactPos.z);
    // Scale marker based on bullet diameter
    const scale = impact.bulletDiameter * 10; // Scale up for visibility
    target.impactMarkers[i].scale.set(scale, scale, scale);
  }
  impacts.delete();
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
    
    // Cleanup
    baseBullet.delete();
    bullet.delete();
    bulletPos.delete();
    bulletVel.delete();
  }
}

function resetTarget() {
  // Clear all impacts and reset all targets
  for (const target of targets) {
    if (target.steelTarget) {
      target.steelTarget.clearImpacts();
    }
    
    // Remove impact markers
    for (const marker of target.impactMarkers) {
      scene.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material) marker.material.dispose();
    }
    target.impactMarkers = [];
  }
  
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
      updateImpactMarkers(target);
    }
  }
  
  // Update stats (show first target's stats)
  if (targets.length > 0 && targets[0].steelTarget) {
    updateStats(targets[0].steelTarget);
  }
  
  // Render
  renderer.render(scene, camera);
}

function updateStats(steelTarget) {
  if (!steelTarget) return;
  
  // Get velocity
  const velocity = steelTarget.getVelocity();
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
  document.getElementById('linearVelocity').textContent = speed.toFixed(2) + ' m/s';
  velocity.delete();
  
  // Get angular velocity
  const angVel = steelTarget.getAngularVelocity();
  const angSpeed = Math.sqrt(angVel.x * angVel.x + angVel.y * angVel.y + angVel.z * angVel.z);
  document.getElementById('angularVelocity').textContent = angSpeed.toFixed(2) + ' rad/s';
  angVel.delete();
  
  // Get position
  const position = steelTarget.getCenterOfMass();
  document.getElementById('positionX').textContent = position.x.toFixed(3) + ' m';
  document.getElementById('positionZ').textContent = position.z.toFixed(3) + ' m';
  position.delete();
  
  // Get mass
  const mass = steelTarget.getMass();
  document.getElementById('targetMass').textContent = mass.toFixed(2) + ' kg';
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

