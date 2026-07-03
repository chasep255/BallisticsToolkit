// shot-solver.js - Headless ballistic shot solver.
//
// Owns the WASM objects (Bullet, zeroed bullet, BallisticsSimulator) and the
// pure shot math: zeroing, dispersion (MV variation + rifle accuracy), aim
// rotation, wind-aware trajectory integration and scoring. It is shared by the
// player's visible pipeline (rendering/ballistics.js keeps the tracer, sounds
// and recoil and delegates the math here) and by the headless AI shooters,
// which fire through their own solver instance so they can never clobber the
// trajectory the player's bullet animation is reading across frames.

import
{
  getBTK,
  btkToThreeJsPosition,
  threeJsToBtkPosition,
  btkToThreeJsVelocity,
  threeJsToBtkVelocity
}
from './btk.js';

const LOG_PREFIX_SOLVER = '[ShotSolver]';

export class ShotSolver
{
  /**
   * @param {Object} config
   * @param {Object} config.windGenerator - BTK WindGenerator (not owned)
   * @param {number} config.distanceYards - range to the target line
   * @param {Object} config.btkTarget - BTK Target for scoring (not owned)
   * @param {boolean} [config.verbose] - log per-shot details (player path)
   */
  constructor(config)
  {
    this.windGenerator = config.windGenerator;
    this.distance = config.distanceYards;
    this.btkTarget = config.btkTarget;
    this.verbose = config.verbose === true;

    // WASM objects owned by this solver
    this.ballisticSimulator = null;
    this.bullet = null;
    this.zeroedBullet = null;
    this.lastTrajectory = null; // owned by ballisticSimulator, never deleted

    // Bullet parameters
    this.nominalMV = 0;
    this.bulletDiameter = 0;
    this.mvSd = 0;
    this.rifleAccuracyMoa = 0;

    // Target center relative to the bullet's start (Three.js coords, yards).
    // For a lane at startXYards the target sits at (startXYards + x, y, z).
    this.targetCenterLocal = null;

    // Shot tracking for logging
    this.shotNumber = 0;
  }

  /**
   * Create the WASM objects and compute the no-wind zero.
   *
   * @param {Object} bulletParams - { mvFps, diameterInches, weightGrains,
   *   lengthInches, twistInchesPerTurn, mvSdFps, rifleAccuracyMoa, bc, dragFunction }
   * @param {Object} targetCenterLocal - target center relative to the bullet
   *   start position (Three.js coords in yards), e.g. {x, y, z: -distance}
   */
  setup(bulletParams, targetCenterLocal)
  {
    // Transient WASM handles; the finally frees any an exception skipped past.
    let atmosphere = null;
    let zeroWind = null;
    let targetPos = null;
    let zeroVelBtk = null;

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
      this.targetCenterLocal = {
        x: targetCenterLocal.x,
        y: targetCenterLocal.y,
        z: targetCenterLocal.z
      };

      const btk = getBTK();
      if (!btk) throw new Error('BTK module not loaded');

      // Create bullet with explicit unit conversions
      this.bullet = new btk.Bullet(
        btk.Conversions.grainsToKg(this.bulletWeight),
        btk.Conversions.inchesToMeters(this.bulletDiameter),
        btk.Conversions.inchesToMeters(this.bulletLength),
        bulletParams.bc,
        bulletParams.dragFunction === 'G1' ? btk.DragFunction.G1 : btk.DragFunction.G7
      );

      // Create atmosphere with explicit unit conversions
      atmosphere = new btk.Atmosphere(
        btk.Conversions.fahrenheitToKelvin(59),
        btk.Conversions.feetToMeters(0),
        0.5,
        0.0
      );

      // Create ballistic simulator
      this.ballisticSimulator = new btk.BallisticsSimulator();
      this.ballisticSimulator.setInitialBullet(this.bullet);
      this.ballisticSimulator.setAtmosphere(atmosphere);

      // Dispose atmosphere immediately after use
      atmosphere.delete();
      atmosphere = null;

      // Set wind to zero for zeroing (dispose immediately after use)
      zeroWind = threeJsToBtkPosition(0, 0, 0);
      this.ballisticSimulator.setWind(zeroWind);
      zeroWind.delete();
      zeroWind = null;

      // Zero from the local origin to the local target center
      targetPos = threeJsToBtkPosition(
        this.targetCenterLocal.x,
        this.targetCenterLocal.y,
        this.targetCenterLocal.z
      );

      if (this.verbose)
      {
        console.log(
          `${LOG_PREFIX_SOLVER} Zeroing: MV=${this.nominalMV.toFixed(1)}fps, Range=${this.distance}yd, ` +
          `Target=(${this.targetCenterLocal.x.toFixed(3)}, ${this.targetCenterLocal.y.toFixed(3)}, ${this.targetCenterLocal.z.toFixed(1)}) yards`);
      }

      // Calculate spin rate from twist rate (BTK expects m/s and m/turn)
      const mvMps = btk.Conversions.fpsToMps(this.nominalMV);
      const twistMetersPerTurn = btk.Conversions.inchesToMeters(this.twistRate);
      const spinRate = btk.Bullet.computeSpinRateFromTwist(mvMps, twistMetersPerTurn);

      // Use C++ zeroing routine (returns raw BTK bullet)
      const zeroStartTime = performance.now();
      this.zeroedBullet = this.ballisticSimulator.computeZero(mvMps, targetPos, 0.001, 1000, 1e-6, spinRate);
      const zeroTimeMs = performance.now() - zeroStartTime;
      targetPos.delete();
      targetPos = null;

      // Log the zeroed bullet velocity to show elevation and windage
      if (this.verbose)
      {
        console.log(`${LOG_PREFIX_SOLVER} Spin rate: ${spinRate.toFixed(1)} rad/s (twist: ${this.twistRate.toFixed(1)} in/turn)`);
        console.log(`${LOG_PREFIX_SOLVER} Zero computation took ${zeroTimeMs.toFixed(1)}ms`);
        zeroVelBtk = this.zeroedBullet.getVelocity();
        const zeroVel = btkToThreeJsVelocity(zeroVelBtk);
        const zeroVelMag = Math.sqrt(zeroVel.x * zeroVel.x + zeroVel.y * zeroVel.y + zeroVel.z * zeroVel.z);
        // Calculate angles from velocity components (X=right, Y=up, negative Z=downrange)
        const elevationRad = Math.asin(zeroVel.y / zeroVelMag);
        const windageRad = Math.atan2(zeroVel.x, -zeroVel.z);
        const elevationMoa = btk.Conversions.radiansToMoa(elevationRad);
        const windageMoa = btk.Conversions.radiansToMoa(windageRad);
        console.log(`${LOG_PREFIX_SOLVER} Zero complete: Elevation=${elevationMoa.toFixed(2)} MOA (${elevationRad.toFixed(6)} rad), Windage=${windageMoa.toFixed(2)} MOA (${windageRad.toFixed(6)} rad)`);
        zeroVelBtk.delete();
        zeroVelBtk = null;
      }
    }
    catch (error)
    {
      console.error('Failed to setup shot solver:', error);
      throw error;
    }
    finally
    {
      // Free any transient an exception skipped before its inline delete.
      if (atmosphere) atmosphere.delete();
      if (zeroWind) zeroWind.delete();
      if (targetPos) targetPos.delete();
      if (zeroVelBtk) zeroVelBtk.delete();
    }
  }

  /**
   * Fire one headless shot: apply dispersion and aim to the zeroed bullet,
   * integrate through the live wind field, and return the impact relative to
   * the lane's target center.
   *
   * @param {Object} opts
   * @param {number} opts.yawRad - horizontal aim adjustment (+ = right)
   * @param {number} opts.pitchRad - vertical aim adjustment (+ = up)
   * @param {number} [opts.startXYards] - lane crossrange of the muzzle; the
   *   bullet flies through that lane's wind and is scored against a target at
   *   (startXYards + targetCenterLocal.x, targetCenterLocal.y)
   * @returns {{relativeX:number, relativeY:number, mvFps:number, impactVelocityFps:number}|null}
   */
  solveShot(opts)
  {
    if (!this.ballisticSimulator || !this.zeroedBullet)
    {
      console.error('Shot solver not initialized');
      return null;
    }

    const yawRad = opts.yawRad;
    const pitchRad = opts.pitchRad;
    const startXYards = opts.startXYards ?? 0;

    this.shotNumber++;

    // WASM handles tracked here so the finally can free any that an exception
    // skipped past (the happy path still deletes each inline, then nulls it).
    let zeroVelBtk = null;
    let variedVel = null;
    let bulletStartPos = null;
    let variedBullet = null;
    let pointAtTarget = null;
    let bulletState = null;
    let bulletPosBtk = null;
    let bulletVelBtk = null;

    try
    {
      const dt = 0.001;

      // Apply MV variation in fps
      const mvVariationFps = (Math.random() - 0.5) * 2.0 * this.mvSd; // fps
      const actualMVFps = this.nominalMV + mvVariationFps; // fps

      if (this.verbose)
      {
        console.log(`${LOG_PREFIX_SOLVER} #${this.shotNumber} fired: MV=${actualMVFps.toFixed(1)}fps (${mvVariationFps >= 0 ? '+' : ''}${mvVariationFps.toFixed(1)}fps), Aim=(${yawRad.toFixed(6)}, ${pitchRad.toFixed(6)})`);
      }

      // Rifle accuracy as uniform distribution within a circle (diameter)
      // Generate random point within unit circle using rejection sampling
      let accuracyX, accuracyY;
      do {
        accuracyX = (Math.random() - 0.5) * 2.0; // -1 to 1
        accuracyY = (Math.random() - 0.5) * 2.0; // -1 to 1
      } while (accuracyX * accuracyX + accuracyY * accuracyY > 1.0);

      const btk = getBTK();
      if (!btk) throw new Error('BTK module not loaded');

      // Rifle accuracy in MOA, convert to radians for angular error
      const accuracyRad = btk.Conversions.moaToRadians(this.rifleAccuracyMoa);
      const accuracyRadius = accuracyRad / 2.0; // Convert diameter to radius
      const accuracyErrorH = accuracyX * accuracyRadius; // radians
      const accuracyErrorV = accuracyY * accuracyRadius; // radians

      // Apply scope aim and accuracy errors to the zeroed velocity
      zeroVelBtk = this.zeroedBullet.getVelocity();
      const zeroVel = btkToThreeJsVelocity(zeroVelBtk);
      const zeroVelMag = Math.sqrt(zeroVel.x * zeroVel.x + zeroVel.y * zeroVel.y + zeroVel.z * zeroVel.z);
      // Compute true unit direction in fps space
      const ux0 = zeroVel.x / zeroVelMag;
      const uy0 = zeroVel.y / zeroVelMag;
      const uz0 = zeroVel.z / zeroVelMag;

      // Apply scope aim as small angular adjustments to the zeroed direction
      const yawAdjustment = yawRad + accuracyErrorH;
      const pitchAdjustment = -(pitchRad + accuracyErrorV); // Invert pitch for correct behavior

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

      // Dispose zeroVelBtk now that we're done with zeroVel
      zeroVelBtk.delete();
      zeroVelBtk = null;

      // Scale by actual MV (fps) and convert to BTK velocity
      variedVel = threeJsToBtkVelocity(
        ux * actualMVFps,
        uy * actualMVFps,
        uz * actualMVFps
      );

      // Create bullet with varied initial state - start from this lane's muzzle.
      // The wind-aware simulation samples wind at the bullet's true world
      // position, so starting at the lane x flies through that lane's wind.
      bulletStartPos = threeJsToBtkPosition(startXYards, 0, 0);

      variedBullet = new btk.Bullet(
        this.zeroedBullet,
        bulletStartPos,
        variedVel,
        this.zeroedBullet.getSpinRate()
      );

      // Dispose temporary vectors immediately after bullet creation
      variedVel.delete();
      variedVel = null;
      bulletStartPos.delete();
      bulletStartPos = null;

      // Reset simulator with varied bullet
      this.ballisticSimulator.setInitialBullet(variedBullet);
      this.ballisticSimulator.resetToInitial();

      // Dispose varied bullet immediately - simulator has copied the data
      variedBullet.delete();
      variedBullet = null;

      // Simulate with wind generator (trajectory is owned by simulator)
      const range_m = btk.Conversions.yardsToMeters(this.distance);
      this.ballisticSimulator.simulateWithWind(range_m, dt, 5.0, this.windGenerator);
      this.lastTrajectory = this.ballisticSimulator.getTrajectory();
      pointAtTarget = this.lastTrajectory.atDistance(range_m); // distance in meters

      if (!pointAtTarget)
      {
        console.error('Failed to get trajectory point at target distance');
        return null;
      }

      // Get bullet position and velocity at target (convert units: meters→yards, m/s→fps)
      bulletState = pointAtTarget.getState();
      bulletPosBtk = bulletState.getPosition();
      bulletVelBtk = bulletState.getVelocity();
      const bulletPos = btkToThreeJsPosition(bulletPosBtk); // Convert meters to yards
      const bulletVel = btkToThreeJsVelocity(bulletVelBtk); // Convert m/s to fps
      const impactVelocityFps = Math.sqrt(bulletVel.x ** 2 + bulletVel.y ** 2 + bulletVel.z ** 2); // fps

      // Dispose BTK objects
      bulletPosBtk.delete();
      bulletPosBtk = null;
      bulletVelBtk.delete();
      bulletVelBtk = null;
      bulletState.delete();
      bulletState = null;

      // Impact relative to this lane's target center (X=horizontal, Y=vertical)
      const relativeX = bulletPos.x - (startXYards + this.targetCenterLocal.x); // yards
      const relativeY = bulletPos.y - this.targetCenterLocal.y; // yards

      if (this.verbose)
      {
        const distanceFromCenter = Math.sqrt(relativeX ** 2 + relativeY ** 2);
        console.log(`${LOG_PREFIX_SOLVER} Impact: (${relativeX.toFixed(3)}, ${relativeY.toFixed(3)}) yards from center, Distance=${distanceFromCenter.toFixed(3)}yd`);
        console.log(`${LOG_PREFIX_SOLVER} Flight time: ${this.lastTrajectory.getTotalTime().toFixed(3)}s, Impact velocity: ${impactVelocityFps.toFixed(1)}fps`);
      }

      pointAtTarget.delete(); // Dispose TrajectoryPoint to prevent memory leak
      pointAtTarget = null;

      return {
        relativeX: relativeX, // yards
        relativeY: relativeY, // yards
        mvFps: actualMVFps,
        impactVelocityFps: impactVelocityFps
      };
    }
    catch (error)
    {
      console.error('Failed to solve shot:', error);
      throw error;
    }
    finally
    {
      // Free any handle an exception skipped before its inline delete (the
      // happy path nulls each one, so this is a no-op then). Sub-objects
      // before their parent.
      if (bulletPosBtk) bulletPosBtk.delete();
      if (bulletVelBtk) bulletVelBtk.delete();
      if (bulletState) bulletState.delete();
      if (pointAtTarget) pointAtTarget.delete();
      if (variedBullet) variedBullet.delete();
      if (variedVel) variedVel.delete();
      if (bulletStartPos) bulletStartPos.delete();
      if (zeroVelBtk) zeroVelBtk.delete();
    }
  }

  /**
   * Score an impact against the target.
   * @returns {{score:number, isX:boolean}}
   */
  scoreImpact(relativeXYards, relativeYYards)
  {
    const btk = getBTK();
    if (!btk) throw new Error('BTK module not loaded');

    // Create a temporary match just for scoring this one shot
    const tempMatch = new btk.Match();
    const relativeX_m = btk.Conversions.yardsToMeters(relativeXYards);
    const relativeY_m = btk.Conversions.yardsToMeters(relativeYYards);
    const bulletDiameterMeters = btk.Conversions.inchesToMeters(this.bulletDiameter);
    const hit = tempMatch.addHit(relativeX_m, relativeY_m, this.btkTarget, bulletDiameterMeters);

    // Extract data from Hit before disposing
    const score = hit.getScore();
    const isX = hit.isX();
    hit.delete();
    tempMatch.delete();

    return {
      score,
      isX
    };
  }

  /**
   * Measure how a steady crosswind moves this bullet at the target: two
   * constant-wind no-dispersion sims (0 and +10 mph full-value) on the zeroed
   * bullet. Captures both the horizontal drift and the vertical aerodynamic
   * ("crosswind") jump a spinning bullet picks up, so AI shooters can hold for
   * both. Used by the AI to convert a wind estimate into a hold.
   *
   * @returns {{driftMoaPerMph:number, jumpMoaPerMph:number}}
   *   driftMoaPerMph: windage MOA per mph (+wind = +X drift)
   *   jumpMoaPerMph: elevation MOA per mph (sign depends on twist; +up)
   */
  calibrateDriftSensitivity()
  {
    const btk = getBTK();
    if (!btk) throw new Error('BTK module not loaded');

    const range_m = btk.Conversions.yardsToMeters(this.distance);
    const calibrationMph = 10.0;

    const impactForWind = (windMph) =>
    {
      let windVec = null;
      let point = null;
      let state = null;
      let posBtk = null;
      try
      {
        // Constant crosswind (+X = left-to-right), BTK wants m/s
        windVec = new btk.Vector3D(btk.Conversions.mphToMps(windMph), 0, 0);
        this.ballisticSimulator.setWind(windVec);
        windVec.delete();
        windVec = null;

        this.ballisticSimulator.setInitialBullet(this.zeroedBullet);
        this.ballisticSimulator.resetToInitial();
        this.ballisticSimulator.simulate(range_m, 0.001, 5.0);
        const trajectory = this.ballisticSimulator.getTrajectory();
        point = trajectory.atDistance(range_m);
        if (!point) throw new Error('Calibration trajectory missing target point');
        state = point.getState();
        posBtk = state.getPosition();
        const pos = btkToThreeJsPosition(posBtk);
        posBtk.delete();
        posBtk = null;
        state.delete();
        state = null;
        point.delete();
        point = null;
        return { x: pos.x, y: pos.y }; // yards
      }
      finally
      {
        if (posBtk) posBtk.delete();
        if (state) state.delete();
        if (point) point.delete();
        if (windVec) windVec.delete();
      }
    };

    let zeroWind = null;
    try
    {
      const p0 = impactForWind(0);
      const p10 = impactForWind(calibrationMph);

      // Windage drift (horizontal) and aerodynamic jump (vertical), per mph.
      const driftRad = Math.atan2(p10.x - p0.x, this.distance);
      const jumpRad = Math.atan2(p10.y - p0.y, this.distance);
      const driftMoaPerMph = btk.Conversions.radiansToMoa(driftRad) / calibrationMph;
      const jumpMoaPerMph = btk.Conversions.radiansToMoa(jumpRad) / calibrationMph;
      console.log(`${LOG_PREFIX_SOLVER} Wind calibration at ${this.distance}yd: drift ${driftMoaPerMph.toFixed(3)} MOA/mph, jump ${jumpMoaPerMph.toFixed(3)} MOA/mph`);
      if (!(driftMoaPerMph > 0))
      {
        console.warn(`${LOG_PREFIX_SOLVER} Unexpected drift sign/magnitude: ${driftMoaPerMph}`);
      }
      return { driftMoaPerMph, jumpMoaPerMph };
    }
    finally
    {
      // Restore zero constant wind (solveShot uses the generator regardless)
      zeroWind = threeJsToBtkPosition(0, 0, 0);
      this.ballisticSimulator.setWind(zeroWind);
      zeroWind.delete();
    }
  }

  /**
   * Wind weighting per downrange station. A crosswind near the muzzle deflects
   * the bullet for the rest of its flight, so its effect is proportional to the
   * time of flight remaining from that point (near wind matters most, wind at
   * the target almost not at all). Returns normalized weights (sum = 1) for
   * `stations` stations at fractions (k-0.5)/stations of the range. With these,
   * a weighted-average wind estimate times the constant-wind drift sensitivity
   * reproduces the true deflection for any steady crosswind profile.
   *
   * @param {number} stations
   * @returns {number[]} normalized weights, length `stations`
   */
  computeWindWeights(stations)
  {
    const btk = getBTK();
    const range_m = btk.Conversions.yardsToMeters(this.distance);

    // Representative no-wind trajectory of the zeroed bullet
    let zeroWind = null;
    try
    {
      zeroWind = new btk.Vector3D(0, 0, 0);
      this.ballisticSimulator.setWind(zeroWind);
    }
    finally
    {
      if (zeroWind) zeroWind.delete();
    }
    this.ballisticSimulator.setInitialBullet(this.zeroedBullet);
    this.ballisticSimulator.resetToInitial();
    this.ballisticSimulator.simulate(range_m, 0.001, 5.0);
    const traj = this.ballisticSimulator.getTrajectory();
    const totalTime = traj.getTotalTime();

    const weights = [];
    let sum = 0;
    for (let k = 1; k <= stations; k++)
    {
      const frac = (k - 0.5) / stations;
      const d_m = btk.Conversions.yardsToMeters(this.distance * frac);
      let point = null;
      let t_k = totalTime * frac; // fallback if the lookup misses
      try
      {
        point = traj.atDistance(d_m);
        if (point) t_k = point.getTime();
      }
      finally
      {
        if (point) point.delete();
      }
      const remaining = Math.max(0, totalTime - t_k);
      weights.push(remaining);
      sum += remaining;
    }

    if (sum > 0)
    {
      for (let i = 0; i < weights.length; i++) weights[i] /= sum;
    }
    else
    {
      weights.fill(1 / stations);
    }
    console.log(`${LOG_PREFIX_SOLVER} Wind station weights (muzzle->target): [${weights.map(w => w.toFixed(2)).join(', ')}]`);
    return weights;
  }

  getLastTrajectory()
  {
    return this.lastTrajectory;
  }

  dispose()
  {
    if (this.bullet)
    {
      this.bullet.delete();
    }
    if (this.zeroedBullet)
    {
      this.zeroedBullet.delete();
    }
    if (this.ballisticSimulator)
    {
      this.ballisticSimulator.delete();
    }
    // Note: lastTrajectory is owned by ballisticSimulator, don't delete it

    this.ballisticSimulator = null;
    this.bullet = null;
    this.zeroedBullet = null;
    this.lastTrajectory = null;
    this.btkTarget = null;
    this.windGenerator = null;
  }
}
