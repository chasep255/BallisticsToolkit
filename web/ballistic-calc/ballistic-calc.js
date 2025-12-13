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
    document.getElementById('printBtn').addEventListener('click', printResults);

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

  // Calculate spin rate from twist rate (always calculate for display, but only use in simulation if enabled)
  const enableSpinEffects = document.getElementById('enableSpinEffects').checked;
  const spinRateForDisplay = btk.Bullet.computeSpinRateFromTwist(muzzleVelocity, btk.Conversions.inchesToMeters(twistRate));
  const spinRate = enableSpinEffects ? spinRateForDisplay : 0.0;

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

  // Get atmospheric data before deleting the atmosphere object
  const airDensity = atmosphere.getAirDensity();
  const pressure = atmosphere.getPressure();
  const speedOfSound = atmosphere.getSpeedOfSound();
  const tempKelvin = atmosphere.getTemperature();

  // Get bullet properties before deleting
  const sectionalDensity = bullet.getSectionalDensity();

  // Convert spin rate to RPM (using BTK's conversion formula: rpm = radps * 60 / (2 * π))
  // Always calculate from the display spin rate, not the simulation spin rate
  const spinRateRpm = spinRateForDisplay * 60.0 / (2.0 * Math.PI);

  // Calculate Miller stability factor and ideal twist rate
  const twistRateInches = parseFloat(document.getElementById('twistRate').value);
  const millerStabilityFactor = bullet.computeMillerStabilityFactor(twistRateInches);
  // Calculate ideal twist rate for current SG (or minimum of 1.5 if unstable)
  const targetSG = millerStabilityFactor >= 1.5 ? millerStabilityFactor : 1.5;
  const idealTwistRate = bullet.computeIdealTwistRate(targetSG);

  // Collect all input parameters for display
  const inputParams = {
    weight: parseFloat(document.getElementById('weight').value),
    diameter: parseFloat(document.getElementById('diameter').value),
    bc: parseFloat(document.getElementById('bc').value),
    dragFunction: dragFunction,
    length: parseFloat(document.getElementById('length').value),
    twistRate: twistRateInches,
    enableSpinEffects: enableSpinEffects,
    muzzleVelocity: parseFloat(document.getElementById('muzzleVelocity').value),
    zeroRange: parseFloat(document.getElementById('zeroRange').value),
    scopeHeight: parseFloat(document.getElementById('scopeHeight').value),
    temperature: parseFloat(document.getElementById('temperature').value),
    humidity: parseFloat(document.getElementById('humidity').value),
    altitude: parseFloat(document.getElementById('altitude').value),
    windSpeed: parseFloat(document.getElementById('windSpeed').value),
    windDirection: parseFloat(document.getElementById('windDirection').value),
    maxRange: parseFloat(document.getElementById('maxRange').value),
    step: parseFloat(document.getElementById('step').value),
    angleUnits: document.getElementById('angleUnits').value
  };

  // Display results
  displayResults(trajectory, airDensity, pressure, speedOfSound, tempKelvin, sectionalDensity, spinRateRpm, enableSpinEffects, millerStabilityFactor, idealTwistRate, twistRateInches, inputParams);

  // Dispose BTK objects to prevent memory leaks
  // Note: trajectoryObj is owned by simulator, don't delete it
  simulator.delete();
  atmosphere.delete();
  bullet.delete();
}

function displayResults(trajectory, airDensity, pressure, speedOfSound, tempKelvin, sectionalDensity, spinRateRpm, enableSpinEffects, millerStabilityFactor, idealTwistRate, twistRateInches, inputParams)
{
  const tableBody = document.getElementById('trajectoryTable').getElementsByTagName('tbody')[0];
  tableBody.innerHTML = '';

  // Display atmospheric info
  const atmosphericInfo = document.getElementById('atmosphericInfo');
  // Convert density: kg/m³ to lb/ft³ using BTK's conversion factor (matches kgpm3ToLbpft3)
  const densityLbPerCuFt = airDensity * 0.062428;
  // Convert pressure using BTK conversion
  const pressureInHg = btk.Conversions.pascalsToInHg(pressure);
  // Convert speed of sound to fps
  const speedOfSoundFps = btk.Conversions.mpsToFps(speedOfSound);
  // Convert temperature to Fahrenheit
  const tempFahrenheit = btk.Conversions.kelvinToFahrenheit(tempKelvin);
  // Convert sectional density to lb/in² (from kg/m²)
  // Sectional density = weight / diameter²
  // Convert: kg/m² → lb/in² using BTK conversions
  // 1 kg/m² = (1 kg / 1 m²) = (kgToPounds(1) / (metersToInches(1))²)
  const sectionalDensityLbPerSqIn = btk.Conversions.kgToPounds(sectionalDensity) / Math.pow(btk.Conversions.metersToInches(1.0), 2);

  // Format wind direction description
  const windDirDesc = inputParams.windDirection === 12 ? 'Headwind (from target)' :
                      inputParams.windDirection === 6 ? 'Tailwind (from behind)' :
                      inputParams.windDirection === 3 ? 'Crosswind (from right)' :
                      inputParams.windDirection === 9 ? 'Crosswind (from left)' :
                      `${inputParams.windDirection} o'clock`;

  let infoHTML = `<strong>Input Parameters:</strong><br>`;
  infoHTML += `• <strong>Bullet:</strong> ${inputParams.weight.toFixed(1)} gr, ${inputParams.diameter.toFixed(3)}" dia, ${inputParams.length.toFixed(2)}" length, BC(${inputParams.dragFunction}) ${inputParams.bc.toFixed(3)}<br>`;
  infoHTML += `• <strong>Barrel:</strong> ${inputParams.twistRate.toFixed(1)} in/turn twist, Spin Effects: ${inputParams.enableSpinEffects ? 'Enabled' : 'Disabled'}<br>`;
  infoHTML += `• <strong>Shooting:</strong> MV ${inputParams.muzzleVelocity.toFixed(0)} fps, Zero ${inputParams.zeroRange.toFixed(0)} yd, Scope Height ${inputParams.scopeHeight.toFixed(1)}"<br>`;
  infoHTML += `• <strong>Environment:</strong> ${inputParams.temperature.toFixed(0)}°F, ${inputParams.humidity.toFixed(0)}% RH, ${inputParams.altitude.toFixed(0)} ft altitude<br>`;
  infoHTML += `• <strong>Wind:</strong> ${inputParams.windSpeed.toFixed(0)} mph ${windDirDesc}<br>`;
  infoHTML += `• <strong>Trajectory:</strong> Max Range ${inputParams.maxRange.toFixed(0)} yd, Step ${inputParams.step.toFixed(0)} yd, Units ${inputParams.angleUnits.toUpperCase()}<br><br>`;
  
  infoHTML += `<strong>Atmospheric Conditions:</strong> Air Density: ${densityLbPerCuFt.toFixed(4)} lb/ft³ | Pressure: ${pressureInHg.toFixed(2)} inHg | Speed of Sound: ${speedOfSoundFps.toFixed(0)} fps | Temperature: ${tempFahrenheit.toFixed(1)}°F`;
  
  infoHTML += `<br><strong>Bullet Properties:</strong> Sectional Density: ${sectionalDensityLbPerSqIn.toFixed(3)} lb/in²`;
  
  if (spinRateRpm > 0)
  {
    infoHTML += ` | Spin Rate: ${Math.abs(spinRateRpm).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} RPM`;
  }
  
  // Add Miller stability factor and ideal twist rate
  infoHTML += `<br><strong>Miller Twist Rule:</strong> Stability Factor (SG): ${millerStabilityFactor.toFixed(2)}`;
  if (millerStabilityFactor < 1.0)
  {
    infoHTML += ` <span style="color: #d32f2f;">(Unstable - SG &lt; 1.0)</span>`;
  }
  else if (millerStabilityFactor < 1.5)
  {
    infoHTML += ` <span style="color: #f57c00;">(Marginal Stability - 1.0 ≤ SG &lt; 1.5)</span>`;
  }
  else
  {
    infoHTML += ` <span style="color: #388e3c;">(Good Stability - SG ≥ 1.5)</span>`;
  }
  if (millerStabilityFactor >= 1.5)
  {
    // Show what twist rate would give their current SG
    infoHTML += ` | Twist Rate for SG=${millerStabilityFactor.toFixed(2)}: ${idealTwistRate.toFixed(2)} in/turn (current: ${twistRateInches.toFixed(1)} in/turn)`;
  }
  else
  {
    // Show minimum twist rate needed for comfortable stability
    infoHTML += ` | Minimum Twist Rate for SG=1.5: ${idealTwistRate.toFixed(2)} in/turn (current: ${twistRateInches.toFixed(1)} in/turn)`;
  }
  
  atmosphericInfo.innerHTML = infoHTML;

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
  document.getElementById('printBtn').disabled = false;
}

function showError(message)
{
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  document.getElementById('printBtn').disabled = true;
}

function hideError()
{
  document.getElementById('error').style.display = 'none';
}

function printResults()
{
  const resultsDiv = document.getElementById('results');
  if (resultsDiv.style.display === 'none')
  {
    return; // Nothing to print
  }

  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Ballistic Calculator Results</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { margin-bottom: 10px; }
          .info-section { margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 5px; font-family: monospace; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #4CAF50; color: white; }
          tr:nth-child(even) { background-color: #f2f2f2; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>📊 Ballistic Calculator Results</h1>
        <div class="info-section">${document.getElementById('atmosphericInfo').innerHTML}</div>
        ${document.getElementById('trajectoryTable').outerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  
  // Wait for content to load, then print
  setTimeout(() => {
    printWindow.print();
  }, 250);
}