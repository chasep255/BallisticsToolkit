/**
 * MatchDriver - Abstract base for F-Class game drivers.
 *
 * A driver owns all match-format logic: match/turn state, timers, the shot log,
 * score aggregation, and the data models the HUD and scorecard render. The
 * simulator (rendering, scopes, input, target animation) talks only to this
 * interface, never to format-specific state.
 *
 * Concrete drivers:
 *   - StringFireMatchDriver: N matches x M record shots, T minutes per match.
 *   - PairFireDriver: two players alternating shots.
 *
 * Subclasses MUST override the methods marked abstract below.
 */
export class MatchDriver
{
  constructor()
  {
    // All shots fired this match. Entry shape:
    //   { player, section, isSighter, recordIndex, score, isX, mvFps, impactVelocityFps, relativeX, relativeY, timeSec, suddenDeath }
    this.shotLog = [];

    // Single pending event for the simulator to consume (null when none).
    this._pendingEvent = null;
  }

  // ===== Lifecycle (abstract) =====

  /** Begin the match. @param {number} now elapsed game time in seconds */
  start(now) { throw new Error('MatchDriver.start not implemented'); }

  /** Advance timers and detect auto-transitions. @param {number} now seconds */
  tick(now) { throw new Error('MatchDriver.tick not implemented'); }

  /** Called by the simulator whenever the shared target finishes raising and is ready. */
  onTargetReady(now) {}

  /** @returns {boolean} whether any clock is currently running */
  isRunning() { throw new Error('MatchDriver.isRunning not implemented'); }

  /** @returns {boolean} whether the whole match is finished */
  isComplete() { throw new Error('MatchDriver.isComplete not implemented'); }

  // ===== Firing (abstract / optional) =====

  /** @returns {boolean} whether firing is currently allowed by the rules */
  canFire() { throw new Error('MatchDriver.canFire not implemented'); }

  /** Bookkeeping at trigger pull (before the bullet is scored). @param {number} now seconds */
  onShotFired(now) {}

  /**
   * Classify and log a scored shot, then handle any phase/turn/segment transition.
   * @param {Object} shotData { score, isX, mvFps, impactVelocityFps, relativeX, relativeY }
   * @param {number} now seconds
   */
  onShotScored(shotData, now) { throw new Error('MatchDriver.onShotScored not implemented'); }

  // ===== Sighter controls (optional) =====

  /** End the sighter phase early and go to record. */
  goForRecord() {}

  // ===== Progression (optional) =====

  /**
   * Proceed past a completed segment (e.g. start the next match).
   * @param {number} now seconds
   * @returns {boolean} true if the driver actually advanced
   */
  advance(now) { return false; }

  // ===== Queries (abstract / optional) =====

  /** @returns {string|null} active player id ('p1'/'p2') or null for single-player formats */
  getActivePlayerId() { return null; }

  /** @returns {Object} model consumed by the HUD (see drivers for shape) */
  getHudModel() { throw new Error('MatchDriver.getHudModel not implemented'); }

  /** @returns {Object} model consumed by the scorecard (see drivers for shape) */
  getScorecardModel() { throw new Error('MatchDriver.getScorecardModel not implemented'); }

  /** @returns {Object} which contextual buttons to show */
  getControlsModel()
  {
    return { goForRecord: false, goForRecordText: 'Go For Record' };
  }

  // ===== Events =====

  emitEvent(event)
  {
    this._pendingEvent = event;
  }

  /** @returns {Object|null} the pending event, clearing it */
  consumeEvent()
  {
    const event = this._pendingEvent;
    this._pendingEvent = null;
    return event;
  }

  /**
   * One-shot signal that a shot needs a "miss" animation (e.g. a turn timeout),
   * kept separate from the event slot so it never collides with completion.
   * @returns {Object|null} { relativeX, relativeY } or null
   */
  consumeTimeout()
  {
    return null;
  }

  // ===== Shared helpers =====

  /** Format seconds as MM:SS (clamped at zero). */
  static formatTime(seconds)
  {
    const clamped = Math.max(0, seconds);
    const minutes = Math.floor(clamped / 60);
    const secs = Math.floor(clamped % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /** Aggregate score and X-count over a list of shots. */
  aggregate(shots)
  {
    let total = 0;
    let xCount = 0;
    for (const shot of shots)
    {
      total += shot.score;
      if (shot.isX) xCount++;
    }
    return { total, xCount, count: shots.length };
  }

  /**
   * Build a grouping point list (impact positions in yards from target center)
   * for the scorecard diagram. Shots without a recorded position (e.g. turn
   * timeouts) are skipped.
   */
  static buildGroup(shots)
  {
    return shots
      .filter(s => s.relativeX !== null && s.relativeX !== undefined && s.relativeY !== null && s.relativeY !== undefined)
      .map(s => ({ x: s.relativeX, y: s.relativeY, isX: s.isX, isSighter: s.isSighter }));
  }
}
