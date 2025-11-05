/**
 * Scope - Self-contained scope class that handles rendering, movement, and zoom
 * Each scope owns its render target, camera, and composition meshes
 */

import * as THREE from 'three';
import
{
  MirageEffect
}
from './mirage.js';
import { sampleWindAtThreeJsPosition } from '../core/btk.js';

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
    this.rangeDistance = config.rangeDistance;
    this.reticle = config.reticle || false;
    this.focalPlane = config.focalPlane || 'SFP'; // 'FFP' or 'SFP'
    this.maxDialMOA = config.maxDialMOA || 10; // Maximum dial adjustment in MOA (±10 MOA default)

    // FOV limits
    this.minFOV = config.minFOV;
    this.maxFOV = config.maxFOV;
    this.currentFOV = config.initialFOV;
    this.initialFOV = config.initialFOV; // Store for SFP MOA calibration

    // State
    this.yaw = 0;
    this.pitch = 0;
    this.lookAtBase = config.initialLookAt ||
    {
      x: 0,
      y: config.cameraPosition.y,
      z: -config.rangeDistance
    };

    // Zero offset tracking (dial adjustments in MOA)
    this.zeroOffsetYaw = 0; // Horizontal dial (L/R)
    this.zeroOffsetPitch = 0; // Vertical dial (U/D)

    // Calculate scope size and position
    const availableWidth = this.canvasWidth - 20;
    const availableHeight = this.canvasHeight - 20;
    const maxScopeSize = Math.min(availableWidth, availableHeight);
    this.scopeSize = Math.floor(maxScopeSize * config.sizeFraction);
    const renderSize = this.scopeSize; // Render at 1x resolution for performance

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
    this.createCamera(config.cameraPosition);
    this.createViewMesh();
    this.createCrosshair();

    // Create scope dial display (only for rifle scope with reticle)
    if (this.reticle)
    {
      this.createScopeDialDisplay();
    }

    // Create mirage effect and intermediate render target
    this.mirageEffect = new MirageEffect(this.renderer);
    this.mirageTarget = new THREE.WebGLRenderTarget(renderSize, renderSize,
    {
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
    this.renderTarget = new THREE.WebGLRenderTarget(size, size,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      samples: 4
    });
  }

  /**
   * Create perspective camera for this scope
   */
  createCamera(cameraPosition)
  {
    this.camera = new THREE.PerspectiveCamera(this.currentFOV, 1.0, 0.5, 2500);
    this.camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
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
    const material = new THREE.MeshBasicMaterial(
    {
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
   * Create crosshair overlay with shader-based rendering
   */
  createCrosshair()
  {
    const scopeSize = this.scopeSize;
    const x = this.scopeX;
    const y = this.scopeY;
    const compX = x + scopeSize / 2 - this.canvasWidth / 2;
    const compY = this.canvasHeight / 2 - (y + scopeSize / 2);

    const geometry = new THREE.PlaneGeometry(scopeSize, scopeSize);

    // Shader-based rendering for both scopes (with or without reticle)
    const material = new THREE.ShaderMaterial(
    {
      uniforms:
      {
        fov:
        {
          value: this.currentFOV
        },
        reticleFOV:
        {
          value: this.focalPlane === 'FFP' ? this.currentFOV : this.initialFOV
        }, // FFP uses current, SFP uses initial
        scopeRadius:
        {
          value: 0.492
        }, // (512 - 8) / 1024
        hasReticle:
        {
          value: this.reticle ? 1.0 : 0.0
        }
      },
      vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float fov;
        uniform float reticleFOV; // For reticle scaling: current FOV for FFP, initial FOV for SFP
        uniform float scopeRadius;
        uniform float hasReticle;
        
        varying vec2 vUv;
        
        // Red color for reticle (slightly dimmed from pure red)
        const vec3 reticleColor = vec3(0.8, 0.0, 0.0);
        const vec3 borderColor = vec3(0.0, 0.0, 0.0);
        
        void main() {
          // Convert UV to centered coordinates (-0.5 to 0.5)
          vec2 centered = vUv - 0.5;
          float dist = length(centered);
          
          // Antialiasing width (about 1.5 pixels in normalized coords)
          float aaWidth = 0.0015;
          
          // Discard pixels outside the scope circle with smooth edge
          if (dist > scopeRadius + aaWidth) {
            discard;
          }
          
          // Calculate MOA per normalized unit using reticleFOV
          // FFP: reticleFOV = current FOV (reticle scales with zoom)
          // SFP: reticleFOV = initial FOV (reticle stays fixed, calibrated to initial zoom)
          float moaPerUnit = reticleFOV * 60.0;
          
          // Line thickness in MOA (constant angular size for FFP, fixed pixels for SFP)
          float mainLineThicknessMOA = 0.05; // 0.05 MOA line thickness
          float tickThicknessMOA = 0.03; // 0.03 MOA tick thickness
          
          // Convert MOA thickness to normalized coordinates
          // FFP: scales with zoom (thinner when zoomed out, thicker when zoomed in)
          // SFP: stays fixed pixel size (moaPerUnit constant at initial value)
          float mainLineThickness = mainLineThicknessMOA / moaPerUnit;
          float tickThickness = tickThicknessMOA / moaPerUnit;
          
          // Tick mark lengths in MOA (constant angular size)
          float majorTickLengthMOA = 0.75; // 0.75 MOA
          float minorTickLengthMOA = 0.375; // 0.375 MOA
          
          // Convert MOA to normalized coords using reticleFOV
          // FFP: scales with zoom (moaPerUnit changes)
          // SFP: stays fixed (moaPerUnit constant at initial value)
          float majorTickLength = majorTickLengthMOA / moaPerUnit;
          float minorTickLength = minorTickLengthMOA / moaPerUnit;
          
          // Calculate border dimensions first (needed for clipping)
          float borderWidth = 0.008; // ~8 pixels at 1024 resolution
          float borderInner = scopeRadius - borderWidth;
          
          // === RETICLE DRAWING (only if hasReticle == 1.0) ===
          vec4 finalColor = vec4(0.0, 0.0, 0.0, 0.0);
          
          if (hasReticle > 0.5) {
            // Main crosshair lines with antialiasing
            float distToHorizontal = abs(centered.y);
            float distToVertical = abs(centered.x);
            
            float horizontalAlpha = smoothstep(mainLineThickness + aaWidth, mainLineThickness - aaWidth, distToHorizontal);
            float verticalAlpha = smoothstep(mainLineThickness + aaWidth, mainLineThickness - aaWidth, distToVertical);
            float crosshairAlpha = max(horizontalAlpha, verticalAlpha);
            
            // Clip crosshair at inner edge of black border
            if (dist > borderInner) {
              crosshairAlpha = 0.0;
            }
            
            if (crosshairAlpha > 0.01) {
              finalColor = vec4(reticleColor, crosshairAlpha);
            }
          }
          
          // Draw tick marks with antialiasing at 1 MOA intervals (if no crosshair drawn yet)
          if (finalColor.a < 0.01 && hasReticle > 0.5) {
            // Check for tick marks on horizontal line (vertical ticks)
            // Detection area must be larger than the longest tick
            float tickDetectionArea = max(majorTickLength * 1.2, 0.01);
            if (abs(centered.y) < tickDetectionArea) {
              float moaPos = centered.x * moaPerUnit;
              float nearestMoa = floor(moaPos + 0.5);
              float distToTick = abs(moaPos - nearestMoa);
              float distToTickNorm = distToTick / moaPerUnit;
              
              float tickAlpha = smoothstep(tickThickness + aaWidth, tickThickness - aaWidth, distToTickNorm);
              
              if (tickAlpha > 0.01 && abs(nearestMoa) > 0.5) {
                // Major tick every 2 MOA, minor tick every 1 MOA
                bool isMajorTick = mod(abs(nearestMoa), 2.0) < 0.1;
                float tickLength = isMajorTick ? majorTickLength : minorTickLength;
                
                // Use proportional antialiasing width (10% of tick length)
                float tickAA = tickLength * 0.1;
                
                // Tick is visible from center (0) to tickLength, with smooth fade at the end
                float lengthAlpha = 1.0 - smoothstep(tickLength - tickAA, tickLength + tickAA, abs(centered.y));
                
                float tickFinalAlpha = tickAlpha * lengthAlpha;
                
                if (tickFinalAlpha > 0.01) {
                  finalColor = vec4(reticleColor, tickFinalAlpha);
                }
              }
            }
            
            // Check for tick marks on vertical line (horizontal ticks)
            if (finalColor.a < 0.01 && abs(centered.x) < tickDetectionArea) {
              float moaPos = centered.y * moaPerUnit;
              float nearestMoa = floor(moaPos + 0.5);
              float distToTick = abs(moaPos - nearestMoa);
              float distToTickNorm = distToTick / moaPerUnit;
              
              float tickAlpha = smoothstep(tickThickness + aaWidth, tickThickness - aaWidth, distToTickNorm);
              
              if (tickAlpha > 0.01 && abs(nearestMoa) > 0.5) {
                // Major tick every 2 MOA, minor tick every 1 MOA
                bool isMajorTick = mod(abs(nearestMoa), 2.0) < 0.1;
                float tickLength = isMajorTick ? majorTickLength : minorTickLength;
                
                // Use proportional antialiasing width (10% of tick length)
                float tickAA = tickLength * 0.1;
                
                // Tick is visible from center (0) to tickLength, with smooth fade at the end
                float lengthAlpha = 1.0 - smoothstep(tickLength - tickAA, tickLength + tickAA, abs(centered.x));
                
                float tickFinalAlpha = tickAlpha * lengthAlpha;
                
                if (tickFinalAlpha > 0.01) {
                  finalColor = vec4(reticleColor, tickFinalAlpha);
                }
              }
            }
          }
          
          // Draw black circular border with smooth antialiasing (drawn last, on top)
          // borderWidth and borderInner already calculated above
          
          // Smooth transition at outer edge
          float outerAlpha = smoothstep(scopeRadius + aaWidth, scopeRadius - aaWidth, dist);
          
          // Smooth transition at inner edge
          float innerAlpha = smoothstep(borderInner - aaWidth, borderInner + aaWidth, dist);
          
          // Border is visible between inner and outer radius
          float borderAlpha = innerAlpha * outerAlpha;
          
          if (borderAlpha > 0.01) {
            // Border covers everything (blend on top)
            finalColor = mix(finalColor, vec4(borderColor, 1.0), borderAlpha);
          }
          
          // Output final color
          gl_FragColor = finalColor;
        }
      `,
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
  }

  /**
   * Create scope dial display (positioned in lower right corner outside scope circle)
   */
  createScopeDialDisplay()
  {
    const scopeSize = this.scopeSize;
    const x = this.scopeX;
    const y = this.scopeY;
    const compX = x + scopeSize / 2 - this.canvasWidth / 2;
    const compY = this.canvasHeight / 2 - (y + scopeSize / 2);

    // Create canvas for text rendering
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 128;
    this.scopeDialCanvas = canvas;

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.scopeDialTexture = texture;

    // Create mesh for dial display
    // Position in lower right corner, inside the scope circle
    const displayWidth = 150;
    const displayHeight = 60;
    const geometry = new THREE.PlaneGeometry(displayWidth, displayHeight);
    const material = new THREE.MeshBasicMaterial(
    {
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    this.scopeDialMesh = new THREE.Mesh(geometry, material);
    // Position in absolute lower right corner of the canvas
    // Anchor from bottom-right edge with padding
    const canvasRight = this.canvasWidth / 2;
    const canvasBottom = -this.canvasHeight / 2;
    const offsetX = canvasRight - displayWidth / 2 - 10; // 10px padding from right edge
    const offsetY = canvasBottom + displayHeight / 2 + 10; // 10px padding from bottom edge
    this.scopeDialMesh.position.set(offsetX, offsetY, 2);
    this.scopeDialMesh.renderOrder = 3; // Render after crosshair (2)
    this.scopeDialMesh.frustumCulled = false;

    this.compositionScene.add(this.scopeDialMesh);

    // Initialize with 0-0
    this.updateScopeDialDisplay();
  }

  /**
   * Update scope dial display with current zero offset
   */
  updateScopeDialDisplay()
  {
    if (!this.scopeDialCanvas) return;

    const ctx = this.scopeDialCanvas.getContext('2d');
    const canvas = this.scopeDialCanvas;

    // Get dial position
    const dialPos = this.getDialPosition();
    const vertical = dialPos.vertical;
    const horizontal = dialPos.horizontal;

    // Clear canvas (transparent background, no box)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Format elevation and windage - always show both with 3 decimals and direction
    // Note: negative pitch = dial up (U), positive pitch = dial down (D)
    // Note: negative yaw = dial right (R), positive yaw = dial left (L)
    // For zero, arbitrarily show as "up" and "right" (U/R)
    const vStr = `${Math.abs(vertical).toFixed(3)}${vertical <= 0 ? 'U' : 'D'}`;
    const hStr = `${Math.abs(horizontal).toFixed(3)}${horizontal <= 0 ? 'R' : 'L'}`;

    // Draw text in red like the reticle - elevation on top, windage below
    ctx.font = 'bold 36px monospace';
    ctx.fillStyle = '#ff0000'; // Red like the reticle
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // Draw elevation on top, windage below (right-aligned with padding)
    const textX = canvas.width - 10; // 10px padding from right edge
    ctx.fillText(vStr, textX, canvas.height / 2 - 28);
    ctx.fillText(hStr, textX, canvas.height / 2 + 28);

    // Update texture
    if (this.scopeDialTexture)
    {
      this.scopeDialTexture.needsUpdate = true;
    }
  }

  /**
   * Update camera FOV and look-at based on current state
   */
  updateCamera()
  {
    // Update FOV
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();

    // Update reticle shader uniforms
    if (this.crosshairMesh?.material?.uniforms)
    {
      const uniforms = this.crosshairMesh.material.uniforms;
      uniforms.fov.value = this.currentFOV;
      uniforms.reticleFOV.value = this.focalPlane === 'FFP' ? this.currentFOV : this.initialFOV;
    }

    // Calculate look-at target with yaw/pitch offsets + zero offset
    const totalYaw = this.yaw + this.zeroOffsetYaw;
    const totalPitch = this.pitch + this.zeroOffsetPitch;
    const lookX = this.lookAtBase.x + this.rangeDistance * Math.tan(totalYaw);
    const lookY = this.lookAtBase.y + this.rangeDistance * Math.tan(totalPitch);
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
    this.lookAtBase = {
      x,
      y,
      z
    };
  }

  /**
   * Dial scope up (increase zero offset - bullet impacts higher)
   */
  dialUp(moaIncrement)
  {
    const radians = moaIncrement * (Math.PI / 180) / 60;
    const newPitch = this.zeroOffsetPitch - radians;
    const maxRadians = this.maxDialMOA * (Math.PI / 180) / 60;

    // Clamp to ±maxDialMOA
    if (Math.abs(newPitch) <= maxRadians)
    {
      this.zeroOffsetPitch = newPitch;
      this.updateScopeDialDisplay();
    }
  }

  /**
   * Dial scope down (decrease zero offset - bullet impacts lower)
   */
  dialDown(moaIncrement)
  {
    const radians = moaIncrement * (Math.PI / 180) / 60;
    const newPitch = this.zeroOffsetPitch + radians;
    const maxRadians = this.maxDialMOA * (Math.PI / 180) / 60;

    // Clamp to ±maxDialMOA
    if (Math.abs(newPitch) <= maxRadians)
    {
      this.zeroOffsetPitch = newPitch;
      this.updateScopeDialDisplay();
    }
  }

  /**
   * Dial scope left (decrease zero offset - bullet impacts left)
   */
  dialLeft(moaIncrement)
  {
    const radians = moaIncrement * (Math.PI / 180) / 60;
    const newYaw = this.zeroOffsetYaw + radians;
    const maxRadians = this.maxDialMOA * (Math.PI / 180) / 60;

    // Clamp to ±maxDialMOA
    if (Math.abs(newYaw) <= maxRadians)
    {
      this.zeroOffsetYaw = newYaw;
      this.updateScopeDialDisplay();
    }
  }

  /**
   * Dial scope right (increase zero offset - bullet impacts right)
   */
  dialRight(moaIncrement)
  {
    const radians = moaIncrement * (Math.PI / 180) / 60;
    const newYaw = this.zeroOffsetYaw - radians;
    const maxRadians = this.maxDialMOA * (Math.PI / 180) / 60;

    // Clamp to ±maxDialMOA
    if (Math.abs(newYaw) <= maxRadians)
    {
      this.zeroOffsetYaw = newYaw;
      this.updateScopeDialDisplay();
    }
  }

  /**
   * Reset scope to initial state (zero dial, zoom, and center on target)
   */
  resetScope()
  {
    this.zeroOffsetYaw = 0;
    this.zeroOffsetPitch = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.currentFOV = this.initialFOV;
    this.updateCamera();
    this.updateScopeDialDisplay();
  }

  /**
   * Get current dial position in MOA
   */
  getDialPosition()
  {
    const yawMOA = this.zeroOffsetYaw * (180 / Math.PI) * 60;
    const pitchMOA = this.zeroOffsetPitch * (180 / Math.PI) * 60;
    return {
      horizontal: yawMOA,
      vertical: pitchMOA
    };
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
    let intersection = {
      x: 0,
      y: 0,
      z: -this.rangeDistance,
      distance: this.rangeDistance
    };

    // Test ground plane (Y = 0)
    if (lookDir.y !== 0)
    {
      const t = (0 - camPos.y) / lookDir.y;
      if (t > 0)
      {
        const x = camPos.x + lookDir.x * t;
        const z = camPos.z + lookDir.z * t;
        if (x >= -rangeWidth / 2 && x <= rangeWidth / 2 && z >= -this.rangeDistance && z <= 0)
        {
          if (t < closestT)
          {
            closestT = t;
            intersection = {
              x,
              y: 0,
              z,
              distance: -z
            };
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
        if (x >= -rangeWidth / 2 && x <= rangeWidth / 2 && y >= 0 && y <= rangeHeight)
        {
          if (t < closestT)
          {
            closestT = t;
            intersection = {
              x,
              y,
              z: -this.rangeDistance,
              distance: this.rangeDistance
            };
          }
        }
      }
    }

    // Test left plane (X = -rangeWidth/2)
    if (lookDir.x !== 0)
    {
      const t = (-rangeWidth / 2 - camPos.x) / lookDir.x;
      if (t > 0)
      {
        const y = camPos.y + lookDir.y * t;
        const z = camPos.z + lookDir.z * t;
        if (y >= 0 && y <= rangeHeight && z >= -this.rangeDistance && z <= 0)
        {
          if (t < closestT)
          {
            closestT = t;
            intersection = {
              x: -rangeWidth / 2,
              y,
              z,
              distance: -z
            };
          }
        }
      }
    }

    // Test right plane (X = +rangeWidth/2)
    if (lookDir.x !== 0)
    {
      const t = (rangeWidth / 2 - camPos.x) / lookDir.x;
      if (t > 0)
      {
        const y = camPos.y + lookDir.y * t;
        const z = camPos.z + lookDir.z * t;
        if (y >= 0 && y <= rangeHeight && z >= -this.rangeDistance && z <= 0)
        {
          if (t < closestT)
          {
            closestT = t;
            intersection = {
              x: rangeWidth / 2,
              y,
              z,
              distance: -z
            };
          }
        }
      }
    }

    return intersection;
  }

  /**
   * Render scope to its render target with mirage effect
   * @param {Object} windGenerator - Wind generator for mirage effect
   */
  render(windGenerator)
  {
    this.updateCamera();

    // Step 1: Render scene to intermediate mirage target
    this.renderer.setRenderTarget(this.mirageTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // Step 2: Apply mirage effect from mirageTarget to final renderTarget
    if (windGenerator)
    {
      // Calculate where scope's center ray intersects the range bounding box
      // Range box: X from -rangeWidth/2 to +rangeWidth/2, Y from 0 to maxHeight, Z from 0 to -rangeDistance
      const intersection = this.calculateRangeIntersection();

      // Store current wind data for display
      const wind = sampleWindAtThreeJsPosition(windGenerator, intersection.x, intersection.y, intersection.z);
      const windSpeed = Math.sqrt(wind.x * wind.x + wind.z * wind.z);
      const windAngle = Math.atan2(wind.x, -wind.z) * 180 / Math.PI;
      this.currentWind = {
        speed: windSpeed,
        angle: windAngle,
        distance: intersection.distance
      };

      this.mirageEffect.update(
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
   * Get current aim (yaw, pitch in radians)
   */
  getAim()
  {
    return {
      yaw: this.yaw,
      pitch: this.pitch
    };
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
   * Get smoothed wind vector (cross, head) in mph from mirage effect
   */
  getSmoothedWindVector()
  {
    return this.mirageEffect && this.mirageEffect.getSmoothedWindVector ?
      this.mirageEffect.getSmoothedWindVector() :
      {
        x: 0,
        y: 0
      };
  }

  /**
   * Dispose all resources
   */
  dispose()
  {
    // Remove and dispose scope dial display
    if (this.scopeDialMesh)
    {
      if (this.scopeDialMesh.parent)
      {
        this.scopeDialMesh.parent.remove(this.scopeDialMesh);
      }
      if (this.scopeDialMesh.geometry)
      {
        this.scopeDialMesh.geometry.dispose();
      }
      if (this.scopeDialMesh.material)
      {
        this.scopeDialMesh.material.dispose();
      }
      this.scopeDialMesh = null;
    }

    if (this.scopeDialTexture)
    {
      this.scopeDialTexture.dispose();
      this.scopeDialTexture = null;
    }

    this.scopeDialCanvas = null;

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