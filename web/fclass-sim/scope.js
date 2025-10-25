/**
 * Scope - Self-contained scope class that handles rendering, movement, and zoom
 * Each scope owns its render target, camera, and composition meshes
 */

import * as THREE from 'three';
import { MirageEffect } from './mirage-effect.js';

export class Scope
{
  constructor(config)
  {
    // Store configuration
    this.scene = config.scene;
    this.renderer = config.renderer;
    this.compositionScene = config.compositionScene;
    this.canvasWidth = config.canvasWidth;
    this.canvasHeight = config.canvasHeight;
    this.cameraPosition = config.cameraPosition;
    this.rangeDistance = config.rangeDistance;
    this.reticle = config.reticle || false;

    // FOV limits
    this.minFOV = config.minFOV;
    this.maxFOV = config.maxFOV;
    this.currentFOV = config.initialFOV;

    // State
    this.yaw = 0;
    this.pitch = 0;
    this.lookAtBase = config.initialLookAt || { x: 0, y: config.cameraPosition.y, z: -config.rangeDistance };

    // Calculate scope size and position
    const availableWidth = this.canvasWidth - 20;
    const availableHeight = this.canvasHeight - 20;
    const maxScopeSize = Math.min(availableWidth, availableHeight);
    this.scopeSize = Math.floor(maxScopeSize * config.sizeFraction);
    const renderSize = this.scopeSize * 2;

    // Position based on config
    if (config.position === 'bottom-left')
    {
      this.scopeX = 10;
      this.scopeY = this.canvasHeight - this.scopeSize - 10;
    }
    else if (config.position === 'bottom-right')
    {
      this.scopeX = this.canvasWidth - this.scopeSize - 10;
      this.scopeY = this.canvasHeight - this.scopeSize - 10;
    }

    // Create Three.js resources
    this.createRenderTarget(renderSize);
    this.createCamera();
    this.createViewMesh();
    this.createCrosshair();
    
    // Create mirage effect and intermediate render target
    this.mirageEffect = new MirageEffect(this.renderer);
    this.mirageTarget = new THREE.WebGLRenderTarget(renderSize, renderSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      samples: 4
    });
  }

  /**
   * Create WebGL render target for this scope
   */
  createRenderTarget(size)
  {
    this.renderTarget = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      samples: 4
    });
  }

  /**
   * Create perspective camera for this scope
   */
  createCamera()
  {
    this.camera = new THREE.PerspectiveCamera(this.currentFOV, 1.0, 0.5, 2500);
    this.camera.position.set(
      this.cameraPosition.x,
      this.cameraPosition.y,
      this.cameraPosition.z
    );
    this.camera.up.set(0, 1, 0);
    this.updateCamera();
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

    return new THREE.CanvasTexture(maskCanvas);
  }

  /**
   * Create view mesh for composition scene
   */
  createViewMesh()
  {
    const size = this.scopeSize;
    const x = this.scopeX;
    const y = this.scopeY;

    // Convert screen coordinates to composition camera coordinates
    const compX = x + size / 2 - this.canvasWidth / 2;
    const compY = this.canvasHeight / 2 - (y + size / 2);

    // Create circular mask texture
    this.maskTexture = this.createCircularMaskTexture(size);

    // Create scope view mesh
    const geometry = new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshBasicMaterial({
      map: this.renderTarget.texture,
      alphaMap: this.maskTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    this.viewMesh = new THREE.Mesh(geometry, material);
    this.viewMesh.position.set(compX, compY, 1);
    this.viewMesh.renderOrder = 1;
    this.viewMesh.frustumCulled = false;

    this.compositionScene.add(this.viewMesh);
  }

  /**
   * Create crosshair overlay
   */
  createCrosshair()
  {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;

    if (this.reticle)
    {
      // Reticle crosshair
      ctx.strokeStyle = '#8B0000';
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
    else
    {
      // Simple black circular border
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);

    const scopeSize = this.scopeSize;
    const x = this.scopeX;
    const y = this.scopeY;
    const compX = x + scopeSize / 2 - this.canvasWidth / 2;
    const compY = this.canvasHeight / 2 - (y + scopeSize / 2);

    const geometry = new THREE.PlaneGeometry(scopeSize, scopeSize);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    this.crosshairMesh = new THREE.Mesh(geometry, material);
    this.crosshairMesh.position.set(compX, compY, 2);
    this.crosshairMesh.renderOrder = 2;
    this.crosshairMesh.frustumCulled = false;

    this.compositionScene.add(this.crosshairMesh);
    this.crosshairTexture = texture;
  }

  /**
   * Update camera FOV and look-at based on current state
   */
  updateCamera()
  {
    // Update FOV
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();

    // Calculate look-at target with yaw/pitch offsets
    const lookX = this.lookAtBase.x + this.rangeDistance * Math.tan(this.yaw);
    const lookY = this.lookAtBase.y + this.rangeDistance * Math.tan(this.pitch);
    const lookZ = this.lookAtBase.z;

    this.camera.lookAt(lookX, lookY, lookZ);
  }

  /**
   * Move scope left by MOA increment
   */
  left(moaIncrement)
  {
    const radians = moaIncrement * (Math.PI / 180) / 60;
    this.yaw -= radians;
  }

  /**
   * Move scope right by MOA increment
   */
  right(moaIncrement)
  {
    const radians = moaIncrement * (Math.PI / 180) / 60;
    this.yaw += radians;
  }

  /**
   * Move scope up by MOA increment
   */
  up(moaIncrement)
  {
    const radians = moaIncrement * (Math.PI / 180) / 60;
    this.pitch += radians;
  }

  /**
   * Move scope down by MOA increment
   */
  down(moaIncrement)
  {
    const radians = moaIncrement * (Math.PI / 180) / 60;
    this.pitch -= radians;
  }

  /**
   * Zoom in (divide FOV by factor)
   */
  zoomIn(factor)
  {
    this.currentFOV = Math.max(this.minFOV, this.currentFOV / factor);
  }

  /**
   * Zoom out (multiply FOV by factor)
   */
  zoomOut(factor)
  {
    this.currentFOV = Math.min(this.maxFOV, this.currentFOV * factor);
  }

  /**
   * Set base look-at position (yaw/pitch offsets applied relative to this)
   */
  lookAt(x, y, z)
  {
    this.lookAtBase = { x, y, z };
  }

  /**
   * Calculate where the scope's center ray intersects the range bounding box
   * @returns {Object} Intersection point {x, y, z, distance}
   */
  calculateRangeIntersection()
  {
    // Range bounding box dimensions (in yards)
    const rangeWidth = 50; // Assume 50 yards wide (adjust as needed)
    const rangeHeight = 20; // Assume 20 yards tall (adjust as needed)
    
    // Camera position (shooter position)
    const camPos = this.camera.position;
    
    // Calculate look direction from camera (center of view)
    const lookDir = new THREE.Vector3(0, 0, -1);
    lookDir.applyQuaternion(this.camera.quaternion);
    lookDir.normalize();
    
    // Ray from camera in look direction
    // We need to find where this ray intersects the range box
    
    // Range box bounds:
    // X: -rangeWidth/2 to +rangeWidth/2
    // Y: 0 (ground) to rangeHeight
    // Z: 0 (shooter) to -rangeDistance (target)
    
    // Test intersection with each plane and find the closest valid one
    let closestT = Infinity;
    let intersection = { x: 0, y: 0, z: -this.rangeDistance, distance: this.rangeDistance };
    
    // Test ground plane (Y = 0)
    if (lookDir.y !== 0)
    {
      const t = (0 - camPos.y) / lookDir.y;
      if (t > 0)
      {
        const x = camPos.x + lookDir.x * t;
        const z = camPos.z + lookDir.z * t;
        if (x >= -rangeWidth/2 && x <= rangeWidth/2 && z >= -this.rangeDistance && z <= 0)
        {
          if (t < closestT)
          {
            closestT = t;
            intersection = { x, y: 0, z, distance: -z };
          }
        }
      }
    }
    
    // Test back plane (Z = -rangeDistance, the target area)
    if (lookDir.z !== 0)
    {
      const t = (-this.rangeDistance - camPos.z) / lookDir.z;
      if (t > 0)
      {
        const x = camPos.x + lookDir.x * t;
        const y = camPos.y + lookDir.y * t;
        if (x >= -rangeWidth/2 && x <= rangeWidth/2 && y >= 0 && y <= rangeHeight)
        {
          if (t < closestT)
          {
            closestT = t;
            intersection = { x, y, z: -this.rangeDistance, distance: this.rangeDistance };
          }
        }
      }
    }
    
    // Test left plane (X = -rangeWidth/2)
    if (lookDir.x !== 0)
    {
      const t = (-rangeWidth/2 - camPos.x) / lookDir.x;
      if (t > 0)
      {
        const y = camPos.y + lookDir.y * t;
        const z = camPos.z + lookDir.z * t;
        if (y >= 0 && y <= rangeHeight && z >= -this.rangeDistance && z <= 0)
        {
          if (t < closestT)
          {
            closestT = t;
            intersection = { x: -rangeWidth/2, y, z, distance: -z };
          }
        }
      }
    }
    
    // Test right plane (X = +rangeWidth/2)
    if (lookDir.x !== 0)
    {
      const t = (rangeWidth/2 - camPos.x) / lookDir.x;
      if (t > 0)
      {
        const y = camPos.y + lookDir.y * t;
        const z = camPos.z + lookDir.z * t;
        if (y >= 0 && y <= rangeHeight && z >= -this.rangeDistance && z <= 0)
        {
          if (t < closestT)
          {
            closestT = t;
            intersection = { x: rangeWidth/2, y, z, distance: -z };
          }
        }
      }
    }
    
    return intersection;
  }
  
  /**
   * Render scope to its render target with mirage effect
   * @param {Object} windGenerator - Wind generator for mirage effect
   * @param {number} time - Current time in seconds for animation
   */
  render(windGenerator, time)
  {
    this.updateCamera();
    
    // Step 1: Render scene to intermediate mirage target
    this.renderer.setRenderTarget(this.mirageTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    
    // Step 2: Apply mirage effect from mirageTarget to final renderTarget
    if (windGenerator && time !== undefined)
    {
      // Calculate where scope's center ray intersects the range bounding box
      // Range box: X from -rangeWidth/2 to +rangeWidth/2, Y from 0 to maxHeight, Z from 0 to -rangeDistance
      const intersection = this.calculateRangeIntersection();
      
      // Store current wind data for display
      const wind = windGenerator.getWindAt(intersection.x, intersection.y, intersection.z, time);
      const windSpeed = Math.sqrt(wind.x * wind.x + wind.z * wind.z);
      const windAngle = Math.atan2(wind.x, -wind.z) * 180 / Math.PI;
      this.currentWind = {
        speed: windSpeed,
        angle: windAngle,
        distance: intersection.distance
      };
      
      this.mirageEffect.update(
        time,
        this.currentFOV,
        windGenerator,
        intersection
      );
      this.mirageEffect.apply(this.mirageTarget.texture, this.renderTarget);
    }
    else
    {
      // Fallback: copy without mirage effect
      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.currentWind = null;
    }
    
    this.renderer.setRenderTarget(null);
  }

  /**
   * Get render target texture
   */
  getTexture()
  {
    return this.renderTarget.texture;
  }

  /**
   * Get view mesh for composition
   */
  getMesh()
  {
    return this.viewMesh;
  }

  /**
   * Get current aim (yaw, pitch in radians)
   */
  getAim()
  {
    return { yaw: this.yaw, pitch: this.pitch };
  }


  /**
   * Get current FOV in degrees
   */
  getFOV()
  {
    return this.currentFOV;
  }

  /**
   * Get current wind data (speed, angle, distance)
   */
  getWindData()
  {
    return this.currentWind;
  }

  /**
   * Get smoothed wind speed from mirage effect
   */
  getSmoothedWindSpeed()
  {
    return this.mirageEffect ? this.mirageEffect.getSmoothedWindSpeed() : 0;
  }

  /**
   * Dispose all resources
   */
  dispose()
  {
    // Remove and dispose view mesh
    if (this.viewMesh)
    {
      if (this.viewMesh.parent)
      {
        this.viewMesh.parent.remove(this.viewMesh);
      }
      if (this.viewMesh.geometry)
      {
        this.viewMesh.geometry.dispose();
      }
      if (this.viewMesh.material)
      {
        // Don't dispose material.map (render target texture) - it's disposed separately
        this.viewMesh.material.map = null;
        this.viewMesh.material.alphaMap = null;
        this.viewMesh.material.dispose();
      }
      this.viewMesh = null;
    }

    // Remove and dispose crosshair mesh
    if (this.crosshairMesh)
    {
      if (this.crosshairMesh.parent)
      {
        this.crosshairMesh.parent.remove(this.crosshairMesh);
      }
      if (this.crosshairMesh.geometry)
      {
        this.crosshairMesh.geometry.dispose();
      }
      if (this.crosshairMesh.material)
      {
        this.crosshairMesh.material.dispose();
      }
      this.crosshairMesh = null;
    }

    // Dispose textures
    if (this.maskTexture)
    {
      this.maskTexture.dispose();
      this.maskTexture = null;
    }
    if (this.crosshairTexture)
    {
      this.crosshairTexture.dispose();
      this.crosshairTexture = null;
    }

    // Dispose render target (this also disposes the texture)
    if (this.renderTarget)
    {
      this.renderTarget.dispose();
      this.renderTarget = null;
    }
    
    // Dispose mirage effect and target
    if (this.mirageEffect)
    {
      this.mirageEffect.dispose();
      this.mirageEffect = null;
    }
    if (this.mirageTarget)
    {
      this.mirageTarget.dispose();
      this.mirageTarget = null;
    }

    // Null out camera reference (not owned by us, don't dispose)
    this.camera = null;
  }
}

