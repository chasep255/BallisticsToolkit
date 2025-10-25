/**
 * RelayManager - Manages relay state, timer, sighters, and record shots for F-Class matches
 */
export class RelayManager
{
  constructor(debugMode = false)
  {
    this.debugMode = debugMode;
    this.relayIndex = 1; // Current relay (1, 2, or 3)
    this.phase = 'sighters'; // 'sighters', 'record', or 'ended'
    
    // Timer and shot limits (debug mode: 3 min, 3 shots; normal: 20 min, 20 shots)
    this.timerDuration = debugMode ? 180 : 1200; // 3 or 20 minutes in seconds
    this.maxRecordShots = debugMode ? 3 : 20; // 3 or 20 shots per relay
    
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
    if (this.timeRemaining <= 0 || this.recordShotsFired >= 20)
    {
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
      this.phase = 'record';
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
      
      // Auto-end if max record shots reached
      if (this.recordShotsFired >= this.maxRecordShots)
      {
        this.endRelay();
      }
    }
    // Note: Sighters are now handled in fireShot() for immediate UI updates
  }
  
  /**
   * End the current relay
   */
  endRelay()
  {
    if (this.phase !== 'ended')
    {
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
      this.relayIndex++;
      this.resetForNextRelay();
    }
  }
  
  /**
   * Reset state for next relay
   */
  resetForNextRelay()
  {
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

