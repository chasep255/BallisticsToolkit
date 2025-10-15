/**
 * JavaScript wrapper for Ballistics Calculator WebAssembly module using embind API
 */
class BallisticsCalculator
{
  constructor(btk)
  {
    this.btk = btk;
    this.simulator = new btk.Simulator();
  }

  /**
   * Set bullet parameters
   * @param {Object} bullet - Bullet parameters
   * @param {number} bullet.weight - Weight in grains
   * @param {number} bullet.bc - Ballistic coefficient
   * @param {string} bullet.dragFunction - 'G1' or 'G7'
   */
  setBullet(bullet)
  {
    if (!this.btk)
    {
      throw new Error('BallisticsToolkit module not loaded');
    }
    const weight = this.btk.Conversions.grainsToKg(bullet.weight);
    const diameter = this.btk.Conversions.inchesToMeters(bullet.diameter);
    const length = this.btk.Conversions.inchesToMeters(bullet.length);
    const dragFunction = bullet.dragFunction === 'G1' ? this.btk.DragFunction.G1 : this.btk.DragFunction.G7;

    const bulletObj = new this.btk.Bullet(weight, diameter, length, bullet.bc, dragFunction);
    this.simulator.setInitialBullet(bulletObj);
  }


  /**
   * Set atmospheric conditions
   * @param {Object} atmosphere - Atmospheric parameters
   * @param {number} atmosphere.temperature - Temperature in Fahrenheit
   * @param {number} atmosphere.humidity - Humidity percentage (0-100)
   * @param {number} atmosphere.altitude - Altitude in feet
   */
  setAtmosphere(atmosphere)
  {
    if (!this.btk)
    {
      throw new Error('BallisticsToolkit module not loaded');
    }
    const temperature = this.btk.Conversions.fahrenheitToKelvin(atmosphere.temperature);
    const altitude = this.btk.Conversions.feetToMeters(atmosphere.altitude);
    const humidity = atmosphere.humidity / 100.0; // Convert percentage to decimal
    const pressure = 0.0; // Use zero pressure to trigger standard pressure calculation

    const atmosphereObj = new this.btk.Atmosphere(temperature, altitude, humidity, pressure);
    this.simulator.setAtmosphere(atmosphereObj);
  }

  /**
   * Set wind conditions
   * @param {Object} wind - Wind parameters
   * @param {number} wind.speed - Wind speed in mph
   * @param {number} wind.direction - Wind direction in clock mode (3=from right, 6=from front, 9=from left, 12=from rear)
   */
  setWind(wind)
  {
    if (!this.btk)
    {
      throw new Error('BallisticsToolkit module not loaded');
    }
    const speed = this.btk.Conversions.mphToMps(wind.speed);
    const direction = this.btk.Conversions.oclockToRadians(wind.direction);

    // Convert from cylindrical (speed, direction) to Cartesian (x, y, z)
    // o'clock system: 3=from right, 6=headwind, 9=from left, 12=tailwind
    // direction is in radians: 0°=tailwind, 90°=from right, 180°=headwind, 270°=from left
    const x = -speed * Math.cos(direction); // Downrange component (negative = headwind, positive = tailwind)
    const y = speed * Math.sin(direction); // Crossrange component (positive = from right, negative = from left)
    const z = 0.0; // No vertical component for now

    const windObj = new this.btk.Vector3D(x, y, z);
    this.simulator.setWind(windObj);
  }

  /**
   * Calculate trajectory
   * @param {Object} shot - Shot parameters
   * @param {number} shot.muzzleVelocity - Muzzle velocity in fps
   * @param {number} shot.zeroRange - Zero range in yards
   * @param {number} shot.scopeHeight - Scope height in inches
   * @param {number} shot.maxRange - Maximum range in yards
   * @param {number} shot.step - Step size in yards
   * @returns {Array} - Trajectory data
   */
  calculateTrajectory(shot)
  {
    if (!this.btk)
    {
      throw new Error('BallisticsToolkit module not loaded');
    }

    // Create initial bullet state with zeroed position
    const muzzleVelocity = this.btk.Conversions.fpsToMps(shot.muzzleVelocity);
    const zeroRange = this.btk.Conversions.yardsToMeters(shot.zeroRange);
    const scopeHeight = this.btk.Conversions.inchesToMeters(shot.scopeHeight);

    // Compute zeroed initial state using simulator
    const timeStep = 0.001;
    const maxIterations = 20;
    const tolerance = 0.001;
    const spinRate = 0.0;

    this.simulator.computeZero(muzzleVelocity, scopeHeight, zeroRange, timeStep, maxIterations, tolerance, spinRate);
    
    const maxRangeDistance = this.btk.Conversions.yardsToMeters(shot.maxRange);
    const simulationTimeStep = 0.001;
    const maxTime = 60.0;

    // Simulate using stored state
    const trajectory = this.simulator.simulate(maxRangeDistance, simulationTimeStep, maxTime);

    // Convert trajectory to JavaScript array, sampling at requested intervals
    const trajectoryData = [];
    const stepSize = shot.step; // yards
    const maxRange = shot.maxRange; // yards

    // Sample trajectory at regular intervals using built-in interpolation
    for (let range = 0; range <= maxRange; range += stepSize)
    {
      const targetRange = this.btk.Conversions.yardsToMeters(range);

      // Use trajectory's built-in interpolation
      const interpolatedPoint = trajectory.atDistance(targetRange);

      // Check if the point is valid (not NaN time)
      const time = interpolatedPoint.getTime();
      if (!isNaN(time))
      {
        const state = interpolatedPoint.getState();
        const position = state.getPosition();

        // Calculate drop and drift in mrad
        // Drop = (bullet_height - scope_height) / range * 1000
        // Negative drop means below line of sight
        const bulletHeightMeters = position.z;
        const scopeHeightMeters = this.btk.Conversions.inchesToMeters(shot.scopeHeight);
        const rangeMeters = this.btk.Conversions.yardsToMeters(range);

        const dropMeters = bulletHeightMeters - scopeHeightMeters;
        const dropMrad = range > 0 ? (dropMeters / rangeMeters) * 1000 : 0;

        // Convert mrad to MOA using conversions
        const dropMoa = this.btk.Conversions.radiansToMoa(this.btk.Conversions.mradToRadians(dropMrad));

        const driftMeters = position.y; // Y is crosswind drift
        const driftMrad = range > 0 ? (driftMeters / rangeMeters) * 1000 : 0;

        // Convert drift to Left/Right text
        // In the coordinate system: positive Y = right drift, negative Y = left drift
        const driftText = driftMrad > 0.01 ? `Right ${driftMrad.toFixed(2)}` :
          driftMrad < -0.01 ? `Left ${Math.abs(driftMrad).toFixed(2)}` :
          '0.00';

        // Get velocity and energy
        const velocity = state.getTotalVelocity();
        const energy = this.calculateEnergy(this.simulator.getInitialBullet().getWeight(), velocity);

        trajectoryData.push(
        {
          range: range,
          drop: dropMrad,
          dropMoa: dropMoa,
          drift: driftMrad,
          driftText: driftText,
          velocity: this.btk.Conversions.mpsToFps(velocity),
          energy: this.btk.Conversions.joulesToFootPounds(energy),
          time: time
        });
      }
    }

    return trajectoryData;
  }

  /**
   * Calculate kinetic energy
   * @param {Weight} weight - Bullet weight
   * @param {Velocity} velocity - Bullet velocity
   * @returns {Energy} - Kinetic energy
   */
  calculateEnergy(weight, velocity)
  {
    // KE = 0.5 * m * v^2
    const mass = weight; // weight is already in kg
    const speed = velocity; // velocity is already in m/s
    const energyJoules = 0.5 * mass * speed * speed;
    return energyJoules; // Return raw joules
  }


  /**
   * Get trajectory point at specific range
   * @param {number} range - Range in yards
   * @returns {Object|null} - Trajectory point or null if not found
   */
  getTrajectoryPoint(range)
  {
    if (!this.trajectory) {
      return null;
    }
    
    // Convert yards to meters for C++ API
    const rangeMeters = this.btk.Conversions.yardsToMeters(range);
    
    // Use the C++ trajectory interpolation
    const point = this.trajectory.atDistance(rangeMeters);
    
    // Check if point is valid (not NaN time)
    if (isNaN(point.getTime())) {
      return null;
    }
    
    // Convert back to imperial units for JavaScript
    const state = point.getState();
    const position = state.getPosition();
    const velocity = state.getVelocity();
    
    return {
      range: range,
      drop: this.btk.Conversions.radiansToMoa(point.getState().getPositionZ() / rangeMeters),
      drift: this.btk.Conversions.radiansToMoa(point.getState().getPositionY() / rangeMeters),
      velocity: this.btk.Conversions.mpsToFps(velocity.magnitude()),
      energy: this.calculateEnergy(state.getWeight(), velocity.magnitude()),
      time: point.getTime()
    };
  }

  /**
   * Clean up resources
   */
  destroy()
  {
    // With embind, objects are automatically garbage collected
    this.simulator = null;
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports)
{
  module.exports = BallisticsCalculator;
}
else if (typeof window !== 'undefined')
{
  window.BallisticsCalculator = BallisticsCalculator;
}