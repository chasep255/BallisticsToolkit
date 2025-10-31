/**
 * Wind - Wind generation and sampling for F-Class simulator
 * Wraps BTK wind generator with clean API
 */

import
{
  createWindGeneratorFromPreset
}
from './btk.js';

const LOG_PREFIX = '[Wind]';

/**
 * Create a wind generator from a preset name
 * Wind varies with time, so each game will have different wind patterns
 * @param {string} presetName - Name of the wind preset
 * @param {btk.Vector3D} minCorner - Minimum corner of sampling box (BTK coordinates, meters)
 * @param {btk.Vector3D} maxCorner - Maximum corner of sampling box (BTK coordinates, meters)
 * @returns {BtkWindGeneratorWrapper} Wind generator instance
 */
export function createWind(presetName, minCorner, maxCorner)
{
  console.log(`${LOG_PREFIX} Creating wind generator: ${presetName}`);
  const generator = createWindGeneratorFromPreset(presetName, minCorner, maxCorner);
  return generator;
}

/**
 * Sample wind at a specific position
 * @param {BtkWindGeneratorWrapper} generator - Wind generator instance
 * @param {number} x - X position (yards)
 * @param {number} y - Y position (yards)
 * @param {number} z - Z position (yards)
 * @returns {Object} Wind vector {x, y, z} in mph
 */
export function sampleWind(generator, x, y, z)
{
  if (!generator)
  {
    console.warn(`${LOG_PREFIX} No wind generator provided`);
    return {
      x: 0,
      y: 0,
      z: 0
    };
  }
  return generator.getWindAt(x, y, z);
}

/**
 * Get wind speed magnitude at a position
 * @param {BtkWindGeneratorWrapper} generator - Wind generator instance
 * @param {number} x - X position (yards)
 * @param {number} y - Y position (yards)
 * @param {number} z - Z position (yards)
 * @param {number} time - Time (seconds)
 * @returns {number} Wind speed in mph
 */
export function getWindSpeed(generator, x, y, z, time)
{
  const wind = sampleWind(generator, x, y, z, time);
  return Math.sqrt(wind.x * wind.x + wind.y * wind.y + wind.z * wind.z);
}