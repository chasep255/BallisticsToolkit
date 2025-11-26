/**
 * SpottingScope - Spotting scope without reticle, controlled by WASD keyboard
 * 
 * Renders the 3D scene through a scope view without reticle.
 * Positioned at bottom-left of composition.
 * Uses WASD for panning and E/R for zoom (always active, no pointer lock).
 */

import * as THREE from 'three';
import
{
  Config
}
from './config.js';

// Scope FOV specs are always quoted "width in feet at 100 yards".
const SCOPE_SPEC_DISTANCE_YARDS = 100;
const FEET_PER_YARD = 3;

function fovDegFromFeetAtSpecDistance(widthFeet)
{
  const widthYards = widthFeet / FEET_PER_YARD;
  const halfAngle = Math.atan((widthYards / 2) / SCOPE_SPEC_DISTANCE_YARDS);
  return THREE.MathUtils.radToDeg(2 * halfAngle);
}

export class SpottingScope
{
  constructor(config)
  {
    this.scene = config.scene;
    this.outputRenderTarget = config.renderTarget; // Render target from CompositionLayer
    this.renderer = config.renderer; // Must use the renderer that created the render target

    // Scope specifications
    if (config.minZoomX === undefined) throw new Error('SpottingScope config requires minZoomX');
    if (config.maxZoomX === undefined) throw new Error('SpottingScope config requires maxZoomX');
    if (config.lowFovFeet === undefined) throw new Error('SpottingScope config requires lowFovFeet');

    this.minZoomX = config.minZoomX;
    this.maxZoomX = config.maxZoomX;
    this.lowFovFeet = config.lowFovFeet;

    // Derive high FOV feet from low FOV feet using linear magnification relationship
    this.highFovFeet = (this.lowFovFeet * this.minZoomX) / this.maxZoomX;

    // Calculate FOV values from feet specifications
    this.lowFovDeg = fovDegFromFeetAtSpecDistance(this.lowFovFeet);
    this.highFovDeg = fovDegFromFeetAtSpecDistance(this.highFovFeet);

    // Fit FOV(X) = a / X + b through the two spec endpoints
    this.fovA = (this.lowFovDeg - this.highFovDeg) /
      (1 / this.minZoomX - 1 / this.maxZoomX);
    this.fovB = this.lowFovDeg - this.fovA / this.minZoomX;

    // Get render target dimensions
    const renderWidth = this.outputRenderTarget.width;
    const renderHeight = this.outputRenderTarget.height;

    // Zoom/FOV settings
    this.currentZoomX = this.minZoomX; // Start fully zoomed out
    this.currentFOV = this.getFovForZoomX(this.currentZoomX);
    this.minFOVDeg = this.getFovForZoomX(this.minZoomX);
    this.maxFOVDeg = this.getFovForZoomX(this.maxZoomX);
    this.initialFOV = this.currentFOV;

    // Camera aim (yaw/pitch in radians)
    this.yaw = 0;
    this.pitch = 0;
    const maxPanDeg = (config.maxPanDeg !== undefined) ? config.maxPanDeg : (Config.SCOPE_MAX_PAN_DEG || 20);
    this.maxPanAngleRad = THREE.MathUtils.degToRad(maxPanDeg);

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

    // Normalized placement within composition
    this.centerNormalized = config.centerNormalized ||
    {
      x: 0,
      y: 0
    };
    this.heightNormalized = config.heightNormalized || 0;
    this.scopeRadiusNormalized = 0;

    // Pan speed scaling factor (like fclass sim)
    this.panSpeedBase = config.panSpeedBase || 0.1; // radians per second base speed

    // Create resources
    this.createInternalRenderTarget(renderWidth, renderHeight);
    this.createCamera();
    this.createInternalComposition(renderWidth, renderHeight);

    // Derive normalized scope radius
    const hudScopeRadius = 0.98;
    if (this.heightNormalized > 0)
    {
      this.scopeRadiusNormalized = (this.heightNormalized / 2) * hudScopeRadius;
    }
  }

  createInternalRenderTarget(width, height)
  {
    // Internal render target for 3D scene
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
      Config.CAMERA_FAR_PLANE
    );
    this.camera.position.set(
      this.cameraPosition.x,
      this.cameraPosition.y,
      this.cameraPosition.z
    );
    this.updateCameraLookAt();
  }

  /**
   * Resize internal render targets and camera aspect when the scope's
   * output render target has been resized.
   */
  resizeRenderTargets(outputWidth, outputHeight)
  {
    if (this.sceneRenderTarget)
    {
      this.sceneRenderTarget.setSize(outputWidth, outputHeight);
    }

    if (this.camera)
    {
      this.camera.aspect = outputWidth / outputHeight;
      this.camera.updateProjectionMatrix();
    }
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
    // Orthographic scene for scope rendering
    this.internalScene = new THREE.Scene();
    this.internalCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.internalCamera.position.z = 5;

    // Main scope view: circle mapped with lit 3D scene texture
    const scopeRadius = 0.98;
    const scopeGeom = new THREE.CircleGeometry(scopeRadius, 128);
    const scopeTexture = this.sceneRenderTarget.texture;
    const scopeMat = new THREE.MeshBasicMaterial(
    {
      map: scopeTexture,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const scopeMesh = new THREE.Mesh(scopeGeom, scopeMat);
    scopeMesh.position.set(0, 0, 0.01);
    this.internalScene.add(scopeMesh);

    // Thin black housing ring around the glass
    const housingOuterRadius = 1.0;
    const housingGeom = new THREE.RingGeometry(scopeRadius, housingOuterRadius, 128);
    const housingMat = new THREE.MeshStandardMaterial(
    {
      color: 0x000000,
      metalness: 0.9,
      roughness: 0.35,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const housingMesh = new THREE.Mesh(housingGeom, housingMat);
    housingMesh.position.set(0, 0, 0.02);
    this.internalScene.add(housingMesh);

    // Local lighting for metallic look on housing
    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    this.internalScene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(0.4, 0.8, 1.0).normalize();
    this.internalScene.add(dirLight);
  }

  /**
   * Get camera FOV (degrees) for a given zoom X using the fitted model.
   */
  getFovForZoomX(zoomX)
  {
    return this.fovA / zoomX + this.fovB;
  }

  /**
   * Set zoom level in X (e.g. 4–40X) and update camera.
   */
  setZoomX(zoomX)
  {
    const clamped = THREE.MathUtils.clamp(zoomX, this.minZoomX, this.maxZoomX);
    this.currentZoomX = clamped;
    this.currentFOV = this.getFovForZoomX(this.currentZoomX);

    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();
  }

  getZoomX()
  {
    return this.currentZoomX;
  }

  getFovDeg()
  {
    return this.currentFOV;
  }

  getFovRad()
  {
    return THREE.MathUtils.degToRad(this.currentFOV);
  }

  /**
   * Pan scope by explicit yaw/pitch deltas (in radians).
   */
  panBy(deltaYawRad, deltaPitchRad)
  {
    this.yaw = THREE.MathUtils.clamp(this.yaw + deltaYawRad, -this.maxPanAngleRad, this.maxPanAngleRad);
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaPitchRad, -this.maxPanAngleRad, this.maxPanAngleRad);
    this.updateCameraLookAt();
  }

  /**
   * Pan up (increase pitch)
   */
  up(deltaRad)
  {
    this.panBy(0, deltaRad);
  }

  /**
   * Pan down (decrease pitch)
   */
  down(deltaRad)
  {
    this.panBy(0, -deltaRad);
  }

  /**
   * Pan left (increase yaw)
   */
  left(deltaRad)
  {
    this.panBy(deltaRad, 0);
  }

  /**
   * Pan right (decrease yaw)
   */
  right(deltaRad)
  {
    this.panBy(-deltaRad, 0);
  }

  zoomIn()
  {
    const zoomFactor = 1.05; // 5% increase per step (like fclass sim)
    this.setZoomX(this.currentZoomX * zoomFactor);
  }

  zoomOut()
  {
    const zoomFactor = 1.05;
    this.setZoomX(this.currentZoomX / zoomFactor);
  }

  getCamera()
  {
    return this.camera;
  }

  /**
   * Update camera based on key states (called from animation loop)
   * Pan speed scales with FOV (slower when zoomed in)
   */
  updateFromKeys(keyStates, dt)
  {
    const currentFOV = this.getFovDeg();
    const maxFOV = this.getFovForZoomX(this.minZoomX);
    const fovScale = currentFOV / maxFOV; // 1.0 at max zoom out, < 1.0 when zoomed in
    const panSpeed = this.panSpeedBase * fovScale * dt; // Scale with FOV and delta time

    if (keyStates.w) this.up(panSpeed);
    if (keyStates.s) this.down(panSpeed);
    if (keyStates.a) this.left(panSpeed);
    if (keyStates.d) this.right(panSpeed);
  }

  render(dt = 0)
  {
    // Step 1: Render 3D scene to internal render target
    this.renderer.setRenderTarget(this.sceneRenderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // Step 2: Composite scene to output render target
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
  }
}