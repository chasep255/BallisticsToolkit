/**
 * Shot - Manages bullet trajectory simulation and rendering for steel-sim
 * Uses incremental timeStep-based simulation for collision detection with moving targets
 */

import * as THREE from 'three';
import { Config } from './config.js';

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

    // Bullet animation state
    this.bulletMesh = null;
    this.bulletGeometry = null;
    this.bulletMaterial = null;
    this.bulletGlowSprite = null;
    this.bulletGlowTexture = null;
    this.bulletGlowMaterial = null;

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
    const initialBullet = new btk.Bullet(
      this.bullet,
      this.initialPosition,
      this.initialVelocity,
      0.0 // No spin for now
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
    const maxRange_m = 10000.0; // Large value so distance doesn't terminate early
    this.ballisticSimulator.simulateWithWind(
      maxRange_m,
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
    if (!this.alive || !this.ballisticSimulator || !this.bulletMesh) return;

    const currentBullet = this.ballisticSimulator.getCurrentBullet();
    const posBtk = currentBullet.getPosition();
    const pos = this.btkToThreeJsPosition(posBtk);
    
    this.bulletMesh.position.set(pos.x, pos.y, pos.z);
    if (this.bulletGlowSprite)
    {
      this.bulletGlowSprite.position.set(pos.x, pos.y, pos.z);
    }
    
    posBtk.delete();
  }

  /**
   * Create bullet glow texture (pressure wave effect)
   */
  createBulletGlowTexture()
  {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(centerX, centerY);

    // Create radial gradient for pressure wave
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.3, 'rgba(200, 200, 255, 0.4)');
    gradient.addColorStop(0.6, 'rgba(150, 150, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(100, 100, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.bulletGlowTexture = new THREE.CanvasTexture(canvas);
    return this.bulletGlowTexture;
  }

  /**
   * Create bullet mesh and glow sprite
   */
  createBulletMesh()
  {
    // Copper color material
    this.bulletMaterial = new THREE.MeshBasicMaterial(
    {
      color: new THREE.Color(0.722, 0.451, 0.200), // Copper color
      toneMapped: false
    });

    // Use actual bullet diameter from parameters
    const radiusYards = this.btk.Conversions.metersToYards(this.bulletParams.diameter) / 2.0;
    this.bulletGeometry = new THREE.SphereGeometry(radiusYards, 16, 16);

    // Create mesh
    this.bulletMesh = new THREE.Mesh(this.bulletGeometry, this.bulletMaterial);
    this.bulletMesh.castShadow = this.shadowsEnabled;
    this.bulletMesh.receiveShadow = false;
    
    // Set initial position
    const posBtk = this.initialPosition;
    const pos = this.btkToThreeJsPosition(posBtk);
    this.bulletMesh.position.set(pos.x, pos.y, pos.z);
    
    this.scene.add(this.bulletMesh);

    // Create pressure wave glow sprite
    const glowTexture = this.createBulletGlowTexture();
    this.bulletGlowMaterial = new THREE.SpriteMaterial(
    {
      map: glowTexture,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    this.bulletGlowSprite = new THREE.Sprite(this.bulletGlowMaterial);
    const glowSize = this.btk.Conversions.metersToYards(this.bulletParams.diameter) * 15.0;
    this.bulletGlowSprite.scale.set(glowSize, glowSize, 1);
    this.bulletGlowSprite.position.set(pos.x, pos.y, pos.z);
    this.scene.add(this.bulletGlowSprite);
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
    if (!this.bulletMesh) return null;
    return {
      x: this.bulletMesh.position.x,
      y: this.bulletMesh.position.y,
      z: this.bulletMesh.position.z
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
   * Dispose shot and clean up resources
   */
  dispose()
  {
    // Mark as dead
    this.alive = false;

    // Remove from scene
    if (this.bulletMesh)
    {
      this.scene.remove(this.bulletMesh);
      this.bulletMesh = null;
    }
    if (this.bulletGlowSprite)
    {
      this.scene.remove(this.bulletGlowSprite);
      this.bulletGlowSprite = null;
    }

    // Dispose geometries and materials
    if (this.bulletGeometry)
    {
      this.bulletGeometry.dispose();
      this.bulletGeometry = null;
    }
    if (this.bulletMaterial)
    {
      this.bulletMaterial.dispose();
      this.bulletMaterial = null;
    }
    if (this.bulletGlowMaterial)
    {
      this.bulletGlowMaterial.dispose();
      this.bulletGlowMaterial = null;
    }
    if (this.bulletGlowTexture)
    {
      this.bulletGlowTexture.dispose();
      this.bulletGlowTexture = null;
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
