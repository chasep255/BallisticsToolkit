import * as THREE from 'three';

/**
 * Wrapper class for C++ DustCloud that manages Three.js rendering resources
 * and automatically disposes when animation is complete.
 * 
 * Creates and owns all its resources (C++ physics object, Three.js instanced mesh, geometry, material).
 * 
 * Requires window.btk to be initialized (loaded by main application).
 */
export class DustCloud
{

  /**
   * Create a new dust cloud
   * @param {Object} options - Configuration options
   * @param {THREE.Vector3} options.position - Initial cloud center position in Three.js coordinates (required)
   * @param {THREE.Scene} options.scene - Three.js scene to add mesh to (required)
   * @param {number} options.numParticles - Number of particles (required)
   * @param {Object} options.color - RGB color {r, g, b} 0-255 (required)
   *                                 Each particle gets random color jitter (±20%)
   * @param {Object} options.wind - Wind vector in mph, Three.js coordinates (required)
   * @param {number} options.initialRadius - Initial cloud radius in yards (required)
   * @param {number} options.growthRate - Cloud radius growth rate in feet/second (required)
   * @param {number} options.particleDiameter - Particle diameter in yards (required)
   * Note: Alpha decays automatically with volume growth (no separate fade rate)
   */
  constructor(options)
  {
    const
    {
      position,
      scene,
      numParticles,
      color,
      wind,
      initialRadius,
      growthRate,
      particleDiameter
    } = options;

    if (!scene) throw new Error('Scene is required');
    if (!position) throw new Error('Position is required');

    // Use BTK from window (must be initialized by main application)
    const btk = window.btk;

    this.scene = scene;

    // Convert impact point (yards, Three.js coords) to BTK coordinates (meters)
    const impactPos = window.threeJsToBtkPosition(position);

    // Convert wind vector (mph, Three.js coords) to BTK coordinates (m/s)
    const windMph = new THREE.Vector3(wind.x, wind.y, wind.z);
    const windBtk = window.threeJsToBtkVelocityMph(windMph);

    // Convert parameters from yards/fps to meters/mps for BTK
    const initialRadiusMeters = btk.Conversions.yardsToMeters(initialRadius);
    const growthRateMps = btk.Conversions.fpsToMps(growthRate);

    // Create C++ dust cloud
    // Particles have relative positions from cloud center (Gaussian distribution)
    // Cloud radius grows linearly over time
    // Cloud center advects with wind
    // Alpha decays with volume: alpha = (initial_radius / current_radius)³
    this.dustCloud = new btk.DustCloud(
      numParticles,
      impactPos,
      windBtk,
      initialRadiusMeters,
      growthRateMps
    );

    // Cleanup temporary BTK objects
    impactPos.delete();
    windBtk.delete();

    // Store particle diameter for material sizing
    this.particleDiameter = particleDiameter;

    // Generate colors once (with jitter for variation)
    this.particleColors = this.generateColors(numParticles, color);

    // Create Three.js points for rendering
    this.points = this.createPoints(numParticles, particleDiameter);
    this.scene.add(this.points);
  }

  /**
   * Generate colors for particles with random jitter
   * @private
   */
  generateColors(numParticles, baseColor)
  {
    const colors = new Float32Array(numParticles * 3);
    const baseR = baseColor.r / 255.0;
    const baseG = baseColor.g / 255.0;
    const baseB = baseColor.b / 255.0;

    for(let i = 0; i < numParticles; ++i)
    {
      // Add random color jitter (±20% variation)
      const jitterR = baseR + (Math.random() - 0.5) * baseR * 0.4;
      const jitterG = baseG + (Math.random() - 0.5) * baseG * 0.4;
      const jitterB = baseB + (Math.random() - 0.5) * baseB * 0.4;

      colors[i * 3 + 0] = Math.max(0, Math.min(1, jitterR));
      colors[i * 3 + 1] = Math.max(0, Math.min(1, jitterG));
      colors[i * 3 + 2] = Math.max(0, Math.min(1, jitterB));
    }

    return colors;
  }

  /**
   * Create Three.js points for dust particles
   * @private
   */
  createPoints(numParticles, particleDiameter)
  {
    // Create buffer geometry for points
    this.pointsGeometry = new THREE.BufferGeometry();

    // Initialize position and color attributes
    const positions = new Float32Array(numParticles * 3);
    const colors = this.particleColors; // Use pre-generated colors

    this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Create material for points
    // Size is in world units (yards)
    this.pointsMaterial = new THREE.PointsMaterial(
    {
      size: particleDiameter, // Size in yards (world units)
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true
    });

    // Create points object
    const points = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
    points.frustumCulled = false;

    return points;
  }

  /**
   * Update physics and rendering
   * @param {number} dt - Time step in seconds
   */
  update(dt)
  {
    if (!this.dustCloud) return;

    // Step physics
    this.dustCloud.timeStep(dt);

    // Get positions from C++
    const positions = this.dustCloud.getPositions();

    // Check if any particles are still visible
    if (positions.length > 0)
    {
      const numParticles = positions.length / 3; // 3 floats per position

      // Get global alpha for the cloud
      const alpha = this.dustCloud.getAlpha();

      // Get position attribute
      const positionAttr = this.pointsGeometry.attributes.position;

      // Copy positions directly into buffer attribute (bulk copy from WASM memory view)
      positionAttr.array.set(positions);

      // Mark attribute as needing update
      positionAttr.needsUpdate = true;

      // Update material opacity with global alpha
      this.pointsMaterial.opacity = alpha;

      // Update point count
      this.pointsGeometry.setDrawRange(0, numParticles);
    }
    else
    {
      // No particles visible - set opacity to 0 and draw range to 0
      this.pointsMaterial.opacity = 0.0;
      this.pointsGeometry.setDrawRange(0, 0);
    }
  }

  /**
   * Check if dust cloud animation is complete
   * @returns {boolean} True if all particles have faded out
   */
  isDone()
  {
    return this.dustCloud ? this.dustCloud.isDone() : true;
  }

  /**
   * Clean up all resources (C++ object, Three.js objects)
   */
  dispose()
  {
    // Clean up physics object
    if (this.dustCloud)
    {
      this.dustCloud.delete();
      this.dustCloud = null;
    }

    // Clean up points
    if (this.points)
    {
      this.scene.remove(this.points);
      this.points = null;
    }

    // Clean up geometry
    if (this.pointsGeometry)
    {
      this.pointsGeometry.dispose();
      this.pointsGeometry = null;
    }

    // Clean up material
    if (this.pointsMaterial)
    {
      this.pointsMaterial.dispose();
      this.pointsMaterial = null;
    }
  }
}

/**
 * Factory class for managing collections of dust clouds
 */
export class DustCloudFactory
{
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
  static create(options)
  {
    const cloud = new DustCloud(options);
    DustCloudFactory.clouds.push(cloud);
    return cloud;
  }

  /**
   * Delete a specific cloud by reference
   * @param {DustCloud} cloud - The cloud instance to delete
   * @returns {boolean} True if cloud was found and deleted, false otherwise
   */
  static delete(cloud)
  {
    const index = DustCloudFactory.clouds.indexOf(cloud);
    if (index === -1)
    {
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
  static deleteAt(index)
  {
    if (index < 0 || index >= DustCloudFactory.clouds.length)
    {
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
  static deleteAll()
  {
    for (const cloud of DustCloudFactory.clouds)
    {
      cloud.dispose();
    }
    DustCloudFactory.clouds = [];
  }

  /**
   * Update all dust clouds (physics and rendering)
   * Automatically disposes clouds when animation is complete
   * @param {number} dt - Time step in seconds
   */
  static updateAll(dt)
  {
    // Iterate backwards to safely remove items while iterating
    for (let i = DustCloudFactory.clouds.length - 1; i >= 0; i--)
    {
      const cloud = DustCloudFactory.clouds[i];

      // Update physics and rendering
      cloud.update(dt);

      // Check if animation is complete and auto-dispose
      if (cloud.isDone())
      {
        cloud.dispose();
        DustCloudFactory.clouds.splice(i, 1);
      }
    }
  }

  /**
   * Get all dust clouds
   * @returns {DustCloud[]} Array of all active dust clouds
   */
  static getAll()
  {
    return DustCloudFactory.clouds;
  }

  /**
   * Get dust cloud count
   * @returns {number} Number of active dust clouds
   */
  static getCount()
  {
    return DustCloudFactory.clouds.length;
  }

  /**
   * Get a dust cloud by index
   * @param {number} index - Index of cloud to get
   * @returns {DustCloud|null} Cloud instance or null if index is invalid
   */
  static getAt(index)
  {
    if (index < 0 || index >= DustCloudFactory.clouds.length)
    {
      return null;
    }
    return DustCloudFactory.clouds[index];
  }
}