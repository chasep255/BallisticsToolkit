/**
 * TimeManager - Manages game time with pause/resume and visibility handling
 * Uses THREE.Clock internally but provides consistent frame-based time values
 */

import * as THREE from 'three';

const LOG_PREFIX = '[TimeManager]';

export class TimeManager
{
  constructor()
  {
    this.clock = null;
    this.paused = false;
    this.autoPaused = false; // true only when paused by tab-hidden, not the user
    this.visibilityHandler = null;
    this.lastDeltaTime = 0;
    this.lastElapsedTime = 0;
    this.pauseStartTime = 0; // When pause started
    this.totalPausedTime = 0; // Total time spent paused

    console.log(`${LOG_PREFIX} Initialized`);
  }

  /**
   * Start the clock
   */
  start()
  {
    if (!this.clock)
    {
      this.clock = new THREE.Clock();
      this.setupVisibilityHandling();
      console.log(`${LOG_PREFIX} Clock created and started`);
    }
    this.clock.start();
    this.lastDeltaTime = 0;
    this.lastElapsedTime = 0;
    this.totalPausedTime = 0;
  }

  /**
   * Update time values - should be called once per frame at the start of render()
   */
  update()
  {
    if (!this.clock || this.paused)
    {
      this.lastDeltaTime = 0;
      return;
    }
    // Get delta and clamp to prevent physics issues
    const rawDelta = this.clock.getDelta();
    this.lastDeltaTime = Math.min(0.05, Math.max(0.0005, rawDelta));
    // Subtract total paused time from elapsed time to get actual game time
    this.lastElapsedTime = this.clock.getElapsedTime() - this.totalPausedTime;

    // Log if delta time is unusual (potential performance issue)
    if (rawDelta > 0.1)
    {
      console.warn(`${LOG_PREFIX} Large delta time: ${(rawDelta * 1000).toFixed(1)}ms (clamped to ${(this.lastDeltaTime * 1000).toFixed(1)}ms)`);
    }
  }

  /**
   * Get delta time (clamped) - returns cached value from last update()
   */
  getDeltaTime()
  {
    return this.lastDeltaTime;
  }

  /**
   * Get elapsed time since start - returns cached value from last update()
   */
  getElapsedTime()
  {
    return this.lastElapsedTime;
  }

  /**
   * Pause the clock
   */
  pause()
  {
    if (this.clock && !this.paused)
    {
      this.paused = true;
      // Record when we paused (using raw clock time)
      this.pauseStartTime = this.clock.getElapsedTime();
      console.log(`${LOG_PREFIX} Paused at game time ${this.lastElapsedTime.toFixed(2)}s`);
    }
  }

  /**
   * Resume the clock
   */
  resume()
  {
    if (this.clock && this.paused)
    {
      // Calculate how long we were paused and add it to total
      const pauseDuration = this.clock.getElapsedTime() - this.pauseStartTime;
      this.totalPausedTime += pauseDuration;

      // Call getDelta() once to reset the delta accumulator after pause
      // This prevents a large delta spike when resuming
      this.clock.getDelta();
      this.paused = false;
      console.log(`${LOG_PREFIX} Resumed after ${pauseDuration.toFixed(2)}s pause, game time still ${this.lastElapsedTime.toFixed(2)}s`);
    }
  }

  /**
   * Check if paused
   */
  isPaused()
  {
    return this.paused;
  }

  /**
   * Setup page visibility handling (auto-pause when tab hidden)
   */
  setupVisibilityHandling()
  {
    this.visibilityHandler = () =>
    {
      if (document.hidden)
      {
        // Auto-pause only if not already paused, so we don't clobber a manual
        // pause (and know not to auto-resume it later).
        if (!this.paused)
        {
          console.log(`${LOG_PREFIX} Tab hidden - pausing`);
          this.autoPaused = true;
          this.pause();
        }
      }
      else if (this.autoPaused)
      {
        // Only resume what WE auto-paused; never override a manual pause.
        console.log(`${LOG_PREFIX} Tab visible - resuming`);
        this.autoPaused = false;
        this.resume();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    console.log(`${LOG_PREFIX} Visibility handling enabled`);
  }

  /**
   * Dispose time manager
   */
  dispose()
  {
    if (this.visibilityHandler)
    {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.clock)
    {
      this.clock.stop();
      this.clock = null;
    }
    this.paused = false;
    console.log(`${LOG_PREFIX} Disposed`);
  }
}