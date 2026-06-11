// wind-marker-response.js - Shared wind-driven response for flag/sock markers.
//
// Flags (flags.js) and windsocks (windsocks.js) react to wind identically: a
// sampled horizontal wind vector drives a lift angle (degrees from vertical)
// and a heading, both rate-limited toward their targets so the marker eases
// rather than snaps. This module is the single source for that response so the
// two renderers can't drift apart (e.g. when tuning the angle curve). Each
// renderer keeps its own mesh/uniform application.

// Concave angle response: steep at low wind, flattening to horizontal at
// flatSpeed. exp < 1 expands the low end for light-wind sensitivity (the
// high-power range-flag "angle ÷ ~4" convention). Returns degrees from vertical.
export function windMarkerAngle(windHoriz_mph, minAngle, maxAngle, flatSpeed, responseExp)
{
  const span = maxAngle - minAngle;
  const frac = Math.pow(Math.min(windHoriz_mph / flatSpeed, 1), responseExp);
  return minAngle + span * frac;
}

// Step a marker's angle/direction toward the wind-driven target, rate-limited
// by per-axis interpolation speeds (angle in deg/s, direction in rad/s).
// Returns { angle, direction, windHoriz_mph }, the caller also tends to need
// the wind magnitude for its flap/sway animation.
export function stepWindMarker(
{
  windX_mph,
  windZ_mph,
  currentAngle,
  currentDirection,
  deltaTime,
  minAngle,
  maxAngle,
  flatSpeed,
  responseExp,
  angleSpeed,
  directionSpeed
})
{
  const windHoriz_mph = Math.hypot(windX_mph, windZ_mph);
  const targetAngle = windMarkerAngle(windHoriz_mph, minAngle, maxAngle, flatSpeed, responseExp);

  // Wind heading in the ground plane (-windZ because Three.js negative Z is
  // downrange). Hold the current heading when becalmed so it doesn't spin.
  const targetDirection = windHoriz_mph > 1e-6 ? Math.atan2(-windZ_mph, windX_mph) : currentDirection;

  // Ease the angle toward target, capped at angleSpeed * dt.
  const angleDiff = targetAngle - currentAngle;
  const angle = currentAngle + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), angleSpeed * deltaTime);

  // Ease the heading the short way around the circle, capped at directionSpeed * dt.
  let dirDiff = targetDirection - currentDirection;
  while (dirDiff > Math.PI) dirDiff -= 2 * Math.PI;
  while (dirDiff < -Math.PI) dirDiff += 2 * Math.PI;
  const direction = currentDirection + Math.sign(dirDiff) * Math.min(Math.abs(dirDiff), directionSpeed * deltaTime);

  return { angle, direction, windHoriz_mph };
}
