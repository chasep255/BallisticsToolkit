// ai-shooter.js - AI shooter decision logic.
//
// An AIShooter is a pure "brain": from its smoothed wind read it decides a hold
// (MOA) and a pacing delay for the next shot. It owns no WASM objects and does
// no rendering - the caller (simulator.js, for the pair-fire opponent) samples
// the wind, executes the shot through the ShotSolver, and feeds the impact back
// via learnFromImpact() so the shooter can correct.
//
// The hold is the shooter's wind call plus a running correction it learns from its
// own impacts. There is no hold/trigger wobble: the rifle's own dispersion (MV SD
// + accuracy MOA, applied in the solver, identical to the player's shots) is the
// only mechanical spread, so skill differences live entirely in how the shooter
// reads and manages the wind.
//
// The read error is a PERCENT of the actual wind (not a fixed mph), so misjudging
// a strong wind costs far more than the same percentage on a light breeze.
//
// Two things make it realistic. First, the read is a LAGGED average of the flags
// (readLagTauSec), so in a switching wind it trails the truth - a real, time-varying
// error - plus small per-shot jitter and a rare blown read (catching a switch the
// wrong way). Second, the shooter CHASES: after each shot it folds a fraction of
// where the shot landed into a running correction (learnFromImpact), the way you
// correct off the spotter. Because that correction is based on a past impact, it
// over-corrects when the wind has since moved - the classic wind-chasing mistake -
// and a higher chase gain (a less disciplined shooter) makes it worse.
//
// Skill levels:
//  - easy:   poor reader - noisy, stale flat read, and over-chases its own misses,
//            so it swings around chasing the wind.
//  - medium: decent reader - moderate noise and a measured chase.
//  - hard:   disciplined reader - low noise, fresh near-weighted read, small
//            corrections, and waits for his condition; still caught out by a fast
//            switch or a blown read now and then.

import
{
  sampleWindAtThreeJsPosition
}
from './btk.js';

// Downrange wind-sampling stations (shared with ShotSolver.computeWindWeights).
export const WIND_READ_STATIONS = 5;

// Read-error and chase model (errors are a fraction of the actual wind):
//  - windReadErrorPct: 1-sigma per-shot read jitter.
//  - blownReadProb / blownReadPct: chance of, and extra 1-sigma error from,
//    catching a switch the wrong way on a given shot.
//  - readLagTauSec: EMA time constant of the flag read; larger = staler, lags
//    switches more (a systematic, time-varying error in switchy wind).
//  - chaseGain: fraction of the last impact folded back as a correction.
//  - chaseDecay: how much that correction carries to the next shot (0..1).
export const AI_PROFILES = {
  easy: {
    label: 'Easy',
    windReadFraction: 1.0, // no systematic under/over-hold
    windReadErrorPct: 0.3,
    blownReadProb: 0.12,
    blownReadPct: 0.50,
    readLagTauSec: 8, // stale read - lags switches
    nearWeightedWind: false, // flat average across the flags
    chaseGain: 0.55, // over-chases: corrects too hard off a single shot
    chaseDecay: 0.85,
    pairDelayRange: [2, 5], // seconds, uniform
    conditionWaitMph: null
  },
  medium: {
    label: 'Medium',
    windReadFraction: 1.0,
    windReadErrorPct: 0.2,
    blownReadProb: 0.06,
    blownReadPct: 0.40,
    readLagTauSec: 4, // somewhat stale read
    nearWeightedWind: true, // hears "the first flag matters" but reads a flat average
    chaseGain: 0.38,
    chaseDecay: 0.88,
    pairDelayRange: [2, 5],
    conditionWaitMph: null
  },
  hard: {
    label: 'Hard',
    windReadFraction: 1.0, // reads the full value - no systematic under-hold
    windReadErrorPct: 0.1,
    blownReadProb: 0.03, // drops a point on a missed switch now and then
    blownReadPct: 0.35,
    readLagTauSec: 2, // fresh read, tracks switches quickly
    nearWeightedWind: true, // weights near wind by time-of-flight remaining (expert skill)
    chaseGain: 0.22, // measured corrections - doesn't chase single shots
    chaseDecay: 0.90,
    pairDelayRange: [2, 5],
    conditionWaitMph: 1.5 // waits if the wind moved off his last-shot read
  }
};

// Hold clamps (roughly the rifle scope's dial range) so a bad read can't send
// the hold absurdly far off the frame.
const MAX_WINDAGE_HOLD_MOA = 20;
const MAX_ELEVATION_HOLD_MOA = 5;

// How far the learned chase correction can wander, so a chasing streak can't run
// the hold off the frame.
const MAX_CHASE_MOA = 8;

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

function clamp(x, lo, hi)
{
  return Math.max(lo, Math.min(hi, x));
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

    // Running correction the shooter has learned from its own impacts (MOA).
    // Updated in learnFromImpact(); added to the wind call in planShot().
    this.chaseX = 0;
    this.chaseY = 0;

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

    // Wind estimate the shooter believes (mph). Per-shot read jitter as a percent
    // of the actual wind, plus a small chance of a blown read (a switch caught the
    // wrong way). The lagged read (updateWindRead) already trails the truth in a
    // switching wind, which is the main systematic error.
    let errFrac = gaussian(p.windReadErrorPct);
    if (Math.random() < p.blownReadProb) errFrac += gaussian(p.blownReadPct);
    const estimateMph = this.windEma * p.windReadFraction * (1 + errFrac);

    // The same estimate drives both holds: windage drift and the vertical crosswind
    // jump. On top sits the chase correction the shooter has learned from its own
    // impacts (learnFromImpact). (jumpMoaPerMph is ~0 when spin effects are off.)
    let holdX = -this.driftMoaPerMph * estimateMph + this.chaseX;
    let holdY = -this.jumpMoaPerMph * estimateMph + this.chaseY;
    holdX = clamp(holdX, -MAX_WINDAGE_HOLD_MOA, MAX_WINDAGE_HOLD_MOA);
    holdY = clamp(holdY, -MAX_ELEVATION_HOLD_MOA, MAX_ELEVATION_HOLD_MOA);

    this.windAtLastShotMph = this.windEma;
    this.hasFired = true;

    return {
      holdXMoa: holdX,
      holdYMoa: holdY
    };
  }

  /**
   * Learn from where the last shot landed. The caller passes the signed impact
   * offset from the target center in MOA (+ = right / up). The shooter folds a
   * fraction of that miss into a running correction it carries to the next shot,
   * the way you correct off the spotter. The correction decays slowly so it does
   * not drift forever. Because it is based on a single past impact, it over-corrects
   * when the wind has since moved - the classic chasing mistake, worse at high gain.
   * @param {number} windageMoa  - impact offset right(+)/left(-) of center, MOA
   * @param {number} elevationMoa - impact offset up(+)/down(-) of center, MOA
   */
  learnFromImpact(windageMoa, elevationMoa)
  {
    const p = this.profile;
    this.chaseX = clamp(p.chaseDecay * this.chaseX - p.chaseGain * windageMoa, -MAX_CHASE_MOA, MAX_CHASE_MOA);
    this.chaseY = clamp(p.chaseDecay * this.chaseY - p.chaseGain * elevationMoa, -MAX_CHASE_MOA, MAX_CHASE_MOA);
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
