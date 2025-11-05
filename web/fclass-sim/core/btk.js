import BallisticsToolkit from '../../ballistics_toolkit_wasm.js';

// Load BTK module at module level (promise-based, non-blocking)
let btk = null;
const btkPromise = BallisticsToolkit().then(module =>
{
  btk = module;
  // Make BTK globally accessible once loaded
  if (typeof window !== 'undefined')
  {
    window.btk = btk;
  }
  return module;
});

// Wait for BTK to be ready
export async function waitForBTK()
{
  await btkPromise;
  return btk;
}

// Get BTK (may be null if not loaded yet)
export function getBTK()
{
  return btk;
}

// ===== COORDINATE CONVERSION UTILITIES =====

/**
 * Convert BTK Vector3D (meters, BTK coords) to plain object (yards, Three.js coords)
 * BTK: X=downrange, Y=crossrange-right, Z=up
 * Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
 * @returns {Object} Position object {x, y, z} in yards (Three.js coords)
 */
export function btkToThreeJsPosition(btkVec)
{
  if (!btk) throw new Error('BTK not loaded yet');
  return {
    x: btk.Conversions.metersToYards(btkVec.y),  // BTK Y (crossrange) → Three X (right)
    y: btk.Conversions.metersToYards(btkVec.z),  // BTK Z (up) → Three Y (up)
    z: -btk.Conversions.metersToYards(btkVec.x)  // BTK -X (downrange) → Three Z (downrange)
  };
}

/**
 * Convert Three.js position (yards, Three.js coords) to BTK Vector3D (meters, BTK coords)
 * Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
 * BTK: X=downrange, Y=crossrange-right, Z=up
 */
export function threeJsToBtkPosition(x_yd, y_yd, z_yd)
{
  if (!btk) throw new Error('BTK not loaded yet');
  return new btk.Vector3D(
    btk.Conversions.yardsToMeters(-z_yd), // Three Z (downrange) → BTK X (downrange)
    btk.Conversions.yardsToMeters(x_yd),  // Three X (crossrange) → BTK Y (crossrange)
    btk.Conversions.yardsToMeters(y_yd)   // Three Y (up) → BTK Z (up)
  );
}

/**
 * Convert BTK Vector3D (m/s, BTK coords) to Three.js velocity (fps, Three.js coords)
 */
export function btkToThreeJsVelocity(btkVec)
{
  if (!btk) throw new Error('BTK not loaded yet');
  return {
    x: btk.Conversions.mpsToFps(btkVec.y),
    y: btk.Conversions.mpsToFps(btkVec.z),
    z: -btk.Conversions.mpsToFps(btkVec.x)
  };
}

/**
 * Convert Three.js velocity (fps, Three.js coords) to BTK Vector3D (m/s, BTK coords)
 */
export function threeJsToBtkVelocity(x_fps, y_fps, z_fps)
{
  if (!btk) throw new Error('BTK not loaded yet');
  return new btk.Vector3D(
    btk.Conversions.fpsToMps(-z_fps),
    btk.Conversions.fpsToMps(x_fps),
    btk.Conversions.fpsToMps(y_fps)
  );
}

/**
 * Convert BTK wind vector (m/s, BTK coords) to Three.js wind vector (mph, Three.js coords)
 * @param {btk.Vector3D} windBtk - Wind vector from BTK wind generator
 * @returns {Object} Wind vector {x, y, z} in mph (Three.js coords)
 */
export function btkWindToThreeJs(windBtk)
{
  if (!btk) throw new Error('BTK not loaded yet');
  return {
    x: btk.Conversions.mpsToMph(windBtk.y),  // BTK Y (crossrange) → Three X (horizontal)
    y: btk.Conversions.mpsToMph(windBtk.z),  // BTK Z (up) → Three Y (vertical)
    z: btk.Conversions.mpsToMph(-windBtk.x)  // BTK -X (downrange) → Three Z (downrange)
  };
}

/**
 * Sample wind at Three.js position and return in Three.js coords (mph)
 * @param {btk.WindGenerator} generator - Wind generator instance
 * @param {number} x_yd - X position in yards (Three.js coords)
 * @param {number} y_yd - Y position in yards (Three.js coords)
 * @param {number} z_yd - Z position in yards (Three.js coords)
 * @returns {Object} Wind vector {x, y, z} in mph (Three.js coords)
 */
export function sampleWindAtThreeJsPosition(generator, x_yd, y_yd, z_yd)
{
  if (!btk) throw new Error('BTK not loaded yet');
  if (!generator) {
    return { x: 0, y: 0, z: 0 };
  }
  
  // Convert Three.js coords (yards) to BTK coords (meters) and sample
  const windBtk = generator.sample(
    btk.Conversions.yardsToMeters(-z_yd), // Three Z (downrange) → BTK X (downrange)
    btk.Conversions.yardsToMeters(x_yd),  // Three X (crossrange) → BTK Y (crossrange)
    btk.Conversions.yardsToMeters(y_yd)   // Three Y (up) → BTK Z (up)
  );
  
  // Convert BTK wind (m/s) to Three.js coords (mph)
  const wind = btkWindToThreeJs(windBtk);
  windBtk.delete(); // Dispose Vector3D to prevent memory leak
  
  return wind;
}