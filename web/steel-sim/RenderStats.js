/**
 * RenderStats - Collects and logs render statistics
 * 
 * Wraps render calls to automatically collect draw calls, triangles, points, and lines.
 * Call logStats() manually when you want to output the statistics.
 */

export class RenderStats
{
  constructor()
  {
    this.stats = new Map(); // Map of render name -> accumulated stats
    this.frameStartTime = null;
    this.frameTimes = []; // Array of frame times in milliseconds
    this.frameCount = 0; // Number of frames tracked in current period
    this.totalFrameCount = 0; // Total frames since creation (never resets)
    this.periodStartTime = null; // Start time for current stats period
  }

  /**
   * Get the number of frames tracked
   * @returns {number} Frame count
   */
  getFrameCount()
  {
    return this.frameCount;
  }

  /**
   * Wrap a render call and collect statistics
   * @param {THREE.WebGLRenderer} renderer - The renderer to use
   * @param {THREE.Scene} scene - Scene to render
   * @param {THREE.Camera} camera - Camera to use
   * @param {string} name - Name identifier for this render call (for logging)
   * @returns {Object} Stats object with calls, triangles, points, lines
   */
  render(renderer, scene, camera, name)
  {
    // Reset stats before rendering
    renderer.info.reset();

    // Perform the render
    renderer.render(scene, camera);

    // Collect stats after rendering
    const info = renderer.info.render;
    const stats = {
      calls: info.calls,
      triangles: info.triangles,
      points: info.points,
      lines: info.lines
    };

    // Accumulate stats for this render name
    if (!this.stats.has(name))
    {
      this.stats.set(name, {
        calls: 0,
        triangles: 0,
        points: 0,
        lines: 0,
        count: 0
      });
    }

    const accumulated = this.stats.get(name);
    accumulated.calls += stats.calls;
    accumulated.triangles += stats.triangles;
    accumulated.points += stats.points;
    accumulated.lines += stats.lines;
    accumulated.count++;

    return stats;
  }

  /**
   * Mark the start of a frame
   */
  frameStart()
  {
    this.frameStartTime = performance.now();
    if (this.periodStartTime === null)
    {
      this.periodStartTime = this.frameStartTime;
    }
  }

  /**
   * Mark the completion of a frame
   */
  frameComplete()
  {
    if (this.frameStartTime === null) return;

    const frameEndTime = performance.now();
    const frameTime = frameEndTime - this.frameStartTime;
    
    // Track frame time for render stats
    this.frameTimes.push(frameTime);
    this.frameCount++;
    this.totalFrameCount++;
    this.frameStartTime = null;
  }

  /**
   * Log accumulated statistics
   */
  logStats()
  {
    if (this.stats.size === 0 && this.frameTimes.length === 0) return;

    // Calculate FPS statistics
    let fpsLine = '';
    if (this.frameTimes.length > 0 && this.periodStartTime !== null)
    {
      // Actual FPS: frames per wall clock time for this period
      const wallClockTime = (performance.now() - this.periodStartTime) / 1000.0;
      const actualFps = this.frameCount / wallClockTime;
      
      // Theoretical FPS: based on average frame time
      const totalTime = this.frameTimes.reduce((sum, t) => sum + t, 0);
      const avgFrameTime = totalTime / this.frameTimes.length;
      const theoreticalFps = 1000.0 / avgFrameTime;
      
      const minFrameTime = Math.min(...this.frameTimes);
      const maxFrameTime = Math.max(...this.frameTimes);
      const minFps = 1000.0 / maxFrameTime; // Min FPS corresponds to max frame time
      const maxFps = 1000.0 / minFrameTime; // Max FPS corresponds to min frame time

      fpsLine = `[RenderStats] FPS: Actual=${actualFps.toFixed(1)} (limited by requestAnimationFrame), Theoretical=${theoreticalFps.toFixed(1)} (if unlimited), Range: ${minFps.toFixed(1)}-${maxFps.toFixed(1)}, Frames: ${this.frameCount}`;
    }

    console.log('[RenderStats] === Frame Statistics ===');
    
    if (fpsLine)
    {
      console.log(fpsLine);
    }

    if (this.stats.size > 0)
    {
      for (const [name, stats] of this.stats.entries())
      {
        const avgCalls = stats.calls / stats.count;
        const avgTriangles = stats.triangles / stats.count;
        const avgPoints = stats.points / stats.count;
        const avgLines = stats.lines / stats.count;

        console.log(`[RenderStats] ${name}: Draw calls: ${avgCalls.toFixed(1)}, Triangles: ${avgTriangles.toFixed(0)}, Points: ${avgPoints.toFixed(0)}, Lines: ${avgLines.toFixed(0)}, Render count: ${stats.count}`);
      }
    }
    
    console.log('[RenderStats] ========================');
  }

  /**
   * Get total frame count since creation
   * @returns {number} Total frame count
   */
  getTotalFrameCount()
  {
    return this.totalFrameCount;
  }

  /**
   * Reset accumulated statistics (called automatically after logging)
   */
  reset()
  {
    this.stats.clear();
    this.frameTimes = [];
    this.frameCount = 0;
    this.periodStartTime = null;
  }

  /**
   * Get current accumulated stats without logging
   * @returns {Map} Map of render name -> stats
   */
  getStats()
  {
    return this.stats;
  }
}

