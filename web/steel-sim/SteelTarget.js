import * as THREE from 'three';

/**
 * Wrapper class for C++ SteelTarget that manages Three.js rendering resources
 * and optimizes updates by skipping targets that have stopped moving.
 * 
 * Creates and owns all its resources (C++ physics object, Three.js mesh, chain lines).
 * 
 * Requires window.btk to be initialized (loaded by main application).
 */
export class SteelTarget {

  /**
   * Create a new steel target
   * @param {Object} options - Configuration options
   * @param {Object} options.position - Position in yards {x, y, z} (required)
   * @param {number} options.width - Width in inches (required)
   * @param {number} options.height - Height in inches (required)
   * @param {number} options.thickness - Thickness in inches (default 0.5)
   * @param {boolean} options.isOval - True for oval shape, false for rectangle (default false)
   * @param {number} options.beamHeight - Height of overhead beam in meters (default 2.5)
   * @param {number} options.attachmentAngle - Angle in radians for oval attachment point (default Math.PI / 4 = 45°)
   * @param {THREE.Scene} options.scene - Three.js scene to add mesh/chain lines to (required)
   */
  constructor(options) {
    const {
      position,
      width,
      height,
      thickness = 0.5,
      isOval = false,
      beamHeight = 2.5,
      attachmentAngle = Math.PI / 4, // 45 degrees
      scene
    } = options;

    if (!scene) throw new Error('Scene is required');
    if (!position) throw new Error('Position is required');
    if (width === undefined || width === null) throw new Error('Width is required');
    if (height === undefined || height === null) throw new Error('Height is required');
    
    // Use BTK from window (must be initialized by main application)
    const btk = window.btk;

    this.scene = scene;
    
    this.lastUpdateTime = performance.now();
    
    // Convert all inputs to meters using BTK conversions
    const position_m = {
      x: btk.Conversions.yardsToMeters(position.x),
      y: btk.Conversions.yardsToMeters(position.y),
      z: btk.Conversions.yardsToMeters(position.z)
    };
    const width_m = btk.Conversions.inchesToMeters(width);
    const height_m = btk.Conversions.inchesToMeters(height);
    const thickness_m = btk.Conversions.inchesToMeters(thickness);

    // Calculate attachment points based on shape
    let attachmentY, attachmentZ;
    if (isOval) {
      // For circles, attach at specified angle from vertical on the circle edge
      const radius = width_m / 2;
      attachmentY = radius * Math.sin(attachmentAngle);
      attachmentZ = radius * Math.cos(attachmentAngle);
    } else {
      // For rectangles, attach at top corners
      attachmentY = width_m / 3;
      attachmentZ = height_m / 2;
    }

    // Create BTK steel target
    const initialPosThree = new THREE.Vector3(position_m.x, position_m.y, position_m.z);
    const initialPos = window.threeJsToBtk(initialPosThree);
    const defaultNormal = new btk.Vector3D(1, 0, 0);
    this.steelTarget = new btk.SteelTarget(width_m, height_m, thickness_m, isOval, initialPos, defaultNormal);
    initialPos.delete();
    defaultNormal.delete();

    // Add chain anchors
    const leftLocalAttach = new btk.Vector3D(thickness_m / 2, attachmentY, attachmentZ);
    const rightLocalAttach = new btk.Vector3D(thickness_m / 2, -attachmentY, attachmentZ);

    // Transform local attachments to world space
    const leftWorldAttach = this.steelTarget.localToWorld(leftLocalAttach);
    const rightWorldAttach = this.steelTarget.localToWorld(rightLocalAttach);

    // Place fixed anchors above and slightly outward from attachment points
    const outwardOffset = 0.25; // meters
    const leftWorldFixed = new btk.Vector3D(
      leftWorldAttach.x,
      leftWorldAttach.y + outwardOffset,
      beamHeight
    );
    const rightWorldFixed = new btk.Vector3D(
      rightWorldAttach.x,
      rightWorldAttach.y - outwardOffset,
      beamHeight
    );

    this.steelTarget.addChainAnchor(leftLocalAttach, leftWorldFixed);
    this.steelTarget.addChainAnchor(rightLocalAttach, rightWorldFixed);

    // Cleanup temporary vectors
    leftWorldAttach.delete();
    rightWorldAttach.delete();
    leftLocalAttach.delete();
    rightLocalAttach.delete();
    leftWorldFixed.delete();
    rightWorldFixed.delete();

    // Initial settle step: run physics in 1-second increments until target settles
    // Check after each step if target has stopped moving, stop early if settled
    // Maximum 30 seconds total
    const MAX_SETTLE_TIME = 30.0; // seconds
    const SETTLE_STEP_SIZE = 1.0; // seconds per step
    
    for (let elapsed = 0; elapsed < MAX_SETTLE_TIME; elapsed += SETTLE_STEP_SIZE) {
      this.steelTarget.timeStep(SETTLE_STEP_SIZE);
      
      // Check if target has stopped moving (C++ now tracks this)
      if (!this.isMoving()) {
        break; // Target has settled, stop early
      }
    }

    // Create Three.js mesh
    this.mesh = this.createMesh();

    // Create chain lines
    this.chainLines = this.createChainLines();
    
    // Initialize chain line positions (target may be stationary after settling)
    this.updateChainLines();
  }


  /**
   * Create Three.js mesh from C++ steel target
   * @private
   */
  createMesh() {
    // Ensure display buffer is up to date
    this.steelTarget.updateDisplay();

    // Get vertex buffer as memory view (already in Three.js coordinates)
    const vertexView = this.steelTarget.getVertices();
    if (!vertexView || vertexView.length === 0) {
      console.error('getVertices returned empty or invalid view');
      return null;
    }

    // Create Float32Array from the memory view
    const positions = new Float32Array(vertexView.length);
    positions.set(vertexView);

    // Get UV buffer from C++
    const uvView = this.steelTarget.getUVs();
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
    const textureData = this.steelTarget.getTexture();
    const texWidth = this.steelTarget.getTextureWidth();
    const texHeight = this.steelTarget.getTextureHeight();

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
    this.scene.add(targetMesh);

    return targetMesh;
  }

  /**
   * Create chain line geometries
   * @private
   */
  createChainLines() {
    // Create line material - steel gray color
    const material = new THREE.LineBasicMaterial({ color: 0x666666, linewidth: 3 });

    // Left chain
    const leftGeometry = new THREE.BufferGeometry();
    const leftPositions = new Float32Array(6); // 2 points * 3 coords
    leftGeometry.setAttribute('position', new THREE.BufferAttribute(leftPositions, 3));
    const leftLine = new THREE.Line(leftGeometry, material);
    leftLine.castShadow = true;
    this.scene.add(leftLine);

    // Right chain
    const rightGeometry = new THREE.BufferGeometry();
    const rightPositions = new Float32Array(6);
    rightGeometry.setAttribute('position', new THREE.BufferAttribute(rightPositions, 3));
    const rightLine = new THREE.Line(rightGeometry, material);
    rightLine.castShadow = true;
    this.scene.add(rightLine);

    return [leftLine, rightLine];
  }

  /**
   * Update physics and rendering (only if target is moving)
   * @param {number} dt - Time step in seconds
   */
  update(dt) {
    if (!this.steelTarget) return;
    
    // Skip updates for stationary targets (C++ tracks isMoving)
    if (!this.steelTarget.isMoving()) {
      return;
    }
    
    // Update physics (C++ will update isMoving flag)
    this.steelTarget.timeStep(dt);
    
    // Update mesh vertices
    this.updateMesh();
    
    // Update chain lines
    this.updateChainLines();
    
    this.lastUpdateTime = performance.now();
  }

  /**
   * Check if target is moving (delegates to C++)
   * @returns {boolean} True if target is moving
   */
  isMoving() {
    return this.steelTarget ? this.steelTarget.isMoving() : false;
  }

  /**
   * Update mesh vertices from C++ physics state
   */
  updateMesh() {
    if (!this.mesh || !this.steelTarget) return;
    
    // Update display buffer before reading vertices
    this.steelTarget.updateDisplay();
    
    // Get vertex buffer as memory view (already in Three.js coordinates)
    const vertexView = this.steelTarget.getVertices();
    
    // Update position buffer in-place (vertices already in Three.js space)
    const positions = this.mesh.geometry.attributes.position.array;
    positions.set(vertexView);
    
    // Mark buffer as needing update
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingBox();
    this.mesh.geometry.computeBoundingSphere();
  }

  /**
   * Update chain line positions from C++ physics state
   */
  updateChainLines() {
    if (!this.chainLines || !this.steelTarget) return;
    
    // Get actual anchor data from C++ physics engine (already updated by simulation)
    const anchors = this.steelTarget.getAnchors();
    if (anchors.size() === 0) {
      anchors.delete();
      return;
    }
    
    // Update each chain line for each anchor
    const numAnchors = anchors.size();
    const numChainLines = this.chainLines.length;
    
    for (let i = 0; i < Math.min(numAnchors, numChainLines); i++) {
      const anchor = anchors.get(i);
      
      // Transform local attachment to world space
      const attachWorld = this.steelTarget.localToWorld(anchor.localAttachment);
      
      // Convert BTK positions to Three.js for rendering
      const fixed = window.btkToThreeJs(anchor.worldFixed);
      const attach = window.btkToThreeJs(attachWorld);
      
      // Update chain line: connects fixed anchor to attachment point
      const positions = this.chainLines[i].geometry.attributes.position.array;
      positions[0] = fixed.x;
      positions[1] = fixed.y;
      positions[2] = fixed.z;
      positions[3] = attach.x;
      positions[4] = attach.y;
      positions[5] = attach.z;
      this.chainLines[i].geometry.attributes.position.needsUpdate = true;
      
      // Cleanup WASM objects (Three.js Vector3 objects will be GC'd)
      attachWorld.delete();
    }
    
    anchors.delete();
  }

  /**
   * Update texture from C++ texture buffer
   */
  updateTexture() {
    if (!this.steelTarget || !this.mesh) return;
    
    // Get texture from mesh
    const texture = this.mesh.userData.texture;
    if (!texture) return;
    
    // Get updated texture data from C++ (already updated incrementally with impacts)
    const textureData = this.steelTarget.getTexture();
    if (!textureData || textureData.length === 0) return;
    
    // Copy data from WASM memory to texture
    const imageData = new Uint8ClampedArray(textureData);
    texture.image.data.set(imageData);
    texture.needsUpdate = true;
  }

  /**
   * Check if ray intersects with this target
   * @param {THREE.Raycaster} raycaster - Raycaster to use for intersection test
   * @returns {THREE.Intersection|null} Intersection result or null if no hit
   */
  isHit(raycaster) {
    if (!this.mesh) return null;
    
    // Update bounding volumes for accurate intersection
    this.mesh.geometry.computeBoundingBox();
    this.mesh.geometry.computeBoundingSphere();
    
    const intersects = raycaster.intersectObject(this.mesh);
    return intersects.length > 0 ? intersects[0] : null;
  }

  /**
   * Clean up all resources (C++ object, Three.js objects)
   */
  dispose() {
    // Clean up physics object
    if (this.steelTarget) {
      this.steelTarget.delete();
      this.steelTarget = null;
    }
    
    // Clean up mesh
    if (this.mesh) {
      this.scene.remove(this.mesh);
      // Dispose texture if stored
      if (this.mesh.userData.texture) {
        this.mesh.userData.texture.dispose();
      }
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
      this.mesh = null;
    }
    
    // Clean up chain lines
    if (this.chainLines) {
      for (const line of this.chainLines) {
        this.scene.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
      }
      this.chainLines = null;
    }
  }
}

/**
 * Factory class for managing collections of steel targets
 */
export class SteelTargetFactory {
  /**
   * Static collection of all active steel targets
   * @type {SteelTarget[]}
   */
  static targets = [];

  /**
   * Create a new steel target and add it to the collection
   * @param {Object} options - Configuration options for SteelTarget
   * @returns {SteelTarget} The created target instance
   */
  static create(options) {
    const target = new SteelTarget(options);
    SteelTargetFactory.targets.push(target);
    return target;
  }

  /**
   * Delete a specific target by reference
   * @param {SteelTarget} target - The target instance to delete
   * @returns {boolean} True if target was found and deleted, false otherwise
   */
  static delete(target) {
    const index = SteelTargetFactory.targets.indexOf(target);
    if (index === -1) {
      return false;
    }
    
    target.dispose();
    SteelTargetFactory.targets.splice(index, 1);
    return true;
  }

  /**
   * Delete a target by index
   * @param {number} index - Index of target to delete
   * @returns {boolean} True if target was found and deleted, false otherwise
   */
  static deleteAt(index) {
    if (index < 0 || index >= SteelTargetFactory.targets.length) {
      return false;
    }
    
    const target = SteelTargetFactory.targets[index];
    target.dispose();
    SteelTargetFactory.targets.splice(index, 1);
    return true;
  }

  /**
   * Delete all targets
   */
  static deleteAll() {
    for (const target of SteelTargetFactory.targets) {
      target.dispose();
    }
    SteelTargetFactory.targets = [];
  }

  /**
   * Update all targets (physics and rendering)
   * @param {number} dt - Time step in seconds
   */
  static updateAll(dt) {
    for (const target of SteelTargetFactory.targets) {
      target.update(dt);
    }
  }

  /**
   * Get all targets
   * @returns {SteelTarget[]} Array of all active targets
   */
  static getAll() {
    return SteelTargetFactory.targets;
  }

  /**
   * Get target count
   * @returns {number} Number of active targets
   */
  static getCount() {
    return SteelTargetFactory.targets.length;
  }

  /**
   * Get a target by index
   * @param {number} index - Index of target to get
   * @returns {SteelTarget|null} Target instance or null if index is invalid
   */
  static getAt(index) {
    if (index < 0 || index >= SteelTargetFactory.targets.length) {
      return null;
    }
    return SteelTargetFactory.targets[index];
  }

  /**
   * Find targets that intersect with a ray
   * @param {THREE.Raycaster} raycaster - Raycaster to use for intersection test
   * @returns {Array<{target: SteelTarget, intersection: THREE.Intersection}>} Array of hits
   */
  static findHits(raycaster) {
    const hits = [];
    for (const target of SteelTargetFactory.targets) {
      const intersection = target.isHit(raycaster);
      if (intersection) {
        hits.push({ target, intersection });
      }
    }
    // Sort by distance (closest first)
    hits.sort((a, b) => a.intersection.distance - b.intersection.distance);
    return hits;
  }

  /**
   * Get the closest target hit by a ray
   * @param {THREE.Raycaster} raycaster - Raycaster to use for intersection test
   * @returns {{target: SteelTarget, intersection: THREE.Intersection}|null} Closest hit or null
   */
  static findClosestHit(raycaster) {
    const hits = SteelTargetFactory.findHits(raycaster);
    return hits.length > 0 ? hits[0] : null;
  }
}
