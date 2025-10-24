import BallisticsToolkit from '../ballistics_toolkit_wasm.js';

let btk = null;

// Initialize BTK module
export async function initializeBTK() {
  if (!btk) {
    btk = await BallisticsToolkit();
  }
  return btk;
}

// Export btk for direct access
export function getBTK() {
  return btk;
}

// ===== BTK WRAPPERS (TRANSPARENT COORDINATE/UNIT CONVERSION) =====

/**
 * Wraps BTK Vector3 for POSITIONS - appears as standard Three.js coords in yards
 * BTK: X=downrange(m), Y=crossrange-right(m), Z=up(m)
 * Three.js: X=right(yd), Y=up(yd), Z=towards-camera(yd) [negative Z = downrange]
 */
export class BtkVector3Wrapper
{
  constructor(btkVec3OrX, y, z)
  {
    if (typeof btkVec3OrX === 'object')
    {
      // Wrapping existing BTK vector
      this._btk = btkVec3OrX;
    }
    else
    {
      // Creating from Three.js coords (yards) - convert to BTK (meters)
      const x_yd = btkVec3OrX;
      const btkX_m = btk.Conversions.yardsToMeters(-z); // Three Z → BTK X (downrange)
      const btkY_m = btk.Conversions.yardsToMeters(x_yd); // Three X → BTK Y (crossrange)
      const btkZ_m = btk.Conversions.yardsToMeters(y); // Three Y → BTK Z (up)
      this._btk = new btk.Vector3D(btkX_m, btkY_m, btkZ_m);
    }
  }

  // Expose as Three.js coordinates in yards (transparent conversion)
  get x()
  {
    return btk.Conversions.metersToYards(this._btk.y);
  } // BTK Y → Three X
  get y()
  {
    return btk.Conversions.metersToYards(this._btk.z);
  } // BTK Z → Three Y
  get z()
  {
    return btk.Conversions.metersToYards(-this._btk.x);
  } // BTK -X → Three Z

  set x(x_yd)
  {
    this._btk.y = btk.Conversions.yardsToMeters(x_yd);
  }
  set y(y_yd)
  {
    this._btk.z = btk.Conversions.yardsToMeters(y_yd);
  }
  set z(z_yd)
  {
    this._btk.x = btk.Conversions.yardsToMeters(-z_yd);
  }

  toThreeVector3()
  {
    return new THREE.Vector3(this.x, this.y, this.z);
  }

  // Set from Three.js Vector3
  setFromThreeVector3(vec3)
  {
    this.x = vec3.x;
    this.y = vec3.y;
    this.z = vec3.z;
    return this;
  }

  get raw()
  {
    return this._btk;
  } // For passing to BTK functions
}

/**
 * Wraps BTK Vector3 for VELOCITIES - appears as standard Three.js coords in fps
 * BTK: X=downrange(m/s), Y=crossrange-right(m/s), Z=up(m/s)
 * Three.js: X=right(fps), Y=up(fps), Z=towards-camera(fps) [negative Z = downrange]
 */
export class BtkVelocityWrapper
{
  constructor(btkVec3OrX, y, z)
  {
    if (typeof btkVec3OrX === 'object')
    {
      // Wrapping existing BTK vector
      this._btk = btkVec3OrX;
    }
    else
    {
      // Creating from Three.js coords (fps) - convert to BTK (m/s)
      const x_fps = btkVec3OrX;
      const btkX_mps = btk.Conversions.fpsToMps(-z); // Three Z → BTK X (downrange)
      const btkY_mps = btk.Conversions.fpsToMps(x_fps); // Three X → BTK Y (crossrange)
      const btkZ_mps = btk.Conversions.fpsToMps(y); // Three Y → BTK Z (up)
      this._btk = new btk.Vector3D(btkX_mps, btkY_mps, btkZ_mps);
    }
  }

  // Expose as Three.js coordinates in fps (transparent conversion)
  get x()
  {
    return btk.Conversions.mpsToFps(this._btk.y);
  } // BTK Y → Three X
  get y()
  {
    return btk.Conversions.mpsToFps(this._btk.z);
  } // BTK Z → Three Y
  get z()
  {
    return btk.Conversions.mpsToFps(-this._btk.x);
  } // BTK -X → Three Z

  magnitude()
  {
    // Returns speed in fps (transparent conversion from m/s)
    return btk.Conversions.mpsToFps(this._btk.magnitude());
  }

  normalized()
  {
    // Returns unit vector (still in Three.js coords)
    return new BtkVelocityWrapper(this._btk.normalized());
  }

  get raw()
  {
    return this._btk;
  } // For passing to BTK functions
}

/**
 * Wraps BTK Bullet - all coordinates in Three.js space, yards
 */
export class BtkBulletWrapper
{
  constructor(btkBulletOrMass, posOrDiameter, velOrLength, spinRateOrBc, dragFunction)
  {
    if (typeof btkBulletOrMass === 'object' && arguments.length === 1)
    {
      // Wrapping existing BTK bullet
      this._btk = btkBulletOrMass;
    }
    else if (typeof btkBulletOrMass === 'object' && arguments.length === 4)
    {
      // Creating bullet from (baseBullet, pos, vel, spinRate)
      // pos and vel MUST be wrappers (BtkVector3Wrapper or BtkVelocityWrapper)
      const baseBullet = btkBulletOrMass;
      const pos = posOrDiameter; // BtkVector3Wrapper
      const vel = velOrLength; // BtkVelocityWrapper
      const spinRate = spinRateOrBc;
      // Handle case where baseBullet is a wrapper
      const baseBulletRaw = baseBullet.raw || baseBullet;
      this._btk = new btk.Bullet(baseBulletRaw, pos.raw, vel.raw, spinRate);
    }
    else
    {
      // Creating new bullet from standard units (grains, inches)
      const massGrains = btkBulletOrMass;
      const diameterInches = posOrDiameter;
      const lengthInches = velOrLength;
      const bc = spinRateOrBc;
      this._btk = new btk.Bullet(
        btk.Conversions.grainsToKg(massGrains),
        btk.Conversions.inchesToMeters(diameterInches),
        btk.Conversions.inchesToMeters(lengthInches),
        bc,
        dragFunction === 'G1' ? btk.DragFunction.G1 : btk.DragFunction.G7
      );
    }
  }

  getPosition()
  {
    return new BtkVector3Wrapper(this._btk.getPosition());
  }
  getVelocity()
  {
    return new BtkVelocityWrapper(this._btk.getVelocity());
  }
  getMach()
  {
    return this._btk.getMach();
  }
  getTime()
  {
    return this._btk.getTime();
  }
  getSpinRate()
  {
    return this._btk.getSpinRate();
  }

  get raw()
  {
    return this._btk;
  }
}

/**
 * Wraps BTK TrajectoryPoint
 */
export class BtkTrajectoryPointWrapper
{
  constructor(btkPoint)
  {
    this._btk = btkPoint;
  }

  getState()
  {
    return new BtkBulletWrapper(this._btk.getState());
  }
  getTime()
  {
    return this._btk.getTime();
  }
  get raw()
  {
    return this._btk;
  }
}

/**
 * Wraps BTK Trajectory - distances in yards, returns Three.js coords
 */
export class BtkTrajectoryWrapper
{
  constructor(btkTrajectory)
  {
    this._btk = btkTrajectory;
  }

  atTime(t)
  {
    const point = this._btk.atTime(t);
    return point ? new BtkTrajectoryPointWrapper(point) : undefined;
  }

  atDistance(distanceYards)
  {
    const d_m = btk.Conversions.yardsToMeters(distanceYards);
    const point = this._btk.atDistance(d_m);
    return point ? new BtkTrajectoryPointWrapper(point) : undefined;
  }

  getTotalTime()
  {
    return this._btk.getTotalTime();
  }

  get raw()
  {
    return this._btk;
  }
}

/**
 * Wraps BTK WindGenerator - positions in yards, returns Three.js coords
 * Note: Wind is currently only a function of downrange distance (z coordinate),
 * but we keep the 3-coordinate interface for future flexibility
 */
export class BtkWindGeneratorWrapper
{
  constructor(btkWindGen)
  {
    this._btk = btkWindGen;
  }

  getWindAt(x_yd, y_yd, z_yd, time)
  {
    // Convert Three.js Z (towards camera, negative = downrange) to BTK X (downrange)
    // Wind only depends on downrange distance currently
    const downrange_m = btk.Conversions.yardsToMeters(-z_yd);
    const wind = this._btk.sample(downrange_m, time);

    // Convert BTK wind (m/s) to Three.js coordinates and mph
    const windX_mph = btk.Conversions.mpsToMph(wind.y); // BTK Y (crossrange) → Three X (horizontal)
    const windY_mph = btk.Conversions.mpsToMph(wind.z); // BTK Z (up) → Three Y (vertical)  
    const windZ_mph = btk.Conversions.mpsToMph(-wind.x); // BTK -X (downrange) → Three Z (downrange)

    return {
      x: windX_mph, // mph
      y: windY_mph, // mph
      z: windZ_mph // mph
    };
  }

  get raw()
  {
    return this._btk;
  }
}

/**
 * Wraps BTK BallisticsSimulator (stateful simulator) - all inputs/outputs in Three.js coords, yards
 */
export class BtkBallisticsSimulatorWrapper
{
  constructor()
  {
    this._btk = new btk.BallisticsSimulator();
  }

  setInitialBullet(bullet)
  {
    this._btk.setInitialBullet(bullet.raw || bullet);
  }

  setAtmosphere(atmosphere)
  {
    this._btk.setAtmosphere(atmosphere.raw || atmosphere);
  }

  setWind(wind)
  {
    if (wind instanceof BtkVector3Wrapper)
    {
      this._btk.setWind(wind.raw);
    }
    else
    {
      this._btk.setWind(wind);
    }
  }

  resetToInitial()
  {
    this._btk.resetToInitial();
  }

  simulate(rangeYards, timeStep, maxTime)
  {
    const range_m = btk.Conversions.yardsToMeters(rangeYards);
    const rawTraj = this._btk.simulate(range_m, timeStep, maxTime);
    return new BtkTrajectoryWrapper(rawTraj);
  }

  simulateWithWind(rangeYards, timeStep, maxTime, windGenerator, time)
  {
    const range_m = btk.Conversions.yardsToMeters(rangeYards);
    const rawTraj = this._btk.simulateWithWind(range_m, timeStep, maxTime, windGenerator.raw || windGenerator, time);
    return new BtkTrajectoryWrapper(rawTraj);
  }

  get raw()
  {
    return this._btk;
  }
}

/**
 * Wraps BTK Atmosphere - all parameters in standard units (°F, feet, %)
 */
export class BtkAtmosphereWrapper
{
  constructor(tempF, altitudeFeet, humidity, pressure = 0.0)
  {
    this._btk = new btk.Atmosphere(
      btk.Conversions.fahrenheitToKelvin(tempF),
      btk.Conversions.feetToMeters(altitudeFeet),
      humidity,
      pressure
    );
  }

  get raw()
  {
    return this._btk;
  }
}

/**
 * Wraps BTK Match - handles scoring with transparent unit conversion
 */
export class BtkMatchWrapper
{
  constructor()
  {
    this._btk = new btk.Match();
  }

  getTotalScore()
  {
    return this._btk.getTotalScore();
  }
  getXCount()
  {
    return this._btk.getXCount();
  }
  getHitCount()
  {
    return this._btk.getHitCount();
  }

  // Add hit to match
  addHit(relativeX, relativeY, target, bulletDiameterInches)
  {
    // Convert from yards to meters for BTK
    const relativeX_m = btk.Conversions.yardsToMeters(relativeX);
    const relativeY_m = btk.Conversions.yardsToMeters(relativeY);
    const bulletDiameterMeters = btk.Conversions.inchesToMeters(bulletDiameterInches);
    return this._btk.addHit(relativeX_m, relativeY_m, target, bulletDiameterMeters);
  }

  // Return group size in inches
  getGroupSizeInches()
  {
    return btk.Conversions.metersToInches(this._btk.getGroupSize());
  }

  // Clear all hits from the match
  clear()
  {
    this._btk.clear();
  }

  get raw()
  {
    return this._btk;
  }
}

