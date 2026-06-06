/**
 * StringFireMatchDriver - Classic F-Class course of fire, now configurable.
 *
 * Format: `numMatches` matches, each `maxRecordShots` record shots and
 * `timerDuration` seconds. Match 1 has unlimited sighters; later matches get
 * `laterMatchSighters` (default 2). A match ends when time expires or the
 * record-shot count is reached. The combined score is the aggregate.
 */
import { MatchDriver } from './match-driver.js';

const LOG_PREFIX = '[StringFireDriver]';

export class StringFireMatchDriver extends MatchDriver
{
  /**
   * @param {Object} config
   * @param {number} config.matches           number of matches (default 3)
   * @param {number} config.shotsPerMatch     record shots per match (default 20)
   * @param {number} config.minutesPerMatch   minutes per match (default 20)
   * @param {boolean} config.debugMode        1-min matches, 2 shots when true
   */
  constructor(config = {})
  {
    super();

    const debugMode = config.debugMode || false;
    this.debugMode = debugMode;

    this.numMatches = config.matches || 3;
    this.maxRecordShots = debugMode ? 2 : (config.shotsPerMatch || 20);
    this.timerDuration = debugMode ? 60 : (config.minutesPerMatch || 20) * 60;
    this.laterMatchSighters = 2;

    this.matchIndex = 1;
    this.phase = 'sighters'; // 'sighters' | 'record' | 'ended'

    this.timeRemaining = this.timerDuration;
    this.timerStartTime = null;
    this.recordShotsFired = 0;
    this.sightersFired = 0;
    this.isTimerRunning = false;

    console.log(`${LOG_PREFIX} ${this.numMatches} matches, ${this.maxRecordShots} shots, ${this.timerDuration}s each`);
  }

  // ===== Lifecycle =====

  start(now)
  {
    this.startTimerIfNeeded(now);
  }

  startTimerIfNeeded(now)
  {
    if (!this.isTimerRunning && this.phase !== 'ended')
    {
      this.timerStartTime = now;
      this.isTimerRunning = true;
    }
  }

  tick(now)
  {
    if (!this.isTimerRunning || this.phase === 'ended')
    {
      return;
    }

    const elapsed = now - this.timerStartTime;
    this.timeRemaining = Math.max(0, this.timerDuration - elapsed);

    if (this.timeRemaining <= 0)
    {
      this.endMatch();
    }
  }

  isRunning()
  {
    return this.isTimerRunning;
  }

  isComplete()
  {
    return this.matchIndex >= this.numMatches && this.phase === 'ended';
  }

  // ===== Firing =====

  canFire()
  {
    return this.phase !== 'ended';
  }

  onShotScored(shotData, now)
  {
    const isRecord = this.phase === 'record';

    if (isRecord)
    {
      this.recordShotsFired++;
    }
    else
    {
      this.sightersFired++;
    }

    this.shotLog.push({
      player: null,
      section: this.matchIndex,
      isSighter: !isRecord,
      recordIndex: isRecord ? this.recordShotsFired : null,
      score: shotData.score,
      isX: shotData.isX,
      mvFps: shotData.mvFps,
      impactVelocityFps: shotData.impactVelocityFps,
      relativeX: shotData.relativeX ?? null,
      relativeY: shotData.relativeY ?? null,
      diag: shotData.diag ?? null,
      timeSec: this.timerDuration - this.timeRemaining,
      suddenDeath: false
    });

    // Auto-switch to record on matches after the first once the sighter cap is met.
    if (!isRecord && this.matchIndex > 1 && this.sightersFired >= this.laterMatchSighters)
    {
      this.phase = 'record';
    }

    // End the match when the record-shot count is reached.
    if (isRecord && this.recordShotsFired >= this.maxRecordShots)
    {
      this.endMatch();
    }
  }

  goForRecord()
  {
    if (this.phase === 'sighters')
    {
      this.phase = 'record';
    }
  }

  // ===== Progression =====

  endMatch()
  {
    if (this.phase === 'ended')
    {
      return;
    }

    console.log(`${LOG_PREFIX} Match ${this.matchIndex} ended (${this.recordShotsFired} record, ${this.sightersFired} sighters)`);
    this.phase = 'ended';
    this.isTimerRunning = false;

    if (this.isComplete())
    {
      this.emitEvent({ type: 'aggregateComplete', matchIndex: this.matchIndex, numMatches: this.numMatches, recordShots: this.recordShotsFired });
    }
    else
    {
      this.emitEvent({ type: 'matchComplete', matchIndex: this.matchIndex, numMatches: this.numMatches, recordShots: this.recordShotsFired });
    }
  }

  advance(now)
  {
    if (this.matchIndex < this.numMatches)
    {
      this.matchIndex++;
      this.phase = 'sighters';
      this.timeRemaining = this.timerDuration;
      this.timerStartTime = null;
      this.recordShotsFired = 0;
      this.sightersFired = 0;
      this.isTimerRunning = false;
      this.startTimerIfNeeded(now);
    }
  }

  // ===== Queries =====

  getActivePlayerId()
  {
    return null;
  }

  getSightersRemaining()
  {
    if (this.matchIndex === 1)
    {
      return Infinity;
    }
    return Math.max(0, this.laterMatchSighters - this.sightersFired);
  }

  getHudModel()
  {
    const matchShots = this.shotLog.filter(s => s.section === this.matchIndex);
    const records = matchShots.filter(s => !s.isSighter);
    const sighters = matchShots.filter(s => s.isSighter);
    const { total, xCount } = this.aggregate(records);
    const shotCount = records.length;

    const model = {
      primaryLabel: 'Match:',
      primaryValue: `${this.matchIndex}/${this.numMatches}`,
      timerLabel: 'Timer:',
      timerValue: MatchDriver.formatTime(this.timeRemaining),
      score: total,
      xCount: xCount
    };

    if (this.phase === 'sighters')
    {
      const remaining = this.getSightersRemaining();
      model.shots = {
        mode: 'sighters',
        current: sighters.length,
        limit: remaining === Infinity ? '\u221E' : this.laterMatchSighters
      };
    }
    else
    {
      model.shots = {
        mode: 'record',
        current: shotCount,
        max: this.maxRecordShots,
        complete: shotCount >= this.maxRecordShots
      };
    }

    const last = matchShots.length > 0 ? matchShots[matchShots.length - 1] : null;
    model.lastShot = last
      ? { score: last.score, isX: last.isX, mvFps: last.mvFps, impactVelocityFps: last.impactVelocityFps }
      : null;

    return model;
  }

  getControlsModel()
  {
    if (this.phase !== 'sighters')
    {
      return { goForRecord: false, goForRecordText: 'Go For Record' };
    }

    const remaining = this.getSightersRemaining();
    const text = remaining === Infinity ? 'Go For Record' : `Go For Record (${remaining} sighters left)`;
    return { goForRecord: true, goForRecordText: text };
  }

  getScorecardModel()
  {
    const sections = [];
    let aggregateTotal = 0;
    let aggregateX = 0;

    for (let m = 1; m <= this.numMatches; m++)
    {
      const matchShots = this.shotLog.filter(s => s.section === m);
      const sighters = matchShots.filter(s => s.isSighter).map(s => ({ score: s.score, isX: s.isX, diag: s.diag ?? null }));
      const records = matchShots.filter(s => !s.isSighter);
      const { total, xCount } = this.aggregate(records);

      aggregateTotal += total;
      aggregateX += xCount;

      sections.push({
        label: `Match ${m}`,
        sighters: sighters,
        records: records.map(s => ({ score: s.score, isX: s.isX, diag: s.diag ?? null })),
        suddenDeath: [],
        recordSlots: this.maxRecordShots,
        group: MatchDriver.buildGroup(matchShots),
        total: total,
        xCount: xCount,
        isWinner: false
      });
    }

    return {
      sections: sections,
      footer: { text: `Aggregate Total: ${aggregateTotal}-${aggregateX}X` }
    };
  }
}
