import BallisticsToolkit from '../ballistics_toolkit_wasm.js';
import * as THREE from 'three';

let btk = null;
let steelTarget = null;
let scene, camera, renderer;
let targetMesh = null;
let chainLines = [];
let impactMarkers = []; // Array of impact marker meshes
let raycaster, mouse;
let animationId = null;
let lastTime = performance.now();

// Store target configuration
let targetConfig = {
  position: null,
  bodyWidth: null,
  bodyHeight: null,
  leftAnchor: null,
  rightAnchor: null
};

// ===== COORDINATE CONVERSION UTILITIES =====
// BTK: X=downrange, Y=crossrange-right, Z=up
// Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)

function btkToThreeJs(btkVec) {
  return new THREE.Vector3(
    btkVec.y,   // BTK Y (crossrange) → Three X (right)
    btkVec.z,   // BTK Z (up) → Three Y (up)
    -btkVec.x   // BTK -X (downrange) → Three Z (towards camera)
  );
}

function threeJsToBtk(threeVec) {
  return new btk.Vector3D(
    -threeVec.z,  // Three Z → BTK X (downrange)
    threeVec.x,   // Three X → BTK Y (crossrange)
    threeVec.y    // Three Y → BTK Z (up)
  );
}

// Simple function to create a steel target with manual positioning
// Parameters: position in yards, dimensions in inches, chainLength in feet
// All converted to meters using BTK conversions inside the function
function createTarget(
  position = { x: 0, y: 1, z: -10/3 }, // yards (y=1 yard up, z=-10/3 yards downrange)
  bodyWidth = 18,  // inches
  bodyHeight = 30, // inches
  headWidth = 6,   // inches
  headHeight = 9,  // inches
  thickness = 0.5, // inches
  density = 7850,  // kg/m³
  chainLength = 1, // feet
  springConstant = 5000, // N/m
  leftAnchor = null,  // Three.js coords in meters (or null to auto-calculate)
  rightAnchor = null  // Three.js coords in meters (or null to auto-calculate)
) {
  // Convert all inputs to meters using BTK conversions
  const position_m = {
    x: btk.Conversions.yardsToMeters(position.x),
    y: btk.Conversions.yardsToMeters(position.y),
    z: btk.Conversions.yardsToMeters(position.z)
  };
  const bodyWidth_m = btk.Conversions.inchesToMeters(bodyWidth);
  const bodyHeight_m = btk.Conversions.inchesToMeters(bodyHeight);
  const headWidth_m = btk.Conversions.inchesToMeters(headWidth);
  const headHeight_m = btk.Conversions.inchesToMeters(headHeight);
  const thickness_m = btk.Conversions.inchesToMeters(thickness);
  const chainLength_m = btk.Conversions.yardsToMeters(chainLength / 3); // feet to yards to meters
  
  // Calculate chain offsets (45 degree angle)
  const chainVert = chainLength_m / Math.sqrt(2);
  const chainHoriz = chainLength_m / Math.sqrt(2);
  const shoulderOffset = bodyWidth_m / 2;
  
  // Calculate anchor positions if not provided (in Three.js coordinates, meters)
  // Anchors should be above the target's shoulders
  // Target will be at position_m, with shoulders at top of body (bodyHeight_m/2)
  if (!leftAnchor) {
    leftAnchor = {
      x: position_m.x - (shoulderOffset + chainHoriz),
      y: position_m.y + bodyHeight_m / 2 + chainVert,  // Above the top of the body
      z: position_m.z
    };
  }
  if (!rightAnchor) {
    rightAnchor = {
      x: position_m.x + (shoulderOffset + chainHoriz),
      y: position_m.y + bodyHeight_m / 2 + chainVert,  // Above the top of the body
      z: position_m.z
    };
  }
  
  // Create BTK steel target
  steelTarget = new btk.SteelTarget(thickness_m, density);
  
  // Add body rectangle (components default to normal in +X direction, so shape is in YZ plane)
  const bodyPos = new btk.Vector3D(0, 0, 0);
  steelTarget.addRectangle(bodyPos, bodyWidth_m, bodyHeight_m);
  bodyPos.delete();
  
  // Add head as oval (positioned above body along Z axis)
  // Note: In BTK, Z is up, so positive Z is above
  const headOffset = bodyHeight_m / 2 + headHeight_m / 2;
  const headPos = new btk.Vector3D(0, 0, headOffset);
  steelTarget.addOval(headPos, headWidth_m, headHeight_m);
  headPos.delete();
  
  // Add chain anchors (swapped: left anchor connects to right shoulder, right anchor to left shoulder)
  // Fixed anchor positions (convert from Three.js to BTK) - these stay fixed in world space
  const leftAnchorThree = new THREE.Vector3(leftAnchor.x, leftAnchor.y, leftAnchor.z);
  const leftAnchorFixed = threeJsToBtk(leftAnchorThree);
  // Attachment points on target (swapped connections) - these move with the target
  // Body is centered at origin, so top is at +bodyHeight_m/2 in Z direction
  const leftAttach = new btk.Vector3D(0, shoulderOffset, bodyHeight_m / 2);
  steelTarget.addChainAnchor(leftAnchorFixed, leftAttach, chainLength_m, springConstant);
  
  const rightAnchorThree = new THREE.Vector3(rightAnchor.x, rightAnchor.y, rightAnchor.z);
  const rightAnchorFixed = threeJsToBtk(rightAnchorThree);
  const rightAttach = new btk.Vector3D(0, -shoulderOffset, bodyHeight_m / 2);
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
  
  // Set damping and ensure zero initial velocity
  steelTarget.setDamping(0.98, 0.95);
  
  // Reset velocities to zero after setup (in case any forces were applied during setup)
  // Note: We can't directly set velocity, but we can ensure it starts at rest
  
  // Store configuration for later use (in meters for Three.js)
  targetConfig.position = position_m;
  targetConfig.bodyWidth = bodyWidth_m;
  targetConfig.bodyHeight = bodyHeight_m;
  targetConfig.leftAnchor = leftAnchor;
  targetConfig.rightAnchor = rightAnchor;
  
  // Create Three.js mesh
  createTargetMesh();
  createChainLines();
  updateImpactMarkers(); // Initialize impact markers (should be empty initially)
  
  return steelTarget;
}

async function init() {
  try {
    // Load WASM module
    btk = await BallisticsToolkit();
    
    // Setup Three.js scene
    setupScene();
    
    // Create steel target with default configuration
    createTarget();
    
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
  
  // Position camera at origin looking at target
  // Target is at BTK (3.048, 0, 0) = Three.js (0, 0, -3.048)
  camera.position.set(0, 1, 0);
  camera.lookAt(0, 1, -3);
  
  // Setup renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);
  
  // Add grid for reference (ground plane)
  const gridHelper = new THREE.GridHelper(10, 20, 0x444444, 0x222222);
  scene.add(gridHelper);
  
  // Add axes helper for debugging
  const axesHelper = new THREE.AxesHelper(2);
  scene.add(axesHelper);
  
  // Setup raycaster for mouse interaction
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
  
  // Handle mouse clicks
  canvas.addEventListener('click', onCanvasClick);
}


function createTargetMesh() {
  // Remove old mesh if it exists
  if (targetMesh) {
    scene.remove(targetMesh);
    targetMesh.geometry.dispose();
    targetMesh.material.dispose();
  }
  
  // Get vertices from BTK (world space, BTK coords)
  const btkVertices = steelTarget.getVertices(32);
  
  // Convert to Three.js coordinates
  const positions = new Float32Array(btkVertices.size() * 3);
  for (let i = 0; i < btkVertices.size(); i++) {
    const btkVec = btkVertices.get(i);
    const threeVec = btkToThreeJs(btkVec);
    
    positions[i * 3] = threeVec.x;
    positions[i * 3 + 1] = threeVec.y;
    positions[i * 3 + 2] = threeVec.z;
    
    btkVec.delete(); // Clean up WASM object
  }
  btkVertices.delete();
  
  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.computeVertexNormals();
  
  // Create material (metallic steel)
  const material = new THREE.MeshStandardMaterial({
    color: 0x808080,
    metalness: 0.8,
    roughness: 0.3,
    side: THREE.DoubleSide
  });
  
  // Create mesh
  targetMesh = new THREE.Mesh(geometry, material);
  scene.add(targetMesh);
}

function updateTargetMesh() {
  if (!targetMesh || !steelTarget) return;
  
  // Get updated vertices from BTK (world space, BTK coords)
  const btkVertices = steelTarget.getVertices(32);
  
  // Update position buffer in-place, converting BTK → Three.js coords
  const positions = targetMesh.geometry.attributes.position.array;
  for (let i = 0; i < btkVertices.size(); i++) {
    const btkVec = btkVertices.get(i);
    const threeVec = btkToThreeJs(btkVec);
    
    positions[i * 3] = threeVec.x;
    positions[i * 3 + 1] = threeVec.y;
    positions[i * 3 + 2] = threeVec.z;
    
    btkVec.delete(); // Clean up WASM object
  }
  btkVertices.delete();
  
  // Mark buffer as needing update
  targetMesh.geometry.attributes.position.needsUpdate = true;
  targetMesh.geometry.computeVertexNormals();
}

function createChainLines() {
  // Remove old chain lines
  for (const line of chainLines) {
    scene.remove(line);
    if (line.geometry) line.geometry.dispose();
    if (line.material) line.material.dispose();
  }
  chainLines = [];
  
  // Create line material
  const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
  
  // Left chain
  const leftGeometry = new THREE.BufferGeometry();
  const leftPositions = new Float32Array(6); // 2 points * 3 coords
  leftGeometry.setAttribute('position', new THREE.BufferAttribute(leftPositions, 3));
  const leftLine = new THREE.Line(leftGeometry, material);
  scene.add(leftLine);
  chainLines.push(leftLine);
  
  // Right chain
  const rightGeometry = new THREE.BufferGeometry();
  const rightPositions = new Float32Array(6);
  rightGeometry.setAttribute('position', new THREE.BufferAttribute(rightPositions, 3));
  const rightLine = new THREE.Line(rightGeometry, material);
  scene.add(rightLine);
  chainLines.push(rightLine);
  
  updateChainLines();
}

function updateImpactMarkers() {
  if (!steelTarget) return;
  
  // Get impacts from target
  const impacts = steelTarget.getImpacts();
  const currentCount = impacts.size();
  
  // Remove excess markers if impacts were cleared
  while (impactMarkers.length > currentCount) {
    const marker = impactMarkers.pop();
    scene.remove(marker);
    if (marker.geometry) marker.geometry.dispose();
    if (marker.material) marker.material.dispose();
  }
  
  // Add new markers for new impacts
  while (impactMarkers.length < currentCount) {
    const geometry = new THREE.SphereGeometry(0.01, 8, 8); // 1cm radius sphere
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red impact marker
    const marker = new THREE.Mesh(geometry, material);
    scene.add(marker);
    impactMarkers.push(marker);
  }
  
  // Update marker positions
  for (let i = 0; i < currentCount; i++) {
    const impact = impacts.get(i);
    const impactPos = btkToThreeJs(impact.position);
    impactMarkers[i].position.set(impactPos.x, impactPos.y, impactPos.z);
    // Scale marker based on bullet diameter
    const scale = impact.bulletDiameter * 10; // Scale up for visibility
    impactMarkers[i].scale.set(scale, scale, scale);
    // Note: impact is a value object, not a pointer, so no delete() needed
  }
  impacts.delete();
}

function updateChainLines() {
  if (chainLines.length !== 2 || !steelTarget || !targetConfig.bodyWidth || !targetConfig.bodyHeight) return;
  
  // Get target's current center of mass and normal
  const centerOfMass = steelTarget.getCenterOfMass();
  const normal = steelTarget.getNormal();
  
  // Calculate attachment positions relative to center of mass
  // Original positions were: left=(0, shoulderOffset, bodyHeight/2), right=(0, -shoulderOffset, bodyHeight/2)
  // These are in the target's local frame (normal in +X, shape in YZ plane)
  // After rotation, we need to transform these positions
  const shoulderOffset = targetConfig.bodyWidth / 2;
  const shoulderHeight = targetConfig.bodyHeight / 2;
  
  // Original attachment positions in local frame (before rotation)
  const leftAttachLocal = new btk.Vector3D(0, shoulderOffset, shoulderHeight);
  const rightAttachLocal = new btk.Vector3D(0, -shoulderOffset, shoulderHeight);
  
  // Rotate from +X normal to current normal
  const defaultNormal = new btk.Vector3D(1, 0, 0);
  const dot = normal.dot(defaultNormal);
  
  let leftAttach, rightAttach;
  let axis = null;
  let rotation = null;
  
  if (dot > 0.9999 || dot < -0.9999) {
    // Already aligned or opposite - no rotation needed (or 180 deg)
    leftAttach = new btk.Vector3D(
      centerOfMass.x + leftAttachLocal.x,
      centerOfMass.y + leftAttachLocal.y,
      centerOfMass.z + leftAttachLocal.z
    );
    rightAttach = new btk.Vector3D(
      centerOfMass.x + rightAttachLocal.x,
      centerOfMass.y + rightAttachLocal.y,
      centerOfMass.z + rightAttachLocal.z
    );
  } else {
    // Calculate rotation axis and angle
    axis = defaultNormal.cross(normal).normalized();
    const angle = Math.acos(dot);
    rotation = btk.Quaternion.fromAxisAngle(axis, angle);
    
    // Rotate attachment positions
    leftAttach = rotation.rotate(leftAttachLocal);
    rightAttach = rotation.rotate(rightAttachLocal);
    
    // Translate to center of mass
    leftAttach.x += centerOfMass.x;
    leftAttach.y += centerOfMass.y;
    leftAttach.z += centerOfMass.z;
    rightAttach.x += centerOfMass.x;
    rightAttach.y += centerOfMass.y;
    rightAttach.z += centerOfMass.z;
  }
  
  // Fixed anchor positions (convert from Three.js to BTK)
  const leftAnchorThree = new THREE.Vector3(targetConfig.leftAnchor.x, targetConfig.leftAnchor.y, targetConfig.leftAnchor.z);
  const leftAnchorFixed = threeJsToBtk(leftAnchorThree);
  
  const rightAnchorThree = new THREE.Vector3(targetConfig.rightAnchor.x, targetConfig.rightAnchor.y, targetConfig.rightAnchor.z);
  const rightAnchorFixed = threeJsToBtk(rightAnchorThree);
  
  // Convert to Three.js for rendering
  const leftAttachThree = btkToThreeJs(leftAttach);
  const rightAttachThree = btkToThreeJs(rightAttach);
  const leftAnchorFixedThree = btkToThreeJs(leftAnchorFixed);
  const rightAnchorFixedThree = btkToThreeJs(rightAnchorFixed);
  
  // Update left chain line (connect left fixed anchor to right attachment)
  const leftPositions = chainLines[0].geometry.attributes.position.array;
  leftPositions[0] = leftAnchorFixedThree.x;
  leftPositions[1] = leftAnchorFixedThree.y;
  leftPositions[2] = leftAnchorFixedThree.z;
  leftPositions[3] = rightAttachThree.x;
  leftPositions[4] = rightAttachThree.y;
  leftPositions[5] = rightAttachThree.z;
  chainLines[0].geometry.attributes.position.needsUpdate = true;
  
  // Update right chain line (connect right fixed anchor to left attachment)
  const rightPositions = chainLines[1].geometry.attributes.position.array;
  rightPositions[0] = rightAnchorFixedThree.x;
  rightPositions[1] = rightAnchorFixedThree.y;
  rightPositions[2] = rightAnchorFixedThree.z;
  rightPositions[3] = leftAttachThree.x;
  rightPositions[4] = leftAttachThree.y;
  rightPositions[5] = leftAttachThree.z;
  chainLines[1].geometry.attributes.position.needsUpdate = true;
  
  // Cleanup
  leftAttachLocal.delete();
  rightAttachLocal.delete();
  leftAttach.delete();
  rightAttach.delete();
  leftAnchorFixed.delete();
  rightAnchorFixed.delete();
  defaultNormal.delete();
  if (axis) axis.delete();
  if (rotation) rotation.delete();
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
  if (!targetMesh || !steelTarget) return;
  
  const canvas = document.getElementById('steelCanvas');
  const rect = canvas.getBoundingClientRect();
  
  // Convert mouse position to normalized device coordinates (-1 to +1)
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Cast ray from camera through mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Check for intersections with target mesh
  const intersects = raycaster.intersectObject(targetMesh);
  
  if (intersects.length > 0) {
    const intersection = intersects[0];
    const impactPoint = intersection.point; // Three.js coords
    
    // Get camera position (shooter position) in Three.js coords
    const shooterPos = camera.position.clone();
    
    // Calculate direction from shooter to impact point (for velocity calculation)
    const direction = impactPoint.clone().sub(shooterPos).normalize();
    
    // Bullet velocity: 800 m/s towards impact point (from shooter)
    const bulletSpeed = 800; // m/s
    const bulletVelThree = direction.multiplyScalar(bulletSpeed);
    
    // Convert impact point and velocity to BTK coordinates
    const bulletPos = threeJsToBtk(impactPoint); // Bullet is at impact point
    const bulletVel = threeJsToBtk(bulletVelThree); // Velocity points from shooter to target
    
    // Create bullet with realistic parameters
    // 140gr .308 bullet (~0.01 kg) at 800 m/s
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
    
    // Apply hit to target (direct impact - bullet is at impact point)
    steelTarget.hitBullet(bullet);
    
    // Cleanup
    baseBullet.delete();
    bullet.delete();
    bulletPos.delete();
    bulletVel.delete();
  }
}

function resetTarget() {
  if (!targetConfig.position) return;
  
  // Clean up old target
  if (steelTarget) {
    steelTarget.delete();
    steelTarget = null;
  }
  
  // Remove old mesh
  if (targetMesh) {
    scene.remove(targetMesh);
    targetMesh.geometry.dispose();
    targetMesh.material.dispose();
    targetMesh = null;
  }
  
  // Remove old chain lines
  for (const line of chainLines) {
    scene.remove(line);
    if (line.geometry) line.geometry.dispose();
    if (line.material) line.material.dispose();
  }
  chainLines = [];
  
  // Remove old impact markers
  for (const marker of impactMarkers) {
    scene.remove(marker);
    if (marker.geometry) marker.geometry.dispose();
    if (marker.material) marker.material.dispose();
  }
  impactMarkers = [];
  
  // Recreate target (simplest way to reset everything)
  createTarget();
  
  // Update visuals
  updateTargetMesh();
  updateChainLines();
  updateImpactMarkers();
  updateStats();
}

function animate() {
  animationId = requestAnimationFrame(animate);
  
  const currentTime = performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 1/30); // Cap at 30 FPS
  lastTime = currentTime;
  
  // Update physics
  if (steelTarget) {
    steelTarget.timeStep(dt);
    updateTargetMesh();
    updateChainLines();
    updateImpactMarkers();
    updateStats();
  }
  
  // Render
  renderer.render(scene, camera);
}

function updateStats() {
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

