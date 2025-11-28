import * as THREE from 'three';
import
{
  Config
}
from './config.js';
import
{
  SteelTarget,
  SteelTargetFactory
}
from './SteelTarget.js';
import
{
  DustCloudFactory
}
from './DustCloud.js';
import
{
  ImpactMarkFactory
}
from './ImpactMark.js';

/**
 * Wrapper class for managing a rack of steel targets with beam and support posts
 * 
 * Creates and owns all its resources (beam mesh, support posts, array of SteelTarget instances).
 * Handles automatic spacing and positioning of targets.
 * 
 * Requires window.btk to be initialized (loaded by main application).
 */
export class TargetRack
{

  /**
   * Create a new target rack defined by two corners in meters
   *
   * @param {Object} options - Configuration options
   * @param {{x:number,y:number,z:number}} options.bottomLeft - Bottom-left corner in meters
   * @param {{x:number,y:number,z:number}} options.topRight - Top-right corner in meters
   * @param {number} options.outwardOffset - Outward offset for chain anchors in meters (default 0)
   * @param {THREE.Scene} options.scene - Three.js scene to add meshes to (required)
   */
  constructor(options)
  {
    const
    {
      bottomLeft,
      topRight,
      outwardOffset = 0, // Default 0 meters
      scene
    } = options;

    if (!scene) throw new Error('Scene is required');
    if (!bottomLeft) throw new Error('bottomLeft corner is required');
    if (!topRight) throw new Error('topRight corner is required');

    // Use BTK from window (must be initialized by main application)
    const btk = window.btk;

    this.scene = scene;

    // Store corners
    this.bottomLeft = {
      ...bottomLeft
    };
    this.topRight = {
      ...topRight
    };

    // Derived rack dimensions
    this.width = this.topRight.x - this.bottomLeft.x;
    this.height = this.topRight.y - this.bottomLeft.y;
    this.center = {
      x: (this.bottomLeft.x + this.topRight.x) / 2,
      y: (this.bottomLeft.y + this.topRight.y) / 2,
      z: (this.bottomLeft.z + this.topRight.z) / 2
    };

    // Beam height (top of rack)
    this.beamY = this.topRight.y;

    this.targets = []; // Array of SteelTarget instances
    this.beamMesh = null;
    this.leftPostMesh = null; // Deprecated - kept for impact detection compatibility
    this.rightPostMesh = null; // Deprecated - kept for impact detection compatibility
    this.postInstanceIndices = [null, null]; // [leftIndex, rightIndex] - tracked by factory
    this.outwardOffset = outwardOffset; // Store default outward offset for all targets
  }

  /**
   * Add a target to the rack with automatic positioning
   * @param {Object} options - Target configuration
   * @param {number} options.width - Width in meters (required)
   * @param {number} options.height - Height in meters (required)
   * @param {number} options.thickness - Thickness in meters (default from config, already converted)
   * @param {boolean} options.isOval - True for oval shape, false for rectangle (default false)
   * @param {number} options.outwardOffset - Outward offset for chain anchors in meters (defaults to rack's outwardOffset)
   * @returns {SteelTarget} The created target instance
   */
  addTarget(options)
  {
    const
    {
      width,
      height,
      thickness = 0.5,
      isOval = false,
      outwardOffset = this.outwardOffset // Default to rack's outwardOffset
    } = options;

    if (width === undefined || width === null) throw new Error('Width is required');
    if (height === undefined || height === null) throw new Error('Height is required');

    // Store target configuration for later positioning
    this.targets.push(
    {
      width,
      height,
      thickness,
      isOval,
      outwardOffset, // Store per-target outwardOffset
      steelTarget: null // Will be created in repositionTargets
    });

    // Reposition all targets and update beam/posts
    this.repositionTargets();

    return this.targets[this.targets.length - 1].steelTarget;
  }

  /**
   * Reposition all targets to be evenly spaced across the full rack width
   * Deletes and recreates all targets to ensure correct positioning
   * @private
   */
  repositionTargets()
  {
    const totalTargets = this.targets.length;
    if (totalTargets === 0) return;

    // Delete all existing steel targets (use factory to properly remove from array)
    for (const targetConfig of this.targets)
    {
      if (targetConfig.steelTarget)
      {
        SteelTargetFactory.delete(targetConfig.steelTarget);
        targetConfig.steelTarget = null;
      }
    }

    // Position each target evenly spaced across the full width (in yards)
    for (let i = 0; i < totalTargets; i++)
    {
      const targetConfig = this.targets[i];

      // Evenly distribute centers across the rack width
      const fraction = (i + 0.5) / totalTargets;
      const targetX = this.bottomLeft.x + fraction * (this.topRight.x - this.bottomLeft.x);

      // Create target at correct position using factory
      targetConfig.steelTarget = SteelTargetFactory.create(
      {
        position:
        {
          x: targetX,
          y: this.center.y,
          z: this.center.z
        },
        width: targetConfig.width,
        height: targetConfig.height,
        thickness: targetConfig.thickness,
        isOval: targetConfig.isOval,
        beamHeight: this.beamY,
        outwardOffset: targetConfig.outwardOffset,
        scene: this.scene
      });
    }

    // Update beam and posts to span all targets
    this.updateBeamAndPosts();
  }

  /**
   * Update beam and support posts to span all targets
   * @private
   */
  updateBeamAndPosts()
  {
    const btk = window.btk;

    if (this.targets.length === 0)
    {
      // No targets, remove beam and posts if they exist
      this.removeBeamAndPosts();
      return;
    }

    // Remove existing beam and posts
    this.removeBeamAndPosts();

    // Create beam (2" diameter)
    // Beam radius from config (already in meters)
    const beamRadius = Config.TARGET_CONFIG.beamRadius;
    const beamGeometry = new THREE.CylinderGeometry(beamRadius, beamRadius, this.width, 8);
    const beamMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0xaaaaaa, // Light gray steel
      metalness: 0.6,
      roughness: 0.5
    });
    this.beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);

    // Rotate to horizontal (cylinder is vertical by default)
    this.beamMesh.rotation.z = Math.PI / 2;
    // Beam is at the top of the rack
    this.beamMesh.position.set(this.center.x, this.beamY, this.center.z);
    this.beamMesh.castShadow = true;
    this.beamMesh.receiveShadow = true;

    this.scene.add(this.beamMesh);

    // Posts will be created as instances by TargetRackFactory
    // Store post data for factory initialization
    const postRadius = Config.TARGET_CONFIG.postRadius;
    const postCenterY = this.bottomLeft.y + this.height / 2;

    // Create temporary meshes for impact detection (not added to scene)
    const postGeometry = new THREE.CylinderGeometry(postRadius, postRadius, this.height, 8);
    const postMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0xaaaaaa, // Light gray steel
      metalness: 0.6,
      roughness: 0.5
    });

    // Left post - for impact detection only
    this.leftPostMesh = new THREE.Mesh(postGeometry.clone(), postMaterial);
    this.leftPostMesh.position.set(this.bottomLeft.x, postCenterY, this.center.z);
    // Don't add to scene - will be instanced

    // Right post - for impact detection only
    this.rightPostMesh = new THREE.Mesh(postGeometry.clone(), postMaterial.clone());
    this.rightPostMesh.position.set(this.topRight.x, postCenterY, this.center.z);
    // Don't add to scene - will be instanced
  }

  /**
   * Get the frame meshes (beam and posts) for collision detection
   * @returns {THREE.Mesh[]} Array of frame meshes
   */
  getFrameMeshes()
  {
    const meshes = [];
    if (this.beamMesh) meshes.push(this.beamMesh);
    if (this.leftPostMesh) meshes.push(this.leftPostMesh);
    if (this.rightPostMesh) meshes.push(this.rightPostMesh);
    return meshes;
  }

  /**
   * Register frame meshes with the impact detector
   * @param {ImpactDetector} impactDetector - The impact detector to register with
   */
  registerWithImpactDetector(impactDetector)
  {
    if (!impactDetector) return;

    const frameMeshes = this.getFrameMeshes();
    for (const mesh of frameMeshes)
    {
      // Clone geometry and apply world transform
      const transformedGeometry = mesh.geometry.clone();
      mesh.updateMatrixWorld();
      transformedGeometry.applyMatrix4(mesh.matrixWorld);

      impactDetector.addMeshFromGeometry(
        transformedGeometry,
        {
          name: 'RackFrame',
          soundName: 'ricochet', // Metal ricochet sound
          mesh: mesh, // Store mesh reference for decal projection
          onImpact: (impactPosition, normal, velocity, scene, windGenerator, targetMesh) =>
          {
            const pos = new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z);

            // Small metal dust puff
            DustCloudFactory.create(
            {
              position: pos,
              scene: scene,
              numParticles: 200,
              color:
              {
                r: 180,
                g: 180,
                b: 180
              }, // Light grey
              windGenerator: windGenerator,
              initialRadius: 0.02,
              growthRate: 0.08,
              particleDiameter: 0.3
            });

            // Small dark impact mark (1cm)
            ImpactMarkFactory.create(
            {
              position: pos,
              normal: normal,
              velocity: velocity,
              mesh: targetMesh,
              color: 0x2a2a2a, // Dark grey
              size: 0.2 // 1cm (0.2 * 5cm base = 1cm)
            });
          }
        }
      );
    }
  }

  /**
   * Remove beam and posts from scene
   * @private
   */
  removeBeamAndPosts()
  {
    if (this.beamMesh)
    {
      this.scene.remove(this.beamMesh);
      if (this.beamMesh.geometry) this.beamMesh.geometry.dispose();
      if (this.beamMesh.material) this.beamMesh.material.dispose();
      this.beamMesh = null;
    }

    // Post meshes are not in scene (instanced), but dispose geometries for impact detection
    if (this.leftPostMesh)
    {
      if (this.leftPostMesh.geometry) this.leftPostMesh.geometry.dispose();
      if (this.leftPostMesh.material) this.leftPostMesh.material.dispose();
      this.leftPostMesh = null;
    }

    if (this.rightPostMesh)
    {
      if (this.rightPostMesh.geometry) this.rightPostMesh.geometry.dispose();
      if (this.rightPostMesh.material) this.rightPostMesh.material.dispose();
      this.rightPostMesh = null;
    }
  }

  /**
   * Get all targets in this rack
   * @returns {SteelTarget[]} Array of all targets
   */
  getTargets()
  {
    return this.targets.map(t => t.steelTarget).filter(t => t !== null);
  }

  /**
   * Get total rack width in meters
   * @returns {number} Width in meters
   */
  getWidth()
  {
    return this.width;
  }

  /**
   * Clean up all resources (beam, posts, targets)
   */
  dispose()
  {
    // Dispose all targets and remove from factory
    for (const targetConfig of this.targets)
    {
      if (targetConfig.steelTarget)
      {
        SteelTargetFactory.delete(targetConfig.steelTarget);
      }
    }
    this.targets = [];

    // Remove beam and posts
    this.removeBeamAndPosts();
  }
}

/**
 * Factory class for managing collections of target racks
 */
export class TargetRackFactory
{
  /**
   * Static collection of all active target racks
   * @type {TargetRack[]}
   */
  static racks = [];

  /**
   * Instanced mesh for all posts (shared across all racks)
   * @type {THREE.InstancedMesh|null}
   */
  static postMesh = null;
  static postScene = null;

  /**
   * Create a new target rack and add it to the collection
   * @param {Object} options - Configuration options for TargetRack
   * @returns {TargetRack} The created rack instance
   */
  static create(options)
  {
    const rack = new TargetRack(options);
    TargetRackFactory.racks.push(rack);
    return rack;
  }

  /**
   * Delete all target racks
   */
  static deleteAll()
  {
    for (const rack of TargetRackFactory.racks)
    {
      rack.dispose();
    }
    TargetRackFactory.racks = [];
  }

  /**
   * Delete a specific rack by reference
   * @param {TargetRack} rack - The rack instance to delete
   * @returns {boolean} True if rack was found and deleted, false otherwise
   */
  static delete(rack)
  {
    const index = TargetRackFactory.racks.indexOf(rack);
    if (index !== -1)
    {
      rack.dispose();
      TargetRackFactory.racks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all target racks
   * @returns {TargetRack[]} Array of all active racks
   */
  static getAll()
  {
    return TargetRackFactory.racks;
  }

  /**
   * Get number of active racks
   * @returns {number} Number of racks
   */
  static getCount()
  {
    return TargetRackFactory.racks.length;
  }

  /**
   * Get all targets from all racks
   * @returns {SteelTarget[]} Array of all targets from all racks
   */
  static getAllTargets()
  {
    const allTargets = [];
    for (const rack of TargetRackFactory.racks)
    {
      allTargets.push(...rack.getTargets());
    }
    return allTargets;
  }

  /**
   * Initialize instanced post mesh (call once after all racks are created)
   * @param {THREE.Scene} scene - Three.js scene
   */
  static initializePostInstancing(scene)
  {
    // Count total posts (2 per rack)
    const totalPosts = this.racks.length * 2;
    if (totalPosts === 0) return;

    this.postScene = scene;

    // Post radius from config (already in meters)
    const postRadius = Config.TARGET_CONFIG.postRadius;
    const basePostHeight = 1.0; // Unit height for scaling

    // Create base cylinder geometry (will be scaled per instance)
    const postGeometry = new THREE.CylinderGeometry(postRadius, postRadius, basePostHeight, 8);
    postGeometry.computeVertexNormals();

    // Shared material for all posts
    const postMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0xaaaaaa, // Light gray steel
      metalness: 0.6,
      roughness: 0.5
    });

    // Create instanced mesh for all posts
    this.postMesh = new THREE.InstancedMesh(postGeometry, postMaterial, totalPosts);
    this.postMesh.castShadow = true;
    this.postMesh.receiveShadow = true;
    scene.add(this.postMesh);

    // Assign instance indices and set matrices for each rack's posts
    const instanceMatrix = new THREE.Matrix4();
    const identityRotation = new THREE.Quaternion();
    let instanceIndex = 0;

    for (const rack of this.racks)
    {
      // Calculate post center Y position
      const postCenterY = rack.bottomLeft.y + rack.height / 2;

      // Left post
      const leftScale = new THREE.Vector3(1, rack.height / basePostHeight, 1);
      instanceMatrix.compose(
        new THREE.Vector3(rack.bottomLeft.x, postCenterY, rack.center.z),
        identityRotation,
        leftScale
      );
      this.postMesh.setMatrixAt(instanceIndex, instanceMatrix);
      rack.postInstanceIndices[0] = instanceIndex++;

      // Right post
      const rightScale = new THREE.Vector3(1, rack.height / basePostHeight, 1);
      instanceMatrix.compose(
        new THREE.Vector3(rack.topRight.x, postCenterY, rack.center.z),
        identityRotation,
        rightScale
      );
      this.postMesh.setMatrixAt(instanceIndex, instanceMatrix);
      rack.postInstanceIndices[1] = instanceIndex++;
    }

    this.postMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Delete all target racks
   */
  static deleteAll()
  {
    for (const rack of TargetRackFactory.racks)
    {
      rack.dispose();
    }
    TargetRackFactory.racks = [];

    // Dispose instanced post mesh
    if (this.postMesh && this.postScene)
    {
      this.postScene.remove(this.postMesh);
      this.postMesh.geometry.dispose();
      this.postMesh.material.dispose();
      this.postMesh = null;
    }
    this.postScene = null;
  }
}