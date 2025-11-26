/**
 * BallisticsTable.js - Pre-computed ballistics table for impact point estimation
 * 
 * Builds a lookup table that maps scope dial settings to bullet impact points.
 * Used to estimate where the shooter is actually aiming (for mirage wind sampling).
 */

export class BallisticsTable
{
  constructor()
  {
    this.entries = [];
    this.maxRange_m = 0;
    this.rangeStep_m = 0;
    this.elevationStep_mrad = 0.1;
  }
  
  /**
   * Build the ballistics table from rifle zero configuration.
   * Uses a single trajectory simulation to create a drop table.
   * @param {Object} rifleZero - Zero configuration from steel-sim
   * @param {Object} config - Table generation config
   *   - maxRange_m: maximum range to simulate (meters)
   *   - rangeStep_m: step size for the table (meters)
   */
  build(rifleZero, config)
  {
    console.log('[BallisticsTable] Building drop table...');
    const startTime = performance.now();
    
    // Extract config
    if (config.maxRange_m === undefined) throw new Error('BallisticsTable.build requires maxRange_m');
    if (config.rangeStep_m === undefined) throw new Error('BallisticsTable.build requires rangeStep_m');
    
    const maxRange_m = config.maxRange_m;
    const rangeStep_m = config.rangeStep_m;
    
    this.maxRange_m = maxRange_m;
    this.rangeStep_m = rangeStep_m;
    this.dropTable = []; // Array of {range_m, drop_mrad, spinDrift_mrad} where both angles are in milliradians
    
    // Create simulator for table generation
    const simulator = new window.btk.BallisticsSimulator();
    simulator.setAtmosphere(rifleZero.atmosphere);
    
    // No wind for table (we're just computing bullet drop)
    const noWind = new window.btk.Vector3D(0, 0, 0);
    simulator.setWind(noWind);
    noWind.delete();
    
    // Set up bullet: scope at y=0, bore at y=-scopeHeight_m (below scope)
    const scopeHeight_m = rifleZero.scopeHeight_m;
    const initPos = new window.btk.Vector3D(0, -scopeHeight_m, 0);
    const zeroVel = rifleZero.zeroedVelocity;
    
    // Create bullet with position and velocity (using Bullet constructor that takes bullet, position, velocity, spinRate)
    const baseBullet = rifleZero.bullet;
    const bullet = new window.btk.Bullet(
      baseBullet,
      initPos,
      zeroVel,
      rifleZero.spinRate
    );
    
    initPos.delete();
    
    simulator.setInitialBullet(bullet);
    
    // Simulate entire trajectory at once
    simulator.simulate(maxRange_m, 0.001, 10.0);
    const trajectoryObj = simulator.getTrajectory();
    
    for (let range = 0; range <= maxRange_m; range += rangeStep_m)
    {
      const point = trajectoryObj.atDistance(range);
      if (!point) continue;

      const state = point.getState();
      const position = state.getPosition();

      const drop_m = position.y;
      const spinDrift_m = position.x; // Lateral displacement due to spin drift
      const drop_mrad = range > 0 ? (drop_m / range) * 1000.0 : 0.0;
      const spinDrift_mrad = range > 0 ? (spinDrift_m / range) * 1000.0 : 0.0;

      this.dropTable.push({
        range_m: range,
        drop_mrad: drop_mrad,
        spinDrift_mrad: spinDrift_mrad
      });

      console.log(`[BallisticsTable] Range: ${range}m, Drop: ${drop_mrad.toFixed(2)}mrad, Spin Drift: ${spinDrift_mrad.toFixed(2)}mrad`);

      point.delete();
    }
    
    const endTime = performance.now();
    console.log(`[BallisticsTable] Built drop table with ${this.dropTable.length} entries in ${(endTime - startTime).toFixed(1)}ms`);
    
    simulator.delete();
  }
  
  /**
   * Estimate where the bullet path intersects the scope line of sight, based
   * on the current scope angles and the precomputed drop table.
   * 
   * Conceptually: at this elevation angle, how far does the dope table say the
   * bullet will fly before it falls to ground level? We linearly scan the
   * table and return the last distance where the bullet is still above ground.
   * @param {number} elevation_mrad - Current total elevation angle in mrad (dial + holdover)
   * @param {number} windage_mrad - Current total windage angle in mrad (dial + hold)
   * @param {number} launch_height - Scope/eye height above ground in meters
   * @returns {Object} {x, y, z, range} in meters, or null if no valid estimate
   */
  estimateImpactPoint(elevation_mrad, windage_mrad, launch_height)
  {
    if (this.dropTable.length === 0) return null;
    
    let lastEntry = null;
    
    // Linear scan over the table: for each range, combine the scope elevation
    // with the bullet drop angle to get the bullet's effective angle above
    // horizontal, then see if that ray from launch_height is still above y=0.
    for (let i = 0; i < this.dropTable.length; ++i)
    {
      const entry = this.dropTable[i];
      const range_m = entry.range_m;
      
      // Combined vertical angle in milliradians: scope angle + drop (negative)
      const totalElev_mrad = elevation_mrad + entry.drop_mrad;
      const totalElev_rad = totalElev_mrad / 1000.0;
      
      // Height of bullet above ground at this range
      const height_m = launch_height + Math.tan(totalElev_rad) * range_m;
      
      if (height_m <= 0)
      {
        // Bullet has gone below ground at this range; stop and use lastEntry
        break;
      }
      
      lastEntry = entry;
    }
    
    if (!lastEntry)
    {
      // Bullet is immediately below ground (e.g., pointing into the dirt)
      return {
        x: 0,
        y: 0,
        z: 0,
        range: 0
      };
    }
    
    const range_m = lastEntry.range_m;
    
    // Combine spin drift and dialed/held windage into a single yaw angle.
    const totalYaw_rad = (windage_mrad + lastEntry.spinDrift_mrad) / 1000.0;
    
    // Interpret range as distance along a horizontal line of sight:
    // - Z is downrange (negative)
    // - X is crossrange (positive = right)
    const x = range_m * Math.sin(totalYaw_rad);
    const z = -range_m * Math.cos(totalYaw_rad);
    
    return {
      x,
      y: 0,
      z,
      range: range_m
    };
  }
  
  /**
   * Get statistics about the table for debugging
   */
  getStats()
  {
    if (this.dropTable.length === 0)
    {
      return {
        numEntries: 0,
        rangeRange: [0, 0],
        dropRange_mrad: [0, 0],
        spinDriftRange_mrad: [0, 0]
      };
    }

    const ranges = this.dropTable.map(e => e.range_m);
    const drops = this.dropTable.map(e => e.drop_mrad);
    const spinDrifts = this.dropTable.map(e => e.spinDrift_mrad);

    return {
      numEntries: this.dropTable.length,
      rangeRange: [Math.min(...ranges), Math.max(...ranges)],
      dropRange_mrad: [Math.min(...drops), Math.max(...drops)],
      spinDriftRange_mrad: [Math.min(...spinDrifts), Math.max(...spinDrifts)]
    };
  }
}

