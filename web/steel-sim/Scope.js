/**
 * Scope - FFP (First Focal Plane) scope with shader-based reticle
 * 
 * Renders the 3D scene through a scope view with mrad reticle that scales with zoom.
 * Positioned at bottom-center of composition for future turret overlays on top.
 */

import * as THREE from 'three';

export class Scope
{
  constructor(config)
  {
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
    this.cameraPosition = config.cameraPosition ||
    {
      x: 0,
      y: 1,
      z: 0
    };
    this.lookAtBase = config.initialLookAt ||
    {
      x: 0,
      y: 0,
      z: -1000
    };

    // Create resources
    this.createInternalRenderTarget(renderWidth, renderHeight);
    this.createCamera();
    this.createInternalComposition(renderWidth, renderHeight);
  }

  createInternalRenderTarget(width, height)
  {
    // Internal render target for 3D scene before compositing with reticle
    this.sceneRenderTarget = new THREE.WebGLRenderTarget(width, height,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      samples: 4 // MSAA
    });
  }

  createCamera()
  {
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

  updateCameraLookAt()
  {
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

  createInternalComposition()
  {
    // Orthographic HUD scene for scope rendering
    this.internalScene = new THREE.Scene();
    this.internalCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.internalCamera.position.z = 5;

    // Black housing disc (background)
    const housingGeom = new THREE.CircleGeometry(1.0, 128);
    const housingMat = new THREE.MeshBasicMaterial(
    {
      color: 0x000000,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const housingMesh = new THREE.Mesh(housingGeom, housingMat);
    housingMesh.position.set(0, 0, 0);
    this.internalScene.add(housingMesh);

    // Main scope view: circle mapped with lit 3D scene texture
    const scopeGeom = new THREE.CircleGeometry(0.98, 128);
    const scopeMat = new THREE.MeshBasicMaterial(
    {
      map: this.sceneRenderTarget.texture,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const scopeMesh = new THREE.Mesh(scopeGeom, scopeMat);
    scopeMesh.position.set(0, 0, 0.01);
    this.internalScene.add(scopeMesh);

    // Simple crosshair using thin bars
    const barThickness = 0.01;
    const barLength = 1.8;
    const barMat = new THREE.MeshBasicMaterial(
    {
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true
    });

    const vertGeom = new THREE.PlaneGeometry(barThickness, barLength);
    const horizGeom = new THREE.PlaneGeometry(barLength, barThickness);

    const vertBar = new THREE.Mesh(vertGeom, barMat);
    vertBar.position.set(0, 0, 0.02);
    this.internalScene.add(vertBar);

    const horizBar = new THREE.Mesh(horizGeom, barMat);
    horizBar.position.set(0, 0, 0.02);
    this.internalScene.add(horizBar);
  }

  setFOV(fov)
  {
    this.currentFOV = Math.max(this.minFOV, Math.min(this.maxFOV, fov));
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();
    this.reticleMaterial.uniforms.fov.value = this.currentFOV;
  }

  zoomIn(delta = 1)
  {
    const zoomFactor = 0.9;
    this.setFOV(this.currentFOV * zoomFactor);
  }

  zoomOut(delta = 1)
  {
    const zoomFactor = 1.1;
    this.setFOV(this.currentFOV * zoomFactor);
  }

  /**
   * Calculate scaled pan amount based on current zoom level
   * More zoomed in (smaller FOV) = smaller pan movements for finer control
   */
  getScaledPanAmount(baseAmount)
  {
    // Scale pan amount proportionally to FOV
    // At maxFOV (30°), use full amount
    // At minFOV (1°), use 1/30th of the amount
    return baseAmount * (this.currentFOV / this.maxFOV);
  }

  panLeft(baseAmount = 0.005)
  {
    const amount = this.getScaledPanAmount(baseAmount);
    this.yaw += amount;
    this.updateCameraLookAt();
  }

  panRight(baseAmount = 0.005)
  {
    const amount = this.getScaledPanAmount(baseAmount);
    this.yaw -= amount;
    this.updateCameraLookAt();
  }

  panUp(baseAmount = 0.005)
  {
    const amount = this.getScaledPanAmount(baseAmount);
    this.pitch += amount;
    this.updateCameraLookAt();
  }

  panDown(baseAmount = 0.005)
  {
    const amount = this.getScaledPanAmount(baseAmount);
    this.pitch -= amount;
    this.updateCameraLookAt();
  }

  getCamera()
  {
    return this.camera;
  }

  render()
  {
    // Step 1: Render 3D scene to internal render target
    this.renderer.setRenderTarget(this.sceneRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // Mark texture as updated
    this.sceneRenderTarget.texture.needsUpdate = true;

    // Step 2: Composite scene + reticle to output render target
    // Clear with transparent color to preserve alpha channel
    this.renderer.setRenderTarget(this.outputRenderTarget);
    this.renderer.setClearColor(0x000000, 0.0); // Transparent black
    this.renderer.clear();
    this.renderer.render(this.internalScene, this.internalCamera);

    // Mark output texture as updated
    this.outputRenderTarget.texture.needsUpdate = true;

    this.renderer.setRenderTarget(null);
  }

  dispose()
  {
    this.sceneRenderTarget.dispose();
    // Dispose all meshes/materials in internal scene
    this.internalScene.traverse((object) =>
    {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
    // Note: renderer is owned by CompositionRenderer, don't dispose it here
  }
}