/**
 * JavaScript wrapper for Ballistics Calculator WebAssembly module using embind API
 */
class BallisticsCalculator
{
  constructor(btk)
  {
    this.btk = btk;
    this.bullet = null;
    this.atmosphere = null;
    this.wind = null;
  }

  /**
   * Set bullet parameters
   * @param {Object} bullet - Bullet parameters
   * @param {number} bullet.weight - Weight in grains
   * @param {number} bullet.diameter - Diameter in inches
   * @param {number} bullet.length - Length in inches
   * @param {number} bullet.bc - Ballistic coefficient
   * @param {string} bullet.dragFunction - 'G1' or 'G7'
   */
  setBullet(bullet)
  {
    if (!this.btk)
    {
      throw new Error('BallisticsToolkit module not loaded');
    }
    const weight = this.btk.Weight.grains(bullet.weight);
    const diameter = this.btk.Distance.inches(bullet.diameter);
    const length = this.btk.Distance.inches(bullet.length);
    const dragFunction = bullet.dragFunction === 'G1' ? this.btk.DragFunction.G1 : this.btk.DragFunction.G7;

    this.bullet = new this.btk.Bullet(weight, diameter, length, bullet.bc, dragFunction);
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
    const temperature = this.btk.Temperature.fahrenheit(atmosphere.temperature);
    const altitude = this.btk.Distance.feet(atmosphere.altitude);
    const humidity = atmosphere.humidity / 100.0; // Convert percentage to decimal
    const pressure = this.btk.Pressure.zero(); // Use zero pressure to trigger standard pressure calculation

    this.atmosphere = new this.btk.Atmosphere(temperature, altitude, humidity, pressure);
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
    const speed = this.btk.Velocity.mph(wind.speed);
    const direction = this.btk.Angle.oclock(wind.direction);

    this.wind = new this.btk.Wind(speed, direction);
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
    if (!this.bullet || !this.atmosphere || !this.wind)
    {
      throw new Error('Bullet, atmosphere, and wind must be set before calculating trajectory');
    }

    // Create initial bullet state with zeroed position
    const muzzleVelocity = this.btk.Velocity.fps(shot.muzzleVelocity);
    const zeroRange = this.btk.Distance.yards(shot.zeroRange);
    const scopeHeight = this.btk.Distance.inches(shot.scopeHeight);

    // Compute zeroed initial state
    const timeStep = this.btk.Time.seconds(0.001);
    const maxIterations = 20;
    const tolerance = this.btk.Distance.meters(0.001);

    const initialState = this.btk.Simulator.computeZeroedInitialState(
      this.bullet, muzzleVelocity, scopeHeight, zeroRange, this.atmosphere, this.wind,
      timeStep, maxIterations, tolerance
    );
    const maxRangeDistance = this.btk.Distance.yards(shot.maxRange);
    const simulationTimeStep = this.btk.Time.seconds(0.001);
    const maxTime = this.btk.Time.seconds(60.0);

    // Simulate trajectory
    const trajectory = this.btk.Simulator.simulateToDistance(
      initialState, maxRangeDistance, this.wind, this.atmosphere, simulationTimeStep, maxTime
    );

    // Convert trajectory to JavaScript array, sampling at requested intervals
    const trajectoryData = [];
    const stepSize = shot.step; // yards
    const maxRange = shot.maxRange; // yards

    // Sample trajectory at regular intervals using built-in interpolation
    for (let range = 0; range <= maxRange; range += stepSize)
    {
      const targetRange = this.btk.Distance.yards(range);

      // Use trajectory's built-in interpolation
      const interpolatedPoint = trajectory.atDistance(targetRange);

      // Check if the point is valid (not NaN time)
      const time = interpolatedPoint.getTime();
      if (!isNaN(time.getSeconds()))
      {
        const state = interpolatedPoint.getState();
        const position = state.getPosition();

        // Calculate drop and drift in mrad
        // Drop = (bullet_height - scope_height) / range * 1000
        // Negative drop means below line of sight
        const bulletHeightMeters = position.z.getMeters();
        const scopeHeightMeters = this.btk.Distance.inches(shot.scopeHeight).getMeters();
        const rangeMeters = this.btk.Distance.yards(range).getMeters();

        const dropMeters = bulletHeightMeters - scopeHeightMeters;
        const dropMrad = range > 0 ? (dropMeters / rangeMeters) * 1000 : 0;

        // Convert mrad to MOA using C++ units system
        const dropAngleMrad = this.btk.Angle.mrad(dropMrad);
        const dropMoa = dropAngleMrad.getMoa();

        const driftMeters = position.y.getMeters(); // Y is crosswind drift
        const driftMrad = range > 0 ? (driftMeters / rangeMeters) * 1000 : 0;

        // Convert drift to Left/Right text
        // In the coordinate system: positive Y = right drift, negative Y = left drift
        const driftText = driftMrad > 0.01 ? `Right ${driftMrad.toFixed(2)}` :
          driftMrad < -0.01 ? `Left ${Math.abs(driftMrad).toFixed(2)}` :
          '0.00';

        // Get velocity and energy
        const velocity = state.getTotalVelocity();
        const energy = this.calculateEnergy(this.bullet.getWeight(), velocity);

        trajectoryData.push(
        {
          range: range,
          drop: dropMrad,
          dropMoa: dropMoa,
          drift: driftMrad,
          driftText: driftText,
          velocity: velocity.getFps(),
          energy: energy.getFootPounds(),
          time: time.getSeconds()
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
    const mass = weight.getKilograms();
    const speed = velocity.getMps();
    const energyJoules = 0.5 * mass * speed * speed;
    return this.btk.Energy.joules(energyJoules);
  }


  /**
   * Get trajectory point at specific range
   * @param {number} range - Range in yards
   * @returns {Object|null} - Trajectory point or null if not found
   */
  getTrajectoryPoint(range)
  {
    if (!this.bullet || !this.atmosphere || !this.wind)
    {
      throw new Error('Bullet, atmosphere, and wind must be set before calculating trajectory');
    }

    // This would require implementing interpolation in the trajectory
    // For now, return null as this is a more complex operation
    return null;
  }

  /**
   * Clean up resources
   */
  destroy()
  {
    // With embind, objects are automatically garbage collected
    this.bullet = null;
    this.atmosphere = null;
    this.wind = null;
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