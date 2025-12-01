import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LOG_PREFIX = '[Boar]';

/**
 * Boar - Individual wild boar instance with walking animation
 * Follows a path defined by waypoints
 */
export class Boar
{
  /**
   * Create a new boar instance
   * @param {THREE.Scene} scene - Three.js scene
   * @param {Object} model - Cached model from ModelManager {scene, animations}
   * @param {Array<{x: number, y?: number, z: number}>} path - Array of waypoint positions in meters
   * @param {Object} config - Configuration from Config.BOAR_CONFIG
   * @param {Object} impactDetector - Impact detector for collision registration
   * @param {number} objectId - Unique object ID for collision detection
   */
  constructor(scene, model, path, config, impactDetector, objectId)
  {
    if (!path || path.length < 2)
    {
      throw new Error(`${LOG_PREFIX} Path must have at least 2 waypoints`);
    }

    this.scene = scene;
    this.path = path;
    this.config = config;
    this.impactDetector = impactDetector;
    this.objectId = objectId;
    this.colliderHandle = -1; // Initialized after box calculation
    this.speed = config.walkingSpeed || 2.0; // m/s
    this.waypointReachThreshold = config.waypointReachThreshold || 0.5; // meters
    this.loopPath = config.loopPath !== undefined ? config.loopPath : true;
    this.turnSpeed = config.turnSpeed || Math.PI; // radians per second (default: 180°/s)

    // Clone the model scene for this boar instance (SkeletonUtils required for skinned meshes)
    this.boarGroup = SkeletonUtils.clone(model.scene);
    
    // Calculate bounding box to determine if scaling is needed
    this.boarGroup.updateMatrixWorld(true);
    const box = new THREE.Box3();
    box.setFromObject(this.boarGroup);
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    
    // Auto-scale small models to be at least 1.5m in largest dimension
    const targetSize = 1.5;
    let finalScale = config.scale || 1.0;
    if (maxDimension > 0 && maxDimension < targetSize)
    {
      finalScale = targetSize / maxDimension;
    }
    
    if (finalScale !== 1.0)
    {
      this.boarGroup.scale.set(finalScale, finalScale, finalScale);
      this.boarGroup.updateMatrixWorld(true);
      box.setFromObject(this.boarGroup);
    }

    // Check for debug wireframe mode via URL param
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.get('debug') === '1';

    // Configure materials - preserve skinning for SkinnedMesh
    this.boarGroup.traverse((child) =>
    {
      if (child.isMesh)
      {
        child.visible = true;
        child.frustumCulled = false;
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Clone material to preserve skinning data
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const newMaterials = materials.map(mat =>
        {
          const newMat = mat.clone();
          newMat.side = THREE.DoubleSide;
          newMat.needsUpdate = true;
          
          // Wireframe mode for debug
          if (debugMode)
          {
            newMat.wireframe = true;
            newMat.transparent = true;
            newMat.opacity = 0.7;
          }
          
          return newMat;
        });
        
        child.material = Array.isArray(child.material) ? newMaterials : newMaterials[0];
      }
    });

    // Set initial position from first waypoint
    const firstWaypoint = path[0];
    // If waypoint includes explicit Y, use it; otherwise position so bottom is at ground level
    this.groundYOffset = (firstWaypoint.y !== undefined) ? firstWaypoint.y : -box.min.y;
    this.boarGroup.position.set(firstWaypoint.x, this.groundYOffset, firstWaypoint.z);
    
    // Add to scene
    this.scene.add(this.boarGroup);

    // Register mesh collider for collision detection
    if (this.impactDetector)
    {
      // Extract geometry from boar meshes (in local space relative to boarGroup)
      const geometries = [];
      const groupScale = this.boarGroup.scale;

      this.boarGroup.traverse((child) =>
      {
        if (child.isMesh && child.geometry)
        {
          // Clone geometry so we don't mutate shared buffers
          const geometry = child.geometry.clone();

          // Ensure local matrix is up to date
          child.updateMatrix();

          // Apply mesh's local transform (relative to boarGroup)
          if (!child.matrix.isIdentity())
          {
            geometry.applyMatrix4(child.matrix);
          }

          // Bake boarGroup's uniform scale into the geometry so collider
          // matches the visually scaled model (collider has no scale)
          if (groupScale.x !== 1 || groupScale.y !== 1 || groupScale.z !== 1)
          {
            geometry.scale(groupScale.x, groupScale.y, groupScale.z);
          }

          geometries.push(geometry);
        }
      });

      if (geometries.length === 0)
      {
        console.warn(`${LOG_PREFIX} No meshes found for collider`);
        this.colliderHandle = -1;
      }
      else
      {
        // Merge all geometries into one
        const mergedGeometry = geometries.length > 1 ? mergeGeometries(geometries) : geometries[0];

        // Dispose temporary geometries
        geometries.forEach(geo =>
        {
          if (geo !== mergedGeometry)
          {
            geo.dispose();
          }
        });

        // Register mesh collider (geometry is in boar local space; we use moveCollider for world transform)
        this.colliderHandle = this.impactDetector.addMeshFromGeometry(mergedGeometry, null);

        // Update collider transform to match current position
        this.updateColliderTransform();
      }
    }

    // Set up animation mixer if model has animations
    this.mixer = null;
    this.action = null;
    if (model.animations && model.animations.length > 0)
    {
      this.mixer = new THREE.AnimationMixer(this.boarGroup);
      
      // Find a walking animation (prefer one with 'walk' in name)
      let walkClip = model.animations.find(clip => 
        clip.name.toLowerCase().includes('walk')
      ) || model.animations[0];
      
      this.action = this.mixer.clipAction(walkClip);
      this.action.play();
    }

    // Path following state
    this.currentWaypointIndex = 0;
    this.targetWaypoint = path[1] || path[0];
    this.position = new THREE.Vector3(firstWaypoint.x, 0, firstWaypoint.z);
    
    // Helper vectors for calculations
    this.direction = new THREE.Vector3();
    this.facingAngle = 0; // Current facing direction (radians)
    
    // Death state
    this.isDead = false;
    this.deathProgress = 0; // 0 to 1, controls roll animation
    this.deathDuration = 0.5; // seconds to complete death roll
    this.deathRotationStart = 0; // Y rotation when death started
  }

  /**
   * Update collider transform to match boar position and rotation
   */
  updateColliderTransform()
  {
    if (!this.impactDetector || this.colliderHandle < 0) return;

    // Get current position
    const pos = this.boarGroup.position;
    
    // Get current quaternion rotation
    const quat = this.boarGroup.quaternion;
    
    // Update mesh collider transform in impact detector
    this.impactDetector.moveCollider(
      this.colliderHandle,
      pos.x, pos.y, pos.z,
      quat.x, quat.y, quat.z, quat.w
    );
  }

  /**
   * Kill the boar - stop walking and play death animation
   */
  die()
  {
    if (this.isDead) return;
    
    this.isDead = true;
    this.deathProgress = 0;
    this.deathRotationStart = this.boarGroup.rotation.y;
    
    // Stop walking animation
    if (this.action)
    {
      this.action.fadeOut(0.2);
    }
  }

  /**
   * Update boar animation and position
   * @param {number} dt - Delta time in seconds
   */
  update(dt)
  {
    // Update animation mixer
    if (this.mixer)
    {
      this.mixer.update(dt);
    }

    // Handle death animation
    if (this.isDead)
    {
      if (this.deathProgress < 1)
      {
        this.deathProgress += dt / this.deathDuration;
        if (this.deathProgress > 1) this.deathProgress = 1;
        
        // Ease-out for smooth roll
        const t = 1 - Math.pow(1 - this.deathProgress, 2);
        
        // Roll onto side (rotate around Z axis by 90 degrees)
        this.boarGroup.rotation.z = t * (Math.PI / 2);
        
        // Slight drop as it falls
        const dropAmount = t * 0.3;
        this.boarGroup.position.y = this.groundYOffset - dropAmount;
        
        // Update collider during death animation
        this.updateColliderTransform();
      }
      return; // Don't process movement when dead
    }

    // Calculate direction to target waypoint
    this.direction.set(
      this.targetWaypoint.x - this.position.x,
      0,
      this.targetWaypoint.z - this.position.z
    );

    const distanceToWaypoint = this.direction.length();

    // Check if we've reached the current waypoint
    if (distanceToWaypoint <= this.waypointReachThreshold)
    {
      this.currentWaypointIndex++;
      
      if (this.currentWaypointIndex >= this.path.length)
      {
        if (this.loopPath)
        {
          this.currentWaypointIndex = 0;
          this.targetWaypoint = this.path[0];
        }
        else
        {
          return;
        }
      }
      else
      {
        this.targetWaypoint = this.path[this.currentWaypointIndex];
      }
      
      this.direction.set(
        this.targetWaypoint.x - this.position.x,
        0,
        this.targetWaypoint.z - this.position.z
      );
    }

    // Normalize direction and move towards waypoint
    if (this.direction.length() > 0)
    {
      this.direction.normalize();
      
      // Calculate target angle
      const targetAngle = Math.atan2(this.direction.x, this.direction.z);
      
      // Gradually turn towards target angle
      let angleDiff = targetAngle - this.facingAngle;
      
      // Normalize angle difference to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      // Limit turn rate
      const maxTurn = this.turnSpeed * dt;
      if (Math.abs(angleDiff) <= maxTurn)
      {
        this.facingAngle = targetAngle;
      }
      else
      {
        this.facingAngle += Math.sign(angleDiff) * maxTurn;
      }
      
      // Normalize facing angle to [-PI, PI]
      while (this.facingAngle > Math.PI) this.facingAngle -= Math.PI * 2;
      while (this.facingAngle < -Math.PI) this.facingAngle += Math.PI * 2;
      
      // Move in facing direction (not target direction)
      const moveDir = new THREE.Vector3(
        Math.sin(this.facingAngle),
        0,
        Math.cos(this.facingAngle)
      );
      const moveDistance = this.speed * dt;
      this.position.addScaledVector(moveDir, moveDistance);
      
      // Update boar group position and rotation
      this.boarGroup.position.set(this.position.x, this.groundYOffset, this.position.z);
      this.boarGroup.rotation.y = this.facingAngle;
    }
    
    // Update collider transform to match new position/rotation
    this.updateColliderTransform();
  }

  /**
   * Get current world position
   * @returns {THREE.Vector3} Current position
   */
  getPosition()
  {
    return this.position.clone();
  }

  /**
   * Dispose of boar resources
   */
  dispose()
  {
    // Remove mesh collider from impact detector
    if (this.impactDetector && this.colliderHandle >= 0)
    {
      this.impactDetector.removeCollider(this.colliderHandle);
      this.colliderHandle = -1;
    }

    if (this.mixer)
    {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.boarGroup);
    }

    if (this.boarGroup)
    {
      this.scene.remove(this.boarGroup);
      
      this.boarGroup.traverse((child) =>
      {
        if (child.isMesh)
        {
          if (child.geometry) child.geometry.dispose();
          if (child.material)
          {
            if (Array.isArray(child.material))
            {
              child.material.forEach(m => m.dispose());
            }
            else
            {
              child.material.dispose();
            }
          }
        }
      });
    }
  }
}

/**
 * Factory class for managing wild boar instances
 */
export class BoarFactory
{
  /** @type {Boar[]} */
  static boars = [];

  /** @type {THREE.Scene|null} */
  static scene = null;

  /** @type {Object|null} */
  static model = null;

  /** @type {Object|null} */
  static config = null;

  /** @type {Object|null} */
  static impactDetector = null;

  /** @type {number} */
  static nextObjectId = 1000; // Start at 1000 to avoid collisions with other object types

  /**
   * Initialize factory with pre-loaded model
   * @param {THREE.Scene} scene - Three.js scene
   * @param {Object} config - Configuration from Config.BOAR_CONFIG
   * @param {Object} preloadedModel - Pre-loaded model from ModelManager {scene, animations}
   * @param {Object} impactDetector - Impact detector for collision registration
   */
  static init(scene, config, preloadedModel, impactDetector)
  {
    if (BoarFactory.model)
    {
      return;
    }

    BoarFactory.scene = scene;
    BoarFactory.config = config;
    BoarFactory.model = preloadedModel;
    BoarFactory.impactDetector = impactDetector;

    console.log(`${LOG_PREFIX} Factory initialized`);
  }

  /**
   * Create a new boar instance with a path
   * @param {Array<{x: number, y?: number, z: number}>} path - Array of waypoint positions in meters
   * @returns {Boar} Created boar instance
   */
  static create(path)
  {
    if (!BoarFactory.model)
    {
      throw new Error(`${LOG_PREFIX} Factory not initialized. Call init() first.`);
    }

    const objectId = BoarFactory.nextObjectId++;
    const boar = new Boar(
      BoarFactory.scene, 
      BoarFactory.model, 
      path, 
      BoarFactory.config,
      BoarFactory.impactDetector,
      objectId
    );
    BoarFactory.boars.push(boar);
    
    return boar;
  }

  /**
   * Update all boars
   * @param {number} dt - Delta time in seconds
   */
  static updateAll(dt)
  {
    for (const boar of BoarFactory.boars)
    {
      boar.update(dt);
    }
  }

  /**
   * Get all boars
   * @returns {Boar[]} Array of all boar instances
   */
  static getAll()
  {
    return BoarFactory.boars;
  }

  /**
   * Dispose of all boars and reset factory
   */
  static dispose()
  {
    for (const boar of BoarFactory.boars)
    {
      boar.dispose();
    }
    BoarFactory.boars = [];
    BoarFactory.model = null;
    BoarFactory.scene = null;
    BoarFactory.config = null;
    BoarFactory.impactDetector = null;
  }
}
