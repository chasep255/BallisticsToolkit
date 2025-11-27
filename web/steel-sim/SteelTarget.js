import * as THREE from 'three';
import
{
  Config
}
from './config.js';

/**
 * Wrapper class for C++ SteelTarget that manages Three.js rendering resources
 * and optimizes updates by skipping targets that have stopped moving.
 * 
 * Creates and owns all its resources (C++ physics object, Three.js mesh, chain lines).
 * 
 * Requires window.btk to be initialized (loaded by main application).
 */
export class SteelTarget
{

  /**
   * Create a new steel target
   * @param {Object} options - Configuration options
   * @param {Object} options.position - Position in meters (SI units) {x, y, z} (required)
   * @param {number} options.width - Width in meters (required)
   * @param {number} options.height - Height in meters (required)
   * @param {number} options.thickness - Thickness in meters (default from config, already converted)
   * @param {boolean} options.isOval - True for oval shape, false for rectangle (default false)
   * @param {number} options.beamHeight - Height of overhead beam in meters (default from Config.TARGET_CONFIG.defaultBeamHeight)
   * @param {number} options.attachmentAngle - Angle in radians for oval attachment point (default Math.PI / 4 = 45°)
   * @param {number} options.outwardOffset - Outward offset for chain anchors in meters (default 0)
   * @param {THREE.Scene} options.scene - Three.js scene to add mesh/chain lines to (required)
   */
  constructor(options)
  {
    const
    {
      position,
      width,
      height,
      thickness,
      isOval = false,
      beamHeight = Config.TARGET_CONFIG.defaultBeamHeight, // meters from config
      attachmentAngle = Math.PI / 4, // 45 degrees
      outwardOffset = 0, // Default 0 meters
      scene
    } = options;

    if (!scene) throw new Error('Scene is required');
    if (!position) throw new Error('Position is required');
    if (width === undefined || width === null) throw new Error('Width is required');
    if (height === undefined || height === null) throw new Error('Height is required');

    // Use BTK from window (must be initialized by main application)
    const btk = window.btk;

    this.scene = scene;
    this.outwardOffset = outwardOffset; // Store for use in addChainAnchor

    // Calculate attachment points based on shape
    // In new coordinate system: X=crossrange (width), Y=up (height), Z=thickness (normal direction)
    let attachmentX, attachmentY;
    if (isOval)
    {
      // For circles, attach at specified angle from vertical on the circle edge
      const radius = width / 2;
      attachmentX = radius * Math.sin(attachmentAngle);
      attachmentY = radius * Math.cos(attachmentAngle);
    }
    else
    {
      // For rectangles, attach at top corners
      attachmentX = width / 3; // 1/3 width from center (left/right)
      attachmentY = height / 2; // Top of target
    }

    // Create BTK steel target
    // Position and dimensions are in meters (SI units)
    const initialPos = new btk.Vector3D(position.x, position.y, position.z);
    const defaultNormal = new btk.Vector3D(0, 0, -1); // Facing uprange (towards shooter)
    this.steelTarget = new btk.SteelTarget(width, height, thickness, isOval, initialPos, defaultNormal);
    initialPos.delete();
    defaultNormal.delete();

    // Add chain anchors - attach at top corners on front face
    // X = ± crossrange (left/right), Y = up (top), Z = -thickness/2 (front face)
    const leftLocalAttach = new btk.Vector3D(-attachmentX, attachmentY, -thickness / 2);
    const rightLocalAttach = new btk.Vector3D(+attachmentX, attachmentY, -thickness / 2);

    // Transform local attachments to world space
    const leftWorldAttach = this.steelTarget.localToWorld(leftLocalAttach);
    const rightWorldAttach = this.steelTarget.localToWorld(rightLocalAttach);

    // Place fixed anchors above and slightly outward from attachment points
    // X=crossrange, Y=up (beam height), Z=-downrange
    const leftWorldFixed = new btk.Vector3D(
      leftWorldAttach.x + this.outwardOffset,
      beamHeight,
      leftWorldAttach.z
    );
    const rightWorldFixed = new btk.Vector3D(
      rightWorldAttach.x - this.outwardOffset,
      beamHeight,
      rightWorldAttach.z
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
  createMesh()
  {
    // Ensure display buffer is up to date
    this.steelTarget.updateDisplay();

    // Get buffers from C++ (already in Three.js coordinates)
    const vertexView = this.steelTarget.getVertices();
    const uvView = this.steelTarget.getUVs();
    const normalView = this.steelTarget.getNormals();

    const positions = new Float32Array(vertexView.length);
    positions.set(vertexView);
    const uvs = new Float32Array(uvView.length);
    uvs.set(uvView);
    const normals = new Float32Array(normalView.length);
    normals.set(normalView);

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);

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

    // Create material with texture.
    // Render both sides so the back of the plate is visible when it swings,
    // but apply a small polygon offset so the plate as a whole wins the depth
    // test against the background terrain (reduces flicker/see-through).
    const material = new THREE.MeshStandardMaterial(
    {
      map: texture,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      roughness: 0.5,
      metalness: 0.1
    });

    // Create mesh
    const targetMesh = new THREE.Mesh(geometry, material);
    targetMesh.castShadow = true;
    targetMesh.receiveShadow = true;
    targetMesh.userData.texture = texture; // Store texture reference
    // Vertices from C++ are already in world space, so leave mesh at origin
    this.scene.add(targetMesh);


    return targetMesh;
  }

  /**
   * Create chain cylinder geometries
   * @private
   */
  createChainLines()
  {
    // Chain radius from config (already in meters)
    const chainRadius = Config.TARGET_CONFIG.chainRadius;

    // Store base length for scaling (unit length = 1.0 meter)
    this.chainBaseLength = 1.0;

    // Create unit-length cylinder geometry (height = 1.0)
    // Reduced segments for better performance (8 instead of 16)
    const chainGeometry = new THREE.CylinderGeometry(chainRadius, chainRadius, this.chainBaseLength, 8);
    chainGeometry.computeVertexNormals();

    // Use MeshStandardMaterial for PBR lighting
    const materialLeft = new THREE.MeshStandardMaterial(
    {
      color: 0x666666,
      roughness: 0.5,
      metalness: 0.6
    });

    const materialRight = new THREE.MeshStandardMaterial(
    {
      color: 0x666666,
      roughness: 0.5,
      metalness: 0.6
    });

    // Left chain cylinder
    const leftCylinder = new THREE.Mesh(chainGeometry.clone(), materialLeft);
    this.scene.add(leftCylinder);

    // Right chain cylinder
    const rightCylinder = new THREE.Mesh(chainGeometry.clone(), materialRight);
    this.scene.add(rightCylinder);

    return [leftCylinder, rightCylinder];
  }

  /**
   * Check if target is moving (delegates to C++)
   * @returns {boolean} True if target is moving
   */
  isMoving()
  {
    return this.steelTarget ? this.steelTarget.isMoving() : false;
  }

  /**
   * Step physics simulation
   * @param {number} dt - Time step in seconds
   */
  stepPhysics(dt)
  {
    if (!this.steelTarget) return;
    this.steelTarget.timeStep(dt);
  }

  /**
   * Update mesh vertices from C++ physics state
   */
  updateMesh()
  {
    if (!this.mesh || !this.steelTarget) return;

    // Update display buffer before reading vertices
    this.steelTarget.updateDisplay();

    // Get vertex buffer as memory view (already in Three.js coordinates)
    const vertexView = this.steelTarget.getVertices();
    const positions = this.mesh.geometry.attributes.position.array;
    positions.set(vertexView);
    this.mesh.geometry.attributes.position.needsUpdate = true;

    // Update normals from C++
    const normalView = this.steelTarget.getNormals();
    const normals = this.mesh.geometry.attributes.normal.array;
    normals.set(normalView);
    this.mesh.geometry.attributes.normal.needsUpdate = true;
  }

  /**
   * Update chain cylinder positions and orientations from C++ physics state
   */
  updateChainLines()
  {
    if (!this.chainLines || !this.steelTarget) return;

    // Get actual anchor data from C++ physics engine (already updated by simulation)
    const anchors = this.steelTarget.getAnchors();

    if (anchors.size() === 0)
    {
      anchors.delete();
      return;
    }

    // Update each chain cylinder for each anchor
    const numAnchors = anchors.size();
    const numChainLines = this.chainLines.length;

    for (let i = 0; i < Math.min(numAnchors, numChainLines); i++)
    {
      const anchor = anchors.get(i);

      // Transform local attachment to world space
      const attachWorld = this.steelTarget.localToWorld(anchor.localAttachment);

      // Convert BTK positions (meters) to Three.js (meters) - same coordinate system, same units
      const fixed = new THREE.Vector3(
        anchor.worldFixed.x,
        anchor.worldFixed.y,
        anchor.worldFixed.z
      );
      const attach = new THREE.Vector3(
        attachWorld.x,
        attachWorld.y,
        attachWorld.z
      );

      // Calculate chain length and direction
      const chainDirection = new THREE.Vector3();
      chainDirection.subVectors(attach, fixed);
      const chainLength = chainDirection.length();

      // Update scale to match new length (much faster than recreating geometry)
      this.chainLines[i].scale.y = chainLength / this.chainBaseLength;

      // Position cylinder at midpoint
      const midpoint = new THREE.Vector3();
      midpoint.addVectors(fixed, attach);
      midpoint.multiplyScalar(0.5);
      this.chainLines[i].position.copy(midpoint);

      // Rotate cylinder to align with chain direction
      // Cylinder default orientation is along Y-axis, so we need to rotate to match chain direction
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(up, chainDirection.normalize());
      this.chainLines[i].quaternion.copy(quaternion);

      // Cleanup WASM objects
      attachWorld.delete();
    }

    anchors.delete();
  }

  /**
   * Update texture from C++ texture buffer
   */
  updateTexture()
  {
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
   * Check if trajectory intersects with this target
   * @param {btk.Trajectory} trajectory - Trajectory to test for intersection
   * @returns {btk.TrajectoryPoint|null} Hit point or null if no intersection
   */
  intersectTrajectory(trajectory)
  {
    if (!this.steelTarget) return null;
    const hit = this.steelTarget.intersectTrajectory(trajectory);
    return (hit !== undefined && hit !== null) ? hit : null;
  }

  /**
   * Apply a bullet hit to this target
   * @param {btk.Bullet} bullet - Bullet instance to apply hit with
   */
  hit(bullet)
  {
    if (!this.steelTarget) return;
    this.steelTarget.hit(bullet);
    this.updateTexture();
    
    // If target was settled, move it back to moving set
    SteelTargetFactory._moveToMoving(this);
  }

  /**
   * Enable or disable verbose debug logging in the underlying C++ target.
   * When enabled, physics state and chain forces are logged to the browser console
   * on each physics substep for this specific target.
   * @param {boolean} enabled
   */
  setDebug(enabled)
  {
    if (!this.steelTarget || typeof this.steelTarget.setDebug !== 'function') return;
    this.steelTarget.setDebug(!!enabled);
  }

  /**
   * Clean up all resources (C++ object, Three.js objects)
   */
  dispose()
  {
    // Clean up physics object
    if (this.steelTarget)
    {
      this.steelTarget.delete();
      this.steelTarget = null;
    }

    // Clean up mesh
    if (this.mesh)
    {
      this.scene.remove(this.mesh);
      // Dispose texture if stored
      if (this.mesh.userData.texture)
      {
        this.mesh.userData.texture.dispose();
      }
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
      this.mesh = null;
    }

    // Clean up chain lines
    if (this.chainLines)
    {
      for (const line of this.chainLines)
      {
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
export class SteelTargetFactory
{
  /**
   * Static collection of all targets (for getAll, getCount, etc.)
   * @type {Set<SteelTarget>}
   */
  static allTargets = new Set();

  /**
   * Static collection of moving targets (actively simulating)
   * @type {Set<SteelTarget>}
   */
  static movingTargets = new Set();

  /**
   * Create a new steel target and add it to both collections
   * @param {Object} options - Configuration options for SteelTarget
   * @returns {SteelTarget} The created target instance
   */
  static create(options)
  {
    const target = new SteelTarget(options);
    SteelTargetFactory.allTargets.add(target);
    SteelTargetFactory.movingTargets.add(target);
    return target;
  }

  /**
   * Move a target from settled to moving (called when target is hit)
   * @param {SteelTarget} target - The target instance to move
   * @private
   */
  static _moveToMoving(target)
  {
    // Just add to moving - idempotent if already there
    SteelTargetFactory.movingTargets.add(target);
  }

  /**
   * Move a target from moving to settled (called when target settles)
   * @param {SteelTarget} target - The target instance to move
   * @private
   */
  static _moveToSettled(target)
  {
    // Just remove from moving - stays in allTargets
    SteelTargetFactory.movingTargets.delete(target);
  }

  /**
   * Delete a specific target by reference
   * @param {SteelTarget} target - The target instance to delete
   * @returns {boolean} True if target was found and deleted, false otherwise
   */
  static delete(target)
  {
    if (SteelTargetFactory.allTargets.delete(target))
    {
      SteelTargetFactory.movingTargets.delete(target);
      target.dispose();
      return true;
    }
    
    return false;
  }

  /**
   * Delete all targets
   */
  static deleteAll()
  {
    for (const target of SteelTargetFactory.allTargets)
    {
      target.dispose();
    }
    SteelTargetFactory.allTargets.clear();
    SteelTargetFactory.movingTargets.clear();
  }

  /**
   * Step physics for all moving targets
   * @param {number} dt - Time step in seconds
   */
  static stepPhysics(dt)
  {
    // Convert to array to avoid modification during iteration
    const targetsToProcess = [...SteelTargetFactory.movingTargets];
    
    for (const target of targetsToProcess)
    {
      target.stepPhysics(dt);

      // Check if target has settled and move it to settled set
      if (!target.isMoving())
      {
        SteelTargetFactory._moveToSettled(target);
      }
    }
  }

  /**
   * Update display/rendering for all moving targets
   */
  static updateDisplay()
  {
    for (const target of SteelTargetFactory.movingTargets)
    {
      target.updateMesh();
      target.updateChainLines();
    }
  }

  /**
   * Get all targets
   * @returns {SteelTarget[]} Array of all active targets
   */
  static getAll()
  {
    return [...SteelTargetFactory.allTargets];
  }

  /**
   * Get target count
   * @returns {number} Number of active targets
   */
  static getCount()
  {
    return SteelTargetFactory.allTargets.size;
  }

  /**
   * Get moving target count
   * @returns {number} Number of moving targets
   */
  static getMovingCount()
  {
    return SteelTargetFactory.movingTargets.size;
  }
}