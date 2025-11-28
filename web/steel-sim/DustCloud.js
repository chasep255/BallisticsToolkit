import * as THREE from 'three';

/**
 * DustCloud - Pure JavaScript dust cloud implementation matching C++ dust_cloud.cpp logic
 * Particles use Gaussian distribution, radius grows linearly, alpha decays inversely with radius
 */

const ALPHA_THRESHOLD = 0.01;

/**
 * Generate a Gaussian random number using Box-Muller transform
 * @private
 */
function gaussianRandom()
{
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export class DustCloud
{
  /**
   * Create a new dust cloud
   * @param {Object} options - Configuration options
   * @param {THREE.Vector3} options.position - Initial cloud center position in meters (required)
   * @param {THREE.Scene} options.scene - Three.js scene to add mesh to (required)
   * @param {number} options.numParticles - Number of particles (required)
   * @param {Object} options.color - RGB color {r, g, b} 0-255 (required)
   * @param {Object} options.windGenerator - Wind generator instance (required)
   * @param {number} options.initialRadius - Initial cloud radius in meters (required)
   * @param {number} options.growthRate - Cloud radius growth rate in m/s (required)
   * @param {number} options.particleDiameter - Particle diameter in meters (required)
   */
  constructor(options)
  {
    const
    {
      position,
      scene,
      numParticles,
      color,
      windGenerator,
      initialRadius,
      growthRate,
      particleDiameter
    } = options;

    if (!scene) throw new Error('Scene is required');
    if (!position) throw new Error('Position is required');
    if (!windGenerator) throw new Error('WindGenerator is required');

    this.scene = scene;
    this.windGenerator = windGenerator;

    // Store state matching C++ implementation
    this.centerPosition = position.clone();
    this.initialRadius = initialRadius;
    this.growthRate = growthRate;
    this.radius = initialRadius;
    this.alpha = 1.0;
    this.particleDiameter = particleDiameter;

    // Generate relative positions using Gaussian distribution (matching C++ logic)
    // Gaussian distribution creates denser distribution at center, tapering off at edges
    this.relativePositions = [];
    for (let i = 0; i < numParticles; i++)
    {
      // Relative position using Gaussian distribution (normal random, mean=0, stddev=1)
      // Scale by initial radius so particles are distributed within the initial cloud size
      const relX = gaussianRandom() * initialRadius;
      const relY = gaussianRandom() * initialRadius;
      const relZ = gaussianRandom() * initialRadius;
      this.relativePositions.push(new THREE.Vector3(relX, relY, relZ));
    }

    // Generate colors once (with jitter for variation)
    this.particleColors = this.generateColors(numParticles, color);

    // Create instanced spheres for rendering
    this.mesh = this.createInstancedSpheres(numParticles, particleDiameter, color);
    this.scene.add(this.mesh);
    
    // Initialize instance matrices immediately with initial positions
    this._hasLoggedPositions = false;
    this.updateInstanceMatrices();
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

    for (let i = 0; i < numParticles; ++i)
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
   * Create instanced spheres for dust particles
   * @private
   */
  createInstancedSpheres(numParticles, particleDiameter, baseColor)
  {
    // Low-poly sphere geometry (icosahedron with 1 subdivision = 80 triangles)
    const sphereGeometry = new THREE.IcosahedronGeometry(0.5, 1); // Unit radius, will be scaled by instance matrix
    
    // Convert base color to THREE.Color (average of particle colors for simplicity)
    const avgR = Array.from({length: numParticles}, (_, i) => this.particleColors[i * 3 + 0]).reduce((a, b) => a + b) / numParticles;
    const avgG = Array.from({length: numParticles}, (_, i) => this.particleColors[i * 3 + 1]).reduce((a, b) => a + b) / numParticles;
    const avgB = Array.from({length: numParticles}, (_, i) => this.particleColors[i * 3 + 2]).reduce((a, b) => a + b) / numParticles;
    
    const color = new THREE.Color(avgR, avgG, avgB);

    // Create simple material
    this.material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 1.0
    });

    // Create instanced mesh
    const instancedMesh = new THREE.InstancedMesh(sphereGeometry, this.material, numParticles);
    instancedMesh.frustumCulled = false;

    // Initialize instance matrix (will be updated each frame)
    this.instanceMatrix = new THREE.Matrix4();

    return instancedMesh;
  }

  /**
   * Update instance matrices with current particle positions
   * @private
   */
  updateInstanceMatrices()
  {
    if (!this.mesh || this.alpha < ALPHA_THRESHOLD)
    {
      if (this.mesh)
      {
        this.mesh.count = 0;
      }
      return;
    }

    const numParticles = this.relativePositions.length;
    const minSize = 0.01; // 1cm minimum
    const scale = Math.max(this.particleDiameter / 2, minSize);
    const scaleVec = new THREE.Vector3(scale, scale, scale);
    const quaternion = new THREE.Quaternion(); // No rotation
    const positionVec = new THREE.Vector3();
    const radiusScale = this.radius / this.initialRadius;

    for (let i = 0; i < numParticles; i++)
    {
      // Calculate world position: center + scaled relative position
      const relPos = this.relativePositions[i];
      positionVec.set(
        this.centerPosition.x + relPos.x * radiusScale,
        this.centerPosition.y + relPos.y * radiusScale,
        this.centerPosition.z + relPos.z * radiusScale
      );

      // Compose matrix from position, rotation, and scale
      this.instanceMatrix.compose(positionVec, quaternion, scaleVec);
      this.mesh.setMatrixAt(i, this.instanceMatrix);
    }

    // Debug: log first few positions on first update
    if (!this._hasLoggedPositions && numParticles > 0)
    {
      const firstPos = new THREE.Vector3(
        this.centerPosition.x + this.relativePositions[0].x * radiusScale,
        this.centerPosition.y + this.relativePositions[0].y * radiusScale,
        this.centerPosition.z + this.relativePositions[0].z * radiusScale
      );
      console.log('[DustCloud] First update - numParticles:', numParticles, 'alpha:', this.alpha.toFixed(3));
      console.log('[DustCloud] Center position:', this.centerPosition.x.toFixed(2), this.centerPosition.y.toFixed(2), this.centerPosition.z.toFixed(2));
      console.log('[DustCloud] First particle position:', firstPos.x.toFixed(2), firstPos.y.toFixed(2), firstPos.z.toFixed(2));
      console.log('[DustCloud] Sphere scale:', scale.toFixed(4), 'm (particleDiameter:', this.particleDiameter.toFixed(4), 'm)');
      this._hasLoggedPositions = true;
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = numParticles;
  }

  /**
   * Update physics and rendering
   * @param {Object} windGenerator - Wind generator for sampling wind at cloud center
   * @param {number} dt - Time step in seconds
   */
  update(windGenerator, dt)
  {
    if (!this.mesh || !windGenerator) return;

    // Match C++ timeStep logic:
    // 1. Grow radius linearly over time
    this.radius += this.growthRate * dt;

    // 2. Calculate alpha inversely proportional to radius: alpha = (initial_radius / current_radius)³
    if (this.radius > 0.0)
    {
      this.alpha = this.initialRadius / this.radius;
      this.alpha = this.alpha * this.alpha * this.alpha; // Cube it
      if (this.alpha < 0.0)
      {
        this.alpha = 0.0;
      }
    }
    else
    {
      this.alpha = 0.0;
    }

    // 3. Advect cloud center with wind (move with the air velocity)
    const wind = windGenerator.sample(this.centerPosition.x, this.centerPosition.y, this.centerPosition.z);
    this.centerPosition.x += wind.x * dt;
    this.centerPosition.y += wind.y * dt;
    this.centerPosition.z += wind.z * dt;
    wind.delete();

    // 4. Update instance matrices with new positions
    this.updateInstanceMatrices();

    // 5. Update material opacity with global alpha
    this.material.opacity = this.alpha;
  }

  /**
   * Check if dust cloud animation is complete
   * @returns {boolean} True if all particles have faded out
   */
  isDone()
  {
    return this.alpha < ALPHA_THRESHOLD;
  }

  /**
   * Clean up all resources
   */
  dispose()
  {
    // Clean up instanced mesh
    if (this.mesh)
    {
      this.scene.remove(this.mesh);
      
      // Clean up geometry
      if (this.mesh.geometry)
      {
        this.mesh.geometry.dispose();
      }
      
      this.mesh = null;
    }

    // Clean up material
    if (this.material)
    {
      this.material.dispose();
      this.material = null;
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
   * @param {Object} windGenerator - Wind generator for sampling wind
   * @param {number} dt - Time step in seconds
   */
  static updateAll(windGenerator, dt)
  {
    // Iterate backwards to safely remove items while iterating
    for (let i = DustCloudFactory.clouds.length - 1; i >= 0; i--)
    {
      const cloud = DustCloudFactory.clouds[i];

      // Update physics and rendering
      cloud.update(windGenerator, dt);

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
