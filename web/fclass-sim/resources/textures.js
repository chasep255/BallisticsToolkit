/**
 * TextureManager - Manages texture loading and caching
 * Handles Three.js texture loading with proper wrapping and anisotropy
 */

import * as THREE from 'three';

const LOG_PREFIX = '[TextureManager]';

// Texture manifest - all textures to load
const TEXTURE_MANIFEST = {
  // Grass textures
  grass_color:
  {
    path: 'textures/grass/Grass004_1K-JPG_Color.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },
  grass_normal:
  {
    path: 'textures/grass/Grass004_1K-JPG_NormalGL.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },
  grass_roughness:
  {
    path: 'textures/grass/Grass004_1K-JPG_Roughness.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },

  // Dirt textures
  dirt_color:
  {
    path: 'textures/dirt/Ground082S_1K-JPG_Color.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },
  dirt_normal:
  {
    path: 'textures/dirt/Ground082S_1K-JPG_NormalGL.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },
  dirt_roughness:
  {
    path: 'textures/dirt/Ground082S_1K-JPG_Roughness.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },

  // Bark textures
  bark_color:
  {
    path: 'textures/bark/Bark012_1K-JPG_Color.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },
  bark_normal:
  {
    path: 'textures/bark/Bark012_1K-JPG_NormalGL.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },
  bark_roughness:
  {
    path: 'textures/bark/Bark012_1K-JPG_Roughness.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },

  // Concrete textures
  concrete_color:
  {
    path: 'textures/concrete/Concrete012_1K-JPG_Color.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },
  concrete_normal:
  {
    path: 'textures/concrete/Concrete012_1K-JPG_NormalGL.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },
  concrete_roughness:
  {
    path: 'textures/concrete/Concrete012_1K-JPG_Roughness.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },

  // Rock textures
  rock_color:
  {
    path: 'textures/rock/Rock030_256_Color.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },
  rock_normal:
  {
    path: 'textures/rock/Rock030_256_NormalGL.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  },
  rock_roughness:
  {
    path: 'textures/rock/Rock030_256_Roughness.jpg',
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping
  }
};

export class TextureManager
{
  constructor()
  {
    this.textures = new Map();
    this.loader = new THREE.TextureLoader();
    this.loadingProgress = 0;

    console.log(`${LOG_PREFIX} Initialized`);
  }

  /**
   * Load all textures from manifest
   */
  async loadAll(renderer)
  {
    console.log(`${LOG_PREFIX} Loading ${Object.keys(TEXTURE_MANIFEST).length} textures...`);

    const entries = Object.entries(TEXTURE_MANIFEST);
    const total = entries.length;
    let loaded = 0;

    const loadPromises = entries.map(([id, config]) =>
    {
      return new Promise((resolve) =>
      {
        this.loader.load(
          config.path,
          (texture) =>
          {
            // Apply texture settings
            if (config.wrapS) texture.wrapS = config.wrapS;
            if (config.wrapT) texture.wrapT = config.wrapT;

            // Set anisotropy if renderer available
            if (renderer)
            {
              texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            }

            this.textures.set(id, texture);
            loaded++;
            this.loadingProgress = loaded / total;

            console.log(`${LOG_PREFIX} Loaded ${id} (${texture.image.width}x${texture.image.height}) [${loaded}/${total}]`);
            resolve();
          },
          undefined,
          (error) =>
          {
            console.error(`${LOG_PREFIX} Failed to load ${id}:`, error);
            loaded++;
            this.loadingProgress = loaded / total;
            resolve();
          }
        );
      });
    });

    await Promise.all(loadPromises);
    console.log(`${LOG_PREFIX} All textures loaded successfully`);
  }

  /**
   * Get a texture by ID
   * @param {string} id - Texture ID from manifest
   * @returns {THREE.Texture|null}
   */
  getTexture(id)
  {
    const texture = this.textures.get(id);
    if (!texture)
    {
      console.warn(`${LOG_PREFIX} Texture not found: ${id}`);
      return null;
    }
    return texture;
  }

  /**
   * Dispose all textures
   */
  dispose()
  {
    console.log(`${LOG_PREFIX} Disposing ${this.textures.size} textures`);
    for (const texture of this.textures.values())
    {
      texture.dispose();
    }
    this.textures.clear();
  }
}