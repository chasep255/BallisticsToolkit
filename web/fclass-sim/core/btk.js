// The WASM loader lives in the shared module; re-export it so this app's
// modules keep importing waitForBTK/getBTK from here. The Three.js coordinate
// helpers below are fclass-specific and stay local.
import { waitForBTK, getBTK } from '../../shared/btk.js';

export { waitForBTK, getBTK };

// Local handle to the loaded module for the conversion helpers below.
function btkOrThrow()
{
  const btk = getBTK();
  if (!btk) throw new Error('BTK not loaded yet');
  return btk;
}

// ===== COORDINATE CONVERSION UTILITIES =====

/**
 * Convert BTK Vector3D (meters) to plain object (yards)
 * BTK and Three.js use the same coordinate system: X=right, Y=up, Z=towards-camera (negative Z = downrange)
 * @param {btk.Vector3D} btkVec - Position vector from BTK in meters
 * @returns {Object} Position object {x, y, z} in yards
 */
export function btkToThreeJsPosition(btkVec)
{
  const btk = btkOrThrow();
  return {
    x: btk.Conversions.metersToYards(btkVec.x),
    y: btk.Conversions.metersToYards(btkVec.y),
    z: btk.Conversions.metersToYards(btkVec.z)
  };
}

/**
 * Convert Three.js position (yards) to BTK Vector3D (meters)
 * BTK and Three.js use the same coordinate system: X=right, Y=up, Z=towards-camera (negative Z = downrange)
 * @param {number} x_yd - X position in yards
 * @param {number} y_yd - Y position in yards
 * @param {number} z_yd - Z position in yards
 * @returns {btk.Vector3D} Position vector in meters
 */
export function threeJsToBtkPosition(x_yd, y_yd, z_yd)
{
  const btk = btkOrThrow();
  return new btk.Vector3D(
    btk.Conversions.yardsToMeters(x_yd),
    btk.Conversions.yardsToMeters(y_yd),
    btk.Conversions.yardsToMeters(z_yd)
  );
}

/**
 * Convert BTK Vector3D (m/s) to Three.js velocity (fps)
 * BTK and Three.js use the same coordinate system: X=right, Y=up, Z=towards-camera (negative Z = downrange)
 * @param {btk.Vector3D} btkVec - Velocity vector from BTK in m/s
 * @returns {Object} Velocity object {x, y, z} in fps
 */
export function btkToThreeJsVelocity(btkVec)
{
  const btk = btkOrThrow();
  return {
    x: btk.Conversions.mpsToFps(btkVec.x),
    y: btk.Conversions.mpsToFps(btkVec.y),
    z: btk.Conversions.mpsToFps(btkVec.z)
  };
}

/**
 * Convert Three.js velocity (fps) to BTK Vector3D (m/s)
 * BTK and Three.js use the same coordinate system: X=right, Y=up, Z=towards-camera (negative Z = downrange)
 * @param {number} x_fps - X velocity in fps
 * @param {number} y_fps - Y velocity in fps
 * @param {number} z_fps - Z velocity in fps
 * @returns {btk.Vector3D} Velocity vector in m/s
 */
export function threeJsToBtkVelocity(x_fps, y_fps, z_fps)
{
  const btk = btkOrThrow();
  return new btk.Vector3D(
    btk.Conversions.fpsToMps(x_fps),
    btk.Conversions.fpsToMps(y_fps),
    btk.Conversions.fpsToMps(z_fps)
  );
}

/**
 * Convert BTK wind vector (m/s) to Three.js wind vector (mph)
 * BTK and Three.js use the same coordinate system: X=right, Y=up, Z=towards-camera (negative Z = downrange)
 * @param {btk.Vector3D} windBtk - Wind vector from BTK wind generator in m/s
 * @returns {Object} Wind vector {x, y, z} in mph
 */
export function btkWindToThreeJs(windBtk)
{
  const btk = btkOrThrow();
  return {
    x: btk.Conversions.mpsToMph(windBtk.x),
    y: btk.Conversions.mpsToMph(windBtk.y),
    z: btk.Conversions.mpsToMph(windBtk.z)
  };
}

/**
 * Sample wind at Three.js position and return in Three.js coords (mph)
 * BTK and Three.js use the same coordinate system: X=right, Y=up, Z=towards-camera (negative Z = downrange)
 * @param {btk.WindGenerator} generator - Wind generator instance
 * @param {number} x_yd - X position in yards
 * @param {number} y_yd - Y position in yards
 * @param {number} z_yd - Z position in yards
 * @returns {Object} Wind vector {x, y, z} in mph
 */
export function sampleWindAtThreeJsPosition(generator, x_yd, y_yd, z_yd)
{
  const btk = btkOrThrow();
  if (!generator)
  {
    return {
      x: 0,
      y: 0,
      z: 0
    };
  }

  // Convert yards to meters and sample (same coordinate system, just unit conversion)
  const windBtk = generator.sample(
    btk.Conversions.yardsToMeters(x_yd),
    btk.Conversions.yardsToMeters(y_yd),
    btk.Conversions.yardsToMeters(z_yd)
  );

  // Convert BTK wind (m/s) to Three.js coords (mph)
  const wind = btkWindToThreeJs(windBtk);
  windBtk.delete(); // Dispose Vector3D to prevent memory leak

  return wind;
}