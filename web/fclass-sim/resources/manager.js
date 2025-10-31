/**
 * ResourceManager - Centralized resource management for audio, time, and textures
 * 
 * Architecture:
 * - Singleton pattern with auto-loading on module import
 * - Resources start loading immediately when this module is imported
 * - Game waits for resources to be ready before enabling "Start Game" button
 * 
 * Loading Flow:
 * 1. HTML loads and imports fclass-sim.js
 * 2. fclass-sim.js imports ResourceManager (this file)
 * 3. ResourceManager singleton is created and startLoading() is called automatically
 * 4. Resources load in background while page initializes
 * 5. initializeApp() waits for resources via waitUntilReady()
 * 6. "Start Game" button is enabled when resources are ready
 * 
 * Usage:
 * - Audio: ResourceManager.audio.playSound('shot1')
 * - Time: ResourceManager.time.getElapsedTime()
 * - Textures: ResourceManager.textures.getTexture('grass_color')
 */

import
{
  AudioManager
}
from './audio.js';
import
{
  TimeManager
}
from './time.js';
import
{
  TextureManager
}
from './textures.js';

const LOG_PREFIX = '[ResourceManager]';

/**
 * ResourceManager - Main singleton manager
 */
class ResourceManager
{
  constructor()
  {
    console.log(`${LOG_PREFIX} Initializing...`);

    this.audio = new AudioManager();
    this.time = new TimeManager();
    this.textures = new TextureManager();

    this.isReady = false;
    this.loadingProgress = 0;
    this.readyPromise = null;
    this.readyResolve = null;

    console.log(`${LOG_PREFIX} Managers created`);
  }

  /**
   * Start loading all resources (called automatically on module import)
   */
  async startLoading()
  {
    if (this.readyPromise)
    {
      console.log(`${LOG_PREFIX} Already loading, returning existing promise`);
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve) =>
    {
      this.readyResolve = resolve;
    });

    console.log(`${LOG_PREFIX} Starting resource loading...`);
    const startTime = performance.now();

    try
    {
      // Load audio and textures in parallel (without renderer for now)
      await Promise.all([
        this.audio.loadAll(),
        this.textures.loadAll(null)
      ]);

      this.isReady = true;
      this.loadingProgress = 1.0;

      const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`${LOG_PREFIX} All resources loaded successfully in ${loadTime}s`);

      this.readyResolve();
    }
    catch (error)
    {
      console.error(`${LOG_PREFIX} Failed to load resources:`, error);
      this.readyResolve(); // Resolve anyway to not block the app
    }

    return this.readyPromise;
  }

  /**
   * Update texture anisotropy after renderer is available
   * @param {THREE.WebGLRenderer} renderer - Renderer for texture anisotropy
   */
  updateTextureAnisotropy(renderer)
  {
    if (!renderer) return;

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    for (const texture of this.textures.textures.values())
    {
      texture.anisotropy = maxAnisotropy;
    }
    console.log(`${LOG_PREFIX} Updated texture anisotropy to ${maxAnisotropy}`);
  }

  /**
   * Wait until all resources are ready
   */
  async waitUntilReady()
  {
    if (this.isReady)
    {
      return Promise.resolve();
    }
    return this.readyPromise || Promise.resolve();
  }

  /**
   * Get overall loading progress (0-1)
   */
  getLoadingProgress()
  {
    if (this.isReady)
    {
      return 1.0;
    }
    // Average of audio and texture progress
    return (this.audio.loadingProgress + this.textures.loadingProgress) / 2;
  }

  /**
   * Dispose all resources
   */
  dispose()
  {
    console.log(`${LOG_PREFIX} Disposing all resources...`);

    this.audio.dispose();
    this.time.dispose();
    this.textures.dispose();

    this.isReady = false;
    this.loadingProgress = 0;
    this.readyPromise = null;
    this.readyResolve = null;

    console.log(`${LOG_PREFIX} All resources disposed`);
  }
}

// Create singleton instance
const instance = new ResourceManager();

// Start loading resources immediately when module is imported
console.log(`${LOG_PREFIX} Module loaded, starting auto-load...`);
instance.startLoading();

// Export singleton
export default instance;