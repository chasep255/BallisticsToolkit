import * as THREE from 'three';
import { Config } from './config.js';
import
{
  SteelTarget,
  SteelTargetFactory
}
from './SteelTarget.js';

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
    this.leftPostMesh = null;
    this.rightPostMesh = null;
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

    // Delete all existing steel targets
    for (const targetConfig of this.targets)
    {
      if (targetConfig.steelTarget)
      {
        targetConfig.steelTarget.dispose();
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
    const beamGeometry = new THREE.CylinderGeometry(beamRadius, beamRadius, this.width, 16);
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

    // Create support posts (vertical posts spanning from bottom to top, 2" diameter)
    // Post radius from config (already in meters)
    const postRadius = Config.TARGET_CONFIG.postRadius;
    const postGeometry = new THREE.CylinderGeometry(postRadius, postRadius, this.height, 16);
    const postMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0xaaaaaa, // Light gray steel
      metalness: 0.6,
      roughness: 0.5
    });

    // Posts extend from bottom to top
    // Cylinder center is at midpoint: bottom + height/2
    const postCenterY = this.bottomLeft.y + this.height / 2;

    // Left post - at left edge, spanning from bottom to top
    this.leftPostMesh = new THREE.Mesh(postGeometry, postMaterial);
    this.leftPostMesh.position.set(this.bottomLeft.x, postCenterY, this.center.z);
    this.leftPostMesh.castShadow = true;
    this.leftPostMesh.receiveShadow = true;
    this.scene.add(this.leftPostMesh);

    // Right post - at right edge, spanning from bottom to top
    this.rightPostMesh = new THREE.Mesh(postGeometry, postMaterial.clone());
    this.rightPostMesh.position.set(this.topRight.x, postCenterY, this.center.z);
    this.rightPostMesh.castShadow = true;
    this.rightPostMesh.receiveShadow = true;
    this.scene.add(this.rightPostMesh);
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

    if (this.leftPostMesh)
    {
      this.scene.remove(this.leftPostMesh);
      if (this.leftPostMesh.geometry) this.leftPostMesh.geometry.dispose();
      if (this.leftPostMesh.material) this.leftPostMesh.material.dispose();
      this.leftPostMesh = null;
    }

    if (this.rightPostMesh)
    {
      this.scene.remove(this.rightPostMesh);
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
}