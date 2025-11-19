/**
 * Scope - FFP (First Focal Plane) scope with shader-based reticle
 * 
 * Renders the 3D scene through a scope view with mrad reticle that scales with zoom.
 * Positioned at bottom-center of composition for future turret overlays on top.
 */

import * as THREE from 'three';

export class Scope {
  constructor(config) {
    this.scene = config.scene;
    this.outputRenderTarget = config.renderTarget; // Render target from CompositionLayer
    this.renderer = config.renderer; // Must use the renderer that created the render target
    
    // Get render target dimensions
    const renderWidth = this.outputRenderTarget.width;
    const renderHeight = this.outputRenderTarget.height;
    
    // FOV settings
    this.currentFOV = config.initialFOV || 30;
    this.minFOV = config.minFOV || 1;
    this.maxFOV = config.maxFOV || 30;
    this.initialFOV = this.currentFOV;
    
    // Camera aim (yaw/pitch in radians)
    this.yaw = 0;
    this.pitch = 0;
    
    // Shooter position
    this.cameraPosition = config.cameraPosition || { x: 0, y: 1, z: 0 };
    this.lookAtBase = config.initialLookAt || { x: 0, y: 0, z: -1000 };
    
    // Create resources
    this.createInternalRenderTarget(renderWidth, renderHeight);
    this.createCamera();
    this.createInternalComposition(renderWidth, renderHeight);
  }
  
  createInternalRenderTarget(width, height) {
    // Internal render target for 3D scene before compositing with reticle
    this.sceneRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      samples: 4 // MSAA
    });
  }
  
  createCamera() {
    this.camera = new THREE.PerspectiveCamera(
      this.currentFOV,
      this.outputRenderTarget.width / this.outputRenderTarget.height,
      0.1,
      3000
    );
    this.camera.position.set(
      this.cameraPosition.x,
      this.cameraPosition.y,
      this.cameraPosition.z
    );
    this.updateCameraLookAt();
  }
  
  updateCameraLookAt() {
    // Apply yaw and pitch to base look-at direction
    const direction = new THREE.Vector3(
      this.lookAtBase.x - this.cameraPosition.x,
      this.lookAtBase.y - this.cameraPosition.y,
      this.lookAtBase.z - this.cameraPosition.z
    ).normalize();
    
    // Apply yaw (horizontal rotation)
    const yawQuat = new THREE.Quaternion();
    yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    direction.applyQuaternion(yawQuat);
    
    // Apply pitch (vertical rotation)
    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(yawQuat);
    const pitchQuat = new THREE.Quaternion();
    pitchQuat.setFromAxisAngle(right, this.pitch);
    direction.applyQuaternion(pitchQuat);
    
    // Set look-at
    const lookAt = new THREE.Vector3(
      this.cameraPosition.x + direction.x * 1000,
      this.cameraPosition.y + direction.y * 1000,
      this.cameraPosition.z + direction.z * 1000
    );
    this.camera.lookAt(lookAt);
  }
  
  createInternalComposition(width, height) {
    // Create internal orthographic scene for compositing 3D scene + reticle
    this.internalScene = new THREE.Scene();
    this.internalCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 10);
    this.internalCamera.position.z = 5;
    
    // Create circular mask texture with actual render target dimensions
    // This ensures the circle stays circular even if render target is not square
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    
    const cx = width / 2;
    const cy = height / 2;
    // Use smaller dimension for radius to ensure circle fits
    const radius = Math.min(width, height) / 2 - 5;
    
    // Black outside, white inside (alpha mask)
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, width, height);
    
    maskCtx.fillStyle = 'white';
    maskCtx.beginPath();
    maskCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    maskCtx.fill();
    
    this.maskTexture = new THREE.CanvasTexture(maskCanvas);
    
    // Create mesh for 3D scene view (with circular mask)
    const viewGeometry = new THREE.PlaneGeometry(1, 1);
    const viewMaterial = new THREE.MeshBasicMaterial({
      map: this.sceneRenderTarget.texture,
      alphaMap: this.maskTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    
    const viewMesh = new THREE.Mesh(viewGeometry, viewMaterial);
    viewMesh.position.set(0, 0, 1);
    viewMesh.renderOrder = 1;
    this.internalScene.add(viewMesh);
    
    // Calculate aspect ratio for shader
    const aspectRatio = width / height;
    
    // Create mesh for reticle overlay
    const reticleGeometry = new THREE.PlaneGeometry(1, 1);
    const reticleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        fov: { value: this.currentFOV },
        scopeRadius: { value: 0.492 },
        aspectRatio: { value: aspectRatio }
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
        uniform float scopeRadius;
        
        varying vec2 vUv;
        
        const vec3 reticleColor = vec3(1.0, 1.0, 1.0); // White
        const vec3 borderColor = vec3(0.0, 0.0, 0.0); // Black
        
        void main() {
          // Center coordinates (-0.5 to 0.5)
          vec2 centered = vUv - 0.5;
          float dist = length(centered);
          float aaWidth = 0.0015;
          
          // Discard outside circle
          if (dist > scopeRadius + aaWidth) {
            discard;
          }
          
          // Calculate mrad per unit (FFP scaling)
          float mradPerUnit = fov * 1000.0 / 60.0;
          
          // Line thickness in mrad
          float mainLineThicknessMrad = 0.1;
          float tickThicknessMrad = 0.075;
          
          // Convert to UV space
          float mainLineThickness = mainLineThicknessMrad / mradPerUnit;
          float tickThickness = tickThicknessMrad / mradPerUnit;
          
          // Tick lengths in mrad
          float majorTickLengthMrad = 1.5;
          float minorTickLengthMrad = 0.75;
          
          float majorTickLength = majorTickLengthMrad / mradPerUnit;
          float minorTickLength = minorTickLengthMrad / mradPerUnit;
          
          // Border calculations
          float borderWidth = 0.015;
          float borderInner = scopeRadius - borderWidth;
          
          // Main crosshair with antialiasing
          float distToHorizontal = abs(centered.y);
          float distToVertical = abs(centered.x);
          
          float horizontalAlpha = smoothstep(mainLineThickness + aaWidth, mainLineThickness - aaWidth, distToHorizontal);
          float verticalAlpha = smoothstep(mainLineThickness + aaWidth, mainLineThickness - aaWidth, distToVertical);
          float crosshairAlpha = max(horizontalAlpha, verticalAlpha);
          
          // Clip crosshair at border
          if (dist > borderInner) {
            crosshairAlpha = 0.0;
          }
          
          // Hash marks
          float hashAlpha = 0.0;
          
          // Calculate mrad coordinates
          float xMrad = centered.x * mradPerUnit;
          float yMrad = centered.y * mradPerUnit;
          
          // Horizontal hash marks
          if (abs(centered.y) < tickThickness * 0.5 && dist < borderInner) {
            float xMod1 = mod(abs(xMrad), 1.0);
            float xMod05 = mod(abs(xMrad), 0.5);
            
            // Major ticks at 1 mrad
            if (xMod1 < 0.05 && abs(centered.x) < majorTickLength * 0.5) {
              hashAlpha = 1.0;
            }
            // Minor ticks at 0.5 mrad
            else if (abs(xMod05) < 0.025 && abs(centered.x) < minorTickLength * 0.5) {
              hashAlpha = 1.0;
            }
          }
          
          // Vertical hash marks
          if (abs(centered.x) < tickThickness * 0.5 && dist < borderInner) {
            float yMod1 = mod(abs(yMrad), 1.0);
            float yMod05 = mod(abs(yMrad), 0.5);
            
            // Major ticks at 1 mrad
            if (yMod1 < 0.05 && abs(centered.y) < majorTickLength * 0.5) {
              hashAlpha = 1.0;
            }
            // Minor ticks at 0.5 mrad
            else if (abs(yMod05) < 0.025 && abs(centered.y) < minorTickLength * 0.5) {
              hashAlpha = 1.0;
            }
          }
          
          // Combine reticle elements
          float reticleAlpha = max(crosshairAlpha, hashAlpha);
          
          // Black border
          float borderAlpha = 0.0;
          if (dist > borderInner) {
            borderAlpha = smoothstep(borderInner - aaWidth, borderInner + aaWidth, dist);
          }
          
          // Final color mixing
          vec4 finalColor = vec4(0.0, 0.0, 0.0, 0.0);
          
          if (borderAlpha > 0.01) {
            finalColor = vec4(borderColor, borderAlpha);
          }
          
          if (reticleAlpha > 0.01) {
            finalColor = vec4(reticleColor, reticleAlpha);
          }
          
          gl_FragColor = finalColor;
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    
    const reticleMesh = new THREE.Mesh(reticleGeometry, reticleMaterial);
    reticleMesh.position.set(0, 0, 2);
    reticleMesh.renderOrder = 2;
    this.internalScene.add(reticleMesh);
    
    // Store material for FOV updates
    this.reticleMaterial = reticleMaterial;
  }
  
  setFOV(fov) {
    this.currentFOV = Math.max(this.minFOV, Math.min(this.maxFOV, fov));
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();
    this.reticleMaterial.uniforms.fov.value = this.currentFOV;
  }
  
  zoomIn(delta = 1) {
    const zoomFactor = 0.9;
    this.setFOV(this.currentFOV * zoomFactor);
  }
  
  zoomOut(delta = 1) {
    const zoomFactor = 1.1;
    this.setFOV(this.currentFOV * zoomFactor);
  }
  
  /**
   * Calculate scaled pan amount based on current zoom level
   * More zoomed in (smaller FOV) = smaller pan movements for finer control
   */
  getScaledPanAmount(baseAmount) {
    // Scale pan amount proportionally to FOV
    // At maxFOV (30°), use full amount
    // At minFOV (1°), use 1/30th of the amount
    return baseAmount * (this.currentFOV / this.maxFOV);
  }
  
  panLeft(baseAmount = 0.005) {
    const amount = this.getScaledPanAmount(baseAmount);
    this.yaw += amount;
    this.updateCameraLookAt();
  }
  
  panRight(baseAmount = 0.005) {
    const amount = this.getScaledPanAmount(baseAmount);
    this.yaw -= amount;
    this.updateCameraLookAt();
  }
  
  panUp(baseAmount = 0.005) {
    const amount = this.getScaledPanAmount(baseAmount);
    this.pitch += amount;
    this.updateCameraLookAt();
  }
  
  panDown(baseAmount = 0.005) {
    const amount = this.getScaledPanAmount(baseAmount);
    this.pitch -= amount;
    this.updateCameraLookAt();
  }
  
  getCamera() {
    return this.camera;
  }
  
  render() {
    // Step 1: Render 3D scene to internal render target
    this.renderer.setRenderTarget(this.sceneRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    
    // Mark texture as updated
    this.sceneRenderTarget.texture.needsUpdate = true;
    
    // Step 2: Composite scene + reticle to output render target
    this.renderer.setRenderTarget(this.outputRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.internalScene, this.internalCamera);
    
    // Mark output texture as updated
    this.outputRenderTarget.texture.needsUpdate = true;
    
    this.renderer.setRenderTarget(null);
  }
  
  dispose() {
    this.sceneRenderTarget.dispose();
    this.maskTexture.dispose();
    this.reticleMaterial.dispose();
    // Note: renderer is owned by CompositionRenderer, don't dispose it here
    
    // Dispose all meshes in internal scene
    this.internalScene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
  }
}

