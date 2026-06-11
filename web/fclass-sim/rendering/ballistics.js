// ballistics.js - Ballistics engine and bullet rendering for FClass simulator

import * as THREE from 'three';
import ResourceManager from '../resources/manager.js';
import
{
  getBTK,
  btkToThreeJsPosition,
  sampleWindAtThreeJsPosition
}
from '../core/btk.js';
import
{
  ShotSolver
}
from '../core/shot-solver.js';

const LOG_PREFIX_SHOT = '[Shot]';

export class BallisticsEngine
{
  constructor(config)
  {
    // Required config
    this.scene = config.scene;
    this.targets = config.targets;
    this.windGenerator = config.windGenerator;

    // Ballistic parameters
    this.distance = config.distance;
    this.shadowsEnabled = config.shadowsEnabled ?? true;
    this.showBulletTrace = config.showBulletTrace ?? true;

    // Headless solver owns the WASM objects and the shot math
    this.solver = null;
    this.btkTarget = null;
    this.bulletDiameter = 0;

    // Rifle scope aim
    this.rifleScopeYaw = 0;
    this.rifleScopePitch = 0;

    // Bullet animation
    this.bulletAnim = null;
    this.bulletMesh = null;
    this.bulletGeometry = null;
    this.bulletMaterial = null;
    this.bulletGlowSprite = null;
    this.bulletGlowTexture = null;
    this.bulletGlowMaterial = null;
    this.pendingShotData = null;

    // Callbacks
    this.onShotComplete = config.onShotComplete || null;
  }

  /**
   * Setup with zeroing
   */
  async setup(bulletParams)
  {
    // Get BTK target from target system
    this.btkTarget = this.targets.getBtkTarget();
    this.bulletDiameter = bulletParams.diameterInches;

    // Get target center from target system (Three.js coords in yards). The
    // player's muzzle is at the origin, so the world center is also the
    // solver's bullet-relative center.
    const targetCenter = this.targets.getUserTargetCenter();
    if (!targetCenter)
    {
      throw new Error('Cannot compute zero: user target not available');
    }

    this.solver = new ShotSolver(
    {
      windGenerator: this.windGenerator,
      distanceYards: this.distance,
      btkTarget: this.btkTarget,
      verbose: true
    });
    this.solver.setup(bulletParams, targetCenter);
  }

  // ===== SHOT FIRING =====

  /**
   * Fire a shot and compute impact.
   *
   * @param {Object|null} aimOverride - optional {yaw, pitch} in radians; used
   *   by AI shooters so the shot ignores the player's scope state.
   */
  fireShot(aimOverride = null)
  {
    if (!this.solver || !this.targets || !this.targets.userTarget)
    {
      console.error('Ballistic simulator or targets not initialized');
      return null;
    }

    // Play shot sound immediately via ResourceManager
    ResourceManager.audio.playSound('shot1');

    // Sample wind at shooter position for logging
    const wind = sampleWindAtThreeJsPosition(this.windGenerator, 0, 0, 0);
    const windSpeedMph = Math.sqrt(wind.x ** 2 + wind.y ** 2 + wind.z ** 2);
    const windDirDeg = Math.atan2(wind.x, -wind.z) * 180 / Math.PI; // Angle from downrange
    console.log(`${LOG_PREFIX_SHOT} Wind at shooter: ${windSpeedMph.toFixed(1)}mph @ ${windDirDeg.toFixed(0)}°`);

    this.pendingShotData = this.solver.solveShot(
    {
      yawRad: aimOverride ? aimOverride.yaw : this.rifleScopeYaw,
      pitchRad: aimOverride ? aimOverride.pitch : this.rifleScopePitch
    });

    return this.pendingShotData;
  }

  /**
   * Set rifle scope aim (yaw and pitch in radians)
   */
  setRifleScopeAim(yaw, pitch)
  {
    this.rifleScopeYaw = yaw;
    this.rifleScopePitch = pitch;
  }


  /**
   * Get bullet diameter in inches
   */
  getBulletDiameter()
  {
    return this.bulletDiameter;
  }

  /**
   * Get last trajectory (owned by the solver's WASM simulator)
   */
  getLastTrajectory()
  {
    return this.solver ? this.solver.getLastTrajectory() : null;
  }

  /**
   * Toggle the bullet trace (glow sprite) live. Enabling takes effect on the
   * next shot (the sprite is created lazily in startBulletAnimation); disabling
   * hides any current sprite immediately.
   */
  setShowBulletTrace(enabled)
  {
    this.showBulletTrace = enabled === true;
    if (!this.showBulletTrace && this.bulletGlowSprite)
    {
      this.bulletGlowSprite.visible = false;
    }
  }

  // ===== BULLET ANIMATION =====

  createBulletGlowTexture()
  {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Create radial gradient for motion blur effect
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)'); // Very faint white center
    gradient.addColorStop(0.2, 'rgba(200, 200, 200, 0.2)'); // Light gray
    gradient.addColorStop(0.5, 'rgba(150, 150, 150, 0.1)'); // Faint gray
    gradient.addColorStop(0.8, 'rgba(100, 100, 100, 0.05)'); // Very faint
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Transparent edge

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    this.bulletGlowTexture = new THREE.CanvasTexture(canvas);
    return this.bulletGlowTexture;
  }

  startBulletAnimation()
  {
    if (!this.getLastTrajectory())
    {
      return;
    }

    if (!this.bulletMaterial)
    {
      // Copper color: #B87333 (RGB: 184, 115, 51)
      this.bulletMaterial = new THREE.MeshBasicMaterial(
      {
        color: new THREE.Color(0.722, 0.451, 0.200), // Copper color
        toneMapped: false
      });
    }

    // Get BTK module
    const btk = getBTK();
    if (!btk) throw new Error('BTK module not loaded');

    if (!this.bulletGeometry)
    {
      // Use actual bullet diameter from UI parameters
      const radiusYards = btk.Conversions.inchesToYards(this.bulletDiameter) / 2.0;
      this.bulletGeometry = new THREE.SphereGeometry(radiusYards, 16, 16);
    }

    if (!this.bulletMesh)
    {
      this.bulletMesh = new THREE.Mesh(this.bulletGeometry, this.bulletMaterial);
      this.bulletMesh.castShadow = this.shadowsEnabled;
      this.bulletMesh.receiveShadow = false;
      this.scene.add(this.bulletMesh);
    }

    // Create pressure wave glow sprite (the visible bullet trace)
    if (this.showBulletTrace && !this.bulletGlowSprite)
    {
      const glowTexture = this.createBulletGlowTexture();
      this.bulletGlowMaterial = new THREE.SpriteMaterial(
      {
        map: glowTexture,
        transparent: true,
        blending: THREE.NormalBlending, // Subtle blur instead of bright glow
        depthWrite: false
      });
      this.bulletGlowSprite = new THREE.Sprite(this.bulletGlowMaterial);
      // Make blur larger for motion trail effect
      const glowSize = btk.Conversions.inchesToYards(this.bulletDiameter) * 15.0;
      this.bulletGlowSprite.scale.set(glowSize, glowSize, 1);
      this.scene.add(this.bulletGlowSprite);
    }

    // Make bullet and glow visible for new animation. The glow sprite is created
    // once and reused, so gate its visibility on the current toggle (not just its
    // existence), otherwise unchecking the trace mid-match wouldn't stick on the
    // next shot.
    this.bulletMesh.visible = true;
    if (this.bulletGlowSprite) this.bulletGlowSprite.visible = this.showBulletTrace;

    // Animation state
    const totalTimeS = this.getLastTrajectory().getTotalTime();
    this.bulletAnim = {
      totalTimeS,
      startTimeS: null // Will be set on first update
    };

    // Initialize position at t=0
    const optPoint0 = this.getLastTrajectory().atTime(0);
    if (optPoint0 !== undefined)
    {
      const state0 = optPoint0.getState();
      const posBtk = state0.getPosition();
      const pos = btkToThreeJsPosition(posBtk); // Convert meters to yards
      this.bulletMesh.position.set(pos.x, pos.y, pos.z);
      posBtk.delete();
      state0.delete();
      optPoint0.delete();
    }

  }

  updateBulletAnimation()
  {
    if (!this.bulletAnim || !this.bulletMesh || !this.getLastTrajectory()) return false;

    const gameTime = ResourceManager.time.getElapsedTime();

    // Initialize start time on first update
    if (this.bulletAnim.startTimeS === null)
    {
      this.bulletAnim.startTimeS = gameTime;
    }

    // Compute elapsed time using game time (pauses when tab is hidden)
    const elapsedRealS = gameTime - this.bulletAnim.startTimeS;
    let t = elapsedRealS;
    if (t >= this.bulletAnim.totalTimeS)
    {
      // Clamp to end
      t = this.bulletAnim.totalTimeS;
    }

    const optPoint = this.getLastTrajectory().atTime(t);
    if (optPoint !== undefined)
    {
      const stateAnim = optPoint.getState();
      const posBtk = stateAnim.getPosition();
      const pos = btkToThreeJsPosition(posBtk); // Convert meters to yards
      this.bulletMesh.position.set(pos.x, pos.y, pos.z);
      if (this.bulletGlowSprite) this.bulletGlowSprite.position.set(pos.x, pos.y, pos.z);
      posBtk.delete();
      stateAnim.delete();
      optPoint.delete();
    }

    // Check if animation is complete
    if (t >= this.bulletAnim.totalTimeS)
    {
      // Hide bullet mesh and glow
      this.bulletMesh.visible = false;
      if (this.bulletGlowSprite) this.bulletGlowSprite.visible = false;

      // Process shot completion
      if (this.pendingShotData && this.onShotComplete)
      {
        const data = this.pendingShotData;

        // Score the hit using BTK target scoring
        const { score, isX } = this.solver.scoreImpact(data.relativeX, data.relativeY);

        // Call completion callback with shot data
        this.onShotComplete(
        {
          relativeX: data.relativeX,
          relativeY: data.relativeY,
          score: score,
          isX: isX,
          mvFps: data.mvFps,
          impactVelocityFps: data.impactVelocityFps
        });

        this.pendingShotData = null;
      }

      // End animation
      this.bulletAnim = null;
      return true; // Animation complete
    }

    return false; // Animation still running
  }

  /**
   * Check if bullet animation is in progress
   */
  isBulletAnimating()
  {
    return this.bulletAnim !== null;
  }

  /**
   * Dispose of all resources
   */
  dispose()
  {
    // Remove and dispose bullet mesh
    if (this.bulletMesh)
    {
      this.scene.remove(this.bulletMesh);
      this.bulletMesh = null;
    }

    // Remove and dispose bullet glow sprite
    if (this.bulletGlowSprite)
    {
      this.scene.remove(this.bulletGlowSprite);
      this.bulletGlowSprite = null;
    }

    // Dispose geometries
    if (this.bulletGeometry)
    {
      this.bulletGeometry.dispose();
      this.bulletGeometry = null;
    }

    // Dispose materials
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

    // Dispose textures
    if (this.bulletGlowTexture)
    {
      this.bulletGlowTexture.dispose();
      this.bulletGlowTexture = null;
    }

    // Dispose the solver (owns the WASM objects)
    if (this.solver)
    {
      this.solver.dispose();
      this.solver = null;
    }

    // Clear references
    this.btkTarget = null;
    this.bulletAnim = null;
    this.pendingShotData = null;
  }
}