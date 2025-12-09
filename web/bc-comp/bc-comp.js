import BallisticsToolkit from '../ballistics_toolkit_wasm.js';

let btk = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () =>
{
  try
  {
    btk = await BallisticsToolkit();
    console.log('BallisticsToolkit WASM module ready');

    // Set up UI
    Utils.setupHelpModal('helpBtn', 'helpModal');
    document.getElementById('calculateBtn').addEventListener('click', calculateGrid);
  }
  catch (error)
  {
    console.error('Failed to initialize:', error);
    showError('Failed to load ballistic calculator. Please refresh the page.');
  }
});

/**
 * Get input values from the form
 */
function getInputValues()
{
  return {
    range: parseFloat(document.getElementById('range').value),
    dragModel: document.getElementById('dragModel').value,
    units: document.getElementById('units').value,
    temperature: parseFloat(document.getElementById('temperature').value),
    altitude: parseFloat(document.getElementById('altitude').value),
    humidity: parseFloat(document.getElementById('humidity').value),
    bcStart: parseFloat(document.getElementById('bc-start').value),
    bcEnd: parseFloat(document.getElementById('bc-end').value),
    bcIncrement: parseFloat(document.getElementById('bc-increment').value),
    mvStart: parseFloat(document.getElementById('mv-start').value),
    mvEnd: parseFloat(document.getElementById('mv-end').value),
    mvIncrement: parseFloat(document.getElementById('mv-increment').value)
  };
}

/**
 * Validate input parameters
 */
function validateInputs(params)
{
  if (params.bcStart >= params.bcEnd)
  {
    showError('Start BC must be less than End BC');
    return false;
  }
  if (params.mvStart >= params.mvEnd)
  {
    showError('Start MV must be less than End MV');
    return false;
  }
  if (params.bcIncrement <= 0 || params.mvIncrement <= 0)
  {
    showError('Increments must be greater than zero');
    return false;
  }
  if (params.range <= 0)
  {
    showError('Range must be positive');
    return false;
  }
  if (params.crosswind < 0)
  {
    showError('Crosswind cannot be negative');
    return false;
  }

  // Check for reasonable grid sizes
  const bcSteps = Math.floor((params.bcEnd - params.bcStart) / params.bcIncrement) + 1;
  const mvSteps = Math.floor((params.mvEnd - params.mvStart) / params.mvIncrement) + 1;
  
  if (bcSteps > 50 || mvSteps > 50)
  {
    showError('Grid too large (max 50 rows/columns). Increase increment size.');
    return false;
  }
  if (bcSteps < 2 || mvSteps < 2)
  {
    showError('Grid too small. Need at least 2 rows and 2 columns.');
    return false;
  }

  return true;
}

/**
 * Calculate wind drift grid
 */
function calculateGrid()
{
  if (!btk)
  {
    showError('Not loaded. Please refresh the page.');
    return;
  }

  hideError();

  const params = getInputValues();
  
  if (!validateInputs(params))
  {
    return;
  }

  // Show loading
  document.getElementById('loading').style.display = 'block';
  document.getElementById('results').style.display = 'none';

  // Use setTimeout to allow UI to update before heavy computation
  setTimeout(() =>
  {
    try
    {
      // Generate BC values
      const bcValues = [];
      for (let bc = params.bcStart; bc <= params.bcEnd + 0.0001; bc += params.bcIncrement)
      {
        bcValues.push(parseFloat(bc.toFixed(4)));
      }

      // Generate MV values
      const mvValues = [];
      for (let mv = params.mvStart; mv <= params.mvEnd + 0.1; mv += params.mvIncrement)
      {
        mvValues.push(Math.round(mv));
      }

      // Get drag function
      const dragFunction = params.dragModel === 'G1' ? btk.DragFunction.G1 : btk.DragFunction.G7;

      // Convert atmosphere parameters to SI units
      const temperatureK = btk.Conversions.fahrenheitToKelvin(params.temperature);
      const altitudeMeters = btk.Conversions.feetToMeters(params.altitude);
      const humidityFraction = params.humidity / 100.0;

      // Fixed 10 mph crosswind for drift calculations
      const crosswindMph = 10;

      // Calculate drift, drop, and sensitivity grids
      const driftData = computeGrid(bcValues, mvValues, params.range, crosswindMph, 'drift', 
                                     dragFunction, temperatureK, altitudeMeters, humidityFraction);
      const dropData = computeGrid(bcValues, mvValues, params.range, crosswindMph, 'drop', 
                                    dragFunction, temperatureK, altitudeMeters, humidityFraction);
      const sensitivityData = computeSensitivityGrid(bcValues, mvValues, params.range, 
                                                      dragFunction, temperatureK, altitudeMeters, humidityFraction);

      // Display results
      displayResults(driftData, dropData, sensitivityData, bcValues, mvValues, params);

      document.getElementById('loading').style.display = 'none';
    }
    catch (error)
    {
      console.error('Calculation failed:', error);
      showError('Calculation failed. Please check your inputs and try again.');
      document.getElementById('loading').style.display = 'none';
    }
  }, 10);
}

/**
 * Compute wind drift or drop for each BC/MV combination
 */
function computeGrid(bcValues, mvValues, rangeYards, crosswindMph, tableType, 
                     dragFunction, temperatureK, altitudeMeters, humidityFraction)
{
  const rangeMeters = btk.Conversions.yardsToMeters(rangeYards);
  const crosswindMps = btk.Conversions.mphToMps(crosswindMph);

  // Wind: crosswind from 3 o'clock (wind blowing left, -X direction)
  // Only apply wind if doing drift table
  const windX = tableType === 'drift' ? -crosswindMps : 0;
  const windY = 0;
  const windZ = 0;

  // Typical bullet dimensions (for G7 bullets, these don't matter much since spin is disabled)
  const diameterMeters = btk.Conversions.inchesToMeters(0.264); // ~6.5mm
  const lengthMeters = btk.Conversions.inchesToMeters(1.3);
  const weightKg = btk.Conversions.grainsToKg(140); // arbitrary weight

  const grid = [];

  for (const bc of bcValues)
  {
    const row = [];
    
    for (const mvFps of mvValues)
    {
      const mvMps = btk.Conversions.fpsToMps(mvFps);
      
      // Create bullet
      const bullet = new btk.Bullet(
        weightKg,
        diameterMeters,
        lengthMeters,
        bc,
        dragFunction
      );
      
      // Create atmosphere
      const atmosphere = new btk.Atmosphere(temperatureK, altitudeMeters, humidityFraction, 0.0);
      
      // Create bullet with flight state (fire horizontally from origin)
      const initialPos = new btk.Vector3D(0, 0, 0);
      const initialVel = new btk.Vector3D(0, 0, -mvMps);
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
      simulator.simulate(rangeMeters, 0.001, 60.0);
      const trajectoryObj = simulator.getTrajectory();
      
      // Get value at range (drift or drop)
      const point = trajectoryObj.atDistance(rangeMeters);
      
      let valueMrad = 0;
      if (point)
      {
        const state = point.getState();
        const position = state.getPosition();
        
        if (tableType === 'drift')
        {
          // Drift: crossrange position (X component)
          const driftMeters = Math.abs(position.x);
          
          // Convert meters to MRAD: angle = atan(drift / range)
          const angleRad = Math.atan(driftMeters / rangeMeters);
          valueMrad = angleRad * 1000; // 1 mrad = 0.001 radians
        }
        else // 'drop'
        {
          // Drop: vertical position (Y component) - negative means below muzzle
          const dropMeters = Math.abs(position.y);
          
          // Convert meters to MRAD: angle = atan(drop / range)
          const angleRad = Math.atan(dropMeters / rangeMeters);
          valueMrad = angleRad * 1000; // 1 mrad = 0.001 radians
        }
        
        point.delete();
      }
      
      row.push(valueMrad);
      
      // Cleanup
      simulator.delete();
      atmosphere.delete();
      bulletWithState.delete();
      bullet.delete();
    }
    
    grid.push(row);
  }

  return grid;
}

/**
 * Compute MV sensitivity for each BC/MV combination
 * Sensitivity = drop difference between MV+10fps and MV-10fps
 */
function computeSensitivityGrid(bcValues, mvValues, rangeYards, 
                                dragFunction, temperatureK, altitudeMeters, humidityFraction)
{
  const rangeMeters = btk.Conversions.yardsToMeters(rangeYards);

  // No wind for sensitivity calculation
  const windX = 0;
  const windY = 0;
  const windZ = 0;

  // Typical bullet dimensions
  const diameterMeters = btk.Conversions.inchesToMeters(0.264);
  const lengthMeters = btk.Conversions.inchesToMeters(1.3);
  const weightKg = btk.Conversions.grainsToKg(140);

  const grid = [];

  for (const bc of bcValues)
  {
    const row = [];
    
    for (const mvFps of mvValues)
    {
      // Calculate drop at MV - 10 fps
      const mvSlowMps = btk.Conversions.fpsToMps(mvFps - 10);
      const dropSlowMrad = calculateDrop(bc, mvSlowMps, rangeMeters, temperatureK, altitudeMeters, humidityFraction, 
                                         weightKg, diameterMeters, lengthMeters, windX, windY, windZ, dragFunction);
      
      // Calculate drop at MV + 10 fps
      const mvFastMps = btk.Conversions.fpsToMps(mvFps + 10);
      const dropFastMrad = calculateDrop(bc, mvFastMps, rangeMeters, temperatureK, altitudeMeters, humidityFraction,
                                         weightKg, diameterMeters, lengthMeters, windX, windY, windZ, dragFunction);
      
      // Sensitivity is the absolute difference in drop
      const sensitivity = Math.abs(dropSlowMrad - dropFastMrad);
      
      row.push(sensitivity);
    }
    
    grid.push(row);
  }

  return grid;
}

/**
 * Helper function to calculate drop for a single trajectory
 */
function calculateDrop(bc, mvMps, rangeMeters, temperatureK, altitudeMeters, humidityFraction,
                       weightKg, diameterMeters, lengthMeters, windX, windY, windZ, dragFunction)
{
  // Create bullet
  const bullet = new btk.Bullet(
    weightKg,
    diameterMeters,
    lengthMeters,
    bc,
    dragFunction
  );
  
  // Create atmosphere
  const atmosphere = new btk.Atmosphere(temperatureK, altitudeMeters, humidityFraction, 0.0);
  
  // Create bullet with flight state (fire horizontally from origin)
  const initialPos = new btk.Vector3D(0, 0, 0);
  const initialVel = new btk.Vector3D(0, 0, -mvMps);
  const bulletWithState = new btk.Bullet(bullet, initialPos, initialVel, 0);
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
  simulator.simulate(rangeMeters, 0.001, 60.0);
  const trajectoryObj = simulator.getTrajectory();
  
  // Get drop at range
  const point = trajectoryObj.atDistance(rangeMeters);
  
  let dropMrad = 0;
  if (point)
  {
    const state = point.getState();
    const position = state.getPosition();
    
    // Drop: vertical position (Y component) - negative means below muzzle
    const dropMeters = Math.abs(position.y);
    
    // Convert meters to MRAD
    const angleRad = Math.atan(dropMeters / rangeMeters);
    dropMrad = angleRad * 1000;
    
    point.delete();
  }
  
  // Cleanup
  simulator.delete();
  atmosphere.delete();
  bulletWithState.delete();
  bullet.delete();
  
  return dropMrad;
}

/**
 * Display comparison results in tables
 */
function displayResults(driftData, dropData, sensitivityData, bcValues, mvValues, params)
{
  // Update info display
  document.getElementById('display-range').textContent = params.range;
  document.getElementById('display-drag').textContent = params.dragModel;
  document.getElementById('display-units').textContent = getUnitLabel(params.units);
  document.getElementById('display-atmosphere').textContent = 
    `${params.temperature}°F, ${params.altitude} ft, ${params.humidity}% humidity`;

  // Build all three tables
  buildTable('driftTable', driftData, bcValues, mvValues, params.range, params.units);
  buildTable('dropTable', dropData, bcValues, mvValues, params.range, params.units);
  buildTable('sensitivityTable', sensitivityData, bcValues, mvValues, params.range, params.units);

  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Build a single table with color coding
 */
function buildTable(tableId, gridData, bcValues, mvValues, rangeYards, units)
{
  const table = document.getElementById(tableId);
  table.innerHTML = '';

  // Convert grid data from MRAD to selected units
  const convertedData = gridData.map(row => 
    row.map(valueMrad => convertFromMrad(valueMrad, rangeYards, units))
  );

  // Find min and max values for color scaling
  let minValue = Infinity;
  let maxValue = -Infinity;
  for (const row of convertedData)
  {
    for (const value of row)
    {
      if (value < minValue) minValue = value;
      if (value > maxValue) maxValue = value;
    }
  }

  // Get decimal places for formatting
  const decimals = getDecimals(units);

  // Build table header
  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  
  // First column header
  const th = document.createElement('th');
  th.textContent = 'BC';
  headerRow.appendChild(th);
  
  // MV column headers
  for (const mv of mvValues)
  {
    const th = document.createElement('th');
    th.textContent = `${mv} fps`;
    headerRow.appendChild(th);
  }

  // Build table body
  const tbody = table.createTBody();
  for (let i = 0; i < bcValues.length; i++)
  {
    const row = tbody.insertRow();
    
    // BC label (first column)
    const bcCell = row.insertCell();
    bcCell.textContent = bcValues[i].toFixed(3);
    
    // Values with color coding
    for (let j = 0; j < mvValues.length; j++)
    {
      const cell = row.insertCell();
      const value = convertedData[i][j];
      cell.textContent = value.toFixed(decimals);
      
      // Apply color based on value (lower is better)
      const color = interpolateColor(value, minValue, maxValue);
      cell.style.backgroundColor = color;
    }
  }
}

/**
 * Convert MRAD to the specified unit
 */
function convertFromMrad(mrad, rangeYards, units)
{
  if (units === 'mrad')
  {
    return mrad;
  }

  // Convert MRAD to radians
  const angleRad = mrad / 1000;

  if (units === 'moa')
  {
    // 1 MOA = 1/60 degree = π/(60*180) radians
    return angleRad * (60 * 180 / Math.PI);
  }
  else if (units === 'in')
  {
    // Convert to inches at range
    const rangeInches = rangeYards * 36;
    return Math.tan(angleRad) * rangeInches;
  }

  return mrad;
}

/**
 * Get unit label for display
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
      return 'Inches';
    default:
      return units;
  }
}

/**
 * Get decimal places for formatting
 */
function getDecimals(units)
{
  return units === 'in' ? 1 : 2;
}

/**
 * Interpolate color from green (best) to red (worst)
 * @param {number} value - Current drift value
 * @param {number} min - Minimum drift (best - green)
 * @param {number} max - Maximum drift (worst - red)
 * @returns {string} RGB color string
 */
function interpolateColor(value, min, max)
{
  // Handle edge case where all values are the same
  if (max === min)
  {
    return 'rgb(255, 255, 200)'; // Light yellow
  }

  // Normalize value to 0-1 range
  const t = (value - min) / (max - min);

  // Interpolate from green (0,255,0) to red (255,0,0)
  // Green -> Yellow -> Red
  let r, g, b;
  
  if (t < 0.5)
  {
    // Green to yellow (increase red)
    r = Math.round(t * 2 * 255);
    g = 255;
    b = 0;
  }
  else
  {
    // Yellow to red (decrease green)
    r = 255;
    g = Math.round((1 - t) * 2 * 255);
    b = 0;
  }

  return `rgb(${r}, ${g}, ${b})`;
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

