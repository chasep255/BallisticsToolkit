/**
 * PairFireDriver - V2-Finale-style pair fire for two hot-seat human players.
 *
 * Both players share one target and alternate single shots. P1 ("left") shoots
 * first, then P2 ("right"), back and forth. Each player gets up to 2 sighters
 * followed by 10 record shots. A per-turn timer (or unlimited) limits each shot;
 * running out scores a zero for that shot.
 *
 * Tiebreak after both players finish their record shots:
 *   1. Higher record total wins.
 *   2. If tied, higher X-count wins.
 *   3. If still tied, sudden death: one alternating shot each; higher score wins,
 *      an X beats a non-X 10; otherwise repeat.
 */
import { MatchDriver } from './match-driver.js';

const LOG_PREFIX = '[PairDriver]';

export class PairFireDriver extends MatchDriver
{
  /**
   * @param {Object} config
   * @param {string} config.player1Name   default 'Player1'
   * @param {string} config.player2Name   default 'Player2'
   * @param {number|null} config.turnSeconds  per-turn time limit, or null for unlimited
   * @param {number} config.recordShots    record shots per player (default 10)
   * @param {number} config.sighters       sighters per player (default 2)
   */
  constructor(config = {})
  {
    super();

    this.recordShots = config.recordShots || 10;
    this.sighterCap = config.sighters ?? 2;
    this.turnSeconds = (config.turnSeconds === null || config.turnSeconds === undefined) ? null : config.turnSeconds;

    this.players = {
      p1: this.makePlayer(config.player1Name || 'Player1'),
      p2: this.makePlayer(config.player2Name || 'Player2')
    };

    this.active = 'p1'; // P1 (right) shoots first
    this.suddenDeath = false;
    this.complete = false;
    this.winner = null;

    // Per-turn timer state
    this.turnRemaining = this.turnSeconds;
    this.turnStartTime = null;
    this.turnTimerRunning = false;

    // A shot has been scored but the turn has not yet switched. The switch is
    // deferred until the target is back up (so the shooter sees their impact);
    // firing is blocked until then.
    this.turnAdvancePending = false;

    // One-shot "animate a miss" signal for turn timeouts
    this._timeoutPending = null;

    console.log(`${LOG_PREFIX} ${this.players.p1.name} vs ${this.players.p2.name}, ` +
      `${this.recordShots} record + ${this.sighterCap} sighters, ` +
      `turn ${this.turnSeconds === null ? 'unlimited' : this.turnSeconds + 's'}`);
  }

  makePlayer(name)
  {
    return {
      name: name,
      phase: 'sighters', // 'sighters' | 'record'
      sightersFired: 0,
      recordShotsFired: 0
    };
  }

  other(id)
  {
    return id === 'p1' ? 'p2' : 'p1';
  }

  // ===== Lifecycle =====

  start(now)
  {
    // Timer starts via onTargetReady once the target is confirmed up.
  }

  onTargetReady(now)
  {
    // Perform the deferred turn switch now that the target is back up.
    if (this.turnAdvancePending && !this.complete)
    {
      this.advanceTurn();
      this.turnAdvancePending = false;
    }

    if (this.complete)
    {
      this.turnTimerRunning = false;
      return;
    }

    if (this.turnSeconds === null)
    {
      this.turnTimerRunning = false;
      this.turnRemaining = null;
      return;
    }

    this.turnStartTime = now;
    this.turnRemaining = this.turnSeconds;
    this.turnTimerRunning = true;
  }

  tick(now)
  {
    if (!this.turnTimerRunning || this.turnSeconds === null || this.complete)
    {
      return;
    }

    this.turnRemaining = Math.max(0, this.turnSeconds - (now - this.turnStartTime));
    if (this.turnRemaining <= 0)
    {
      this.handleTimeout(now);
    }
  }

  isRunning()
  {
    return !this.complete;
  }

  isComplete()
  {
    return this.complete;
  }

  // ===== Firing =====

  canFire()
  {
    // No firing while a turn switch is pending (waiting for the target to come
    // back up and the active shooter to change).
    return !this.complete && !this.turnAdvancePending;
  }

  onShotFired(now)
  {
    // Stop the turn clock at trigger pull; it restarts when the target is ready again.
    this.turnTimerRunning = false;
  }

  onShotScored(shotData, now)
  {
    this.logShot(this.active, shotData);
    this.afterShot(now);
  }

  handleTimeout(now)
  {
    console.log(`${LOG_PREFIX} ${this.players[this.active].name} timed out - scoring zero`);
    this.turnTimerRunning = false;

    // Request a miss animation (kept separate from the completion event slot).
    this._timeoutPending = { relativeX: 0, relativeY: 0 };

    // A timeout scores a zero for the active shooter's current shot (a zeroed
    // sighter while in the sighter phase, otherwise a zero record shot).
    this.logShot(this.active, { score: 0, isX: false, mvFps: null, impactVelocityFps: null });
    this.afterShot(now);
  }

  consumeTimeout()
  {
    const timeout = this._timeoutPending;
    this._timeoutPending = null;
    return timeout;
  }

  /**
   * Append a shot to the log, classified by the player's current phase. A
   * timeout zero is logged the same way: a zeroed sighter if the player is still
   * in the sighter phase, otherwise a zero record shot.
   */
  logShot(playerId, shotData)
  {
    const player = this.players[playerId];
    let isSighter = false;
    let suddenDeath = false;

    if (this.suddenDeath)
    {
      suddenDeath = true;
    }
    else if (player.phase === 'sighters' && player.sightersFired < this.sighterCap)
    {
      isSighter = true;
    }

    if (isSighter)
    {
      player.sightersFired++;
    }
    else if (!suddenDeath)
    {
      player.phase = 'record';
      player.recordShotsFired++;
    }

    this.shotLog.push({
      player: playerId,
      relay: playerId === 'p1' ? 1 : 2, // map to scorecard sections (P1 -> 1, P2 -> 2)
      isSighter: isSighter,
      recordIndex: (!isSighter && !suddenDeath) ? player.recordShotsFired : null,
      score: shotData.score,
      isX: shotData.isX,
      mvFps: shotData.mvFps,
      impactVelocityFps: shotData.impactVelocityFps,
      relativeX: shotData.relativeX ?? null,
      relativeY: shotData.relativeY ?? null,
      timeSec: 0,
      suddenDeath: suddenDeath
    });
  }

  /**
   * Evaluate completion and flag the turn to advance. The actual turn switch is
   * deferred to onTargetReady() so the shooter can see their impact first.
   */
  afterShot(now)
  {
    this.evaluateState(now);
    if (!this.complete)
    {
      this.turnAdvancePending = true;
    }
  }

  /**
   * Choose who shoots next. Players take their shots independently (skipping
   * sighters early means they may need a different number of turns to finish
   * their record shots), so a player who has completed all record shots is
   * skipped - the other player keeps shooting until they finish too.
   */
  advanceTurn()
  {
    if (this.suddenDeath)
    {
      this.active = this.other(this.active);
      return;
    }

    const other = this.other(this.active);
    const otherDone = this.players[other].recordShotsFired >= this.recordShots;
    const selfDone = this.players[this.active].recordShotsFired >= this.recordShots;

    if (!otherDone)
    {
      // Opponent still has record shots to fire: normal alternation.
      this.active = other;
    }
    else if (selfDone)
    {
      // Both finished their record shots; evaluateState resolves the result.
      this.active = other;
    }
    // Otherwise the opponent is finished but this player is not: shoot again.
  }

  // ===== Sighter controls =====

  goForRecord()
  {
    const player = this.players[this.active];
    if (player.phase === 'sighters')
    {
      player.phase = 'record';
    }
  }

  // ===== Completion / tiebreak =====

  recordShotsFor(playerId)
  {
    return this.shotLog.filter(s => s.player === playerId && !s.isSighter && !s.suddenDeath);
  }

  sdShotsFor(playerId)
  {
    return this.shotLog.filter(s => s.player === playerId && s.suddenDeath);
  }

  evaluateState(now)
  {
    if (this.complete)
    {
      return;
    }

    const p1Done = this.players.p1.recordShotsFired >= this.recordShots;
    const p2Done = this.players.p2.recordShotsFired >= this.recordShots;

    if (!this.suddenDeath)
    {
      if (p1Done && p2Done)
      {
        const result = this.compareRegular();
        if (result !== 0)
        {
          this.finish(result);
        }
        else
        {
          console.log(`${LOG_PREFIX} Tied after record shots - entering sudden death`);
          this.suddenDeath = true;
        }
      }
      return;
    }

    // Sudden death: evaluate once both players have taken an equal number of SD shots.
    const sd1 = this.sdShotsFor('p1').length;
    const sd2 = this.sdShotsFor('p2').length;
    if (sd1 === sd2 && sd1 >= 1)
    {
      const result = this.compareSuddenDeath();
      if (result !== 0)
      {
        this.finish(result);
      }
    }
  }

  /** @returns {number} 1 if p1 wins, -1 if p2 wins, 0 if tied */
  compareRegular()
  {
    const a = this.aggregate(this.recordShotsFor('p1'));
    const b = this.aggregate(this.recordShotsFor('p2'));
    if (a.total !== b.total) return a.total > b.total ? 1 : -1;
    if (a.xCount !== b.xCount) return a.xCount > b.xCount ? 1 : -1;
    return 0;
  }

  /** Compare the latest sudden-death shot pair. */
  compareSuddenDeath()
  {
    const sd1 = this.sdShotsFor('p1');
    const sd2 = this.sdShotsFor('p2');
    const a = sd1[sd1.length - 1];
    const b = sd2[sd2.length - 1];
    if (a.score !== b.score) return a.score > b.score ? 1 : -1;
    if (a.isX !== b.isX) return a.isX ? 1 : -1; // an X beats a non-X of equal score
    return 0;
  }

  finish(result)
  {
    this.complete = true;
    this.turnTimerRunning = false;
    this.winner = result > 0 ? 'p1' : 'p2';
    const w = this.players[this.winner];
    const agg = this.aggregate(this.recordShotsFor(this.winner));
    console.log(`${LOG_PREFIX} Match complete - winner ${w.name} (${agg.total}-${agg.xCount}X)`);
    this.emitEvent({ type: 'matchComplete', winner: this.winner, winnerName: w.name });
  }

  // ===== Queries =====

  getActivePlayerId()
  {
    return this.active;
  }

  lastScoredShotFor(playerId)
  {
    for (let i = this.shotLog.length - 1; i >= 0; i--)
    {
      const shot = this.shotLog[i];
      if (shot.player === playerId && !shot.isSighter)
      {
        return { score: shot.score, isX: shot.isX };
      }
    }
    return null;
  }

  buildHudPlayer(playerId)
  {
    const player = this.players[playerId];
    const { total, xCount } = this.aggregate(this.recordShotsFor(playerId));
    const isActive = !this.complete && playerId === this.active;

    let timerValue;
    if (!isActive)
    {
      timerValue = '--';
    }
    else if (this.turnSeconds === null)
    {
      timerValue = '\u221E';
    }
    else
    {
      timerValue = MatchDriver.formatTime(this.turnRemaining);
    }

    let shots;
    if (this.suddenDeath)
    {
      shots = { mode: 'record', current: this.sdShotsFor(playerId).length, max: 0, complete: false, label: 'Sudden Death' };
    }
    else if (player.phase === 'sighters' && player.sightersFired < this.sighterCap)
    {
      shots = { mode: 'sighters', current: player.sightersFired, limit: this.sighterCap };
    }
    else
    {
      shots = { mode: 'record', current: player.recordShotsFired, max: this.recordShots, complete: player.recordShotsFired >= this.recordShots };
    }

    return {
      id: playerId,
      name: player.name,
      active: isActive,
      timerValue: timerValue,
      shots: shots,
      score: total,
      xCount: xCount,
      lastShot: this.lastScoredShotFor(playerId)
    };
  }

  getHudModel()
  {
    // Logical order [P1, P2]; the view places P1 (left shooter) on the left.
    return { players: [this.buildHudPlayer('p1'), this.buildHudPlayer('p2')] };
  }

  getControlsModel()
  {
    if (this.complete || this.suddenDeath)
    {
      return { goForRecord: false, goForRecordText: 'Go For Record' };
    }

    // Only offer "Go For Record" while the player still has sighters left to skip;
    // once both sighters are used the next shot is automatically a record shot.
    const player = this.players[this.active];
    const canSkip = player.phase === 'sighters' && player.sightersFired < this.sighterCap;
    return {
      goForRecord: canSkip,
      goForRecordText: `${player.name}: Go For Record`
    };
  }

  buildSection(playerId)
  {
    const player = this.players[playerId];
    const sighterShots = this.shotLog.filter(s => s.player === playerId && s.isSighter);
    const recordShots = this.recordShotsFor(playerId);
    const sighters = sighterShots.map(s => ({ score: s.score, isX: s.isX }));
    const records = recordShots.map(s => ({ score: s.score, isX: s.isX }));
    const suddenDeath = this.sdShotsFor(playerId).map(s => ({ score: s.score, isX: s.isX }));
    const { total, xCount } = this.aggregate(recordShots);

    return {
      label: player.name,
      sighters: sighters,
      records: records,
      suddenDeath: suddenDeath,
      recordSlots: this.recordShots,
      group: MatchDriver.buildGroup([...sighterShots, ...recordShots]),
      total: total,
      xCount: xCount,
      isWinner: this.winner === playerId
    };
  }

  getScorecardModel()
  {
    let footerText;
    if (this.complete)
    {
      const w = this.players[this.winner];
      const agg = this.aggregate(this.recordShotsFor(this.winner));
      footerText = `Winner: ${w.name} (${agg.total}-${agg.xCount}X)`;
    }
    else if (this.suddenDeath)
    {
      footerText = 'Sudden Death';
    }
    else
    {
      footerText = 'Match In Progress';
    }

    return {
      sections: [this.buildSection('p1'), this.buildSection('p2')],
      footer: { text: footerText }
    };
  }
}
