import * as THREE from 'three';

/**
 * DustCloud - GPU-accelerated dust cloud using shaders
 * Relative positions stored as instance attributes, world positions calculated on GPU
 * This avoids JavaScript loops - all position calculations happen in parallel on the GPU
 */

const ALPHA_THRESHOLD = 0.01; // Threshold for cloud visibility
const POOL_SIZE = 16; // Number of dust clouds in the pool

const DUST_VERTEX_SHADER = `
attribute vec3 instanceRelativePosition;

uniform vec3 centerPosition;
uniform float initialRadius;
uniform float radiusScale;
uniform float particleScale;

void main() {
  // Calculate world position: center + scaled relative position
  // Relative positions are normalized (radius=1.0), so scale by initialRadius * radiusScale = currentRadius
  vec3 worldPos = centerPosition + instanceRelativePosition * initialRadius * radiusScale;
  
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
  do {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();
    value = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  while (Math.abs(value) > 2.0); // Reject if outside 2 standard deviations
  return value;
}

export class DustCloud
{
  /**
   * Create a new dust cloud (for object pool - geometry created once, reused)
   * @param {Object} options - Configuration options
   * @param {THREE.Vector3} options.position - Initial cloud center position in meters (required)
   * @param {THREE.Scene} options.scene - Three.js scene to add mesh to (required)
   * @param {number} options.numParticles - Number of particles (required)
   * @param {Object} options.color - RGB color {r, g, b} 0-255 (required)
   * @param {number} options.initialRadius - Initial cloud radius in meters (required)
   * @param {number} options.growthRate - Cloud radius growth rate in m/s (required)
   * @param {number} options.particleDiameter - Particle diameter in meters (required)
   * @param {boolean} options.addToScene - Whether to add mesh to scene immediately (default: true)
   */
  constructor(options)
  {
    const
    {
      position,
      scene,
      numParticles,
      addToScene = true
    } = options;

    if (!scene) throw new Error('Scene is required');

    this.scene = scene;
    this.active = false; // Start inactive (will be activated by reset())

    // Store numParticles for geometry generation
    this.numParticles = numParticles || 200; // Default to 200 if not provided

    // Generate relative positions using truncated normal distribution (reject outside 2 std dev)
    // This geometry is created once and reused - same pattern every time
    const relativePositions = new Float32Array(this.numParticles * 3);
    for (let i = 0; i < this.numParticles; i++)
    {
      // Use a fixed initialRadius of 1.0 for geometry generation (will be scaled in shader)
      // Truncated at 2 standard deviations (about 95% of particles within radius)
      const relX = truncatedNormalRandom();
      const relY = truncatedNormalRandom();
      const relZ = truncatedNormalRandom();
      relativePositions[i * 3 + 0] = relX;
      relativePositions[i * 3 + 1] = relY;
      relativePositions[i * 3 + 2] = relZ;
    }

    // Create default color (will be updated in reset())
    const defaultColor = new THREE.Color(0.5, 0.5, 0.5);

    // Create shader material - GPU calculates positions, no JavaScript loop needed
    this.material = new THREE.ShaderMaterial(
    {
      vertexShader: DUST_VERTEX_SHADER,
      fragmentShader: DUST_FRAGMENT_SHADER,
      uniforms:
      {
        centerPosition:
        {
          value: new THREE.Vector3(0, 0, 0)
        },
        initialRadius:
        {
          value: 0.02
        },
        radiusScale:
        {
          value: 1.0
        },
        particleScale:
        {
          value: 0.01
        },
        color:
        {
          value: defaultColor
        },
        alpha:
        {
          value: 0.0
        }
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

    // Create instanced mesh (geometry kept permanently, never disposed)
    this.mesh = new THREE.InstancedMesh(sphereGeometry, this.material, this.numParticles);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2; // Render after decals (renderOrder 1) so dust appears on top
    this.mesh.visible = false; // Start hidden

    // Only add to scene if requested (for pool initialization, we'll add later)
    if (addToScene && position)
    {
      this.scene.add(this.mesh);
    }

    // Initialize state if position provided (for backward compatibility)
    if (position)
    {
      this.reset(options);
    }
  }

  /**
   * Reset cloud state for reuse (doesn't recreate geometry)
   * @param {Object} options - Configuration options
   * @param {THREE.Vector3} options.position - Initial cloud center position in meters (required)
   * @param {Object} options.color - RGB color {r, g, b} 0-255 (required)
   * @param {number} options.initialRadius - Initial cloud radius in meters (required)
   * @param {number} options.growthRate - Cloud radius growth rate in m/s (required)
   * @param {number} options.particleDiameter - Particle diameter in meters (required)
   */
  reset(options)
  {
    const
    {
      position,
      color,
      initialRadius,
      growthRate,
      particleDiameter
    } = options;

    if (!position) throw new Error('Position is required');

    // Reset state
    this.centerPosition = position.clone();
    this.initialRadius = initialRadius;
    this.growthRate = growthRate;
    this.radius = initialRadius;
    this.alpha = 1.0;
    this.particleDiameter = particleDiameter;
    this.particleScale = Math.max(particleDiameter / 2, 0.01);

    // Convert color to normalized RGB
    const baseR = color.r / 255.0;
    const baseG = color.g / 255.0;
    const baseB = color.b / 255.0;
    const avgColor = new THREE.Color(baseR, baseG, baseB);

    // Update uniforms
    const uniforms = this.material.uniforms;
    uniforms.centerPosition.value.copy(this.centerPosition);
    uniforms.initialRadius.value = this.initialRadius;
    uniforms.radiusScale.value = 1.0; // Start at initial radius
    uniforms.particleScale.value = this.particleScale;
    uniforms.color.value.copy(avgColor);
    uniforms.alpha.value = this.alpha;

    // Ensure mesh is in scene and visible
    if (!this.mesh.parent)
    {
      this.scene.add(this.mesh);
    }
    this.mesh.visible = true;
    this.active = true;
  }

  /**
   * Update physics and rendering
   * @param {number} dt - Time step in seconds
   */
  update(dt)
  {
    if (!this.active || !this.mesh)
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
    uniforms.radiusScale.value = this.radius / this.initialRadius; // Current radius / initial radius
    uniforms.particleScale.value = this.particleScale;
    uniforms.alpha.value = this.alpha;
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
   * Mark cloud as inactive (for object pool reuse)
   * Does not dispose geometry/mesh - they are kept for reuse
   */
  deactivate()
  {
    this.active = false;
    if (this.mesh)
    {
      this.mesh.visible = false;
      // Update alpha to 0 to ensure it doesn't render
      this.material.uniforms.alpha.value = 0.0;
    }
  }
}

/**
 * Factory class for managing a pool of dust clouds
 */
export class DustCloudFactory
{
  /**
   * Static pool of pre-allocated dust clouds
   * @type {DustCloud[]}
   */
  static pool = [];
  static scene = null;

  /**
   * Initialize the factory with a pool of clouds
   * Must be called before creating clouds
   * @param {THREE.Scene} scene - Three.js scene
   */
  static initialize(scene)
  {
    if (DustCloudFactory.pool.length > 0)
    {
      return; // Already initialized
    }

    DustCloudFactory.scene = scene;

    // Create pool of clouds with default geometry (will be reset when used)
    for (let i = 0; i < POOL_SIZE; i++)
    {
      const cloud = new DustCloud(
      {
        scene: scene,
        numParticles: 200, // Default particle count
        addToScene: false // Don't add to scene yet
      });
      cloud.active = false;
      DustCloudFactory.pool.push(cloud);
    }
  }

  /**
   * Create a new dust cloud by reusing a pool cloud
   * @param {Object} options - Configuration options for DustCloud
   * @returns {DustCloud|null} The activated dust cloud instance, or null if pool is exhausted
   */
  static create(options)
  {
    if (DustCloudFactory.pool.length === 0)
    {
      throw new Error('DustCloudFactory.initialize() must be called before creating clouds');
    }

    // Find first available cloud in pool
    let cloud = null;
    for (let i = 0; i < DustCloudFactory.pool.length; i++)
    {
      if (!DustCloudFactory.pool[i].active)
      {
        cloud = DustCloudFactory.pool[i];
        break;
      }
    }

    // If all clouds are active, reuse the oldest one (first in pool)
    if (!cloud)
    {
      cloud = DustCloudFactory.pool[0];
    }

    // Reset cloud with new options
    cloud.reset(options);
    return cloud;
  }

  /**
   * Deactivate a specific cloud (returns it to pool)
   * @param {DustCloud} cloud - The cloud instance to deactivate
   * @returns {boolean} True if cloud was found and deactivated, false otherwise
   */
  static delete(cloud)
  {
    if (!cloud || !DustCloudFactory.pool.includes(cloud))
    {
      return false;
    }

    cloud.deactivate();
    return true;
  }

  /**
   * Deactivate all dust clouds (return all to pool)
   */
  static deleteAll()
  {
    for (const cloud of DustCloudFactory.pool)
    {
      cloud.deactivate();
    }
  }

  /**
   * Fully dispose of all clouds and clear the pool
   * Must be called on scene destruction to allow re-initialization
   */
  static dispose()
  {
    for (const cloud of DustCloudFactory.pool)
    {
      // Remove mesh from scene
      if (cloud.mesh && DustCloudFactory.scene)
      {
        DustCloudFactory.scene.remove(cloud.mesh);
      }
      // Dispose geometry and material
      if (cloud.mesh)
      {
        cloud.mesh.geometry?.dispose();
        cloud.material?.dispose();
      }
    }
    DustCloudFactory.pool = [];
    DustCloudFactory.scene = null;
  }

  /**
   * Update all active dust clouds (physics and rendering)
   * Automatically deactivates clouds when animation is complete
   * @param {number} dt - Time step in seconds
   */
  static updateAll(dt)
  {
    for (const cloud of DustCloudFactory.pool)
    {
      if (!cloud.active)
      {
        continue;
      }

      // Update physics and rendering
      cloud.update(dt);

      // Check if animation is complete and deactivate
      if (cloud.isDone())
      {
        cloud.deactivate();
      }
    }
  }

  /**
   * Get all active dust clouds
   * @returns {DustCloud[]} Array of all active dust clouds
   */
  static getAll()
  {
    return DustCloudFactory.pool.filter(cloud => cloud.active);
  }

  /**
   * Get dust cloud count
   * @returns {number} Number of active dust clouds
   */
  static getCount()
  {
    return DustCloudFactory.pool.filter(cloud => cloud.active).length;
  }

  /**
   * Get a dust cloud by index in pool
   * @param {number} index - Index of cloud in pool (0-15)
   * @returns {DustCloud|null} Cloud instance or null if index is invalid
   */
  static getAt(index)
  {
    if (index < 0 || index >= DustCloudFactory.pool.length)
    {
      return null;
    }
    return DustCloudFactory.pool[index];
  }
}