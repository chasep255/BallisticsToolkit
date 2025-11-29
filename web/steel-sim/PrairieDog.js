import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * PrairieDog - Individual prairie dog instance for hunting targets
 * Tracks position, animation state, and instance index
 */
export class PrairieDog
{
  /**
   * Create a new prairie dog instance
   * @param {THREE.Vector3} basePosition - Base position on ground (meters)
   * @param {number} instanceIndex - Index in InstancedMesh
   */
  constructor(basePosition, instanceIndex)
  {
    this.basePosition = basePosition.clone();
    this.instanceIndex = instanceIndex;
    this.currentHeight = PrairieDogFactory.raisedOffset; // Start raised
    this.targetHeight = PrairieDogFactory.raisedOffset; // Start raised
    this.animationState = 'idle'; // 'idle', 'raising', 'lowering'
    this.objectId = -1; // Will be set when registered with ImpactDetector
    this.hitAnimationSpeed = null; // Custom speed for hit animation (null = use default)
    this.isDead = false; // True if prairie dog has been killed (no more impact detection)
  }

  /**
   * Get current world position (base + height offset)
   * @returns {THREE.Vector3} Current world position
   */
  getWorldPosition()
  {
    return new THREE.Vector3(
      this.basePosition.x,
      this.basePosition.y + this.currentHeight,
      this.basePosition.z
    );
  }

  /**
   * Raise the prairie dog
   */
  raise()
  {
    // Use factory-computed raised offset so ~2/3 of the body is above ground
    this.targetHeight = PrairieDogFactory.raisedOffset;
    this.animationState = 'raising';
  }

  /**
   * Lower the prairie dog
   */
  lower()
  {
    // Use factory-computed lowered offset so the whole body is below ground
    this.targetHeight = PrairieDogFactory.loweredOffset;
    this.animationState = 'lowering';
  }

  /**
   * Handle impact: shoot up briefly, then lower quickly
   */
  hit()
  {
    // Mark as dead - no more impact detection
    this.isDead = true;
    
    // Shoot up higher than normal raised position
    const btk = window.btk;
    const shootUpHeight = PrairieDogFactory.raisedOffset + btk.Conversions.inchesToMeters(4); // 4 inches higher
    this.targetHeight = shootUpHeight;
    this.animationState = 'raising';
    this.hitAnimationSpeed = PrairieDogFactory.config.animationSpeed * 3; // Fast raise
  }

  /**
   * Check if prairie dog is raised
   * @returns {boolean} True if raised
   */
  isRaised()
  {
    return this.currentHeight > 0.01; // Small threshold for floating point
  }
}

/**
 * Factory class for managing prairie dog hunting targets
 * Uses InstancedMesh for efficient rendering
 */
export class PrairieDogFactory
{
  /**
   * Static collection of all prairie dogs
   * @type {PrairieDog[]}
   */
  static prairieDogs = [];

  /**
   * Shared InstancedMesh for all prairie dogs
   * @type {THREE.InstancedMesh|null}
   */
  static instancedMesh = null;

  /**
   * Shared InstancedMesh for all mounds
   * @type {THREE.InstancedMesh|null}
   */
  static moundMesh = null;

  /**
   * Shared geometry from loaded GLB model
   * @type {THREE.BufferGeometry|null}
   */
  static sharedGeometry = null;

  /**
   * Shared material from loaded GLB model
   * @type {THREE.Material|null}
   */
  static sharedMaterial = null;

  /**
   * Scene reference
   * @type {THREE.Scene|null}
   */
  static scene = null;

  /**
   * Configuration from Config.PRAIRIE_DOG_CONFIG
   * @type {Object|null}
   */
  static config = null;

  /**
   * Bounding box of the model in *world space* after applying base rotation and scale,
   * but before any translation. Used to compute how much of the body is above ground.
   * @type {THREE.Box3|null}
   */
  static worldBounds = null;

  /**
   * Precomputed heights (along world Y) after rotation and scale.
   * height = maxY - minY
   * @type {number}
   */
  static modelHeight = 0;

  /**
   * Precomputed raised and lowered offsets along Y so:
   * - lowered: whole body is below ground (maxY <= 0)
   * - raised: 2/3 of the body height is above ground
   * These are *offsets* added to basePosition.y when updating instances.
   * @type {number}
   */
  static raisedOffset = 0;
  static loweredOffset = 0;

  /**
   * Computed scale factor to achieve target height
   * @type {number}
   */
  static computedScale = 1.0;

  /**
   * Offset to center prairie dog horizontally in mound
   * @type {number}
   */
  static modelCenterOffsetX = 0;
  static modelCenterOffsetZ = 0;

  /**
   * Reusable objects for matrix updates
   */
  static instanceMatrix = new THREE.Matrix4();
  static instancePosition = new THREE.Vector3();
  static instanceRotation = new THREE.Quaternion();
  static instanceScale = new THREE.Vector3(1, 1, 1);
  
  /**
   * Base rotation quaternion - rotate 90 degrees around X axis to stand up
   * (model is on its back, needs to be rotated to stand upright)
   */
  static baseRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

  /**
   * Load GLB model and initialize factory
   * @param {THREE.Scene} scene - Three.js scene
   * @param {Object} config - Configuration from Config.PRAIRIE_DOG_CONFIG
   * @returns {Promise<void>} Promise that resolves when model is loaded
   */
  static async init(scene, config)
  {
    if (PrairieDogFactory.instancedMesh)
    {
      // Already initialized
      return;
    }

    PrairieDogFactory.scene = scene;
    PrairieDogFactory.config = config;

    // Load GLB model
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(config.modelPath);

    // Extract geometry and material from loaded model
    // GLB models can have complex scene graphs, so we need to traverse and find meshes
    const meshes = [];
    gltf.scene.traverse((child) =>
    {
      if (child.isMesh)
      {
        meshes.push(child);
      }
    });

    if (meshes.length === 0)
    {
      throw new Error('PrairieDog: No meshes found in GLB model');
    }

    // Use first mesh (or merge if multiple)
    const firstMesh = meshes[0];
    PrairieDogFactory.sharedGeometry = firstMesh.geometry.clone();
    PrairieDogFactory.sharedMaterial = firstMesh.material.clone();

    // If multiple meshes, merge geometries
    if (meshes.length > 1)
    {
      const geometries = meshes.map(m => m.geometry);
      // Apply transforms if needed
      geometries.forEach((geom, i) =>
      {
        if (meshes[i].matrixWorld && !meshes[i].matrixWorld.isIdentity())
        {
          geom.applyMatrix4(meshes[i].matrixWorld);
        }
      });
      // Merge all geometries
      const mergedGeometry = mergeGeometries(geometries);
      PrairieDogFactory.sharedGeometry = mergedGeometry;
    }

    // Calculate bounding box to determine model height
    // After rotating 90° around X-axis, the original Z dimension becomes Y (vertical)
    PrairieDogFactory.sharedGeometry.computeBoundingBox();
    const localBox = PrairieDogFactory.sharedGeometry.boundingBox.clone();
    
    // Original model height in Z dimension (before rotation)
    const originalHeight = localBox.max.z - localBox.min.z;
    
    // Calculate scale factor to achieve target height
    // After rotation, Z becomes Y, so we scale to make originalHeight * scale = targetHeight
    const targetHeight = config.targetHeight || btk.Conversions.inchesToMeters(16);
    const scale = originalHeight > 0 ? (targetHeight / originalHeight) : 1.0;
    
    // Store the computed scale for use in rendering
    PrairieDogFactory.computedScale = scale;
    
    const rotation = PrairieDogFactory.baseRotation;
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, 0),
      rotation,
      new THREE.Vector3(scale, scale, scale)
    );

    // World-space bounds for a prairie dog positioned at the origin
    const worldBox = new THREE.Box3().copy(localBox).applyMatrix4(transform);
    PrairieDogFactory.worldBounds = worldBox;
    PrairieDogFactory.modelHeight = worldBox.max.y - worldBox.min.y;
    
    // Calculate prairie dog's horizontal extents (X and Z) for mound sizing
    // After rotation, X stays X, and original Y becomes -Z
    const modelWidthX = worldBox.max.x - worldBox.min.x;
    const modelDepthZ = worldBox.max.z - worldBox.min.z;
    PrairieDogFactory.modelMaxRadius = Math.max(modelWidthX, modelDepthZ) / 2; // Maximum radius needed
    
    // Store offset to center prairie dog in mound (account for bounding box center)
    PrairieDogFactory.modelCenterOffsetX = -(worldBox.min.x + worldBox.max.x) / 2;
    PrairieDogFactory.modelCenterOffsetZ = -(worldBox.min.z + worldBox.max.z) / 2;

    // Compute offsets so:
    // - Lowered: whole body is below ground (maxY <= 0)
    // - Raised: entire body is above ground (minY >= 0)
    //
    // When we place an instance with basePosition.y and currentHeight = h,
    // the vertical extent is:
    //   [baseY + h + worldMinY, baseY + h + worldMaxY]
    //
    // Ground plane is at baseY (Landscape.getHeightAt), currently 0.
    // So we can reason with baseY = 0, and just solve for h.
    const H = PrairieDogFactory.modelHeight;
    if (H > 0)
    {
      // Lowered: bring the top just below ground (slight epsilon underground)
      const epsilon = 0.01;
      PrairieDogFactory.loweredOffset = -worldBox.max.y - epsilon;

      // Raised: make entire body above ground (minY >= 0)
      // We want: h + worldMinY >= 0
      // => h >= -worldMinY
      // Use a small epsilon above ground for the bottom
      const epsilonRaised = 0.01;
      PrairieDogFactory.raisedOffset = -worldBox.min.y + epsilonRaised;
    }
    else
    {
      // Fallback: no height, keep defaults
      PrairieDogFactory.loweredOffset = 0;
      PrairieDogFactory.raisedOffset = 0;
    }

    // Create InstancedMesh (will be resized when we know the count)
    PrairieDogFactory.instancedMesh = new THREE.InstancedMesh(
      PrairieDogFactory.sharedGeometry,
      PrairieDogFactory.sharedMaterial,
      config.count
    );
    PrairieDogFactory.instancedMesh.castShadow = true;
    PrairieDogFactory.instancedMesh.receiveShadow = true;
    PrairieDogFactory.instancedMesh.frustumCulled = false;
    // Set render order so prairie dog renders before mound (behind it)
    PrairieDogFactory.instancedMesh.renderOrder = -1;
    scene.add(PrairieDogFactory.instancedMesh);

    // Create mound geometry (torus for the rim around the hole)
    const btk = window.btk;
    // Calculate mound radius to cover prairie dog geometry with some margin
    const margin = btk.Conversions.inchesToMeters(1); // 1 inch margin around prairie dog
    const moundRadius = Math.max(config.moundRadius || btk.Conversions.inchesToMeters(6), PrairieDogFactory.modelMaxRadius + margin);
    const moundInnerRadius = config.moundInnerRadius || btk.Conversions.inchesToMeters(2);
    const moundTubeRadius = (moundRadius - moundInnerRadius) / 2;
    const moundGeometry = new THREE.TorusGeometry(
      (moundRadius + moundInnerRadius) / 2, // Major radius (center of torus)
      moundTubeRadius, // Tube radius
      16, // Radial segments
      32 // Tubular segments
    );
    moundGeometry.computeVertexNormals();

    // Create mound material (dirt/brown color)
    const moundMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7355, // Brown dirt color
      roughness: 0.9,
      metalness: 0.0,
      depthTest: true,
      depthWrite: true
    });

    // Create InstancedMesh for mounds
    PrairieDogFactory.moundMesh = new THREE.InstancedMesh(
      moundGeometry,
      moundMaterial,
      config.count
    );
    PrairieDogFactory.moundMesh.castShadow = true;
    PrairieDogFactory.moundMesh.receiveShadow = true;
    PrairieDogFactory.moundMesh.frustumCulled = false;
    // Set render order so mound renders after prairie dog (in front of it, blocking part of it)
    PrairieDogFactory.moundMesh.renderOrder = 0;
    scene.add(PrairieDogFactory.moundMesh);
  }

  /**
   * Create a new prairie dog at specified position
   * @param {THREE.Vector3} position - Base position on ground (meters)
   * @returns {PrairieDog} The created prairie dog instance
   */
  static create(position)
  {
    if (!PrairieDogFactory.instancedMesh)
    {
      throw new Error('PrairieDogFactory: Must call init() before create()');
    }

    const instanceIndex = PrairieDogFactory.prairieDogs.length;

    // Use the provided ground-level position as the hole location.
    // All vertical motion is handled via currentHeight (raised/lowered offsets).
    const prairieDog = new PrairieDog(position.clone(), instanceIndex);

    // Start prairie dogs in lowered position (constructor already sets this)
    
    PrairieDogFactory.prairieDogs.push(prairieDog);

    // Initialize instance matrices for both prairie dog and mound
    PrairieDogFactory.updateInstanceMatrix(prairieDog);
    PrairieDogFactory.updateMoundMatrix(prairieDog);

    return prairieDog;
  }

  /**
   * Update instance matrix for a single prairie dog
   * @param {PrairieDog} prairieDog - Prairie dog instance
   * @private
   */
  static updateInstanceMatrix(prairieDog)
  {
    const worldPos = prairieDog.getWorldPosition();
    // Center the prairie dog horizontally in the mound
    PrairieDogFactory.instancePosition.set(
      worldPos.x + PrairieDogFactory.modelCenterOffsetX,
      worldPos.y,
      worldPos.z + PrairieDogFactory.modelCenterOffsetZ
    );
    
    // Use base rotation (90 degrees around X axis to stand up)
    PrairieDogFactory.instanceRotation.copy(PrairieDogFactory.baseRotation);
    
    // Apply computed scale (calculated to achieve target height)
    PrairieDogFactory.instanceScale.set(PrairieDogFactory.computedScale, PrairieDogFactory.computedScale, PrairieDogFactory.computedScale);

    PrairieDogFactory.instanceMatrix.compose(
      PrairieDogFactory.instancePosition,
      PrairieDogFactory.instanceRotation,
      PrairieDogFactory.instanceScale
    );

    PrairieDogFactory.instancedMesh.setMatrixAt(prairieDog.instanceIndex, PrairieDogFactory.instanceMatrix);
  }

  /**
   * Update mound instance matrix for a single prairie dog
   * @param {PrairieDog} prairieDog - Prairie dog instance
   * @private
   */
  static updateMoundMatrix(prairieDog)
  {
    if (!PrairieDogFactory.moundMesh)
    {
      return;
    }

    const config = PrairieDogFactory.config;
    const btk = window.btk;
    const moundHeight = config ? (config.moundHeight || btk.Conversions.inchesToMeters(2)) : btk.Conversions.inchesToMeters(2);
    
    // Mound position: at base position, slightly above ground
    // Position mound slightly forward in Z (towards camera) to ensure it occludes the prairie dog
    // TorusGeometry is centered at origin, so we position it at ground level + half height
    PrairieDogFactory.instancePosition.set(
      prairieDog.basePosition.x,
      prairieDog.basePosition.y + moundHeight / 2, // Center mound at half its height above ground
      prairieDog.basePosition.z + 0.01 // Slightly forward to ensure depth test wins
    );
    
    // Mound rotation: rotate 90° around X axis to make torus lie flat on ground (XZ plane)
    // TorusGeometry defaults to XY plane, we need XZ plane
    PrairieDogFactory.instanceRotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    
    // Mound scale: uniform (geometry already sized correctly)
    PrairieDogFactory.instanceScale.set(1, 1, 1);

    PrairieDogFactory.instanceMatrix.compose(
      PrairieDogFactory.instancePosition,
      PrairieDogFactory.instanceRotation,
      PrairieDogFactory.instanceScale
    );

    PrairieDogFactory.moundMesh.setMatrixAt(prairieDog.instanceIndex, PrairieDogFactory.instanceMatrix);
  }

  /**
   * Update all prairie dogs (animations and instance matrices)
   * @param {number} dt - Time step in seconds
   */
  static updateAll(dt)
  {
    if (!PrairieDogFactory.instancedMesh || !PrairieDogFactory.config)
    {
      return;
    }

    const defaultAnimationSpeed = PrairieDogFactory.config.animationSpeed;
    let needsUpdate = false;

    for (const prairieDog of PrairieDogFactory.prairieDogs)
    {
      // Update animation
      if (prairieDog.animationState === 'raising' || prairieDog.animationState === 'lowering')
      {
        // Use custom hit animation speed if set, otherwise use default
        const animationSpeed = prairieDog.hitAnimationSpeed !== null ? prairieDog.hitAnimationSpeed : defaultAnimationSpeed;
        const direction = Math.sign(prairieDog.targetHeight - prairieDog.currentHeight);
        const moveDistance = animationSpeed * dt * direction;
        const newHeight = prairieDog.currentHeight + moveDistance;

        // Check if we've reached target
        if (direction > 0 && newHeight >= prairieDog.targetHeight)
        {
          prairieDog.currentHeight = prairieDog.targetHeight;
          
          // If we just finished shooting up from a hit, immediately start lowering quickly
          if (prairieDog.hitAnimationSpeed !== null)
          {
            prairieDog.targetHeight = PrairieDogFactory.loweredOffset;
            prairieDog.animationState = 'lowering';
            prairieDog.hitAnimationSpeed = defaultAnimationSpeed * 5; // Very fast lower
          }
          else
          {
            prairieDog.animationState = 'idle';
          }
        }
        else if (direction < 0 && newHeight <= prairieDog.targetHeight)
        {
          prairieDog.currentHeight = prairieDog.targetHeight;
          prairieDog.animationState = 'idle';
          prairieDog.hitAnimationSpeed = null; // Reset custom speed
        }
        else
        {
          prairieDog.currentHeight = newHeight;
        }

        // Update instance matrices
        PrairieDogFactory.updateInstanceMatrix(prairieDog);
        // Mound position doesn't change, but update anyway to ensure sync
        PrairieDogFactory.updateMoundMatrix(prairieDog);
        needsUpdate = true;
      }
    }

    if (needsUpdate)
    {
      PrairieDogFactory.instancedMesh.instanceMatrix.needsUpdate = true;
      if (PrairieDogFactory.moundMesh)
      {
        PrairieDogFactory.moundMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /**
   * Raise a prairie dog by index
   * @param {number} index - Index of prairie dog
   */
  static raise(index)
  {
    if (index >= 0 && index < PrairieDogFactory.prairieDogs.length)
    {
      const prairieDog = PrairieDogFactory.prairieDogs[index];
      // Use factory-computed raised offset so ~2/3 of the body is above ground
      prairieDog.raise();
    }
  }

  /**
   * Lower a prairie dog by index
   * @param {number} index - Index of prairie dog
   */
  static lower(index)
  {
    if (index >= 0 && index < PrairieDogFactory.prairieDogs.length)
    {
      PrairieDogFactory.prairieDogs[index].lower();
    }
  }

  /**
   * Handle hit on a prairie dog by index (shoots up then lowers quickly)
   * @param {number} index - Index of prairie dog
   */
  static hit(index)
  {
    if (index >= 0 && index < PrairieDogFactory.prairieDogs.length)
    {
      PrairieDogFactory.prairieDogs[index].hit();
    }
  }

  /**
   * Get all prairie dogs
   * @returns {PrairieDog[]} Array of all prairie dogs
   */
  static getAll()
  {
    return PrairieDogFactory.prairieDogs;
  }

  /**
   * Get prairie dog by index
   * @param {number} index - Index of prairie dog
   * @returns {PrairieDog|null} Prairie dog instance or null if invalid index
   */
  static getAt(index)
  {
    if (index >= 0 && index < PrairieDogFactory.prairieDogs.length)
    {
      return PrairieDogFactory.prairieDogs[index];
    }
    return null;
  }

  /**
   * Get shared geometry (for impact detection)
   * @returns {THREE.BufferGeometry|null} Shared geometry
   */
  static getGeometry()
  {
    return PrairieDogFactory.sharedGeometry;
  }

  /**
   * Clean up all resources
   */
  static dispose()
  {
    if (PrairieDogFactory.instancedMesh && PrairieDogFactory.scene)
    {
      PrairieDogFactory.scene.remove(PrairieDogFactory.instancedMesh);
      PrairieDogFactory.instancedMesh.geometry.dispose();
      if (PrairieDogFactory.instancedMesh.material)
      {
        PrairieDogFactory.instancedMesh.material.dispose();
      }
      PrairieDogFactory.instancedMesh = null;
    }

    PrairieDogFactory.sharedGeometry = null;
    PrairieDogFactory.sharedMaterial = null;
    PrairieDogFactory.prairieDogs = [];
    PrairieDogFactory.scene = null;
    PrairieDogFactory.config = null;
  }
}

