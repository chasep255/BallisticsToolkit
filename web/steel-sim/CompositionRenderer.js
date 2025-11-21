/**
 * CompositionRenderer - Manages composition of 3D scene and overlays
 * 
 * Only this class knows about pixels. Callers use normalized coordinates (-1 to 1)
 * and get back render targets to render into.
 * 
 * Coordinate System:
 * - Normalized coordinates: -1 to 1 (like NDC/OpenGL)
 * - X: -1 (left) to +1 (right), center is 0
 * - Y: -1 (bottom) to +1 (top), center is 0
 * - Full screen: width=2, height=2
 */

import * as THREE from 'three';

/**
 * CompositionLayer - Represents a composited layer with its own render target
 */
export class CompositionLayer
{
  constructor(compositionRenderer, handle, renderTarget, width, height, pixelWidth, pixelHeight, renderOrder, mesh, material)
  {
    this._compositionRenderer = compositionRenderer;
    this.handle = handle;
    this.renderTarget = renderTarget;
    this.width = width; // Normalized width
    this.height = height; // Normalized height
    this.pixelWidth = pixelWidth; // Pixel width
    this.pixelHeight = pixelHeight; // Pixel height
    this.renderOrder = renderOrder;
    this._mesh = mesh;
    this._material = material;
    this._resizeHandler = null;
  }

  /**
   * Get the renderer used by this layer (for rendering into render targets)
   * @returns {THREE.WebGLRenderer}
   */
  getRenderer()
  {
    return this._compositionRenderer.renderer;
  }

  /**
   * Register a callback to be invoked when this layer's render target
   * is resized by the CompositionRenderer.
   * @param {(width:number, height:number) => void} handler
   */
  setResizeHandler(handler)
  {
    this._resizeHandler = typeof handler === 'function' ? handler : null;
  }

  _invokeResizeHandler(width, height)
  {
    if (this._resizeHandler)
    {
      this._resizeHandler(width, height);
    }
  }

  /**
   * Render a Three.js scene with a camera into this element's render target
   * @param {THREE.Scene} scene - Scene to render
   * @param {THREE.Camera} camera - Camera to use
   * @param {Object} options - Options
   * @param {boolean} options.clear - Whether to clear before rendering (default true)
   * @param {THREE.Color|number} options.clearColor - Optional clear color override
   */
  render(scene, camera, options = {})
  {
    const
    {
      clear = true, clearColor = null
    } = options;
    const renderer = this._compositionRenderer.renderer;
    const prevTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.renderTarget);

    if (clear)
    {
      if (clearColor !== null)
      {
        const color = clearColor instanceof THREE.Color ? clearColor : new THREE.Color(clearColor);
        renderer.setClearColor(color, 1.0);
      }
      renderer.clear();
    }

    renderer.render(scene, camera);
    renderer.setRenderTarget(prevTarget);
  }

  /**
   * Set the texture shown by this element in the composition scene.
   * This does NOT render into the renderTarget; it simply changes the
   * texture used by the element's quad that CompositionRenderer draws.
   * @param {THREE.Texture} texture - Texture to display
   */
  setTexture(texture)
  {
    this._material.map = texture;
    this._material.needsUpdate = true;
  }
}

export class CompositionRenderer
{
  constructor(config)
  {
    const canvas = config.canvas;
    this.canvas = canvas;
    this.canvasWidth = canvas.clientWidth;
    this.canvasHeight = canvas.clientHeight;
    this.aspect = this.canvasWidth / this.canvasHeight;
    // Single pixels→normalized scale so horizontal/vertical feel identical
    this.pixelToNormScale = 2 / this.canvasHeight;

    // Create renderer with logarithmic depth buffer for better precision at distance
    this.renderer = new THREE.WebGLRenderer(
    {
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: true
    });
    // Match internal render size to current CSS size, but let CSS
    // continue to control the displayed size (width: 100%, aspect-ratio).
    this.renderer.setSize(this.canvasWidth, this.canvasHeight, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x87ceeb, 1.0); // Sky blue background

    // Create composition scene (2D orthographic, aspect-aware)
    this.compositionScene = new THREE.Scene();
    this.compositionCamera = new THREE.OrthographicCamera(
      -this.aspect, this.aspect, // left, right
      1, -1, // top, bottom
      0, 10
    );
    this.compositionCamera.position.z = 5;

    // Track elements by handle
    this.elements = new Map();
    this.nextHandle = 1;
  }

  /**
   * Get the aspect ratio (canvasWidth / canvasHeight) of the composition
   * Callers should use this instead of recomputing from the canvas.
   */
  getAspect()
  {
    return this.aspect;
  }

  /**
   * Get the virtual viewport size in normalized units.
   * X spans [-aspect, +aspect] → width = 2 * aspect
   * Y spans [-1, +1]           → height = 2
   */
  getVirtualSize()
  {
    return {
      width: 2 * this.aspect,
      height: 2
    };
  }

  /**
   * Get the pixels-to-normalized scale factor used for both axes.
   */
  getPixelToNormScale()
  {
    return this.pixelToNormScale;
  }

  /**
   * Convert screen/client coordinates to normalized composition coordinates.
   * X spans [-aspect, +aspect], Y spans [-1, +1].
   */
  screenToNormalized(clientX, clientY)
  {
    const rect = this.canvas.getBoundingClientRect();

    // Screen coords → canvas coords (0..canvasWidth/Height)
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    // Canvas coords → normalized coords
    const normX = (canvasX / this.canvasWidth) * (2 * this.aspect) - this.aspect;
    const normY = 1 - (canvasY / this.canvasHeight) * 2;

    return {
      x: normX,
      y: normY
    };
  }

  /**
   * Convert mouse movement in pixels to normalized composition deltas.
   * This is suitable for pointer-lock style relative input.
   */
  movementToNormalized(deltaPixelsX, deltaPixelsY)
  {
    const scale = this.pixelToNormScale;
    const normDx = deltaPixelsX * scale;
    const normDy = deltaPixelsY * scale;
    return {
      x: normDx,
      y: normDy
    };
  }

  /**
   * Create a layer in the composition scene
   * Creates a render target and returns a CompositionLayer instance
   * 
   * @param {number} x - X position in normalized coordinates (-1 to 1)
   * @param {number} y - Y position in normalized coordinates (-1 to 1)
   * @param {number} width - Width in normalized coordinates (full screen = 2)
   * @param {number} height - Height in normalized coordinates (full screen = 2)
   * @param {Object} options - Options
   * @param {number} options.renderOrder - Render order (lower renders first, default 1)
   * @param {boolean} options.transparent - Whether the layer should support alpha transparency (default false)
   * @returns {CompositionLayer} CompositionLayer instance with render target and render method
   */
  createElement(x, y, width, height, options = {})
  {
    const
    {
      renderOrder = 1,
        transparent = false,
        supersampleFactor = 2
    } = options;

    // Convert normalized size to pixels
    // Horizontal span is [-aspect, +aspect] => width 2 * aspect
    const pixelWidth = Math.floor((width / (2 * this.aspect)) * this.canvasWidth);
    // Vertical span is [-1, +1] => height 2
    const pixelHeight = Math.floor((height / 2) * this.canvasHeight);

    const renderTarget = new THREE.WebGLRenderTarget(
      pixelWidth * supersampleFactor,
      pixelHeight * supersampleFactor,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        samples: 4, // MSAA
        stencilBuffer: true
      }
    );

    // Create mesh with render target texture (size in normalized coordinates)
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial(
    {
      map: renderTarget.texture,
      transparent: transparent,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.FrontSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    // Position in normalized space, z based on renderOrder
    const z = 1 + renderOrder * 0.1;
    mesh.position.set(x, y, z);
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;

    this.compositionScene.add(mesh);

    // Store element with handle and metadata for future resizes
    const handle = this.nextHandle++;
    const layer = new CompositionLayer(this, handle, renderTarget, width, height, pixelWidth, pixelHeight, renderOrder, mesh, material);

    this.elements.set(handle,
    {
      mesh,
      geometry,
      material,
      renderTarget,
      width,
      height,
      supersampleFactor,
      layer
    });

    // Return CompositionLayer instance
    return layer;
  }

  /**
   * @deprecated Use createElement instead
   */
  addElement(x, y, width, height, options = {})
  {
    return this.createElement(x, y, width, height, options);
  }

  /**
   * Remove a layer from the composition scene
   * @param {CompositionLayer|number} layerOrHandle - CompositionLayer instance or handle
   */
  removeElement(layerOrHandle)
  {
    const handle = layerOrHandle instanceof CompositionLayer ? layerOrHandle.handle : layerOrHandle;
    const element = this.elements.get(handle);
    if (!element) return;

    this.compositionScene.remove(element.mesh);
    element.geometry.dispose();
    element.material.dispose();
    element.renderTarget.dispose();

    this.elements.delete(handle);
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
    this.aspect = this.canvasWidth / this.canvasHeight;
    this.pixelToNormScale = 2 / this.canvasHeight;

    // Update internal render size only; CSS controls element size.
    this.renderer.setSize(width, height, false);

    // Update composition camera to maintain aspect-aware coordinates
    this.compositionCamera.left = -this.aspect;
    this.compositionCamera.right = this.aspect;
    this.compositionCamera.top = 1;
    this.compositionCamera.bottom = -1;
    this.compositionCamera.updateProjectionMatrix();

    // Resize all layer render targets to match new canvas resolution
    for (const element of this.elements.values())
    {
      const
      {
        geometry,
        renderTarget,
        width: normWidth,
        height: normHeight,
        supersampleFactor,
        layer
      } = element;

      if (!renderTarget) continue;

      const elemWidthNorm = normWidth ?? geometry.parameters.width;
      const elemHeightNorm = normHeight ?? geometry.parameters.height;

      const pixelWidth = Math.floor((elemWidthNorm / (2 * this.aspect)) * this.canvasWidth);
      const pixelHeight = Math.floor((elemHeightNorm / 2) * this.canvasHeight);

      const ss = supersampleFactor ?? 2;
      renderTarget.setSize(pixelWidth * ss, pixelHeight * ss);

      if (layer)
      {
        layer.renderTarget = renderTarget;
        layer.pixelWidth = pixelWidth;
        layer.pixelHeight = pixelHeight;
        layer._invokeResizeHandler(renderTarget.width, renderTarget.height);
      }
    }
  }

  /**
   * Dispose of resources
   */
  dispose()
  {
    for (const element of this.elements.values())
    {
      this.compositionScene.remove(element.mesh);
      element.geometry.dispose();
      element.material.dispose();
      element.renderTarget.dispose();
    }

    this.elements.clear();
    this.renderer.dispose();
  }
}