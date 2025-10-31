/**
 * AudioManager - Manages audio loading, playback, and looping sounds
 * Handles Web Audio API context and buffer management
 */

const LOG_PREFIX = '[AudioManager]';

// Audio manifest - all audio files to load
const AUDIO_MANIFEST = {
  // Shot sounds
  shot1:
  {
    path: 'audio/shot1.mp3',
    type: 'oneshot'
  },

  // Background shot sounds (for other shooters)
  bg_shot_1:
  {
    path: 'audio/bg_shot_1.mp3',
    type: 'oneshot'
  },
  bg_shot_2:
  {
    path: 'audio/bg_shot_2.mp3',
    type: 'oneshot'
  },
  bg_shot_3:
  {
    path: 'audio/bg_shot_3.mp3',
    type: 'oneshot'
  },
  bg_shot_4:
  {
    path: 'audio/bg_shot_4.mp3',
    type: 'oneshot'
  },
  bg_shot_5:
  {
    path: 'audio/bg_shot_5.mp3',
    type: 'oneshot'
  },

  // Scope sounds
  scope_click:
  {
    path: 'audio/scope_click.mp3',
    type: 'oneshot'
  },

  // Ambient sounds
  background_noise:
  {
    path: 'audio/background_noise.mp3',
    type: 'loop'
  },
  wind:
  {
    path: 'audio/wind.mp3',
    type: 'loop'
  }
};

// Helper to get random background shot sound ID (avoiding repeats)
let lastBgShotId = null;

function getRandomBgShotId()
{
  let index;
  do {
    index = Math.floor(Math.random() * 5) + 1;
  } while (`bg_shot_${index}` === lastBgShotId);

  lastBgShotId = `bg_shot_${index}`;
  return lastBgShotId;
}

export class AudioManager
{
  constructor()
  {
    this.audioContext = null;
    this.audioBuffers = new Map();
    this.activeSources = new Set();
    this.loopingSources = new Map(); // Map<soundId, {source, gainNode}>
    this.loadingProgress = 0;

    console.log(`${LOG_PREFIX} Initialized`);
  }

  /**
   * Initialize audio context (lazily, on first sound play)
   */
  initializeContext()
  {
    if (!this.audioContext)
    {
      this.audioContext = new(window.AudioContext || window.webkitAudioContext)();
      console.log(`${LOG_PREFIX} Audio context created (sample rate: ${this.audioContext.sampleRate}Hz)`);
    }
    return this.audioContext;
  }

  /**
   * Load all audio files from manifest
   */
  async loadAll()
  {
    console.log(`${LOG_PREFIX} Loading ${Object.keys(AUDIO_MANIFEST).length} audio files...`);

    const entries = Object.entries(AUDIO_MANIFEST);
    const total = entries.length;
    let loaded = 0;

    const loadPromises = entries.map(async ([id, config]) =>
    {
      try
      {
        const response = await fetch(config.path);
        if (!response.ok)
        {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // We need an audio context to decode, so initialize it
        const context = this.initializeContext();
        const audioBuffer = await context.decodeAudioData(arrayBuffer);

        this.audioBuffers.set(id, audioBuffer);
        loaded++;
        this.loadingProgress = loaded / total;

        console.log(`${LOG_PREFIX} Loaded ${id} (${(audioBuffer.duration).toFixed(1)}s) [${loaded}/${total}]`);
      }
      catch (error)
      {
        console.error(`${LOG_PREFIX} Failed to load ${id}:`, error);
        loaded++;
        this.loadingProgress = loaded / total;
      }
    });

    await Promise.all(loadPromises);
    console.log(`${LOG_PREFIX} All audio loaded successfully`);
  }

  /**
   * Play a sound by ID
   * @param {string} id - Sound ID from manifest
   * @param {Object} options - Playback options {volume, loop}
   * @returns {AudioBufferSourceNode|null} The audio source node
   */
  playSound(id, options = {})
  {
    // Handle special case: random background shot
    if (id === 'bg_shot_random')
    {
      id = getRandomBgShotId();
    }

    const buffer = this.audioBuffers.get(id);
    if (!buffer)
    {
      console.warn(`${LOG_PREFIX} Audio buffer not found: ${id}`);
      return null;
    }

    const context = this.initializeContext();

    try
    {
      const source = context.createBufferSource();
      source.buffer = buffer;

      // Apply volume if specified
      if (options.volume !== undefined)
      {
        const gainNode = context.createGain();
        gainNode.gain.value = options.volume;
        source.connect(gainNode);
        gainNode.connect(context.destination);
      }
      else
      {
        source.connect(context.destination);
      }

      // Track active source
      this.activeSources.add(source);

      // Auto-cleanup when sound ends
      source.onended = () =>
      {
        this.activeSources.delete(source);
        try
        {
          source.disconnect();
        }
        catch (e)
        {
          // Already disconnected
        }
      };

      source.start(0);
      return source;
    }
    catch (error)
    {
      console.error(`${LOG_PREFIX} Failed to play sound ${id}:`, error);
      return null;
    }
  }

  /**
   * Start a looping sound with volume control
   * @param {string} id - Sound ID from manifest
   * @param {number} initialVolume - Initial volume (0-1)
   */
  startLoop(id, initialVolume = 1.0)
  {
    // Stop existing loop if playing
    this.stopLoop(id);

    const buffer = this.audioBuffers.get(id);
    if (!buffer)
    {
      console.warn(`${LOG_PREFIX} Audio buffer not found: ${id}`);
      return;
    }

    const context = this.initializeContext();

    try
    {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;

      const gainNode = context.createGain();
      gainNode.gain.value = initialVolume;

      source.connect(gainNode);
      gainNode.connect(context.destination);

      source.start(0);

      this.loopingSources.set(id,
      {
        source,
        gainNode
      });
      console.log(`${LOG_PREFIX} Started loop: ${id} (volume: ${initialVolume.toFixed(2)})`);
    }
    catch (error)
    {
      console.error(`${LOG_PREFIX} Failed to start loop ${id}:`, error);
    }
  }

  /**
   * Set volume for a looping sound
   * @param {string} id - Sound ID
   * @param {number} volume - Volume (0-1)
   */
  setLoopVolume(id, volume)
  {
    const loopData = this.loopingSources.get(id);
    if (loopData && loopData.gainNode)
    {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      loopData.gainNode.gain.value = clampedVolume;
    }
  }

  /**
   * Stop a looping sound
   * @param {string} id - Sound ID
   */
  stopLoop(id)
  {
    const loopData = this.loopingSources.get(id);
    if (loopData)
    {
      try
      {
        loopData.source.stop();
        loopData.source.disconnect();
        loopData.gainNode.disconnect();
        console.log(`${LOG_PREFIX} Stopped loop: ${id}`);
      }
      catch (e)
      {
        // Already stopped
      }
      this.loopingSources.delete(id);
    }
  }

  /**
   * Dispose all audio resources
   */
  dispose()
  {
    console.log(`${LOG_PREFIX} Disposing (${this.activeSources.size} active, ${this.loopingSources.size} looping)`);

    // Stop all active sources
    for (const source of this.activeSources)
    {
      try
      {
        source.stop();
        source.disconnect();
      }
      catch (e)
      {
        // Already stopped
      }
    }
    this.activeSources.clear();

    // Stop all looping sources
    for (const [id, loopData] of this.loopingSources)
    {
      try
      {
        loopData.source.stop();
        loopData.source.disconnect();
        loopData.gainNode.disconnect();
      }
      catch (e)
      {
        // Already stopped
      }
    }
    this.loopingSources.clear();

    // Close audio context
    if (this.audioContext)
    {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioBuffers.clear();
    console.log(`${LOG_PREFIX} Disposed`);
  }
}