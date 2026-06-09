// ai-shooter.js - AI shooter decision logic.
//
// An AIShooter is a pure "brain": from its smoothed wind read it decides a hold
// (MOA) and a pacing delay for the next shot. It owns no WASM objects and does
// no rendering - the caller (simulator.js, for the pair-fire opponent) samples
// the wind and executes the shot through the ShotSolver.
//
// The hold is purely the shooter's wind call: no spotter chasing (it never
// corrects off its own previous impacts) and no hold/trigger wobble. The
// rifle's own dispersion (MV SD + accuracy MOA, applied in the solver,
// identical to the player's shots) is the only mechanical spread, so skill
// differences live entirely in how well each level reads the wind.
//
// The read error is a PERCENT of the actual wind (not a fixed mph), so misjudging
// a strong wind costs far more than the same percentage on a light breeze.
//
// Skill levels:
//  - easy:   a poor wind reader - large percentage read error and a stale, flat
//            read of the flags, so it's well off in anything but a calm.
//  - medium: decent reader - moderate percentage error, somewhat stale, flat read;
//            misses fast switches.
//  - hard:   disciplined wind reader - small percentage error, fresh, near-weighted
//            reads, and waits for his condition before breaking the shot. Near-clean.

import
{
  sampleWindAtThreeJsPosition
}
from './btk.js';

// Downrange wind-sampling stations (shared with ShotSolver.computeWindWeights).
export const WIND_READ_STATIONS = 5;

export const AI_PROFILES = {
  easy: {
    label: 'Easy',
    windReadFraction: 1.0, // no systematic under/over-hold
    windReadErrorPct: 0.40, // read is off by ~40% of the actual wind (1 sigma)
    readLagTauSec: 8, // stale read - misses switches
    nearWeightedWind: false, // flat average across the flags
    pairDelayRange: [2, 5], // seconds, uniform
    conditionWaitMph: null
  },
  medium: {
    label: 'Medium',
    windReadFraction: 1.0,
    windReadErrorPct: 0.20, // ~15% read error
    readLagTauSec: 4, // somewhat stale read
    nearWeightedWind: false, // hears "the first flag matters" but reads a flat average
    pairDelayRange: [2, 5],
    conditionWaitMph: null
  },
  hard: {
    label: 'Hard',
    windReadFraction: 1.0, // reads the full value - no systematic under-hold
    windReadErrorPct: 0.10, // ~5% read error - expert
    readLagTauSec: 2, // fresh read, tracks switches quickly
    nearWeightedWind: true, // weights near wind by time-of-flight remaining (expert skill)
    pairDelayRange: [2, 5],
    conditionWaitMph: 1.5 // waits if the wind moved off his last-shot read
  }
};

// Hold clamps (roughly the rifle scope's dial range) so a bad read can't send
// the hold absurdly far off the frame.
const MAX_WINDAGE_HOLD_MOA = 20;
const MAX_ELEVATION_HOLD_MOA = 5;

// Gaussian via Box-Muller
function gaussian(sd)
{
  if (!sd) return 0;
  let u = 0;
  while (u === 0) u = Math.random(); // avoid log(0)
  const v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * sd;
}

function uniform(lo, hi)
{
  return lo + Math.random() * (hi - lo);
}

export class AIShooter
{
  /**
   * @param {Object} config
   * @param {string} config.level - 'easy' | 'medium' | 'hard'
   * @param {string} [config.name] - display name
   * @param {number} config.distanceYards - range to the target
   * @param {number} config.driftMoaPerMph - windage MOA/mph from ShotSolver.calibrateDriftSensitivity()
   * @param {number} [config.jumpMoaPerMph] - vertical crosswind-jump MOA/mph (same source)
   * @param {number} [config.laneX] - crossrange of this shooter's lane (yards)
   * @param {number[]} [config.windWeights] - per-station weights from
   *   ShotSolver.computeWindWeights(); only used by levels that read near wind.
   */
  constructor(config)
  {
    this.level = config.level;
    this.profile = AI_PROFILES[config.level];
    if (!this.profile) throw new Error(`Unknown AI level: ${config.level}`);
    this.name = config.name || `AI – ${this.profile.label}`;
    this.distance = config.distanceYards;
    this.driftMoaPerMph = config.driftMoaPerMph;
    this.jumpMoaPerMph = config.jumpMoaPerMph ?? 0;
    this.laneX = config.laneX ?? 0;
    this.windWeights = config.windWeights || null;

    // Smoothed wind read (mph crosswind, + = left-to-right)
    this.windEma = 0;
    this.windEmaInitialized = false;

    // Wind read the last shot was fired on (for Hard's condition waiting)
    this.windAtLastShotMph = 0;
    this.hasFired = false;
  }

  /**
   * Update the smoothed wind read. Call regularly (a few Hz is plenty).
   * Samples crosswind at flag height at several stations down this lane - the
   * same information the player gets from watching the flags. Skilled readers
   * weight the near wind more (it deflects the bullet for the rest of its
   * flight); others use a flat average across the flags.
   */
  updateWindRead(windGenerator, dt)
  {
    const stations = WIND_READ_STATIONS;
    const useWeights = this.profile.nearWeightedWind && this.windWeights && this.windWeights.length === stations;

    let crosswind = 0;
    for (let k = 1; k <= stations; k++)
    {
      const frac = (k - 0.5) / stations;
      const wind = sampleWindAtThreeJsPosition(
        windGenerator,
        this.laneX,
        4, // flag height-ish, yards
        -(this.distance * frac)
      );
      const w = useWeights ? this.windWeights[k - 1] : (1 / stations);
      crosswind += w * wind.x; // mph, + = right
    }

    if (!this.windEmaInitialized)
    {
      this.windEma = crosswind;
      this.windEmaInitialized = true;
      return;
    }
    const alpha = Math.min(1, dt / this.profile.readLagTauSec);
    this.windEma += (crosswind - this.windEma) * alpha;
  }

  /**
   * Decide the hold for the next shot.
   * @returns {{holdXMoa:number, holdYMoa:number}}
   */
  planShot()
  {
    const p = this.profile;

    // Wind estimate the shooter believes (mph). The read error is a PERCENT of
    // the actual wind (not a fixed mph): misjudging a 15 mph wind costs far more
    // than the same percentage on a 3 mph breeze. The hold is purely this read -
    // no spotter chasing, no hold/trigger wobble; the rifle's own dispersion
    // (MV SD + accuracy MOA, in the solver, same as the player) is the only
    // mechanical spread. AI skill lives entirely in how well it reads the wind.
    const estimateMph = this.windEma * p.windReadFraction * (1 + gaussian(p.windReadErrorPct));

    // The same wind estimate drives both holds: windage drift (horizontal) and
    // the vertical aerodynamic/crosswind jump a spinning bullet picks up. A
    // level with a bad estimate misjudges both proportionally; a good reader
    // nails both. (jumpMoaPerMph is ~0 when spin effects are off.)
    let holdX = -this.driftMoaPerMph * estimateMph;
    let holdY = -this.jumpMoaPerMph * estimateMph;
    holdX = Math.max(-MAX_WINDAGE_HOLD_MOA, Math.min(MAX_WINDAGE_HOLD_MOA, holdX));
    holdY = Math.max(-MAX_ELEVATION_HOLD_MOA, Math.min(MAX_ELEVATION_HOLD_MOA, holdY));

    this.windAtLastShotMph = this.windEma;
    this.hasFired = true;

    return {
      holdXMoa: holdX,
      holdYMoa: holdY
    };
  }

  /**
   * Pair-fire pacing: how long this shooter takes before breaking the shot.
   * @param {number|null} turnRemainingSec - per-turn clock, or null/Infinity
   */
  decideDelaySeconds(turnRemainingSec)
  {
    const p = this.profile;
    let delay = uniform(p.pairDelayRange[0], p.pairDelayRange[1]);

    // A disciplined shooter waits for his condition to come back
    if (p.conditionWaitMph !== null && this.hasFired &&
      Math.abs(this.windEma - this.windAtLastShotMph) > p.conditionWaitMph)
    {
      delay += uniform(0, 8);
    }

    if (turnRemainingSec !== null && Number.isFinite(turnRemainingSec))
    {
      delay = Math.min(delay, 0.6 * turnRemainingSec);
    }
    return Math.max(0.5, delay);
  }

}
