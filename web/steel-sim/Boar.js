import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import
{
  mergeGeometries
}
from 'three/addons/utils/BufferGeometryUtils.js';
import
{
  WindFlagFactory
}
from './WindFlag.js';
import
{
  TargetRackFactory
}
from './TargetRack.js';
import
{
  Config
}
from './config.js';

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

    // Random speed multiplier between 0.5x and 2.0x
    this.speedMultiplier = 0.5 + Math.random() * 1.5; // 0.5 to 2.0
    const baseSpeed = config.walkingSpeed || 0.8; // m/s
    this.speed = baseSpeed * this.speedMultiplier;

    this.waypointReachThreshold = config.waypointReachThreshold || 0.5; // meters
    this.loopPath = config.loopPath !== undefined ? config.loopPath : true;
    this.turnSpeed = config.turnSpeed || Math.PI; // radians per second (default: 180°/s)

    // Store timeout reference for cleanup
    this.respawnTimeout = null;

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

    // Store visual bounds for collider creation (before position is set)
    this.visualSize = box.getSize(new THREE.Vector3());
    this.visualCenter = box.getCenter(new THREE.Vector3());

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

    // Register box collider for collision detection
    // Using manually tuned box dimensions for best fit
    if (this.impactDetector)
    {
      // Manual box dimensions (in meters, relative to boarGroup origin)
      // Adjust these values to fit the boar model:
      const boxWidth = 0.4; // X - side to side
      const boxHeight = 0.6; // Y - ground to top of back
      const boxDepth = 1.2; // Z - nose to tail

      // Box center offset from boarGroup origin (which is at the feet)
      const centerX = 0.0; // Left/right offset
      const centerY = 0.5; // Height of box center (half of body height from ground)
      const centerZ = 0.3; // Forward/backward offset (positive = forward)

      const size = new THREE.Vector3(boxWidth, boxHeight, boxDepth);
      const localCenter = new THREE.Vector3(centerX, centerY, centerZ);

      console.log(`${LOG_PREFIX} Creating manual box collider: size=(${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}), center=(${localCenter.x.toFixed(2)}, ${localCenter.y.toFixed(2)}, ${localCenter.z.toFixed(2)})`);

      const boxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      boxGeometry.translate(localCenter.x, localCenter.y, localCenter.z);

      // Debug: create wireframe mesh to visualize collider (only in debug mode)
      if (debugMode)
      {
        const debugMaterial = new THREE.MeshBasicMaterial(
        {
          wireframe: true,
          color: 0x00ff00,
          depthTest: false
        });
        this.debugColliderMesh = new THREE.Mesh(boxGeometry.clone(), debugMaterial);
        this.debugColliderMesh.renderOrder = 999;
        // Position at boarGroup's position (will be updated in updateColliderTransform)
        this.debugColliderMesh.position.copy(this.boarGroup.position);
        this.debugColliderMesh.quaternion.copy(this.boarGroup.quaternion);
        this.scene.add(this.debugColliderMesh);
      }

      // Register box collider
      this.colliderHandle = this.impactDetector.addMeshFromGeometry(boxGeometry,
      {
        type: 'boar',
        boarObjectId: this.objectId
      });

      this.updateColliderTransform();
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
      // Set animation playback speed to match walking speed multiplier
      this.action.setEffectiveTimeScale(this.speedMultiplier);
      this.action.play();
    }

    // Path following state
    this.currentWaypointIndex = 0;
    this.targetWaypoint = path[1] || path[0];
    this.position = new THREE.Vector3(firstWaypoint.x, 0, firstWaypoint.z);

    // Helper vectors for calculations
    this.direction = new THREE.Vector3();
    this.facingAngle = 0; // Current facing direction (radians)

    // State tracking
    this.state = 'alive'; // 'alive', 'dead', 'respawning'

    // Death state
    this.isDead = false;
    this.deathProgress = 0; // 0 to 1, controls roll animation
    this.deathDuration = 0.5; // seconds to complete death roll
    this.deathRotationStart = 0; // Y rotation when death started
    this.deathRollDirection = 1; // Will be set randomly when die() is called
    this.fadeOutProgress = 0; // 0 to 1, controls fade-out after death
    this.fadeOutDuration = 2.0; // seconds to fade out completely (reduced from 10s)

    // Respawn state
    this.fadeInProgress = 0; // 0 to 1, controls fade-in after respawn
    this.fadeInDuration = 1.0; // seconds to fade in completely

    // Random walk flag
    this.randomWalk = config.randomWalk !== undefined ? config.randomWalk : true;
  }

  /**
   * Update collider transform to match boar position and rotation
   */
  updateColliderTransform()
  {
    if (!this.impactDetector || this.colliderHandle < 0) return;

    // Ensure boarGroup's world matrix is up to date
    this.boarGroup.updateMatrixWorld(true);

    // Get current world position and rotation
    const pos = this.boarGroup.position;
    const quat = this.boarGroup.quaternion;

    // Update mesh collider transform in impact detector
    // Geometry is in boarGroup local space, so we transform it using boarGroup's
    // world position and rotation.
    this.impactDetector.moveCollider(
      this.colliderHandle,
      pos.x, pos.y, pos.z,
      quat.x, quat.y, quat.z, quat.w
    );

    // Update debug wireframe mesh position
    if (this.debugColliderMesh)
    {
      this.debugColliderMesh.position.copy(pos);
      this.debugColliderMesh.quaternion.copy(quat);
    }
  }

  /**
   * Kill the boar - stop walking and play death animation
   */
  die()
  {
    if (this.isDead) return;

    this.isDead = true;
    this.state = 'dead';
    this.deathProgress = 0;
    this.deathRotationStart = this.boarGroup.rotation.y;
    this.deathRollDirection = Math.random() > 0.5 ? 1 : -1; // Random left or right roll

    // Stop walking animation
    if (this.action)
    {
      this.action.fadeOut(0.2);
    }
  }

  /**
   * Respawn the boar at a new random location
   */
  respawn()
  {
    // Clear any pending respawn timeout
    if (this.respawnTimeout !== null)
    {
      clearTimeout(this.respawnTimeout);
      this.respawnTimeout = null;
    }

    // Generate new random path starting from random location
    const newPath = BoarFactory.generateRandomPath(
    {
      maxLength: 100,
      maxRetries: 100
    });
    if (!newPath)
    {
      console.warn(`${LOG_PREFIX} Failed to generate respawn path, retrying...`);
      // Retry after a short delay
      this.respawnTimeout = setTimeout(() =>
      {
        this.respawnTimeout = null;
        this.respawn();
      }, 100);
      return;
    }

    // Generate new random speed multiplier for this respawn
    this.speedMultiplier = 0.5 + Math.random() * 1.5; // 0.5 to 2.0
    const baseSpeed = this.config.walkingSpeed || 0.8; // m/s
    this.speed = baseSpeed * this.speedMultiplier;

    // Reset state
    this.state = 'respawning';
    this.isDead = false;
    this.deathProgress = 0;
    this.fadeOutProgress = 0;
    this.fadeInProgress = 0;

    // Set new path
    this.path = newPath;
    this.currentWaypointIndex = 0;

    // Set position to start of new path
    const startPos = newPath[0];
    this.position.set(startPos.x, 0, startPos.z);
    this.targetWaypoint = newPath[1] || newPath[0];

    // Reset rotation
    this.facingAngle = 0;
    this.boarGroup.rotation.z = 0;
    this.boarGroup.rotation.y = 0;

    // Update visual position
    this.boarGroup.position.set(startPos.x, this.groundYOffset, startPos.z);

    // Reset opacity to 0 (will fade in)
    this.boarGroup.traverse((child) =>
    {
      if (child.isMesh && child.material)
      {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(mat =>
        {
          mat.transparent = true;
          mat.opacity = 0;
        });
      }
    });

    // Re-enable collider
    if (this.impactDetector && this.colliderHandle >= 0)
    {
      this.impactDetector.setColliderEnabled(this.colliderHandle, true);
    }

    // Restart walking animation with new speed
    if (this.action)
    {
      this.action.reset();
      // Update animation playback speed to match walking speed multiplier
      this.action.setEffectiveTimeScale(this.speedMultiplier);
      this.action.play();
    }

    // Update collider transform
    this.updateColliderTransform();
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

    // Handle respawn fade-in animation
    if (this.state === 'respawning')
    {
      if (this.fadeInProgress < 1)
      {
        this.fadeInProgress += dt / this.fadeInDuration;
        if (this.fadeInProgress > 1) this.fadeInProgress = 1;

        // Fade in opacity
        const opacity = this.fadeInProgress;

        this.boarGroup.traverse((child) =>
        {
          if (child.isMesh && child.material)
          {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(mat =>
            {
              mat.transparent = true;
              mat.opacity = opacity;
            });
          }
        });

        // Update collider transform during fade-in so boar can be hit while respawning
        this.updateColliderTransform();

        // Transition to alive state when fully faded in
        if (this.fadeInProgress >= 1)
        {
          this.state = 'alive';
        }
      }
    }

    // Handle death animation
    if (this.isDead)
    {
      // Death roll animation
      if (this.deathProgress < 1)
      {
        this.deathProgress += dt / this.deathDuration;
        if (this.deathProgress > 1) this.deathProgress = 1;

        // Ease-out for smooth roll
        const t = 1 - Math.pow(1 - this.deathProgress, 2);

        // Roll onto side (rotate around Z axis by 90 degrees, random direction)
        this.boarGroup.rotation.z = t * (Math.PI / 2) * this.deathRollDirection;

        // Slight drop as it falls (but keep it above ground)
        const dropAmount = t * 0.05; // Small drop for realism
        this.boarGroup.position.y = Math.max(this.groundYOffset - dropAmount, this.groundYOffset - 0.05);

        // Update collider during death animation
        this.updateColliderTransform();
      }
      // Fade-out animation (starts after death roll completes)
      else if (this.fadeOutProgress < 1)
      {
        this.fadeOutProgress += dt / this.fadeOutDuration;
        if (this.fadeOutProgress > 1) this.fadeOutProgress = 1;

        // Fade out opacity
        const opacity = 1.0 - this.fadeOutProgress;

        this.boarGroup.traverse((child) =>
        {
          if (child.isMesh && child.material)
          {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(mat =>
            {
              mat.transparent = true;
              mat.opacity = opacity;
            });
          }
        });

        // Respawn when fully faded out
        if (this.fadeOutProgress >= 1)
        {
          this.respawn();
        }
      }
      return; // Don't process movement when dead
    }

    // Skip movement for debug boars (they're static)
    if (this.isDebugBoar)
    {
      // Still update collider transform in case it was rotated
      this.updateColliderTransform();
      return;
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
        // If random walk is enabled, generate new path from current position
        if (this.randomWalk)
        {
          const newPath = BoarFactory.generateRandomPath(
          {
            startPos:
            {
              x: this.position.x,
              z: this.position.z
            },
            maxLength: 100,
            maxRetries: 100
          });

          if (newPath)
          {
            // Use the new path, but skip the first waypoint since we're already there
            this.path = newPath;
            this.currentWaypointIndex = 1;
            this.targetWaypoint = newPath[1] || newPath[0];
          }
          else
          {
            // If path generation failed, just loop the current path
            this.currentWaypointIndex = 0;
            this.targetWaypoint = this.path[0];
          }
        }
        else if (this.loopPath)
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
    // Clear any pending respawn timeout to prevent memory leak
    if (this.respawnTimeout !== null)
    {
      clearTimeout(this.respawnTimeout);
      this.respawnTimeout = null;
    }

    // Remove mesh collider from impact detector
    if (this.impactDetector && this.colliderHandle >= 0)
    {
      this.impactDetector.removeCollider(this.colliderHandle);
      this.colliderHandle = -1;
    }

    // Remove debug collider mesh from scene
    if (this.debugColliderMesh)
    {
      this.scene.remove(this.debugColliderMesh);
      if (this.debugColliderMesh.geometry) this.debugColliderMesh.geometry.dispose();
      if (this.debugColliderMesh.material) this.debugColliderMesh.material.dispose();
      this.debugColliderMesh = null;
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
   * @param {Array<{x: number, y?: number, z: number}>|null} path - Optional array of waypoint positions in meters. If null, generates random path.
   * @returns {Boar} Created boar instance
   */
  static create(path = null)
  {
    if (!BoarFactory.model)
    {
      throw new Error(`${LOG_PREFIX} Factory not initialized. Call init() first.`);
    }

    // Generate random path if none provided
    if (!path)
    {
      path = BoarFactory.generateRandomPath(
      {
        maxLength: 100,
        maxRetries: 200
      });
      if (!path)
      {
        console.warn(`${LOG_PREFIX} Failed to generate initial random path, skipping boar creation`);
        return null;
      }
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

    // Start with fade-in animation
    boar.state = 'respawning';
    boar.fadeInProgress = 0;
    boar.boarGroup.traverse((child) =>
    {
      if (child.isMesh && child.material)
      {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(mat =>
        {
          mat.transparent = true;
          mat.opacity = 0;
        });
      }
    });

    return boar;
  }

  /**
   * Update all boars
   * @param {number} dt - Delta time in seconds
   */
  static updateAll(dt)
  {
    // Update all boars
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
   * Get boar by objectId
   * @param {number} objectId - Boar object ID
   * @returns {Boar|null} Boar instance or null if not found
   */
  static getByObjectId(objectId)
  {
    return BoarFactory.boars.find(boar => boar.objectId === objectId) || null;
  }

  /**
   * Generate a random path that avoids obstacles (flag poles and target racks)
   * @param {Object} options - Configuration options
   * @param {{x: number, z: number}} options.startPos - Optional starting position. If not provided, generates random within bounds
   * @param {number} options.maxLength - Maximum ray length in meters (default: 100)
   * @param {number} options.maxRetries - Maximum retry attempts (default: 100)
   * @returns {Array<{x: number, z: number}>|null} Path with start and end waypoints, or null if no valid path found
   */
  static generateRandomPath(options = {})
  {
    const
    {
      startPos = null,
        maxLength = 100,
        maxRetries = 100
    } = options;

    // Get landscape bounds
    const landscapeConfig = Config.LANDSCAPE_CONFIG;
    const boarConfig = Config.BOAR_CONFIG;
    const halfWidth = landscapeConfig.groundWidth / 2;
    const minX = -halfWidth;
    const maxX = halfWidth;

    // Use boar spawn range instead of full landscape length
    // Negative Z = downrange, so minRange becomes more negative (farther)
    const minZ = -boarConfig.maxRange; // Farthest spawn point (1000 yards)
    const maxZ = -boarConfig.minRange; // Closest spawn point (100 yards)

    // Padding values (meters) - keep small to allow paths through tight spaces
    const boarPadding = 1.0; // Padding for boar width
    const bermPadding = 2.0; // Padding for berms behind targets
    const polePadding = 0.5; // Padding around flag poles

    // Get obstacles
    const flags = WindFlagFactory.getAll();
    const racks = TargetRackFactory.getAll();

    // Helper function to check if ray intersects a circle (pole)
    const rayIntersectsCircle = (startX, startZ, endX, endZ, centerX, centerZ, radius) =>
    {
      // Vector from start to end
      const dx = endX - startX;
      const dz = endZ - startZ;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length === 0) return false;

      // Normalized direction
      const dirX = dx / length;
      const dirZ = dz / length;

      // Vector from start to circle center
      const toCenterX = centerX - startX;
      const toCenterZ = centerZ - startZ;

      // Project toCenter onto direction vector
      const projection = toCenterX * dirX + toCenterZ * dirZ;

      // Closest point on ray to circle center
      const closestX = startX + dirX * Math.max(0, Math.min(length, projection));
      const closestZ = startZ + dirZ * Math.max(0, Math.min(length, projection));

      // Distance from closest point to circle center
      const distX = closestX - centerX;
      const distZ = closestZ - centerZ;
      const dist = Math.sqrt(distX * distX + distZ * distZ);

      return dist < radius;
    };

    // Helper function to check if ray intersects a rectangle (target rack)
    const rayIntersectsRect = (startX, startZ, endX, endZ, rectMinX, rectMinZ, rectMaxX, rectMaxZ) =>
    {
      // Expand rectangle by padding
      const paddedMinX = rectMinX - boarPadding - bermPadding;
      const paddedMinZ = rectMinZ - boarPadding - bermPadding;
      const paddedMaxX = rectMaxX + boarPadding + bermPadding;
      const paddedMaxZ = rectMaxZ + boarPadding + bermPadding;

      // Check if ray segment intersects expanded rectangle
      // Using Liang-Barsky line clipping algorithm
      let t0 = 0;
      let t1 = 1;
      const dx = endX - startX;
      const dz = endZ - startZ;

      const p = [-dx, dx, -dz, dz];
      const q = [startX - paddedMinX, paddedMaxX - startX, startZ - paddedMinZ, paddedMaxZ - startZ];

      for (let i = 0; i < 4; i++)
      {
        if (Math.abs(p[i]) < 1e-10)
        {
          // Ray is parallel to this edge
          if (q[i] < 0) return false; // Ray is outside rectangle
        }
        else
        {
          const r = q[i] / p[i];
          if (p[i] < 0)
          {
            if (r > t1) return false;
            if (r > t0) t0 = r;
          }
          else
          {
            if (r < t0) return false;
            if (r < t1) t1 = r;
          }
        }
      }

      // Ray intersects if t0 < t1 and intersection is within segment [0, 1]
      return t0 < t1 && t1 >= 0 && t0 <= 1;
    };

    // Helper function to check if point is within bounds
    const isInBounds = (x, z) =>
    {
      return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
    };

    // Helper function to check if ray is valid (no obstacles, stays in bounds)
    const isValidRay = (startX, startZ, endX, endZ) =>
    {
      // Check bounds
      if (!isInBounds(startX, startZ) || !isInBounds(endX, endZ))
      {
        return false;
      }

      // Check flag poles
      for (const flag of flags)
      {
        const pos = flag.position; // JS WindFlag stores position directly
        const poleRadius = Config.WIND_FLAG_CONFIG.poleThickness / 2 + polePadding;
        if (rayIntersectsCircle(startX, startZ, endX, endZ, pos.x, pos.z, poleRadius))
        {
          return false;
        }
      }

      // Check target racks
      for (const rack of racks)
      {
        const rectMinX = Math.min(rack.bottomLeft.x, rack.topRight.x);
        const rectMaxX = Math.max(rack.bottomLeft.x, rack.topRight.x);
        const rectMinZ = Math.min(rack.bottomLeft.z, rack.topRight.z);
        const rectMaxZ = Math.max(rack.bottomLeft.z, rack.topRight.z);

        if (rayIntersectsRect(startX, startZ, endX, endZ, rectMinX, rectMinZ, rectMaxX, rectMaxZ))
        {
          return false;
        }
      }

      return true;
    };

    // Try to generate valid path
    for (let attempt = 0; attempt < maxRetries; attempt++)
    {
      // Generate start position (use provided or random)
      let startX, startZ;
      if (startPos)
      {
        startX = startPos.x;
        startZ = startPos.z;
        if (!isInBounds(startX, startZ))
        {
          console.warn(`${LOG_PREFIX} Provided start position is out of bounds`);
          return null;
        }
      }
      else
      {
        // Generate random start position within bounds each attempt
        startX = minX + Math.random() * (maxX - minX);
        startZ = minZ + Math.random() * (maxZ - minZ);
      }

      // Random angle (0 to 2π)
      const angle = Math.random() * Math.PI * 2;
      // Random length (10 to maxLength) - minimum 10m to ensure some movement
      const length = 10 + Math.random() * (maxLength - 10);

      // Calculate end point
      const endX = startX + Math.cos(angle) * length;
      const endZ = startZ + Math.sin(angle) * length;

      // Check if ray is valid
      if (isValidRay(startX, startZ, endX, endZ))
      {
        return [
        {
          x: startX,
          z: startZ
        },
        {
          x: endX,
          z: endZ
        }];
      }
    }

    console.warn(`${LOG_PREFIX} Failed to generate valid path after ${maxRetries} attempts`);
    return null;
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