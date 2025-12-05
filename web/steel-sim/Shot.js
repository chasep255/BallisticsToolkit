/**
 * Shot - Manages bullet trajectory simulation and rendering for steel-sim
 * Uses incremental timeStep-based simulation for collision detection with moving targets
 */

import * as THREE from 'three';
import
{
  Config
}
from './config.js';

const LOG_PREFIX = '[Shot]';

export class Shot
{
  constructor(config)
  {
    // Required config
    this.initialPosition = config.initialPosition; // btk.Vector3D (meters)
    this.initialVelocity = config.initialVelocity; // btk.Vector3D (m/s)
    this.bulletParams = config.bulletParams; // {mass, diameter, length, bc, dragFunction}
    this.atmosphere = config.atmosphere; // BTK Atmosphere
    this.windGenerator = config.windGenerator; // BTK WindGenerator
    this.scene = config.scene; // Three.js scene

    // Get BTK module
    const btk = window.btk;
    if (!btk) throw new Error('BTK module not loaded');
    this.btk = btk;

    // Ballistic state
    this.ballisticSimulator = null;
    this.bullet = null;

    // Shot state
    this.alive = true;
    this.lastCheckedCollisionTime = 0.0; // Track last collision check time

    // Bullet animation state
    this.bulletGlowSprite = null;
    this.bulletGlowScale = 1.0; // Store scale for cleanup

    // Rendering config
    this.shadowsEnabled = config.shadowsEnabled ?? true;

    // Initialize
    this.initialize();
  }

  /**
   * Initialize ballistics simulator (no pre-simulation)
   */
  initialize()
  {
    const btk = this.btk;

    // Create bullet from parameters
    this.bullet = new btk.Bullet(
      this.bulletParams.mass, // Already in kg
      this.bulletParams.diameter, // Already in meters
      this.bulletParams.length, // Already in meters
      this.bulletParams.bc,
      this.bulletParams.dragFunction === 'G1' ? btk.DragFunction.G1 : btk.DragFunction.G7
    );

    // Create bullet with initial position and velocity
    const spinRate = this.bulletParams.spinRate || 0.0;
    const initialBullet = new btk.Bullet(
      this.bullet,
      this.initialPosition,
      this.initialVelocity,
      spinRate
    );

    // Create ballistic simulator
    this.ballisticSimulator = new btk.BallisticsSimulator();
    this.ballisticSimulator.setInitialBullet(initialBullet);
    this.ballisticSimulator.setAtmosphere(this.atmosphere);

    // Dispose initial bullet - simulator has copied the data
    initialBullet.delete();

    // Initialize rendering
    this.createBulletMesh();
  }

  /**
   * Advance bullet simulation by a small timestep
   * @param {number} dt - Time step in seconds (typically Config.INTEGRATION_STEP_S)
   */
  advanceSubstep(dt)
  {
    if (!this.alive || !this.ballisticSimulator) return;

    // Simulate forward by dt with wind generator
    // Parameters: max_distance (m), timestep (s), max_time (s), wind_generator
    this.ballisticSimulator.simulateWithWind(
      Config.LANDSCAPE_CONFIG.brownGroundLength,
      Config.BULLET_SUBSTEP_S,
      dt,
      this.windGenerator
    );
  }

  /**
   * Update visual animation to match current bullet state
   */
  updateAnimation()
  {
    if (!this.bulletGlowSprite) return;

    const currentBullet = this.ballisticSimulator.getCurrentBullet();
    const posBtk = currentBullet.getPosition();
    const pos = this.btkToThreeJsPosition(posBtk);

    this.bulletGlowSprite.position.set(pos.x, pos.y, pos.z);

    posBtk.delete();
  }


  /**
   * Create bullet glow sprite (pressure wave) using pooled sprite
   */
  createBulletMesh()
  {
    // Get pooled glow sprite from factory
    this.bulletGlowSprite = BulletGlowPool.acquire();
    if (!this.bulletGlowSprite)
    {
      console.warn('[Shot] No bullet glow sprite available in pool');
      return;
    }

    // Scale sprite to match bullet diameter
    const glowSize = this.btk.Conversions.metersToYards(this.bulletParams.diameter) * 15.0;
    const baseSize = BulletGlowPool.BASE_SIZE_YARDS;
    const scale = glowSize / baseSize;
    this.bulletGlowSprite.scale.set(scale, scale, 1);

    // Set initial position
    const posBtk = this.initialPosition;
    const pos = this.btkToThreeJsPosition(posBtk);
    this.bulletGlowSprite.position.set(pos.x, pos.y, pos.z);
    this.bulletGlowSprite.visible = true;

    // Store scale for cleanup
    this.bulletGlowScale = scale;
  }

  /**
   * Convert BTK Vector3D to Three.js position (meters to yards)
   */
  btkToThreeJsPosition(btkVec)
  {
    return {
      x: this.btk.Conversions.metersToYards(btkVec.x),
      y: this.btk.Conversions.metersToYards(btkVec.y),
      z: this.btk.Conversions.metersToYards(btkVec.z)
    };
  }

  /**
   * Check if shot is still alive (not dead from collision)
   */
  isAlive()
  {
    return this.alive;
  }

  /**
   * Mark shot as dead (hit something)
   */
  markDead()
  {
    this.alive = false;
  }

  /**
   * Get current bullet state from simulator
   */
  getCurrentBullet()
  {
    if (!this.ballisticSimulator) return null;
    return this.ballisticSimulator.getCurrentBullet();
  }

  /**
   * Get current bullet position (Three.js coordinates in yards)
   */
  getCurrentPosition()
  {
    if (!this.bulletGlowSprite) return null;
    return {
      x: this.bulletGlowSprite.position.x,
      y: this.bulletGlowSprite.position.y,
      z: this.bulletGlowSprite.position.z
    };
  }

  /**
   * Get BTK Trajectory object (for collision checks)
   */
  getTrajectory()
  {
    if (!this.ballisticSimulator) return null;
    return this.ballisticSimulator.getTrajectory();
  }

  /**
   * Get and update the last checked collision time
   * Returns the time range [lastChecked, currentTime] and updates lastChecked
   */
  getCollisionCheckTimeRange()
  {
    if (!this.ballisticSimulator) return null;

    const trajectory = this.ballisticSimulator.getTrajectory();
    if (!trajectory) return null;

    const currentTime = trajectory.getTotalTime();
    const lastChecked = this.lastCheckedCollisionTime;

    // Update for next check
    this.lastCheckedCollisionTime = currentTime;

    return {
      t0: lastChecked,
      t1: currentTime
    };
  }

  /**
   * Dispose shot and clean up resources
   */
  dispose()
  {
    // Mark as dead
    this.alive = false;

    // Return glow sprite to pool
    if (this.bulletGlowSprite)
    {
      // Reset scale and hide
      this.bulletGlowSprite.scale.set(BulletGlowPool.BASE_SIZE_YARDS, BulletGlowPool.BASE_SIZE_YARDS, 1);
      this.bulletGlowSprite.visible = false;
      BulletGlowPool.release(this.bulletGlowSprite);
      this.bulletGlowSprite = null;
    }

    // Dispose BTK objects
    // Note: Trajectory is owned by ballisticSimulator, don't delete it separately
    if (this.bullet)
    {
      this.bullet.delete();
      this.bullet = null;
    }
    if (this.ballisticSimulator)
    {
      this.ballisticSimulator.delete();
      this.ballisticSimulator = null;
    }

    // Clean up initial vectors (they may have been deleted already)
    if (this.initialPosition && this.initialPosition.delete)
    {
      this.initialPosition.delete();
    }
    if (this.initialVelocity && this.initialVelocity.delete)
    {
      this.initialVelocity.delete();
    }
  }
}

// ===== SHOT FACTORY =====

/**
 * Factory class for managing active shots
 * Similar pattern to DustCloudFactory and SteelTargetFactory
 */
export class ShotFactory
{
  /**
   * Static collection of all active shots
   * @type {Shot[]}
   */
  static shots = [];

  /**
   * Create a new shot and add it to active shots
   * @param {Object} config - Configuration for the shot
   * @returns {Shot} The created shot instance
   */
  static create(config)
  {
    const shot = new Shot(config);
    ShotFactory.shots.push(shot);
    return shot;
  }

  /**
   * Update all active shots (physics stepping)
   * @param {number} dt - Time step in seconds
   */
  static updateAll(dt)
  {
    for (const shot of ShotFactory.shots)
    {
      shot.advanceSubstep(dt);
    }
  }

  /**
   * Remove and dispose dead shots (should be called after collision detection)
   */
  static cleanupDeadShots()
  {
    const deadShots = ShotFactory.shots.filter(s => !s.isAlive());
    for (const shot of deadShots)
    {
      shot.dispose();
    }
    ShotFactory.shots = ShotFactory.shots.filter(s => s.isAlive());
  }

  /**
   * Update visual animations for all shots
   */
  static updateAnimations()
  {
    for (const shot of ShotFactory.shots)
    {
      shot.updateAnimation();
    }
  }

  /**
   * Get all active shots
   * @returns {Shot[]} Array of all active shots
   */
  static getShots()
  {
    return ShotFactory.shots;
  }

  /**
   * Delete all shots
   */
  static deleteAll()
  {
    for (const shot of ShotFactory.shots)
    {
      shot.dispose();
    }
    ShotFactory.shots = [];
  }
}

// ===== BULLET GLOW POOL =====

/**
 * Object pool for bullet glow sprites (pressure wave effect) to avoid allocation overhead
 * Similar to DustCloudFactory pooling pattern
 */
export class BulletGlowPool
{
  static POOL_SIZE = 32;
  static BASE_SIZE_YARDS = 1.0; // Base size for pooled glow sprites (Three.js sprite default is 1x1)
  
  static pool = [];
  static scene = null;
  static glowTexture = null;

  /**
   * Create bullet glow texture (pressure wave effect)
   */
  static createGlowTexture()
  {
    if (BulletGlowPool.glowTexture) return BulletGlowPool.glowTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(centerX, centerY);

    // Create radial gradient for pressure wave (white center, blue fade)
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.3, 'rgba(200, 200, 255, 0.4)');
    gradient.addColorStop(0.6, 'rgba(150, 150, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(100, 100, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    BulletGlowPool.glowTexture = new THREE.CanvasTexture(canvas);
    return BulletGlowPool.glowTexture;
  }

  /**
   * Initialize the bullet glow sprite pool
   * @param {THREE.Scene} scene - Three.js scene to add sprites to
   */
  static initialize(scene)
  {
    BulletGlowPool.scene = scene;
    
    // Create shared glow texture
    const glowTexture = BulletGlowPool.createGlowTexture();
    
    // Create shared material
    const glowMaterial = new THREE.SpriteMaterial(
    {
      map: glowTexture,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    // Pre-create all glow sprites
    for (let i = 0; i < BulletGlowPool.POOL_SIZE; i++)
    {
      const glowSprite = new THREE.Sprite(glowMaterial);
      glowSprite.scale.set(BulletGlowPool.BASE_SIZE_YARDS, BulletGlowPool.BASE_SIZE_YARDS, 1);
      glowSprite.visible = false;
      glowSprite.raycast = () => {}; // Disable raycaster interaction
      
      scene.add(glowSprite);
      BulletGlowPool.pool.push(glowSprite);
    }

    console.log(`[BulletGlowPool] Initialized ${BulletGlowPool.POOL_SIZE} glow sprites`);
  }

  /**
   * Acquire a glow sprite from the pool
   * @returns {THREE.Sprite|null} Available glow sprite or null if pool exhausted
   */
  static acquire()
  {
    // Find first invisible (available) sprite
    for (const sprite of BulletGlowPool.pool)
    {
      if (!sprite.visible)
      {
        return sprite;
      }
    }
    
    // Pool exhausted - log warning
    console.warn(`[BulletGlowPool] Pool exhausted (${BulletGlowPool.POOL_SIZE} bullets active)`);
    return null;
  }

  /**
   * Release a glow sprite back to the pool
   * @param {THREE.Sprite} sprite - Glow sprite to release
   */
  static release(sprite)
  {
    if (!sprite) return;
    
    // Sprite should already be invisible and scale reset by caller
    // Just verify it's in our pool and ensure it's reset
    if (BulletGlowPool.pool.includes(sprite))
    {
      sprite.visible = false;
      sprite.scale.set(BulletGlowPool.BASE_SIZE_YARDS, BulletGlowPool.BASE_SIZE_YARDS, 1);
    }
  }

  /**
   * Fully dispose of all sprites and clear the pool
   * Must be called on scene destruction to allow re-initialization
   */
  static dispose()
  {
    for (const sprite of BulletGlowPool.pool)
    {
      if (BulletGlowPool.scene)
      {
        BulletGlowPool.scene.remove(sprite);
      }
      sprite.material?.dispose();
    }
    if (BulletGlowPool.glowTexture)
    {
      BulletGlowPool.glowTexture.dispose();
      BulletGlowPool.glowTexture = null;
    }
    BulletGlowPool.pool = [];
    BulletGlowPool.scene = null;
  }
}