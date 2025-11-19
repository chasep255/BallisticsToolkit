/**
 * CompositionRenderer - Manages composition of 3D scene and overlays
 * 
 * Uses a resolution-independent virtual coordinate system to position
 * overlays (scope, HUD, etc.) on top of the main 3D scene.
 */

import * as THREE from 'three';

/**
 * VirtualCoordinates - Resolution-independent coordinate system
 * 
 * Provides a fixed virtual coordinate space that Three.js orthographic camera
 * maps to any canvas size automatically. This is the game-dev standard approach
 * for resolution-independent UI.
 * 
 * Coordinate System:
 * - Horizontal: -100 to +100 (200 units wide)
 * - Vertical: -75 to +75 (150 units tall, maintains 4:3 aspect ratio)
 * - Origin: Center of screen (0, 0)
 * - Top-right corner: (100, 75)
 * - Bottom-left corner: (-100, -75)
 */
export class VirtualCoordinates
{
  // Virtual viewport dimensions
  static WIDTH = 200;  // -100 to +100
  static HEIGHT = 150; // -75 to +75 (maintains 4:3 aspect ratio)
  
  // Edge positions
  static RIGHT = 100;
  static LEFT = -100;
  static TOP = 75;
  static BOTTOM = -75;
  
  // Standard margins (in virtual units)
  static MARGIN_SMALL = 2;
  static MARGIN_MEDIUM = 4;
  static MARGIN_LARGE = 8;
  
  /**
   * Calculate X position from right edge
   * @param {number} offset - Offset from right edge in virtual units
   * @returns {number} X coordinate
   */
  static fromRight(offset)
  {
    return this.RIGHT - offset;
  }
  
  /**
   * Calculate X position from left edge
   * @param {number} offset - Offset from left edge in virtual units
   * @returns {number} X coordinate
   */
  static fromLeft(offset)
  {
    return this.LEFT + offset;
  }
  
  /**
   * Calculate Y position from top edge
   * @param {number} offset - Offset from top edge in virtual units
   * @returns {number} Y coordinate
   */
  static fromTop(offset)
  {
    return this.TOP - offset;
  }
  
  /**
   * Calculate Y position from bottom edge
   * @param {number} offset - Offset from bottom edge in virtual units
   * @returns {number} Y coordinate
   */
  static fromBottom(offset)
  {
    return this.BOTTOM + offset;
  }
}

const VC = VirtualCoordinates;

export class CompositionRenderer
{
  constructor(config)
  {
    const canvas = config.canvas;
    this.canvasWidth = canvas.clientWidth;
    this.canvasHeight = canvas.clientHeight;
    
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ 
      canvas, 
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x87ceeb, 1.0); // Sky blue background
    
    // Create composition scene (2D orthographic)
    this.compositionScene = new THREE.Scene();
    this.compositionCamera = new THREE.OrthographicCamera(
      -VC.WIDTH / 2, VC.WIDTH / 2,
      VC.HEIGHT / 2, -VC.HEIGHT / 2,
      0, 10
    );
    this.compositionCamera.position.z = 5; // Position camera at z=5 to see layers 0-3
    
    // Track overlay elements
    this.overlayElements = [];
  }
  
  /**
   * Add an overlay element to the composition scene
   * @param {THREE.Mesh} mesh - Mesh to add
   * @param {Object} config - Configuration
   * @param {number} config.x - X position in virtual coordinates
   * @param {number} config.y - Y position in virtual coordinates
   * @param {number} config.z - Z position (for layering, default 1)
   * @param {number} config.renderOrder - Render order (default 1)
   */
  addElement(mesh, config = {})
  {
    const { x = 0, y = 0, z = 1, renderOrder = 1 } = config;
    
    mesh.position.set(x, y, z);
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    
    this.compositionScene.add(mesh);
    this.overlayElements.push(mesh);
    
    return mesh;
  }
  
  /**
   * Remove an overlay element from the composition scene
   * @param {THREE.Mesh} mesh - Mesh to remove
   */
  removeElement(mesh)
  {
    this.compositionScene.remove(mesh);
    const index = this.overlayElements.indexOf(mesh);
    if (index !== -1)
    {
      this.overlayElements.splice(index, 1);
    }
  }
  
  /**
   * Render the composition to screen
   */
  render()
  {
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.compositionScene, this.compositionCamera);
  }
  
  /**
   * Handle window resize
   * @param {number} width - New canvas width
   * @param {number} height - New canvas height
   */
  handleResize(width, height)
  {
    this.canvasWidth = width;
    this.canvasHeight = height;
    
    // Update renderer
    this.renderer.setSize(width, height);
    
    // Composition camera doesn't need resize (uses fixed virtual coordinates)
  }
  
  /**
   * Get the composition scene (for adding elements directly)
   */
  getCompositionScene()
  {
    return this.compositionScene;
  }
  
  /**
   * Get the renderer (for external use like raycasting)
   */
  getRenderer()
  {
    return this.renderer;
  }
  
  /**
   * Dispose of resources
   */
  dispose()
  {
    for (const element of this.overlayElements)
    {
      if (element.geometry) element.geometry.dispose();
      if (element.material) element.material.dispose();
    }
    
    this.overlayElements = [];
  }
}

