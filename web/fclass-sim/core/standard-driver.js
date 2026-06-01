/**
 * StandardMatchDriver - Classic F-Class relay format, now configurable.
 *
 * Format: `numRelays` relays, each `maxRecordShots` record shots and
 * `timerDuration` seconds. Relay 1 has unlimited sighters; later relays get
 * `laterRelaySighters` (default 2). A relay ends when time expires or the
 * record-shot count is reached.
 */
import { MatchDriver } from './match-driver.js';

const LOG_PREFIX = '[StandardDriver]';

export class StandardMatchDriver extends MatchDriver
{
  /**
   * @param {Object} config
   * @param {number} config.relays            number of relays (default 3)
   * @param {number} config.shotsPerRelay     record shots per relay (default 20)
   * @param {number} config.minutesPerRelay   minutes per relay (default 20)
   * @param {boolean} config.debugMode        1-min relays, 2 shots when true
   */
  constructor(config = {})
  {
    super();

    const debugMode = config.debugMode || false;
    this.debugMode = debugMode;

    this.numRelays = config.relays || 3;
    this.maxRecordShots = debugMode ? 2 : (config.shotsPerRelay || 20);
    this.timerDuration = debugMode ? 60 : (config.minutesPerRelay || 20) * 60;
    this.laterRelaySighters = 2;

    this.relayIndex = 1;
    this.phase = 'sighters'; // 'sighters' | 'record' | 'ended'

    this.timeRemaining = this.timerDuration;
    this.timerStartTime = null;
    this.recordShotsFired = 0;
    this.sightersFired = 0;
    this.isTimerRunning = false;

    console.log(`${LOG_PREFIX} ${this.numRelays} relays, ${this.maxRecordShots} shots, ${this.timerDuration}s each`);
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
      this.endRelay();
    }
  }

  isRunning()
  {
    return this.isTimerRunning;
  }

  isComplete()
  {
    return this.relayIndex >= this.numRelays && this.phase === 'ended';
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
      relay: this.relayIndex,
      isSighter: !isRecord,
      recordIndex: isRecord ? this.recordShotsFired : null,
      score: shotData.score,
      isX: shotData.isX,
      mvFps: shotData.mvFps,
      impactVelocityFps: shotData.impactVelocityFps,
      timeSec: this.timerDuration - this.timeRemaining,
      suddenDeath: false
    });

    // Auto-switch to record on relays after the first once the sighter cap is met.
    if (!isRecord && this.relayIndex > 1 && this.sightersFired >= this.laterRelaySighters)
    {
      this.phase = 'record';
    }

    // End the relay when the record-shot count is reached.
    if (isRecord && this.recordShotsFired >= this.maxRecordShots)
    {
      this.endRelay();
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

  endRelay()
  {
    if (this.phase === 'ended')
    {
      return;
    }

    console.log(`${LOG_PREFIX} Relay ${this.relayIndex} ended (${this.recordShotsFired} record, ${this.sightersFired} sighters)`);
    this.phase = 'ended';
    this.isTimerRunning = false;

    if (this.isComplete())
    {
      this.emitEvent({ type: 'matchComplete', relayIndex: this.relayIndex, numRelays: this.numRelays, recordShots: this.recordShotsFired });
    }
    else
    {
      this.emitEvent({ type: 'relayComplete', relayIndex: this.relayIndex, numRelays: this.numRelays, recordShots: this.recordShotsFired });
    }
  }

  advance(now)
  {
    if (this.relayIndex < this.numRelays)
    {
      this.relayIndex++;
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
    if (this.relayIndex === 1)
    {
      return Infinity;
    }
    return Math.max(0, this.laterRelaySighters - this.sightersFired);
  }

  getHudModel()
  {
    const relayShots = this.shotLog.filter(s => s.relay === this.relayIndex);
    const records = relayShots.filter(s => !s.isSighter);
    const sighters = relayShots.filter(s => s.isSighter);
    const { total, xCount } = this.aggregate(records);
    const shotCount = records.length;

    const model = {
      primaryLabel: 'Relay:',
      primaryValue: `${this.relayIndex}/${this.numRelays}`,
      timerLabel: 'Timer:',
      timerValue: MatchDriver.formatTime(this.timeRemaining),
      score: total,
      xCount: xCount,
      droppedPoints: shotCount * 10 - total,
      droppedX: shotCount - xCount
    };

    if (this.phase === 'sighters')
    {
      const remaining = this.getSightersRemaining();
      model.shots = {
        mode: 'sighters',
        current: sighters.length,
        limit: remaining === Infinity ? '\u221E' : this.laterRelaySighters
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
    let matchTotal = 0;
    let matchX = 0;

    for (let relay = 1; relay <= this.numRelays; relay++)
    {
      const relayShots = this.shotLog.filter(s => s.relay === relay);
      const sighters = relayShots.filter(s => s.isSighter).map(s => ({ score: s.score, isX: s.isX }));
      const records = relayShots.filter(s => !s.isSighter);
      const { total, xCount } = this.aggregate(records);

      matchTotal += total;
      matchX += xCount;

      sections.push({
        label: `Relay ${relay}`,
        sighters: sighters,
        records: records.map(s => ({ score: s.score, isX: s.isX })),
        suddenDeath: [],
        recordSlots: this.maxRecordShots,
        total: total,
        xCount: xCount,
        isWinner: false
      });
    }

    return {
      sections: sections,
      footer: { text: `Match Total: ${matchTotal}-${matchX}X` }
    };
  }
}
