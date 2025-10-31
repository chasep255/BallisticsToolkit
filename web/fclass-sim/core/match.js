/**
 * MatchState - Manages F-Class match state, relay timing, and shot tracking
 * Pure logic, no rendering dependencies
 */

const LOG_PREFIX = '[MatchState]';

export class MatchState
{
  constructor(debugMode = false)
  {
    console.log(`${LOG_PREFIX} Initializing ${debugMode ? 'DEBUG' : 'NORMAL'} mode`);

    this.debugMode = debugMode;
    this.relayIndex = 1; // Current relay (1, 2, or 3)
    this.phase = 'sighters'; // 'sighters', 'record', or 'ended'

    // Timer and shot limits (debug mode: 1 min, 2 shots; normal: 20 min, 20 shots)
    this.timerDuration = debugMode ? 60 : 1200; // 1 or 20 minutes in seconds
    this.maxRecordShots = debugMode ? 2 : 20; // 2 or 20 shots per relay

    this.timeRemaining = this.timerDuration;
    this.timerStartTime = null; // When timer started (null = not started)
    this.recordShotsFired = 0; // Count of record shots in current relay
    this.sightersFired = 0; // Count of sighters in current relay
    this.isRunning = false;
    this.justEndedFlag = false; // Flag to detect relay end transition

    // Sighters allowed per relay
    this.sightersAllowed = {
      1: Infinity, // Unlimited for relay 1
      2: 2,
      3: 2
    };

    console.log(`${LOG_PREFIX} Timer duration: ${this.timerDuration}s, Max record shots: ${this.maxRecordShots}`);
  }

  /**
   * Start the timer if not already running
   * @param {number} now - Current time in seconds
   */
  startIfNeeded(now)
  {
    if (!this.isRunning && this.phase !== 'ended')
    {
      this.timerStartTime = now;
      this.isRunning = true;
      console.log(`${LOG_PREFIX} Timer started for relay ${this.relayIndex} at ${now.toFixed(2)}s`);
    }
  }

  /**
   * Update timer and check for auto-end conditions
   * @param {number} now - Current time in seconds
   */
  tick(now)
  {
    if (!this.isRunning || this.phase === 'ended')
    {
      return;
    }

    // Update time remaining
    const elapsed = now - this.timerStartTime;
    this.timeRemaining = Math.max(0, this.timerDuration - elapsed);

    // Check for auto-end conditions
    if (this.timeRemaining <= 0)
    {
      console.log(`${LOG_PREFIX} Time expired for relay ${this.relayIndex}`);
      this.endRelay();
    }
    else if (this.recordShotsFired >= this.maxRecordShots)
    {
      console.log(`${LOG_PREFIX} Max record shots (${this.maxRecordShots}) reached for relay ${this.relayIndex}`);
      this.endRelay();
    }
  }

  /**
   * Switch from sighters to record phase
   */
  goForRecord()
  {
    if (this.phase === 'sighters')
    {
      console.log(`${LOG_PREFIX} Switching to RECORD phase (relay ${this.relayIndex}, ${this.sightersFired} sighters fired)`);
      this.phase = 'record';
    }
    else
    {
      console.warn(`${LOG_PREFIX} Cannot go for record - already in ${this.phase} phase`);
    }
  }

  /**
   * Record a shot (sighter or record)
   * @param {boolean} isRecord - True if record shot, false if sighter
   */
  onShot(isRecord)
  {
    if (isRecord)
    {
      this.recordShotsFired++;
      console.log(`${LOG_PREFIX} Record shot #${this.recordShotsFired}/${this.maxRecordShots} fired`);

      // Auto-end if max record shots reached
      if (this.recordShotsFired >= this.maxRecordShots)
      {
        this.endRelay();
      }
    }
  }

  /**
   * End the current relay
   */
  endRelay()
  {
    if (this.phase !== 'ended')
    {
      console.log(`${LOG_PREFIX} Relay ${this.relayIndex} ENDED (${this.recordShotsFired} record shots, ${this.sightersFired} sighters)`);
      this.phase = 'ended';
      this.isRunning = false;
      this.justEndedFlag = true;
    }
  }

  /**
   * Advance to next relay
   */
  advanceRelay()
  {
    if (this.relayIndex < 3)
    {
      const oldRelay = this.relayIndex;
      this.relayIndex++;
      console.log(`${LOG_PREFIX} Advancing from relay ${oldRelay} to relay ${this.relayIndex}`);
      this.resetForNextRelay();
    }
    else
    {
      console.log(`${LOG_PREFIX} Match complete - cannot advance past relay 3`);
    }
  }

  /**
   * Reset state for next relay
   */
  resetForNextRelay()
  {
    console.log(`${LOG_PREFIX} Resetting state for relay ${this.relayIndex}`);
    this.phase = 'sighters';
    this.timeRemaining = this.timerDuration;
    this.timerStartTime = null;
    this.recordShotsFired = 0;
    this.sightersFired = 0;
    this.isRunning = false;
    this.justEndedFlag = false;
  }

  /**
   * Check if relay just ended this frame
   * @returns {boolean}
   */
  justEnded()
  {
    const result = this.justEndedFlag;
    if (result)
    {
      this.justEndedFlag = false; // Clear flag after checking
    }
    return result;
  }

  /**
   * Check if relay is ended
   * @returns {boolean}
   */
  isEnded()
  {
    return this.phase === 'ended';
  }

  /**
   * Check if in record phase
   * @returns {boolean}
   */
  isRecordPhase()
  {
    return this.phase === 'record';
  }

  /**
   * Check if in sighters phase
   * @returns {boolean}
   */
  isSightersPhase()
  {
    return this.phase === 'sighters';
  }

  /**
   * Get elapsed time in current relay
   * @returns {number} Elapsed seconds
   */
  elapsed()
  {
    if (!this.timerStartTime)
    {
      return 0;
    }
    return this.timerDuration - this.timeRemaining;
  }

  /**
   * Get time remaining formatted as MM:SS
   * @returns {string}
   */
  getTimeFormatted()
  {
    const minutes = Math.floor(this.timeRemaining / 60);
    const seconds = Math.floor(this.timeRemaining % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get relay display string (e.g., "1/3")
   * @returns {string}
   */
  getRelayDisplay()
  {
    return `${this.relayIndex}/3`;
  }

  /**
   * Check if all relays are complete
   * @returns {boolean}
   */
  isMatchComplete()
  {
    return this.relayIndex === 3 && this.phase === 'ended';
  }

  /**
   * Get sighters remaining in current relay
   * @returns {number} Number of sighters remaining (Infinity for unlimited)
   */
  getSightersRemaining()
  {
    const allowed = this.sightersAllowed[this.relayIndex];
    if (allowed === Infinity)
    {
      return Infinity;
    }
    return Math.max(0, allowed - this.sightersFired);
  }
}