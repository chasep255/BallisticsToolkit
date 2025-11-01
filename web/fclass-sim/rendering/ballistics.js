// ballistics.js - Ballistics engine and bullet rendering for FClass simulator

import * as THREE from 'three';
import ResourceManager from '../resources/manager.js';

// Import BTK wrappers
import
{
  BtkVector3Wrapper,
  BtkVelocityWrapper,
  BtkBulletWrapper,
  BtkBallisticsSimulatorWrapper,
  BtkAtmosphereWrapper,
  BtkMatchWrapper
}
from '../core/btk.js';

const LOG_PREFIX_ENGINE = '[BallisticsEngine]';
const LOG_PREFIX_SHOT = '[Shot]';

export class BallisticsEngine
{
  constructor(config)
  {
    // Required config
    this.scene = config.scene;
    this.targetSystem = config.targetSystem;
    this.windGenerator = config.windGenerator;

    // Ballistic parameters
    this.distance = config.distance;

    // Ballistic state
    this.ballisticSimulator = null;
    this.bullet = null;
    this.zeroedBullet = null;
    this.btkTarget = null;
    this.lastTrajectory = null;

    // Bullet parameters (from UI)
    this.nominalMV = 0;
    this.bulletDiameter = 0;
    this.mvSd = 0;
    this.rifleAccuracyMoa = 0;

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

    // Shot tracking for logging
    this.shotNumber = 0;
  }

  /**
   * Setup ballistic system with zeroing
   */
  async setupBallisticSystem(bulletParams)
  {
    try
    {
      // Store bullet parameters
      this.nominalMV = bulletParams.mvFps;
      this.bulletDiameter = bulletParams.diameterInches;
      this.bulletWeight = bulletParams.weightGrains;
      this.bulletLength = bulletParams.lengthInches;
      this.twistRate = bulletParams.twistInchesPerTurn;
      this.mvSd = bulletParams.mvSdFps;
      this.rifleAccuracyMoa = bulletParams.rifleAccuracyMoa;

      // Get BTK target from target system
      this.btkTarget = this.targetSystem.getBtkTarget();

      // Create bullet (wrapper handles unit conversions)
      this.bullet = new BtkBulletWrapper(this.bulletWeight, this.bulletDiameter, this.bulletLength, bulletParams.bc, bulletParams.dragFunction);

      // Create atmosphere (wrapper handles unit conversions)
      const atmosphere = new BtkAtmosphereWrapper(59, 0, 0.5, 0.0);

      // Create ballistic simulator (wrapped for transparent coordinate conversion)
      this.ballisticSimulator = new BtkBallisticsSimulatorWrapper();
      this.ballisticSimulator.setInitialBullet(this.bullet);
      this.ballisticSimulator.setAtmosphere(atmosphere);

      // Dispose atmosphere immediately after use
      atmosphere.dispose();

      // Set wind to zero for zeroing (dispose immediately after use)
      const zeroWind = new BtkVector3Wrapper(0, 0, 0);
      this.ballisticSimulator.setWind(zeroWind);
      zeroWind.dispose();

      // Get target center from target system (Three.js coords in yards)
      const targetCenter = this.targetSystem.getUserTargetCenter();
      if (!targetCenter)
      {
        throw new Error('Cannot compute zero: user target not available');
      }

      // BtkVector3Wrapper automatically converts Three.js coords (yards) to BTK coords (meters)
      // Just pass the Three.js coordinates directly
      const targetPos = new BtkVector3Wrapper(
        targetCenter.x,   // Three.js X (crossrange)
        targetCenter.y,   // Three.js Y (vertical)
        targetCenter.z    // Three.js Z (downrange, negative)
      );

      console.log(`${LOG_PREFIX_ENGINE} Zeroing: MV=${this.nominalMV.toFixed(1)}fps, Range=${this.distance}yd, Target=(${targetCenter.x.toFixed(3)}, ${targetCenter.y.toFixed(3)}, ${targetCenter.z.toFixed(1)}) yards`);

      // Calculate spin rate from twist rate (BTK expects m/s and m/turn)
      const mvMps = btk.Conversions.fpsToMps(this.nominalMV);
      const twistMetersPerTurn = btk.Conversions.inchesToMeters(this.twistRate);
      const spinRate = btk.Bullet.computeSpinRateFromTwist(mvMps, twistMetersPerTurn);

      console.log(`${LOG_PREFIX_ENGINE} Spin rate: ${spinRate.toFixed(1)} rad/s (twist: ${this.twistRate.toFixed(1)} in/turn)`);

      // Use C++ zeroing routine (returns raw BTK bullet, wrapper will handle it)
      this.zeroedBullet = new BtkBulletWrapper(
        this.ballisticSimulator.computeZero(mvMps, targetPos.raw, 0.001, 1000, 0.001, spinRate)
      );
      targetPos.dispose();

      // Log the zeroed bullet velocity to show elevation and windage
      const zeroVel = this.zeroedBullet.getVelocity();
      const zeroVelMag = zeroVel.magnitude();
      // Calculate angles from velocity components (Three.js coords: X=right, Y=up, Z=downrange-negative)
      const elevationRad = Math.asin(zeroVel.y / zeroVelMag);
      const windageRad = Math.atan2(zeroVel.x, -zeroVel.z);
      const elevationMoa = btk.Conversions.radiansToMoa(elevationRad);
      const windageMoa = btk.Conversions.radiansToMoa(windageRad);
      console.log(`${LOG_PREFIX_ENGINE} Zero complete: Elevation=${elevationMoa.toFixed(2)} MOA (${elevationRad.toFixed(6)} rad), Windage=${windageMoa.toFixed(2)} MOA (${windageRad.toFixed(6)} rad)`);
    }
    catch (error)
    {
      console.error('Failed to setup ballistic system:', error);
      throw error;
    }
  }

  // ===== SHOT FIRING =====

  /**
   * Fire a shot and compute impact
   */
  fireShot()
  {
    if (!this.ballisticSimulator || !this.targetSystem || !this.targetSystem.userTarget)
    {
      console.error('Ballistic simulator or targets not initialized');
      return null;
    }

    // Increment shot number
    this.shotNumber++;

    // Play shot sound immediately via ResourceManager
    ResourceManager.audio.playSound('shot1');

    try
    {
      const range = this.distance;
      const dt = 0.001;

      // Apply MV variation in fps
      const mvVariationFps = (Math.random() - 0.5) * 2.0 * this.mvSd; // fps
      const actualMVFps = this.nominalMV + mvVariationFps; // fps

      console.log(`${LOG_PREFIX_SHOT} #${this.shotNumber} fired: MV=${actualMVFps.toFixed(1)}fps (${mvVariationFps >= 0 ? '+' : ''}${mvVariationFps.toFixed(1)}fps), Aim=(${this.rifleScopeYaw.toFixed(6)}, ${this.rifleScopePitch.toFixed(6)})`);

      // Rifle accuracy as uniform distribution within a circle (diameter)
      // Generate random point within unit circle using rejection sampling
      let accuracyX, accuracyY;
      do {
        accuracyX = (Math.random() - 0.5) * 2.0; // -1 to 1
        accuracyY = (Math.random() - 0.5) * 2.0; // -1 to 1
      } while (accuracyX * accuracyX + accuracyY * accuracyY > 1.0);

      // Rifle accuracy in MOA, convert to radians for angular error
      const accuracyMoa = this.rifleAccuracyMoa;
      const accuracyRad = btk.Conversions.moaToRadians(accuracyMoa);
      const accuracyRadius = accuracyRad / 2.0; // Convert diameter to radius
      const accuracyErrorH = accuracyX * accuracyRadius; // radians
      const accuracyErrorV = accuracyY * accuracyRadius; // radians

      // Apply scope aim and accuracy errors to the zeroed velocity
      const zeroVel = this.zeroedBullet.getVelocity();
      const zeroVelMag = zeroVel.magnitude();
      // Compute true unit direction in fps space
      const zx = zeroVel.x,
        zy = zeroVel.y,
        zz = zeroVel.z;
      const ux0 = zx / zeroVelMag;
      const uy0 = zy / zeroVelMag;
      const uz0 = zz / zeroVelMag;

      // Apply scope aim as small angular adjustments to the zeroed direction
      const yawAdjustment = this.rifleScopeYaw + accuracyErrorH;
      const pitchAdjustment = -(this.rifleScopePitch + accuracyErrorV); // Invert pitch for correct behavior

      // Create new velocity by rotating the zeroed direction
      const cosYaw = Math.cos(yawAdjustment);
      const sinYaw = Math.sin(yawAdjustment);
      const cosPitch = Math.cos(pitchAdjustment);
      const sinPitch = Math.sin(pitchAdjustment);

      // Rotate unit direction (fps space): yaw around Y, then pitch around X
      const rx = ux0 * cosYaw - uz0 * sinYaw;
      const rz = ux0 * sinYaw + uz0 * cosYaw;
      const ry = uy0;
      const ux = rx;
      const uy = ry * cosPitch + rz * sinPitch;
      const uz = -ry * sinPitch + rz * cosPitch;

      // Scale by actual MV (fps)
      const variedVel = new BtkVelocityWrapper(
        ux * actualMVFps,
        uy * actualMVFps,
        uz * actualMVFps
      );

      // Create bullet with varied initial state - start from muzzle (z=0)
      const bulletStartPos = new BtkVector3Wrapper(0, 0, 0);

      const variedBullet = new BtkBulletWrapper(
        this.zeroedBullet,
        bulletStartPos,
        variedVel,
        this.zeroedBullet.getSpinRate()
      );

      // Dispose temporary wrappers immediately after bullet creation
      variedVel.dispose();
      bulletStartPos.dispose();

      // Reset simulator with varied bullet
      this.ballisticSimulator.setInitialBullet(variedBullet);
      this.ballisticSimulator.resetToInitial();

      // Dispose varied bullet immediately - simulator has copied the data
      variedBullet.dispose();

      // Dispose previous trajectory before creating new one
      if (this.lastTrajectory)
      {
        this.lastTrajectory.dispose();
      }

      // Sample wind at shooter position for logging
      const windAtShooter = this.windGenerator.getWindAt(0, 0, 0); // At muzzle
      const windSpeedMph = Math.sqrt(windAtShooter.x ** 2 + windAtShooter.y ** 2 + windAtShooter.z ** 2);
      const windDirDeg = Math.atan2(windAtShooter.x, -windAtShooter.z) * 180 / Math.PI; // Angle from downrange
      console.log(`${LOG_PREFIX_SHOT} Wind at shooter: ${windSpeedMph.toFixed(1)}mph @ ${windDirDeg.toFixed(0)}°`);

      // Simulate with wind generator (wrapper handles unit conversion)
      this.lastTrajectory = this.ballisticSimulator.simulateWithWind(range, dt, 5.0, this.windGenerator);
      const pointAtTarget = this.lastTrajectory.atDistance(range); // distance in yards

      if (!pointAtTarget)
      {
        console.error('Failed to get trajectory point at target distance');
        return null;
      }

      // Get bullet position and velocity at target (now in Three.js coords, yards)
      const bulletState = pointAtTarget.getState();
      const bulletPos = bulletState.getPosition(); // Three.js coords in yards
      const bulletVel = bulletState.getVelocity(); // Three.js coords in fps
      const impactVelocityFps = Math.sqrt(bulletVel.x ** 2 + bulletVel.y ** 2 + bulletVel.z ** 2); // fps

      // Get target coordinates from target system (Three.js coords, yards)
      const targetCenter = this.targetSystem.getUserTargetCenter();
      const targetX = targetCenter.x;
      const targetY = targetCenter.y;

      // Impact relative to target center (in target plane: X=horizontal, Y=vertical)
      const relativeX = bulletPos.x - targetX; // Horizontal offset in yards
      const relativeY = bulletPos.y - targetY; // Vertical offset in yards

      // Get flight time
      const flightTime = this.lastTrajectory.getTotalTime();

      // Log impact details
      const distanceFromCenter = Math.sqrt(relativeX ** 2 + relativeY ** 2);
      console.log(`${LOG_PREFIX_SHOT} Impact: (${relativeX.toFixed(3)}, ${relativeY.toFixed(3)}) yards from center, Distance=${distanceFromCenter.toFixed(3)}yd`);
      console.log(`${LOG_PREFIX_SHOT} Flight time: ${flightTime.toFixed(3)}s, Impact velocity: ${impactVelocityFps.toFixed(1)}fps`);

      // Store shot data for processing after animation completes
      this.pendingShotData = {
        relativeX: relativeX, // yards
        relativeY: relativeY, // yards
        mvFps: actualMVFps,
        impactVelocityFps: impactVelocityFps
      };

      pointAtTarget.dispose(); // Dispose TrajectoryPoint to prevent memory leak

      return this.pendingShotData;
    }
    catch (error)
    {
      console.error('Failed to fire shot:', error);
      throw error;
    }
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
   * Get last trajectory
   */
  getLastTrajectory()
  {
    return this.lastTrajectory;
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
    if (!this.lastTrajectory)
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

    if (!this.bulletGeometry)
    {
      // Use actual bullet diameter from UI parameters
      const radiusYards = btk.Conversions.inchesToYards(this.bulletDiameter) / 2.0;
      this.bulletGeometry = new THREE.SphereGeometry(radiusYards, 16, 16);
    }

    if (!this.bulletMesh)
    {
      this.bulletMesh = new THREE.Mesh(this.bulletGeometry, this.bulletMaterial);
      this.bulletMesh.castShadow = true;
      this.bulletMesh.receiveShadow = false;
      this.scene.add(this.bulletMesh);
    }

    // Create pressure wave glow sprite
    if (!this.bulletGlowSprite)
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

    // Make bullet and glow visible for new animation
    this.bulletMesh.visible = true;
    this.bulletGlowSprite.visible = true;

    // Animation state
    const totalTimeS = this.lastTrajectory.getTotalTime();
    this.bulletAnim = {
      totalTimeS,
      startTimeS: null // Will be set on first update
    };

    // Initialize position at t=0
    const optPoint0 = this.lastTrajectory.atTime(0);
    if (optPoint0 !== undefined)
    {
      const pos = optPoint0.getState().getPosition(); // Already Three.js coords, yards!
      this.bulletMesh.position.set(pos.x, pos.y, pos.z);
      optPoint0.dispose(); // Dispose TrajectoryPoint to prevent memory leak
    }

  }

  updateBulletAnimation()
  {
    if (!this.bulletAnim || !this.bulletMesh || !this.lastTrajectory) return false;

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

    const optPoint = this.lastTrajectory.atTime(t);
    if (optPoint !== undefined)
    {
      const pos = optPoint.getState().getPosition(); // Already Three.js coords, yards!
      this.bulletMesh.position.set(pos.x, pos.y, pos.z);
      this.bulletGlowSprite.position.set(pos.x, pos.y, pos.z);
      optPoint.dispose(); // Dispose TrajectoryPoint to prevent memory leak
    }

    // Check if animation is complete
    if (t >= this.bulletAnim.totalTimeS)
    {
      // Hide bullet mesh and glow
      this.bulletMesh.visible = false;
      this.bulletGlowSprite.visible = false;

      // Process shot completion
      if (this.pendingShotData && this.onShotComplete)
      {
        const data = this.pendingShotData;

        // Score the hit using BTK target scoring
        // Create a temporary match just for scoring this one shot
        const tempMatch = new BtkMatchWrapper();
        const hit = tempMatch.addHit(data.relativeX, data.relativeY, this.btkTarget, this.bulletDiameter);

        // Extract data from Hit before disposing
        const score = hit.getScore();
        const isX = hit.isX();
        hit.delete(); // Dispose Hit object to prevent memory leak
        tempMatch.dispose(); // Dispose temporary match

        // Call completion callback with shot data
        if (this.onShotComplete)
        {
          this.onShotComplete(
          {
            relativeX: data.relativeX,
            relativeY: data.relativeY,
            score: score,
            isX: isX,
            mvFps: data.mvFps,
            impactVelocityFps: data.impactVelocityFps
          });
        }

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

    // Dispose BTK objects
    if (this.bullet)
    {
      this.bullet.dispose();
    }
    if (this.zeroedBullet)
    {
      this.zeroedBullet.dispose();
    }
    if (this.ballisticSimulator)
    {
      this.ballisticSimulator.dispose();
    }
    if (this.lastTrajectory)
    {
      this.lastTrajectory.dispose();
    }

    // Clear references
    this.ballisticSimulator = null;
    this.bullet = null;
    this.zeroedBullet = null;
    this.lastTrajectory = null;
    this.btkTarget = null;
    this.bulletAnim = null;
    this.pendingShotData = null;
  }
}