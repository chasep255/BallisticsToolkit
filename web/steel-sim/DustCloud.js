import * as THREE from 'three';

/**
 * DustCloud - GPU-accelerated dust cloud using shaders
 * Relative positions stored as instance attributes, world positions calculated on GPU
 * This avoids JavaScript loops - all position calculations happen in parallel on the GPU
 */

const ALPHA_THRESHOLD = 0.01; // Threshold for cloud visibility

const DUST_VERTEX_SHADER = `
attribute vec3 instanceRelativePosition;

uniform vec3 centerPosition;
uniform float radiusScale;
uniform float particleScale;

void main() {
  // Calculate world position: center + scaled relative position
  vec3 worldPos = centerPosition + instanceRelativePosition * radiusScale;
  
  // Transform sphere vertex position relative to world position
  vec3 localPos = position * particleScale;
  vec4 worldPosition = vec4(worldPos + localPos, 1.0);
  
  gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
}
`;

const DUST_FRAGMENT_SHADER = `
uniform vec3 color;
uniform float alpha;

void main() {
  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Generate a Gaussian random number using Box-Muller transform
 * Resamples if outside 2 standard deviations
 * @private
 */
function truncatedNormalRandom()
{
  let value;
  do
  {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    value = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  while(Math.abs(value) > 2.0); // Reject if outside 2 standard deviations
  return value;
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
      initialRadius,
      growthRate,
      particleDiameter
    } = options;

    if (!scene) throw new Error('Scene is required');
    if (!position) throw new Error('Position is required');

    this.scene = scene;

    // Store state
    this.centerPosition = position.clone();
    this.initialRadius = initialRadius;
    this.growthRate = growthRate;
    this.radius = initialRadius;
    this.alpha = 1.0;
    this.particleDiameter = particleDiameter;
    this.particleScale = Math.max(particleDiameter / 2, 0.01); // Constant particle radius
    this.numParticles = numParticles; // Store for later use
    
    // Scale alpha to account for particle overlap (many particles overlap at center)
    // Use inverse square root to reduce alpha without making it too transparent
    this.alphaScale = 1.0 / Math.sqrt(numParticles);
    

    // Generate relative positions using truncated normal distribution (reject outside 2 std dev)
    const relativePositions = new Float32Array(numParticles * 3);
    for (let i = 0; i < numParticles; i++)
    {
      // Scale by initialRadius so particles are distributed within the cloud size
      // Truncated at 2 standard deviations (about 95% of particles within radius)
      const relX = truncatedNormalRandom() * initialRadius;
      const relY = truncatedNormalRandom() * initialRadius;
      const relZ = truncatedNormalRandom() * initialRadius;
      relativePositions[i * 3 + 0] = relX;
      relativePositions[i * 3 + 1] = relY;
      relativePositions[i * 3 + 2] = relZ;
    }

    // Convert color to normalized RGB
    const baseR = color.r / 255.0;
    const baseG = color.g / 255.0;
    const baseB = color.b / 255.0;
    const avgColor = new THREE.Color(baseR, baseG, baseB);

    // Create shader material - GPU calculates positions, no JavaScript loop needed
    this.material = new THREE.ShaderMaterial({
      vertexShader: DUST_VERTEX_SHADER,
      fragmentShader: DUST_FRAGMENT_SHADER,
      uniforms: {
        centerPosition: { value: this.centerPosition },
        radiusScale: { value: 1.0 },
        particleScale: { value: this.particleScale },
        color: { value: avgColor },
        alpha: { value: 1.0 }
      },
      transparent: true,
      depthWrite: false, // Don't write depth - allows proper alpha blending between overlapping dust clouds
      depthTest: true // Still test depth to occlude opaque objects
    });

    // Create sphere geometry (unit radius, scaled by shader)
    const sphereGeometry = new THREE.IcosahedronGeometry(0.5, 1);

    // Add relative positions as instance attribute (GPU reads this directly)
    const relativePositionAttribute = new THREE.InstancedBufferAttribute(relativePositions, 3);
    sphereGeometry.setAttribute('instanceRelativePosition', relativePositionAttribute);

    // Create instanced mesh
    this.mesh = new THREE.InstancedMesh(sphereGeometry, this.material, numParticles);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2; // Render after decals (renderOrder 1) so dust appears on top
    this.scene.add(this.mesh);
  }

  /**
   * Update physics and rendering
   * @param {number} dt - Time step in seconds
   */
  update(dt)
  {
    if (!this.mesh)
    {
      return;
    }

    // 1. Grow cloud radius linearly over time
    this.radius += this.growthRate * dt;
    
    // 2. Fade alpha by 1/growth^2 (as cloud expands, color density decreases)
    // As radius grows, area grows as radius^2, so alpha should be 1/(radius/initialRadius)^2
    const growthRatio = this.radius / this.initialRadius;
    // Clamp growthRatio to prevent division issues and ensure alpha stays valid
    this.alpha = 1.0 / Math.max(growthRatio * growthRatio, 1.0);

    // 3. Update uniforms - GPU does all the position calculations in parallel
    const uniforms = this.material.uniforms;
    uniforms.centerPosition.value.copy(this.centerPosition);
    uniforms.radiusScale.value = this.radius / this.initialRadius;
    uniforms.particleScale.value = this.particleScale;
    uniforms.alpha.value = this.alpha;

    // 4. Ensure mesh stays visible
    this.mesh.visible = true;
  }

  /**
   * Check if dust cloud animation is complete
   * @returns {boolean} True if all particles have faded out
   */
  isDone()
  {
    // Check scaled alpha (what's actually rendered), not raw alpha
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
