// graphics-presets.js - Graphics quality presets for F-Class simulator

import * as THREE from 'three';

export const GraphicsPresets = {
  /**
   * Get graphics preset configuration by name
   * @param {string} name - Preset name: 'High', 'Medium', or 'Low'
   * @returns {Object} Graphics configuration object
   */
  getPreset(name) {
    const normalizedName = name.toLowerCase();
    
    switch (normalizedName) {
      case 'high':
        return GraphicsPresets.HIGH;
      case 'medium':
        return GraphicsPresets.MEDIUM;
      case 'low':
        return GraphicsPresets.LOW;
      default:
        console.warn(`Unknown graphics preset: ${name}, defaulting to Medium`);
        return GraphicsPresets.MEDIUM;
    }
  },

  HIGH: {
    shadowsEnabled: true,
    shadowMapSize: { width: 4096, height: 8192 },
    shadowType: THREE.VSMShadowMap,
    shadowRadius: 3,
    msaaSamples: 4,
    antialiasing: true,
    pixelRatio: 2,
    cloudCount: 80,
    treeCountSides: 200,
    treeCountBehind: 100,
    mountainCount: 20,
    flagSegments: 30
  },

  MEDIUM: {
    shadowsEnabled: true,
    shadowMapSize: { width: 2048, height: 4096 },
    shadowType: THREE.PCFSoftShadowMap,
    shadowRadius: 3,
    msaaSamples: 4,
    antialiasing: true,
    pixelRatio: 2,
    cloudCount: 60,
    treeCountSides: 160,
    treeCountBehind: 80,
    mountainCount: 16,
    flagSegments: 20
  },

  LOW: {
    shadowsEnabled: false,
    shadowMapSize: { width: 1024, height: 2048 }, // Not used when disabled, but defined for consistency
    shadowType: THREE.BasicShadowMap, // Not used when disabled
    shadowRadius: 1, // Not used when disabled
    msaaSamples: 0,
    antialiasing: false,
    pixelRatio: 1,
    cloudCount: 10,
    treeCountSides: 40,
    treeCountBehind: 20,
    mountainCount: 8,
    flagSegments: 10
  }
};

