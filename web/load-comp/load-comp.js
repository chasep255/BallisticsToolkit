import BallisticsToolkit from '../ballistics_toolkit_wasm.js';

let btk = null;

// Constants
const STEP_YARDS = 100; // Step size in yards
const WIND_SPEED_MPH = 10; // 10 mph crosswind

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () =>
{
  try
  {
    btk = await BallisticsToolkit();
    console.log('BallisticsToolkit WASM module ready');

    // Set up UI
    Utils.setupHelpModal('helpBtn', 'helpModal');
    document.getElementById('calculateBtn').addEventListener('click', compareLoads);
  }
  catch (error)
  {
    console.error('Failed to initialize:', error);
    showError('Failed to load ballistic calculator. Please refresh the page.');
  }
});

/**
 * Simulate a single bullet trajectory
 * @param {Object} params - Bullet parameters
 * @param {number} params.weight - Weight in grains
 * @param {number} params.bc - Ballistic coefficient
 * @param {string} params.drag - Drag model ('G1' or 'G7')
 * @param {number} params.mv - Muzzle velocity in fps
 * @param {number} maxRangeYards - Maximum range in yards
 * @returns {Array} Array of trajectory points
 */
function simulateBullet(params, maxRangeYards)
{
  // Convert inputs to SI units
  const weightKg = btk.Conversions.grainsToKg(params.weight);
  const muzzleVelocityMps = btk.Conversions.fpsToMps(params.mv);
  const maxRangeMeters = btk.Conversions.yardsToMeters(maxRangeYards);
  const stepMeters = btk.Conversions.yardsToMeters(STEP_YARDS);

  // Wind: 10 mph crosswind from 3 o'clock (wind blowing left, -X direction)
  const windSpeedMps = btk.Conversions.mphToMps(WIND_SPEED_MPH);
  const windX = -windSpeedMps; // From right, blowing left
  const windY = 0;
  const windZ = 0;

  // Create bullet - use a typical diameter/length for estimation
  // These are reasonable defaults since they primarily affect spin (which is disabled)
  const diameterMeters = btk.Conversions.inchesToMeters(0.264); // ~6.5mm
  const lengthMeters = btk.Conversions.inchesToMeters(1.3);

  const bullet = new btk.Bullet(
    weightKg,
    diameterMeters,
    lengthMeters,
    params.bc,
    params.drag === 'G1' ? btk.DragFunction.G1 : btk.DragFunction.G7
  );

  // Standard atmosphere (59°F, sea level, 50% humidity)
  const temperatureK = btk.Conversions.fahrenheitToKelvin(59);
  const altitudeMeters = 0;
  const humidity = 0.5;
  const atmosphere = new btk.Atmosphere(temperatureK, altitudeMeters, humidity, 0.0);

  // Create bullet with flight state (position, velocity, spin)
  // Fire horizontally from origin: velocity in -Z direction
  const initialPos = new btk.Vector3D(0, 0, 0);
  const initialVel = new btk.Vector3D(0, 0, -muzzleVelocityMps);
  const bulletWithState = new btk.Bullet(bullet, initialPos, initialVel, 0); // no spin
  initialPos.delete();
  initialVel.delete();

  // Create simulator
  const simulator = new btk.BallisticsSimulator();
  simulator.setInitialBullet(bulletWithState);
  simulator.setAtmosphere(atmosphere);

  // Set wind
  const windVector = new btk.Vector3D(windX, windY, windZ);
  simulator.setWind(windVector);
  windVector.delete();

  // Simulate trajectory
  simulator.simulate(maxRangeMeters, 0.001, 60.0);
  const trajectoryObj = simulator.getTrajectory();

  // Extract trajectory points at 100-yard intervals
  const results = [];
  for (let rangeYards = 0; rangeYards <= maxRangeYards; rangeYards += STEP_YARDS)
  {
    const rangeMeters = btk.Conversions.yardsToMeters(rangeYards);
    const point = trajectoryObj.atDistance(rangeMeters);

    if (!point)
    {
      console.warn(`Failed to get trajectory point at ${rangeYards} yards`);
      continue;
    }

    const state = point.getState();
    const position = state.getPosition();

    // Drop: vertical position (Y component) - negative means below muzzle
    const dropMeters = position.y;
    const dropInches = btk.Conversions.metersToInches(dropMeters);

    // Drift: crossrange position (X component)
    const driftMeters = position.x;
    const driftInches = btk.Conversions.metersToInches(driftMeters);

    // Velocity and energy
    const velocityMps = state.getTotalVelocity();
    const velocityFps = btk.Conversions.mpsToFps(velocityMps);
    const energyJoules = point.getKineticEnergy();
    const energyFtLbs = btk.Conversions.joulesToFootPounds(energyJoules);

    results.push(
    {
      range: rangeYards,
      drop: dropInches,
      velocity: velocityFps,
      energy: energyFtLbs,
      drift: driftInches,
      time: point.getTime()
    });

    point.delete();
  }

  // Clean up BTK objects
  simulator.delete();
  atmosphere.delete();
  bulletWithState.delete();
  bullet.delete();

  return results;
}

/**
 * Compare two loads
 */
function compareLoads()
{
  if (!btk)
  {
    showError('Not loaded. Please refresh the page.');
    return;
  }

  hideError();

  // Get bullet 1 parameters
  const bullet1 = {
    weight: parseFloat(document.getElementById('b1Weight').value),
    bc: parseFloat(document.getElementById('b1BC').value),
    drag: document.getElementById('b1Drag').value,
    mv: parseFloat(document.getElementById('b1MV').value)
  };

  // Get bullet 2 parameters
  const bullet2 = {
    weight: parseFloat(document.getElementById('b2Weight').value),
    bc: parseFloat(document.getElementById('b2BC').value),
    drag: document.getElementById('b2Drag').value,
    mv: parseFloat(document.getElementById('b2MV').value)
  };

  // Get max range
  const maxRange = parseFloat(document.getElementById('maxRange').value);

  // Validate inputs
  if (bullet1.weight <= 0 || bullet1.bc <= 0 || bullet1.mv <= 0)
  {
    showError('Bullet 1 has invalid values. Please check weight, BC, and MV.');
    return;
  }
  if (bullet2.weight <= 0 || bullet2.bc <= 0 || bullet2.mv <= 0)
  {
    showError('Bullet 2 has invalid values. Please check weight, BC, and MV.');
    return;
  }
  if (maxRange < 100)
  {
    showError('Max range must be at least 100 yards.');
    return;
  }

  // Get units
  const units = document.getElementById('units').value;

  // Simulate both bullets
  const traj1 = simulateBullet(bullet1, maxRange);
  const traj2 = simulateBullet(bullet2, maxRange);

  // Display results
  displayResults(traj1, traj2, units);
}

/**
 * Convert inches to the specified unit at a given range
 * @param {number} inches - Value in inches
 * @param {number} rangeYards - Range in yards
 * @param {string} units - Target unit ('moa', 'mrad', 'in')
 * @returns {number} Converted value
 */
function convertFromInches(inches, rangeYards, units)
{
  if (units === 'in' || rangeYards === 0)
  {
    return inches;
  }

  // Convert to angle: angle = atan(inches / range_in_inches)
  const rangeInches = rangeYards * 36; // 36 inches per yard
  const angleRad = Math.atan(Math.abs(inches) / rangeInches);

  if (units === 'moa')
  {
    // 1 MOA = 1/60 degree = π/(60*180) radians
    const moa = angleRad * (60 * 180 / Math.PI);
    return inches < 0 ? -moa : moa;
  }
  else if (units === 'mrad')
  {
    // 1 mrad = 0.001 radians
    const mrad = angleRad * 1000;
    return inches < 0 ? -mrad : mrad;
  }

  return inches;
}

/**
 * Get unit label for display
 * @param {string} units - Unit type
 * @returns {string} Display label
 */
function getUnitLabel(units)
{
  switch (units)
  {
    case 'moa':
      return 'MOA';
    case 'mrad':
      return 'MRAD';
    case 'in':
      return 'in';
    default:
      return units;
  }
}

/**
 * Get decimal places for formatting
 * @param {string} units - Unit type
 * @returns {number} Number of decimal places
 */
function getDecimals(units)
{
  return units === 'in' ? 1 : 2;
}

/**
 * Display comparison results in table
 * @param {Array} traj1 - Bullet 1 trajectory
 * @param {Array} traj2 - Bullet 2 trajectory
 * @param {string} units - Display units ('moa', 'mrad', 'in')
 */
function displayResults(traj1, traj2, units)
{
  const tableBody = document.querySelector('#resultsTable tbody');
  tableBody.innerHTML = '';

  // Update table headers with unit labels
  const unitLabel = getUnitLabel(units);
  document.getElementById('b1DropHeader').innerHTML = `Drop<br>(${unitLabel})`;
  document.getElementById('b2DropHeader').innerHTML = `Drop<br>(${unitLabel})`;
  document.getElementById('b1DriftHeader').innerHTML = `Wind Drift<br>(${unitLabel})`;
  document.getElementById('b2DriftHeader').innerHTML = `Wind Drift<br>(${unitLabel})`;

  const decimals = getDecimals(units);

  // Combine trajectories by range
  const maxLen = Math.max(traj1.length, traj2.length);

  for (let i = 0; i < maxLen; i++)
  {
    const p1 = traj1[i] || null;
    const p2 = traj2[i] || null;

    if (!p1 && !p2) continue;

    const range = p1 ? p1.range : p2.range;

    const row = tableBody.insertRow();

    // Range
    row.insertCell().textContent = range;

    // Bullet 1 values (show drop/drift as absolute values)
    if (p1)
    {
      const drop1 = Math.abs(convertFromInches(p1.drop, range, units));
      const drift1 = Math.abs(convertFromInches(p1.drift, range, units));
      addCell(row, drop1.toFixed(decimals), 'col-b1');
      addCell(row, p1.velocity.toFixed(0), 'col-b1');
      addCell(row, p1.energy.toFixed(0), 'col-b1');
      addCell(row, drift1.toFixed(decimals), 'col-b1');
      addCell(row, p1.time.toFixed(3), 'col-b1');
    }
    else
    {
      addCell(row, '-', 'col-b1');
      addCell(row, '-', 'col-b1');
      addCell(row, '-', 'col-b1');
      addCell(row, '-', 'col-b1');
      addCell(row, '-', 'col-b1');
    }

    // Bullet 2 values (show drop/drift as absolute values)
    if (p2)
    {
      const drop2 = Math.abs(convertFromInches(p2.drop, range, units));
      const drift2 = Math.abs(convertFromInches(p2.drift, range, units));
      addCell(row, drop2.toFixed(decimals), 'col-b2');
      addCell(row, p2.velocity.toFixed(0), 'col-b2');
      addCell(row, p2.energy.toFixed(0), 'col-b2');
      addCell(row, drift2.toFixed(decimals), 'col-b2');
      addCell(row, p2.time.toFixed(3), 'col-b2');
    }
    else
    {
      addCell(row, '-', 'col-b2');
      addCell(row, '-', 'col-b2');
      addCell(row, '-', 'col-b2');
      addCell(row, '-', 'col-b2');
      addCell(row, '-', 'col-b2');
    }

    // Percentage comparisons
    if (p1 && p2)
    {
      // Drop: lower magnitude is better (less drop)
      addPercentageCell(row, p1.drop, p2.drop, true);

      // Velocity: higher is better
      addPercentageCell(row, p1.velocity, p2.velocity, false);

      // Energy: higher is better
      addPercentageCell(row, p1.energy, p2.energy, false);

      // Wind Drift: lower magnitude is better (less wind deflection)
      addPercentageCell(row, p1.drift, p2.drift, true);

      // Time: lower is better (faster flight)
      addPercentageCell(row, p1.time, p2.time, true);
    }
    else
    {
      addCell(row, '-', 'col-pct');
      addCell(row, '-', 'col-pct');
      addCell(row, '-', 'col-pct');
      addCell(row, '-', 'col-pct');
      addCell(row, '-', 'col-pct');
    }
  }

  document.getElementById('results').style.display = 'block';
}

/**
 * Add a cell to a table row
 */
function addCell(row, text, className)
{
  const cell = row.insertCell();
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

/**
 * Add a percentage comparison cell (positive = B2 advantage)
 * @param {HTMLTableRowElement} row - Table row
 * @param {number} val1 - Bullet 1 value
 * @param {number} val2 - Bullet 2 value
 * @param {boolean} lowerIsBetter - True if lower values are better (drop, drift, time)
 */
function addPercentageCell(row, val1, val2, lowerIsBetter)
{
  const cell = row.insertCell();
  cell.className = 'col-pct';

  // Handle zero/near-zero values
  if (Math.abs(val1) < 0.001)
  {
    cell.textContent = '-';
    return;
  }

  // Calculate percentage where positive = B2 is better
  let pct;
  if (lowerIsBetter)
  {
    // For drop/drift/time: lower magnitude is better
    // Positive if B2 has less
    const absVal1 = Math.abs(val1);
    const absVal2 = Math.abs(val2);
    pct = ((absVal1 - absVal2) / absVal1) * 100;
  }
  else
  {
    // For velocity/energy: higher is better
    // Positive if B2 is higher
    pct = ((val2 - val1) / val1) * 100;
  }

  // Format with sign
  const pctSign = pct >= 0 ? '+' : '';
  cell.textContent = `${pctSign}${pct.toFixed(1)}%`;

  // Color coding: positive = green (B2 better), negative = red (B2 worse)
  if (pct > 0)
  {
    cell.classList.add('pct-better');
  }
  else if (pct < 0)
  {
    cell.classList.add('pct-worse');
  }
}

function showError(message)
{
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

function hideError()
{
  document.getElementById('error').style.display = 'none';
}