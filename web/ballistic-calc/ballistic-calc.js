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
    document.getElementById('calculateBtn').addEventListener('click', calculateTrajectory);

  }
  catch (error)
  {
    console.error('Failed to initialize:', error);
    showError('Failed to load ballistic calculator. Please refresh the page.');
  }
});

function calculateTrajectory()
{
  if (!btk)
  {
    showError('Not loaded. Please refresh the page.');
    return;
  }

  hideError();

  // Get form values and convert to proper units
  const weight = btk.Conversions.grainsToKg(parseFloat(document.getElementById('weight').value));
  const diameter = btk.Conversions.inchesToMeters(parseFloat(document.getElementById('diameter').value));
  const bc = parseFloat(document.getElementById('bc').value);
  const length = btk.Conversions.inchesToMeters(parseFloat(document.getElementById('length').value));
  const twistRate = parseFloat(document.getElementById('twistRate').value);
  const dragFunction = document.getElementById('dragFunction').value;
  const temperature = btk.Conversions.fahrenheitToKelvin(parseFloat(document.getElementById('temperature').value));
  const humidity = parseFloat(document.getElementById('humidity').value) / 100.0; // Convert percentage to decimal
  const altitude = btk.Conversions.feetToMeters(parseFloat(document.getElementById('altitude').value));
  const muzzleVelocity = btk.Conversions.fpsToMps(parseFloat(document.getElementById('muzzleVelocity').value));
  const zeroRange = btk.Conversions.yardsToMeters(parseFloat(document.getElementById('zeroRange').value));
  const scopeHeight = btk.Conversions.inchesToMeters(parseFloat(document.getElementById('scopeHeight').value));
  const maxRange = btk.Conversions.yardsToMeters(parseFloat(document.getElementById('maxRange').value));
  const step = btk.Conversions.yardsToMeters(parseFloat(document.getElementById('step').value));
  const windSpeed = btk.Conversions.mphToMps(parseFloat(document.getElementById('windSpeed').value));

  // Wind direction (o'clock convention): where the wind is COMING FROM,
  // with the target at 12 o'clock:
  //  - 12 o'clock = from target (headwind)
  //  -  6 o'clock = from behind shooter (tailwind)
  //  -  3 o'clock = from right (full-value crosswind)
  //  -  9 o'clock = from left (full-value crosswind)
  //
  // oclockToRadians returns the origin direction angle φ in radians,
  // measured clockwise from 12 o'clock. We convert this to the direction
  // the wind is BLOWING TOWARD (θ) in BTK coordinates by negating it:
  //   θ = -φ
  const windOriginAngle = btk.Conversions.oclockToRadians(parseFloat(document.getElementById('windDirection').value));
  const windDirection = -windOriginAngle;

  // Calculate spin rate from twist rate (or 0 if spin effects disabled)
  const enableSpinEffects = document.getElementById('enableSpinEffects').checked;
  const spinRate = enableSpinEffects ? btk.Bullet.computeSpinRateFromTwist(muzzleVelocity, btk.Conversions.inchesToMeters(twistRate)) : 0.0;

  // Create bullet
  const bullet = new btk.Bullet(
    weight,
    diameter,
    length,
    bc,
    dragFunction === 'G1' ? btk.DragFunction.G1 : btk.DragFunction.G7
  );

  // Create atmosphere
  const atmosphere = new btk.Atmosphere(temperature, altitude, humidity, 0.0);

  // Create simulator
  const simulator = new btk.BallisticsSimulator();
  simulator.setInitialBullet(bullet);
  simulator.setAtmosphere(atmosphere);

  // Compute zero with no wind
  const zeroWind = new btk.Vector3D(0, 0, 0);
  simulator.setWind(zeroWind);
  zeroWind.delete(); // Dispose Vector3D to prevent memory leak

  // Create target position vector (x=crossrange, y=vertical, z=-downrange)
  const targetPos = new btk.Vector3D(0, scopeHeight, -zeroRange);
  simulator.computeZero(
    muzzleVelocity,
    targetPos,
    0.001, // dt (time step)
    20, // max_iterations
    0.001, // tolerance
    spinRate // spin_rate calculated from twist
  );
  targetPos.delete(); // Dispose Vector3D to prevent memory leak

  // Wind vector in BTK coordinate system: X=crossrange (right), Y=up, Z=-downrange.
  // With the convention above and θ = -φ:
  //  - 12 o'clock (from target)  → headwind (+Z, against bullet flight)
  //  -  6 o'clock (from behind) → tailwind (−Z, with bullet flight)
  //  -  3 o'clock (from right)  → wind blowing left (−X), full-value crosswind
  //  -  9 o'clock (from left)   → wind blowing right (+X), full-value crosswind
  const windX = windSpeed * Math.sin(windDirection); // Crossrange component (+X = wind blowing to the right)
  const windY = 0.0; // No vertical component
  const windZ = windSpeed * Math.cos(windDirection); // Downrange component (+Z = headwind from target, −Z = tailwind from behind)

  const windVector = new btk.Vector3D(windX, windY, windZ);
  simulator.setWind(windVector);
  windVector.delete(); // Dispose Vector3D to prevent memory leak

  // Simulate trajectory (trajectory is owned by simulator, get reference to it)
  simulator.simulate(maxRange, 0.001, 60.0);
  const trajectoryObj = simulator.getTrajectory();

  // Extract trajectory points at specified intervals
  const trajectory = [];

  for (let range = 0; range <= maxRange; range += step)
  {
    const point = trajectoryObj.atDistance(range);
    if (!point)
    {
      console.warn(`Failed to get trajectory point at range ${range}m`);
      continue;
    }
    const state = point.getState();
    const position = state.getPosition();

    // Calculate drop relative to scope height
    // In new coordinate system: X=crossrange, Y=up, Z=-downrange
    const bulletHeight = position.y; // Vertical component is now Y
    const dropMeters = bulletHeight - scopeHeight;
    const dropMrad = range > 0 ? (dropMeters / range) * 1000 : 0;

    // Calculate drift (crosswind component)
    const driftMeters = position.x; // Crossrange component is now X
    const driftMrad = range > 0 ? (driftMeters / range) * 1000 : 0;

    trajectory.push(
    {
      range: btk.Conversions.metersToYards(range),
      drop: dropMrad,
      drift: driftMrad,
      velocity: btk.Conversions.mpsToFps(state.getTotalVelocity()),
      energy: point.getKineticEnergy(),
      time: point.getTime()
    });

    point.delete(); // Dispose TrajectoryPoint to prevent memory leak
  }

  // Display results
  displayResults(trajectory);

  // Dispose BTK objects to prevent memory leaks
  // Note: trajectoryObj is owned by simulator, don't delete it
  simulator.delete();
  atmosphere.delete();
  bullet.delete();
}

function displayResults(trajectory)
{
  const tableBody = document.getElementById('trajectoryTable').getElementsByTagName('tbody')[0];
  tableBody.innerHTML = '';

  const angleUnits = document.getElementById('angleUnits').value;

  // Update table headers
  const headers = document.querySelectorAll('#trajectoryTable th');
  headers[1].textContent = angleUnits === 'mrad' ? 'Drop (mrad)' : 'Drop (MOA)';
  headers[2].textContent = angleUnits === 'mrad' ? 'Drift (mrad)' : 'Drift (MOA)';

  trajectory.forEach(point =>
  {
    const row = tableBody.insertRow();

    row.insertCell(0).textContent = point.range.toFixed(0);

    // Drop (in mrad from calculator)
    const dropValue = angleUnits === 'mrad' ?
      point.drop.toFixed(2) :
      btk.Conversions.mradToMoa(point.drop).toFixed(2);
    row.insertCell(1).textContent = dropValue;

    // Drift (in mrad from calculator)
    const driftValue = angleUnits === 'mrad' ?
      point.drift.toFixed(2) :
      btk.Conversions.mradToMoa(point.drift).toFixed(2);
    row.insertCell(2).textContent = driftValue;

    row.insertCell(3).textContent = point.velocity.toFixed(0);
    row.insertCell(4).textContent = point.energy.toFixed(0);
    row.insertCell(5).textContent = point.time.toFixed(3);
  });

  document.getElementById('results').style.display = 'block';
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