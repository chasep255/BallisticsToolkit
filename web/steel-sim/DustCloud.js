import * as THREE from 'three';

/**
 * Wrapper class for C++ DustCloud that manages Three.js rendering resources
 * and automatically disposes when animation is complete.
 * 
 * Creates and owns all its resources (C++ physics object, Three.js instanced mesh, geometry, material).
 * 
 * Requires window.btk to be initialized (loaded by main application).
 */
export class DustCloud {

  /**
   * Create a new dust cloud
   * @param {Object} options - Configuration options
   * @param {THREE.Vector3} options.position - Impact position in Three.js coordinates (required)
   * @param {THREE.Scene} options.scene - Three.js scene to add mesh to (required)
   * @param {number} options.numParticles - Number of particles (default 500)
   * @param {Object} options.color - RGB color {r, g, b} 0-255 (default brown: {r: 139, g: 115, b: 85})
   *                                 Each particle gets random color jitter (±20%)
   * @param {THREE.Vector3} options.wind - Wind vector in Three.js coordinates (default {x: 0, y: 0, z: 0})
   * @param {number} options.initialVelocityScale - Initial velocity scale in m/s (default 1.0 m/s)
   * @param {number} options.fadeRate - Exponential fade rate per second (default 0.5 = e^(-0.5t))
   * @param {number} options.dragCoefficient - Drag coefficient for quadratic drag (default 10.0, higher = stronger drag)
   * @param {number} options.particleDiameter - Particle diameter in meters (default 0.006 = 6mm)
   */
  constructor(options) {
    const {
      position,
      scene,
      numParticles = 500,
      color = { r: 139, g: 115, b: 85 },
      wind = { x: 0, y: 0, z: 0 }, // Default: no wind
      initialVelocityScale = 1.0, // 1.0 m/s default
      fadeRate = 0.5, // Exponential decay rate (e^(-0.5t)
      dragCoefficient = 10.0, // Quadratic drag coefficient (higher = stronger drag)
      particleDiameter = 0.006 // 6mm default
    } = options;

    if (!scene) throw new Error('Scene is required');
    if (!position) throw new Error('Position is required');
    
    // Use BTK from window (must be initialized by main application)
    const btk = window.btk;

    this.scene = scene;

    // Convert impact point to BTK coordinates
    const impactPos = window.threeJsToBtk(position);
    
    // Convert wind vector to BTK coordinates
    // Three.js: X=right, Y=up, Z=towards camera
    // BTK: X=downrange, Y=crossrange, Z=up
    const windThree = new THREE.Vector3(wind.x, wind.y, wind.z);
    const windBtk = window.threeJsToBtk(windThree);
    
    // Create C++ dust cloud
    // Particles spawn from exact position with random initial velocities
    // Alpha fades linearly over time
    // Each particle gets random color jitter
    // Velocity slows down due to quadratic drag (F ∝ v²), wind advects particles
    this.dustCloud = new btk.DustCloud(
      numParticles,
      impactPos,
      windBtk,
      color.r,
      color.g,
      color.b,
      initialVelocityScale,
      fadeRate,
      dragCoefficient,
      particleDiameter
    );
    
    // Cleanup temporary BTK objects
    impactPos.delete();
    windBtk.delete();

    // Create Three.js instanced mesh for rendering
    this.instancedMesh = this.createInstancedMesh(numParticles, color, particleDiameter);
    this.scene.add(this.instancedMesh);
  }

  /**
   * Create Three.js instanced mesh for dust particles
   * @private
   */
  createInstancedMesh(numParticles, color, particleDiameter) {
    // Create sphere geometry for particles (radius = diameter / 2)
    const particleRadius = particleDiameter / 2;
    this.sphereGeometry = new THREE.SphereGeometry(particleRadius, 6, 6);
    
    // Create material with dust color
    this.sphereMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color.r / 255, color.g / 255, color.b / 255),
      transparent: true,
      opacity: 1.0,
      roughness: 0.8,
      metalness: 0.1
    });
    
    // Create instanced mesh
    const instancedMesh = new THREE.InstancedMesh(
      this.sphereGeometry,
      this.sphereMaterial,
      numParticles
    );
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = false;
    
    return instancedMesh;
  }

  /**
   * Update physics and rendering
   * @param {number} dt - Time step in seconds
   */
  update(dt) {
    if (!this.dustCloud) return;
    
    // Step physics
    this.dustCloud.timeStep(dt);
    
    // Get instance matrices from C++
    const matrices = this.dustCloud.getInstanceMatrices();
    
    // Check if any particles are still visible
    if (matrices.length > 0) {
      const numParticles = matrices.length / 16; // 16 floats per matrix
      
      // Get global alpha for the cloud
      const alpha = this.dustCloud.getAlpha();
      
      // Copy matrices directly into instanceMatrix buffer (bulk copy from WASM memory view)
      const instanceMatrixArray = this.instancedMesh.instanceMatrix.array;
      instanceMatrixArray.set(matrices);
      
      // Update instance count
      this.instancedMesh.count = numParticles;
      this.instancedMesh.instanceMatrix.needsUpdate = true;
      
      // Update material opacity with global alpha
      this.sphereMaterial.opacity = alpha;
      
      // Always cast shadows while particles are being rendered
      // Note: Three.js shadow maps don't support gradual fading, so shadows will
      // be visible until particles fade completely. This is a limitation of shadow maps.
      this.instancedMesh.castShadow = true;
    } else {
      // No particles visible - disable shadows and set opacity to 0
      this.instancedMesh.castShadow = false;
      this.sphereMaterial.opacity = 0.0;
    }
  }

  /**
   * Check if dust cloud animation is complete
   * @returns {boolean} True if all particles have faded out
   */
  isDone() {
    return this.dustCloud ? this.dustCloud.isDone() : true;
  }

  /**
   * Clean up all resources (C++ object, Three.js objects)
   */
  dispose() {
    // Clean up physics object
    if (this.dustCloud) {
      this.dustCloud.delete();
      this.dustCloud = null;
    }
    
    // Clean up instanced mesh
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
      this.instancedMesh = null;
    }
    
    // Clean up geometry
    if (this.sphereGeometry) {
      this.sphereGeometry.dispose();
      this.sphereGeometry = null;
    }
    
    // Clean up material
    if (this.sphereMaterial) {
      this.sphereMaterial.dispose();
      this.sphereMaterial = null;
    }
  }
}

/**
 * Factory class for managing collections of dust clouds
 */
export class DustCloudFactory {
  /**
   * Static collection of all active dust clouds
   * @type {DustCloud[]}
   */
  static clouds = [];

  /**
   * Create a new dust cloud and add it to the collection
   * @param {Object} options - Configuration options for DustCloud
   * @returns {DustCloud} The created dust cloud instance
   */
  static create(options) {
    const cloud = new DustCloud(options);
    DustCloudFactory.clouds.push(cloud);
    return cloud;
  }

  /**
   * Delete a specific cloud by reference
   * @param {DustCloud} cloud - The cloud instance to delete
   * @returns {boolean} True if cloud was found and deleted, false otherwise
   */
  static delete(cloud) {
    const index = DustCloudFactory.clouds.indexOf(cloud);
    if (index === -1) {
      return false;
    }
    
    cloud.dispose();
    DustCloudFactory.clouds.splice(index, 1);
    return true;
  }

  /**
   * Delete a cloud by index
   * @param {number} index - Index of cloud to delete
   * @returns {boolean} True if cloud was found and deleted, false otherwise
   */
  static deleteAt(index) {
    if (index < 0 || index >= DustCloudFactory.clouds.length) {
      return false;
    }
    
    const cloud = DustCloudFactory.clouds[index];
    cloud.dispose();
    DustCloudFactory.clouds.splice(index, 1);
    return true;
  }

  /**
   * Delete all dust clouds
   */
  static deleteAll() {
    for (const cloud of DustCloudFactory.clouds) {
      cloud.dispose();
    }
    DustCloudFactory.clouds = [];
  }

  /**
   * Update all dust clouds (physics and rendering)
   * Automatically disposes clouds when animation is complete
   * @param {number} dt - Time step in seconds
   */
  static updateAll(dt) {
    // Iterate backwards to safely remove items while iterating
    for (let i = DustCloudFactory.clouds.length - 1; i >= 0; i--) {
      const cloud = DustCloudFactory.clouds[i];
      
      // Update physics and rendering
      cloud.update(dt);
      
      // Check if animation is complete and auto-dispose
      if (cloud.isDone()) {
        cloud.dispose();
        DustCloudFactory.clouds.splice(i, 1);
      }
    }
  }

  /**
   * Get all dust clouds
   * @returns {DustCloud[]} Array of all active dust clouds
   */
  static getAll() {
    return DustCloudFactory.clouds;
  }

  /**
   * Get dust cloud count
   * @returns {number} Number of active dust clouds
   */
  static getCount() {
    return DustCloudFactory.clouds.length;
  }

  /**
   * Get a dust cloud by index
   * @param {number} index - Index of cloud to get
   * @returns {DustCloud|null} Cloud instance or null if index is invalid
   */
  static getAt(index) {
    if (index < 0 || index >= DustCloudFactory.clouds.length) {
      return null;
    }
    return DustCloudFactory.clouds[index];
  }
}

