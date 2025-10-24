/**
 * ScopeSystem - Manages scope rendering (cameras, render targets, overlays, crosshairs)
 * Encapsulates all scope-related Three.js objects and rendering logic
 */

export class ScopeSystem
{
  constructor(config)
  {
    this.scene = config.scene;
    this.compositionScene = config.compositionScene;
    this.renderer = config.renderer;
    this.canvasWidth = config.canvasWidth;
    this.canvasHeight = config.canvasHeight;
    this.cameraPosition = config.cameraPosition; // Fixed position for all scope cameras
    this.rangeDistance = config.rangeDistance;
    this.targetSize = config.targetSize;
    this.targetCenterHeight = config.targetCenterHeight;
    this.scopeConfigs = config.scopes;

    // Array to store created scope objects
    this.scopes = [];

    // Resource tracking for disposal
    this.renderTargets = [];
    this.geometries = [];
    this.materials = [];
    this.textures = [];
    this.meshes = [];

    // Initialize all scopes
    this.initialize();
  }

  /**
   * Initialize all scopes based on configuration
   */
  initialize()
  {
    for (const scopeConfig of this.scopeConfigs)
    {
      const scope = this.createScope(scopeConfig);
      this.scopes.push(scope);
    }
  }

  /**
   * Create a single scope with all its components
   */
  createScope(config)
  {
    const scope = {
      type: config.type,
      config: config
    };

    // Calculate scope size and position
    const availableWidth = this.canvasWidth - 20; // 10px padding on each side
    const availableHeight = this.canvasHeight - 20;
    const maxScopeSize = Math.min(availableWidth, availableHeight);
    const scopeSize = Math.floor(maxScopeSize * config.sizeFraction);
    const renderSize = scopeSize * 2;

    scope.size = scopeSize;

    // Position based on config
    if (config.position === 'bottom-left')
    {
      scope.x = 10; // 10px padding from left
      scope.y = this.canvasHeight - scopeSize - 10; // 10px padding from bottom
    }
    else if (config.position === 'bottom-right')
    {
      scope.x = this.canvasWidth - scopeSize - 10; // 10px padding from right
      scope.y = this.canvasHeight - scopeSize - 10; // 10px padding from bottom
    }

    // Create render target
    scope.renderTarget = new THREE.WebGLRenderTarget(renderSize, renderSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      samples: 4
    });
    this.renderTargets.push(scope.renderTarget);

    // Create camera
    this.createScopeCamera(scope);

    // Initialize scope state
    if (scope.type === 'spotting')
    {
      scope.yaw = 0;
      scope.pitch = 0;
      scope.magnification = 4; // Initial 4x magnification
      scope.minMagnification = config.minMagnification;
      scope.maxMagnification = config.maxMagnification;
      scope.initialFOV = config.initialFOV;
    }
    else if (scope.type === 'rifle')
    {
      scope.yaw = 0;
      scope.pitch = 0;
      scope.zoom = config.fovMultiplier; // Initial zoom level
      
      // Calculate movement limits (allow 3x target radius for scope bounding box)
      const scopeBoundingBoxSize = this.targetSize * 3;
      scope.maxYaw = Math.atan(scopeBoundingBoxSize / (2 * this.rangeDistance));
      scope.maxPitch = Math.atan(scopeBoundingBoxSize / (2 * this.rangeDistance));
    }

    // Create view mesh and crosshair
    this.createScopeViewMesh(scope);
    this.createScopeCrosshair(scope);

    return scope;
  }

  /**
   * Create camera for a scope
   */
  createScopeCamera(scope)
  {
    let fov;
    
    if (scope.type === 'spotting')
    {
      fov = scope.config.initialFOV; // Initial FOV for 4x magnification
    }
    else if (scope.type === 'rifle')
    {
      // Calculate FOV for initial zoom
      const fovRadians = Math.atan((scope.config.fovMultiplier * this.targetSize) / this.rangeDistance);
      fov = fovRadians * 180 / Math.PI;
    }

    scope.camera = new THREE.PerspectiveCamera(fov, 1.0, 0.5, 2500);
    
    // Set fixed camera position (never changes)
    scope.camera.position.set(
      this.cameraPosition.x,
      this.cameraPosition.y,
      this.cameraPosition.z
    );
    scope.camera.up.set(0, 1, 0); // Y is up

    // Set initial look-at
    if (scope.type === 'spotting')
    {
      scope.camera.lookAt(0, this.cameraPosition.y, -this.rangeDistance);
    }
    else if (scope.type === 'rifle')
    {
      scope.camera.lookAt(0, this.targetCenterHeight, -this.rangeDistance);
    }
  }

  /**
   * Create circular mask texture for scope overlay
   */
  createCircularMaskTexture(size)
  {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size;
    maskCanvas.height = size;
    const maskCtx = maskCanvas.getContext('2d');

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 5;

    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, size, size);

    maskCtx.fillStyle = 'white';
    maskCtx.beginPath();
    maskCtx.arc(cx, cy, r, 0, Math.PI * 2);
    maskCtx.fill();

    const maskTexture = new THREE.CanvasTexture(maskCanvas);
    this.textures.push(maskTexture);
    return maskTexture;
  }

  /**
   * Create view mesh for a scope
   */
  createScopeViewMesh(scope)
  {
    const size = scope.size;
    const x = scope.x;
    const y = scope.y;

    // Convert screen coordinates to composition camera coordinates
    const canvasW = this.canvasWidth;
    const canvasH = this.canvasHeight;
    const compX = x + size / 2 - canvasW / 2;
    const compY = canvasH / 2 - (y + size / 2);

    // Create circular mask texture
    const maskTexture = this.createCircularMaskTexture(size);

    // Create scope view mesh
    const geometry = new THREE.PlaneGeometry(size, size);
    this.geometries.push(geometry);

    const material = new THREE.MeshBasicMaterial({
      map: scope.renderTarget.texture,
      alphaMap: maskTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.materials.push(material);

    scope.viewMesh = new THREE.Mesh(geometry, material);
    scope.viewMesh.position.set(compX, compY, 1);
    scope.viewMesh.renderOrder = 1;
    scope.viewMesh.frustumCulled = false;

    this.compositionScene.add(scope.viewMesh);
    this.meshes.push(scope.viewMesh);
  }

  /**
   * Create crosshair for a scope
   */
  createScopeCrosshair(scope)
  {
    const size = 1024; // High resolution
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;

    if (scope.config.crosshairType === 'simple')
    {
      // Simple black circular border for spotting scope
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    else if (scope.config.crosshairType === 'reticle')
    {
      // Dark red crosshair for rifle scope
      ctx.strokeStyle = scope.config.crosshairColor || '#8B0000';
      ctx.lineWidth = 4;

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();

      // Black circular border on top
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.textures.push(texture);

    const scopeSize = scope.size;
    const x = scope.x;
    const y = scope.y;
    const canvasW = this.canvasWidth;
    const canvasH = this.canvasHeight;
    const compX = x + scopeSize / 2 - canvasW / 2;
    const compY = canvasH / 2 - (y + scopeSize / 2);

    const geometry = new THREE.PlaneGeometry(scopeSize, scopeSize);
    this.geometries.push(geometry);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.materials.push(material);

    scope.crosshairMesh = new THREE.Mesh(geometry, material);
    scope.crosshairMesh.position.set(compX, compY, 2);
    scope.crosshairMesh.renderOrder = 2;
    scope.crosshairMesh.frustumCulled = false;

    this.compositionScene.add(scope.crosshairMesh);
    this.meshes.push(scope.crosshairMesh);
  }

  /**
   * Get scope by type
   */
  getScope(type)
  {
    return this.scopes.find(scope => scope.type === type);
  }

  /**
   * Render all scopes to their render targets
   */
  renderScopes()
  {
    for (const scope of this.scopes)
    {
      this.renderer.setRenderTarget(scope.renderTarget);
      this.renderer.clear();
      this.renderer.render(this.scene, scope.camera);
    }
    this.renderer.setRenderTarget(null);
  }

  /**
   * Update scope camera orientation and FOV
   * @param {Object} scope - The scope to update
   * @param {Object} userTargetPos - Optional user target position for rifle scope
   */
  updateScopeCamera(scope, userTargetPos = null)
  {
    if (scope.type === 'spotting')
    {
      // Update FOV based on magnification
      scope.camera.fov = scope.initialFOV / scope.magnification;
      scope.camera.updateProjectionMatrix();

      // Calculate look-at target with offsets
      const lookX = this.rangeDistance * Math.tan(scope.yaw);
      const lookY = this.targetCenterHeight + this.rangeDistance * Math.tan(scope.pitch);
      const lookZ = -this.rangeDistance;

      scope.camera.lookAt(lookX, lookY, lookZ);
    }
    else if (scope.type === 'rifle')
    {
      // Update FOV based on zoom
      const targetFrameWidth = this.targetSize;
      const fovRadians = Math.atan((scope.zoom * targetFrameWidth) / this.rangeDistance);
      const fovDegrees = fovRadians * 180 / Math.PI;
      scope.camera.fov = fovDegrees;
      scope.camera.updateProjectionMatrix();

      // Calculate look-at target with offsets relative to user's target
      const baseX = userTargetPos ? userTargetPos.x : 0;
      const baseY = userTargetPos ? userTargetPos.y : this.targetCenterHeight;
      const baseZ = userTargetPos ? userTargetPos.z : -this.rangeDistance;

      const lookX = baseX + this.rangeDistance * Math.tan(scope.yaw);
      const lookY = baseY + this.rangeDistance * Math.tan(scope.pitch);
      const lookZ = baseZ;

      scope.camera.lookAt(lookX, lookY, lookZ);
    }
  }

  /**
   * Dispose all resources
   */
  dispose()
  {
    // Remove meshes from scene
    for (const mesh of this.meshes)
    {
      if (mesh.parent)
      {
        mesh.parent.remove(mesh);
      }
    }

    // Dispose geometries
    for (const geometry of this.geometries)
    {
      geometry.dispose();
    }

    // Dispose materials
    for (const material of this.materials)
    {
      material.dispose();
    }

    // Dispose textures
    for (const texture of this.textures)
    {
      texture.dispose();
    }

    // Dispose render targets
    for (const renderTarget of this.renderTargets)
    {
      renderTarget.dispose();
    }

    // Clear arrays
    this.scopes = [];
    this.meshes = [];
    this.geometries = [];
    this.materials = [];
    this.textures = [];
    this.renderTargets = [];
  }
}

