/**
 * ModelManager - Manages GLB model loading and caching for Steel Simulator
 * Just loads and caches raw GLTF scenes - does NOT process or merge geometry
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LOG_PREFIX = '[ModelManager]';

// Model manifest - all models to load
const MODEL_MANIFEST = {
  // Prairie dog model
  prairie_dog: { path: '../models/prairie dog.glb' }
};

/**
 * Cached model data structure
 * @typedef {Object} CachedModel
 * @property {THREE.Group} scene - Raw GLTF scene (clone before use)
 * @property {THREE.AnimationClip[]} animations - Animation clips from GLB
 */

export class ModelManager
{
  constructor()
  {
    this.models = new Map(); // Map<modelKey, CachedModel>
    this.loader = new GLTFLoader();
    this.loadingProgress = 0;

    console.log(`${LOG_PREFIX} Initialized`);
  }

  /**
   * Load all models from manifest
   * @returns {Promise<void>} Promise that resolves when all models are loaded
   */
  async loadAll()
  {
    const modelKeys = Object.keys(MODEL_MANIFEST);
    if (modelKeys.length === 0)
    {
      console.log(`${LOG_PREFIX} No models in manifest`);
      return;
    }

    // Check if all models are already loaded
    const alreadyLoaded = modelKeys.every((key) => this.models.has(key));
    if (alreadyLoaded)
    {
      // Models already loaded, nothing to do
      return;
    }

    console.log(`${LOG_PREFIX} Loading ${modelKeys.length} models...`);

    const total = modelKeys.length;
    let loaded = 0;

    const loadPromises = modelKeys.map(async (modelKey) =>
    {
      // Skip if already loaded
      if (this.models.has(modelKey))
      {
        loaded++;
        return;
      }

      try
      {
        await this.loadModel(modelKey);
        loaded++;
        this.loadingProgress = loaded / total;
        console.log(`${LOG_PREFIX} Loaded ${modelKey} [${loaded}/${total}]`);
      }
      catch (error)
      {
        console.error(`${LOG_PREFIX} Failed to load ${modelKey}:`, error);
        loaded++;
        this.loadingProgress = loaded / total;
      }
    });

    await Promise.all(loadPromises);
    console.log(`${LOG_PREFIX} All models loaded successfully`);
  }

  /**
   * Load a single model by key
   * @param {string} modelKey - Model key from manifest
   * @returns {Promise<CachedModel>} Promise that resolves with cached model data
   */
  async loadModel(modelKey)
  {
    // Check if already loaded
    if (this.models.has(modelKey))
    {
      return this.models.get(modelKey);
    }

    const config = MODEL_MANIFEST[modelKey];
    if (!config)
    {
      throw new Error(`${LOG_PREFIX} Model not found in manifest: ${modelKey}`);
    }

    // Load GLB file
    const gltf = await this.loader.loadAsync(config.path);

    // Cache the raw scene and animations - no processing
    const cachedModel = {
      scene: gltf.scene,
      animations: gltf.animations ? [...gltf.animations] : []
    };

    this.models.set(modelKey, cachedModel);

    return cachedModel;
  }

  /**
   * Get a cached model by key
   * @param {string} modelKey - Model key from manifest
   * @returns {CachedModel|null} Cached model data or null if not loaded
   */
  getModel(modelKey)
  {
    const model = this.models.get(modelKey);
    if (!model)
    {
      console.warn(`${LOG_PREFIX} Model not found: ${modelKey}. Call loadModel() first.`);
      return null;
    }
    return model;
  }

  /**
   * Get animation clips for a model
   * @param {string} modelKey - Model key from manifest
   * @returns {THREE.AnimationClip[]} Array of animation clips (empty if none)
   */
  getAnimationClips(modelKey)
  {
    const model = this.getModel(modelKey);
    return model ? model.animations : [];
  }

  /**
   * Check if a model is loaded
   * @param {string} modelKey - Model key from manifest
   * @returns {boolean} True if model is loaded
   */
  isLoaded(modelKey)
  {
    return this.models.has(modelKey);
  }

  /**
   * Get loading progress (0.0 to 1.0)
   * @returns {number} Loading progress
   */
  getLoadingProgress()
  {
    return this.loadingProgress;
  }

  /**
   * Dispose all models
   */
  dispose()
  {
    console.log(`${LOG_PREFIX} Disposing ${this.models.size} models`);
    for (const model of this.models.values())
    {
      // Traverse scene and dispose all geometries and materials
      model.scene.traverse((child) =>
      {
        if (child.isMesh)
        {
          if (child.geometry) child.geometry.dispose();
          if (child.material)
          {
            if (Array.isArray(child.material))
            {
              child.material.forEach(m => this.disposeMaterial(m));
            }
            else
            {
              this.disposeMaterial(child.material);
            }
          }
        }
      });
    }
    this.models.clear();
    this.loadingProgress = 0;
  }

  /**
   * Helper to dispose a material and its textures
   * @param {THREE.Material} material - Material to dispose
   */
  disposeMaterial(material)
  {
    if (material.map) material.map.dispose();
    if (material.normalMap) material.normalMap.dispose();
    if (material.roughnessMap) material.roughnessMap.dispose();
    if (material.metalnessMap) material.metalnessMap.dispose();
    if (material.aoMap) material.aoMap.dispose();
    material.dispose();
  }
}

