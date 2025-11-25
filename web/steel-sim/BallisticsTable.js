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
   */
  build(rifleZero, config)
  {
    console.log('[BallisticsTable] Building drop table...');
    const startTime = performance.now();
    
    // Extract config
    const maxRange_m = config.maxRange_m;
    const rangeStep_m = config.rangeStep_m;
    
    this.maxRange_m = maxRange_m;
    this.rangeStep_m = rangeStep_m;
    this.dropTable = []; // Array of {range_m, drop_mrad} where drop_mrad is drop angle in milliradians
    
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
      const drop_mrad = range > 0 ? (drop_m / range) * 1000.0 : 0.0;
      
      this.dropTable.push({
        range_m: range,
        drop_mrad: drop_mrad
      });

      console.log(`[BallisticsTable] Range: ${range}m, Drop: ${drop_mrad.toFixed(2)}mrad`);
      
      point.delete();
    }
    
    const endTime = performance.now();
    console.log(`[BallisticsTable] Built drop table with ${this.dropTable.length} entries in ${(endTime - startTime).toFixed(1)}ms`);
    
    simulator.delete();
  }
  
  /**
   * Estimate where the bullet will impact based on scope dial elevation.
   * Searches drop table for matching angle and interpolates range.
   * @param {number} elevation_mrad - Current scope dial elevation in mrad
   * @returns {Object} {x, y, z, range} in meters, or null if no valid estimate
   */
  estimateImpactPoint(elevation_mrad)
  {
    if (this.dropTable.length === 0) return null;
    
    // Binary search for range where drop_mrad matches elevation_mrad
    let left = 0;
    let right = this.dropTable.length - 1;
    let bestIdx = 0;
    
    while (left <= right)
    {
      const mid = Math.floor((left + right) / 2);
      const entry = this.dropTable[mid];
      
      if (Math.abs(entry.drop_mrad - elevation_mrad) < 0.01)
      {
        bestIdx = mid;
        break;
      }
      else if (entry.drop_mrad < elevation_mrad)
      {
        // Need more drop (more range)
        bestIdx = mid;
        left = mid + 1;
      }
      else
      {
        // Too much drop (less range)
        right = mid - 1;
      }
    }
    
    // Interpolate between entries
    if (bestIdx < this.dropTable.length - 1)
    {
      const curr = this.dropTable[bestIdx];
      const next = this.dropTable[bestIdx + 1];
      
      const currDiff = curr.drop_mrad - elevation_mrad;
      const nextDiff = next.drop_mrad - elevation_mrad;
      
      if (Math.abs(nextDiff - currDiff) > 0.001)
      {
        const alpha = -currDiff / (nextDiff - currDiff);
        const interpRange = curr.range_m + alpha * (next.range_m - curr.range_m);
        
        return {
          x: 0,
          y: 0,
          z: -interpRange,
          range: interpRange
        };
      }
    }
    
    const entry = this.dropTable[bestIdx];
    return {
      x: 0,
      y: 0,
      z: -entry.range_m,
      range: entry.range_m
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
        dropRange_mrad: [0, 0]
      };
    }
    
    const ranges = this.dropTable.map(e => e.range_m);
    const drops = this.dropTable.map(e => e.drop_mrad);
    
    return {
      numEntries: this.dropTable.length,
      rangeRange: [Math.min(...ranges), Math.max(...ranges)],
      dropRange_mrad: [Math.min(...drops), Math.max(...drops)]
    };
  }
}

