/**
 * Scope - FFP (First Focal Plane) scope with optional geometry-based reticle
 * 
 * Renders the 3D scene through a scope view. Can optionally include:
 * - MRAD reticle that scales with zoom (FFP)
 * - Dial adjustments for elevation/windage
 * 
 * Used for both rifle scope (with reticle/dials) and spotting scope (without).
 */

import * as THREE from 'three';
import
{
  Config
}
from './config.js';
import
{
  RenderStats
}
from './RenderStats.js';

// Reticle mapping constant.
// In the original shader-based implementation, the relationship between
// FOV (degrees), reticle "units" (the local reticle geometry space) and
// milliradians was:
//   mradPerUnit = fovDeg * (1000.0 / 60.0)
// The 1000/60 factor was tuned so that at ~60° FOV, one reticle unit
// corresponds to roughly 1 mrad at 1000 yards. We keep the same slope here
// so this geometry-based reticle matches the old visual behavior.
const MRAD_PER_UNIT_SLOPE = 1000.0 / 60.0;

// Scope FOV specs are always quoted "width in feet at 100 yards".
// Keep the 100 yards and 3 ft/yd factors explicit so there are no magic numbers.
const SCOPE_SPEC_DISTANCE_YARDS = 100;
const FEET_PER_YARD = 3;

function fovDegFromFeetAtSpecDistance(widthFeet)
{
  const widthYards = widthFeet / FEET_PER_YARD;
  const halfAngle = Math.atan((widthYards / 2) / SCOPE_SPEC_DISTANCE_YARDS);
  return THREE.MathUtils.radToDeg(2 * halfAngle);
}

export class Scope
{
  constructor(config)
  {
    this.scene = config.scene;
    this.outputRenderTarget = config.renderTarget; // Render target from CompositionLayer
    this.renderer = config.renderer; // Must use the renderer that created the render target
    this.layer = config.layer; // Reference to CompositionLayer for reading position/size
    // Scope specifications - these define what scope this instance is.
    if (config.minZoomX === undefined) throw new Error('Scope config requires minZoomX');
    if (config.maxZoomX === undefined) throw new Error('Scope config requires maxZoomX');
    if (config.lowFovFeet === undefined) throw new Error('Scope config requires lowFovFeet');

    this.minZoomX = config.minZoomX;
    this.maxZoomX = config.maxZoomX;
    this.lowFovFeet = config.lowFovFeet;

    // Derive high FOV feet from low FOV feet using linear magnification relationship:
    //   FOV_width ∝ 1 / magnification
    // => highFovFeet = (lowFovFeet * minZoomX) / maxZoomX
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
    console.log(`[Scope] Initial render target: ${renderWidth}x${renderHeight}`);

    // Zoom/FOV settings based on real scope spec
    this.currentZoomX = this.minZoomX; // Start fully zoomed out

    this.currentFOV = this.getFovForZoomX(this.currentZoomX);
    this.minFOVDeg = this.getFovForZoomX(this.minZoomX);
    this.maxFOVDeg = this.getFovForZoomX(this.maxZoomX);
    this.initialFOV = this.currentFOV;

    // Camera aim (yaw/pitch in radians)
    this.yaw = 0;
    this.pitch = 0;
    const maxPanDeg = (config.maxPanDeg !== undefined) ? config.maxPanDeg : (Config.SCOPE_MAX_PAN_DEG || 20);
    this.maxPanAngleRad = THREE.MathUtils.degToRad(maxPanDeg); // Limit scope horizontal movement

    // Separate limits for pitch up and down
    const maxPitchUpDeg = (config.maxPitchUpDeg !== undefined) ? config.maxPitchUpDeg : (Config.SCOPE_MAX_PITCH_UP_DEG || 10);
    const maxPitchDownDeg = (config.maxPitchDownDeg !== undefined) ? config.maxPitchDownDeg : (Config.SCOPE_MAX_PITCH_DOWN_DEG || 10);
    this.maxPitchUpRad = THREE.MathUtils.degToRad(maxPitchUpDeg);
    this.maxPitchDownRad = THREE.MathUtils.degToRad(maxPitchDownDeg);

    // Feature flags
    this.hasReticle = config.hasReticle !== undefined ? config.hasReticle : true;
    this.hasDials = config.hasDials !== undefined ? config.hasDials : true;

    // Scope dial adjustments (integer clicks to avoid floating-point errors)
    // Only used if hasDials is true
    this.elevationClicks = 0; // Positive = dial up (bullet impacts high)

    // Render statistics collector (optional, passed from parent)
    this.renderStats = config.renderStats || null;
    this.windageClicks = 0; // Positive = dial right (bullet impacts right)

    // Dial constants
    this.CLICK_VALUE_MRAD = 0.1; // Each click is 0.1 MRAD
    this.maxDialMRAD = config.maxDialMRAD || 30.0; // Maximum dial adjustment in MRAD (±30 MRAD default)
    this.maxDialClicks = Math.floor(this.maxDialMRAD / this.CLICK_VALUE_MRAD);

    // Audio manager for scope click sounds (optional)
    this.audioManager = config.audioManager || null;

    // Pan speed for keyboard control (used by spotting scope)
    this.panSpeedBase = config.panSpeedBase || 0.1; // radians per second base speed

    // Depth texture for blur effects (captured from scene render)
    this.depthTexture = null;
    
    // Focal distance for depth-of-field blur (in yards)
    this.focalDistance = config.focalDistance || 100; // Default 100 yards
    
    // Physical scope parameters
    // 56mm objective lens (diameter) and virtual sensor width behind the scope
    this.objectiveDiameter = 0.056; // meters (56mm)
    this.sensorWidth = 0.024;       // meters (24mm effective sensor/eye width)
    
    // Optical effects (depth-of-field blur) enabled flag
    this.opticalEffectsEnabled = config.opticalEffectsEnabled !== undefined ? config.opticalEffectsEnabled : true;
    
    // Blur render target (blurred scene)
    this.blurRenderTarget = null;
    this.blurScene = null;
    this.blurCamera = null;
    this.blurMesh = null;

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

    // Derived normalized scope radius (computed from layer height)
    this.scopeRadiusNormalized = 0;

    // Create resources
    this.createInternalRenderTarget(renderWidth, renderHeight);
    this.createCamera();
    this.createBlurPass();

    this.createInternalComposition(renderWidth, renderHeight);

    // Derive normalized scope radius (matches scopeRadius in HUD)
    const hudScopeRadius = 0.98; // must match scopeRadius in createInternalComposition
    if (this.layer && this.layer.height > 0)
    {
      this.scopeRadiusNormalized = (this.layer.height / 2) * hudScopeRadius;
    }
  }

  // No static helpers here; Scope owns its own geometry/materials.

  createInternalRenderTarget(width, height)
  {
    // Internal render target for 3D scene before compositing with reticle
    // Enable depth texture capture for blur effects
    this.sceneRenderTarget = new THREE.WebGLRenderTarget(width, height,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthTexture: new THREE.DepthTexture(width, height),
      samples: 4 // MSAA
    });
    
    // Store reference to depth texture
    this.depthTexture = this.sceneRenderTarget.depthTexture;
    
    // Blur render targets for separable Gaussian blur (horizontal then vertical)
    this.blurRenderTargetHorizontal = new THREE.WebGLRenderTarget(width, height,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });
    this.blurRenderTarget = new THREE.WebGLRenderTarget(width, height,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });
  }
  
  createBlurPass()
  {
    // Scene for blur pass (fullscreen quad)
    this.blurScene = new THREE.Scene();
    this.blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    // Convert focal distance from yards to meters
    const METERS_PER_YARD = 0.9144;
    const focalDistanceMeters = this.focalDistance * METERS_PER_YARD;
    
    // Separable Gaussian blur shader (horizontal pass)
    // This shader calculates blur radius from depth and performs horizontal blur
    const blurShaderHorizontal = new THREE.ShaderMaterial({
      uniforms: {
        sceneTexture:    { value: this.sceneRenderTarget.texture },
        depthTexture:    { value: this.depthTexture },
        resolution:      { value: new THREE.Vector2(this.blurRenderTargetHorizontal.width, this.blurRenderTargetHorizontal.height) },
        focalDistance:   { value: focalDistanceMeters },
        cameraNear:      { value: Config.CAMERA_NEAR_PLANE },
        cameraFar:       { value: Config.CAMERA_FAR_PLANE },
        maxBlurRadius:   { value: 8.0 },
        lensFocalLength: { value: 0.3 },
        lensFNumber:     { value: 4.0 },
        sensorWidth:     { value: this.sensorWidth }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D sceneTexture;
        uniform sampler2D depthTexture;
        uniform vec2  resolution;
        uniform float focalDistance;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float maxBlurRadius;
        uniform float lensFocalLength;
        uniform float lensFNumber;
        uniform float sensorWidth;
        varying vec2 vUv;
        
        float perspectiveDepthToViewZ(const in float fragCoordZ,
                                      const in float near,
                                      const in float far) {
          return (near * far) / ((far - near) * fragCoordZ - far);
        }
        
        float depthToDistance(float depth) {
          float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
          return -viewZ;
        }
        
        void main() {
          float depth    = texture2D(depthTexture, vUv).r;
          float distance = depthToDistance(depth);
          
          float eps = 0.001;
          float d   = clamp(distance, cameraNear + eps, cameraFar);
          
          float F  = lensFocalLength;
          float N  = lensFNumber;
          float df = max(focalDistance, F + eps);
          
          float CoC = abs((F * F / (N * (df - F))) * ((d - df) / d));
          
          const float DOF_STRENGTH = 5.0;
          float blurPixels = DOF_STRENGTH * CoC * (2.0 * lensFocalLength) / (sensorWidth * sensorWidth);
          
          float blurRadius = clamp(blurPixels, 0.0, maxBlurRadius);
          
          if (blurRadius < 0.1) {
            gl_FragColor = texture2D(sceneTexture, vUv);
            return;
          }
          
          // Separable horizontal Gaussian blur
          vec2 texelSize = vec2(1.0 / resolution.x, 0.0);
          vec4 color = vec4(0.0);
          float totalWeight = 0.0;
          
          int samples = int(ceil(blurRadius * 2.0));
          samples = min(samples, 16);
          
          for (int i = -samples; i <= samples; i++) {
            vec2 offset = vec2(float(i), 0.0) * texelSize;
            float dist = abs(float(i));
            
            if (dist > blurRadius) continue;
            
            float weight = exp(-(dist * dist) / (2.0 * blurRadius * blurRadius));
            color += texture2D(sceneTexture, vUv + offset) * weight;
            totalWeight += weight;
          }
          
          gl_FragColor = color / max(totalWeight, 0.0001);
        }
      `
    });
    
    // Vertical blur shader (uses horizontal blur result as input)
    const blurShaderVertical = new THREE.ShaderMaterial({
      uniforms: {
        sceneTexture:    { value: this.blurRenderTargetHorizontal.texture },
        depthTexture:    { value: this.depthTexture },
        resolution:      { value: new THREE.Vector2(this.blurRenderTarget.width, this.blurRenderTarget.height) },
        focalDistance:   { value: focalDistanceMeters },
        cameraNear:      { value: Config.CAMERA_NEAR_PLANE },
        cameraFar:       { value: Config.CAMERA_FAR_PLANE },
        maxBlurRadius:   { value: 8.0 },
        lensFocalLength: { value: 0.3 },
        lensFNumber:     { value: 4.0 },
        sensorWidth:     { value: this.sensorWidth }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D sceneTexture;
        uniform sampler2D depthTexture;
        uniform vec2  resolution;
        uniform float focalDistance;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float maxBlurRadius;
        uniform float lensFocalLength;
        uniform float lensFNumber;
        uniform float sensorWidth;
        varying vec2 vUv;
        
        float perspectiveDepthToViewZ(const in float fragCoordZ,
                                      const in float near,
                                      const in float far) {
          return (near * far) / ((far - near) * fragCoordZ - far);
        }
        
        float depthToDistance(float depth) {
          float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
          return -viewZ;
        }
        
        void main() {
          float depth    = texture2D(depthTexture, vUv).r;
          float distance = depthToDistance(depth);
          
          float eps = 0.001;
          float d   = clamp(distance, cameraNear + eps, cameraFar);
          
          float F  = lensFocalLength;
          float N  = lensFNumber;
          float df = max(focalDistance, F + eps);
          
          float CoC = abs((F * F / (N * (df - F))) * ((d - df) / d));
          
          const float DOF_STRENGTH = 5.0;
          float blurPixels = DOF_STRENGTH * CoC * (2.0 * lensFocalLength) / (sensorWidth * sensorWidth);
          
          float blurRadius = clamp(blurPixels, 0.0, maxBlurRadius);
          
          if (blurRadius < 0.1) {
            gl_FragColor = texture2D(sceneTexture, vUv);
            return;
          }
          
          // Separable vertical Gaussian blur
          vec2 texelSize = vec2(0.0, 1.0 / resolution.y);
          vec4 color = vec4(0.0);
          float totalWeight = 0.0;
          
          int samples = int(ceil(blurRadius * 2.0));
          samples = min(samples, 16);
          
          for (int i = -samples; i <= samples; i++) {
            vec2 offset = vec2(0.0, float(i)) * texelSize;
            float dist = abs(float(i));
            
            if (dist > blurRadius) continue;
            
            float weight = exp(-(dist * dist) / (2.0 * blurRadius * blurRadius));
            color += texture2D(sceneTexture, vUv + offset) * weight;
            totalWeight += weight;
          }
          
          gl_FragColor = color / max(totalWeight, 0.0001);
        }
      `
    });
    
    const quad = new THREE.PlaneGeometry(2, 2);
    this.blurMeshHorizontal = new THREE.Mesh(quad, blurShaderHorizontal);
    this.blurMeshVertical = new THREE.Mesh(quad, blurShaderVertical);
    this.blurScene.add(this.blurMeshHorizontal);
    this.blurScene.add(this.blurMeshVertical);
  }

  createCamera()
  {
    // Use tighter far plane for better depth precision (from config, in meters)
    this.camera = new THREE.PerspectiveCamera(
      this.currentFOV,
      this.outputRenderTarget.width / this.outputRenderTarget.height,
      Config.CAMERA_NEAR_PLANE,
      Config.CAMERA_FAR_PLANE
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

    // Main scope view: circle mapped with scene texture (will be blurred if optical effects enabled)
    const scopeRadius = 0.98;
    const scopeGeom = new THREE.CircleGeometry(scopeRadius, 64);
    const scopeTexture = this.sceneRenderTarget.texture; // Start with raw scene texture
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
    this.scopeMesh = scopeMesh; // Store reference for texture updates

    // Stencil mask: defines circular aperture for reticle elements (only if reticle enabled)
    if (this.hasReticle)
    {
      const maskGeom = new THREE.CircleGeometry(scopeRadius, 64);
      const maskMat = new THREE.MeshBasicMaterial(
      {
        colorWrite: false,
        depthWrite: false,
        depthTest: false,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilZPass: THREE.ReplaceStencilOp
      });
      const maskMesh = new THREE.Mesh(maskGeom, maskMat);
      maskMesh.position.set(0, 0, 0.015);
      this.internalScene.add(maskMesh);
    }

    // Thin black housing ring around the glass (simple geometry)
    const housingOuterRadius = 1.0; // controls thickness
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

    // Reticle group built in MRAD space, then mapped into HUD units (only if reticle enabled)
    if (this.hasReticle)
    {
      this.reticleGroup = new THREE.Group();
      this.reticleGroup.position.set(0, 0, 0.02);
      this.internalScene.add(this.reticleGroup);

      // Shared metallic material for reticle elements
      const reticleMaterial = new THREE.MeshStandardMaterial(
      {
        color: 0x050505, // very dark, reads as black but allows specular
        metalness: 0.9,
        roughness: 0.25,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.EqualStencilFunc,
        stencilZPass: THREE.KeepStencilOp
      });
      this.reticleMaterial = reticleMaterial;

      // Initialize instanced reticle system
      this.reticleLineInstances = []; // Store instance data for lines
      this.reticleLineMesh = null; // InstancedMesh for all reticle lines

      // Build reticle using MRAD-space helpers
      this.buildReticle();

      // Create instanced mesh after collecting all line data
      this.createInstancedReticle();

      // Apply initial FFP scaling (and map from [-0.5,0.5] reticle space to [-1,1] HUD space)
      this.updateReticleScale();
    }
    else
    {
      this.reticleGroup = null;
      this.reticleMaterial = null;
      this.reticleLineInstances = null;
      this.reticleLineMesh = null;
    }

    // Local lighting for metallic look on housing + reticle
    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    this.internalScene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(0.4, 0.8, 1.0).normalize();
    this.internalScene.add(dirLight);
  }

  /**
   * Convert a MRAD distance into local reticle units at a given FOV.
   * Matches the previous shader behavior: mradPerUnit = fovDeg * 1000 / 60.
   * Scope is circular (1:1 aspect), so horizontal FOV = vertical FOV.
   */
  mradToReticleUnitsAtFov(mrad, fovDeg)
  {
    const mradPerUnit = fovDeg * MRAD_PER_UNIT_SLOPE;
    return mrad / mradPerUnit;
  }

  /**
   * Convert a normalized composition delta into yaw/pitch radians.
   * This keeps the mapping between screen-space movement and scope
   * rotation independent of canvas resolution.
   */
  normalizedDeltaToAngles(deltaNormX, deltaNormY)
  {
    // Single sensitivity so horizontal and vertical feel identical.
    const sensitivity = this.getFovRad() / 2;
    const deltaYaw = -deltaNormX * sensitivity;
    const deltaPitch = -deltaNormY * sensitivity;
    return {
      deltaYaw,
      deltaPitch
    };
  }

  /**
   * Get camera FOV (degrees) for a given zoom X using the fitted model.
   */
  getFovForZoomX(zoomX)
  {
    return this.fovA / zoomX + this.fovB;
  }

  /**
   * Set zoom level in X (e.g. 4–40X) and update camera + reticle scaling.
   */
  setZoomX(zoomX)
  {
    const clamped = THREE.MathUtils.clamp(zoomX, this.minZoomX, this.maxZoomX);
    this.currentZoomX = clamped;
    this.currentFOV = this.getFovForZoomX(this.currentZoomX);

    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();
    if (this.hasReticle)
    {
      this.updateReticleScale();
    }
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
   * Test if a normalized composition-space point is inside the scope circle.
   */
  isPointInside(normX, normY)
  {
    if (!this.scopeRadiusNormalized || !this.layer) return false;

    const pos = this.layer.getPosition();
    const dx = normX - pos.x;
    const dy = normY - pos.y;
    return dx * dx + dy * dy <= this.scopeRadiusNormalized * this.scopeRadiusNormalized;
  }

  /**
   * Add a line segment defined in MRAD space to the reticle group.
   * Stores instance data for later instanced mesh creation.
   */
  addLineMrad(x1Mrad, y1Mrad, x2Mrad, y2Mrad, thicknessMrad)
  {
    if (!this.hasReticle || !this.reticleGroup || !this.reticleMaterial) return;

    const x1 = this.mradToReticleUnitsAtFov(x1Mrad, this.initialFOV);
    const y1 = this.mradToReticleUnitsAtFov(y1Mrad, this.initialFOV);
    const x2 = this.mradToReticleUnitsAtFov(x2Mrad, this.initialFOV);
    const y2 = this.mradToReticleUnitsAtFov(y2Mrad, this.initialFOV);

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= 0.0) return;

    const thickness = this.mradToReticleUnitsAtFov(thicknessMrad, this.initialFOV);
    const angle = Math.atan2(dy, dx);
    const centerX = (x1 + x2) * 0.5;
    const centerY = (y1 + y2) * 0.5;

    // Store instance data for instanced mesh creation
    this.reticleLineInstances.push({
      position: new THREE.Vector3(centerX, centerY, 0),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle),
      scale: new THREE.Vector3(length, thickness, 1)
    });
  }

  /**
   * Create instanced mesh for all reticle lines after collecting instance data.
   */
  createInstancedReticle()
  {
    if (!this.hasReticle || this.reticleLineInstances.length === 0) return;

    // Create base unit-length plane geometry (will be scaled per instance)
    const baseGeometry = new THREE.PlaneGeometry(1, 1);
    baseGeometry.computeVertexNormals();

    // Create instanced mesh for all lines
    this.reticleLineMesh = new THREE.InstancedMesh(
      baseGeometry,
      this.reticleMaterial,
      this.reticleLineInstances.length
    );

    // Set instance matrices
    const instanceMatrix = new THREE.Matrix4();
    for (let i = 0; i < this.reticleLineInstances.length; i++)
    {
      const instance = this.reticleLineInstances[i];
      instanceMatrix.compose(instance.position, instance.quaternion, instance.scale);
      this.reticleLineMesh.setMatrixAt(i, instanceMatrix);
    }
    this.reticleLineMesh.instanceMatrix.needsUpdate = true;

    // Add to reticle group
    this.reticleGroup.add(this.reticleLineMesh);
  }

  /**
   * Add a ring (annulus) defined in MRAD space to the reticle group.
   */
  addRingMrad(centerXMrad, centerYMrad, radiusMrad, thicknessMrad, segments = 96)
  {
    if (!this.hasReticle || !this.reticleGroup || !this.reticleMaterial) return;

    const radiusUnits = this.mradToReticleUnitsAtFov(radiusMrad, this.initialFOV);
    const thicknessUnits = this.mradToReticleUnitsAtFov(thicknessMrad, this.initialFOV);
    const innerRadius = Math.max(radiusUnits - thicknessUnits * 0.5, 0.0);
    const outerRadius = radiusUnits + thicknessUnits * 0.5;

    const ringGeom = new THREE.RingGeometry(innerRadius, outerRadius, segments);
    const ringMesh = new THREE.Mesh(ringGeom, this.reticleMaterial);

    const cx = this.mradToReticleUnitsAtFov(centerXMrad, this.initialFOV);
    const cy = this.mradToReticleUnitsAtFov(centerYMrad, this.initialFOV);
    ringMesh.position.set(cx, cy, 0);

    this.reticleGroup.add(ringMesh);
  }

  /**
   * Add a solid dot in MRAD space (implemented as a filled circle).
   */
  addDotMrad(centerXMrad, centerYMrad, radiusMrad, segments = 48)
  {
    if (!this.hasReticle || !this.reticleGroup || !this.reticleMaterial) return;

    const radiusUnits = this.mradToReticleUnitsAtFov(radiusMrad, this.initialFOV);
    const geom = new THREE.CircleGeometry(radiusUnits, segments);
    const mesh = new THREE.Mesh(geom, this.reticleMaterial);

    const cx = this.mradToReticleUnitsAtFov(centerXMrad, this.initialFOV);
    const cy = this.mradToReticleUnitsAtFov(centerYMrad, this.initialFOV);
    mesh.position.set(cx, cy, 0);

    this.reticleGroup.add(mesh);
  }

  /**
   * Build the reticle pattern in MRAD space.
   * This can be extended later for a full Christmas-tree grid.
   */
  buildReticle()
  {
    const maxExtentMrad = 10.0; // how far ticks extend from center in mrad

    const mainLineThicknessMrad = 0.06;
    const minorLineThicknessMrad = 0.03;

    // Main crosshair lines (through center)
    this.addLineMrad(-maxExtentMrad, 0, maxExtentMrad, 0, mainLineThicknessMrad);
    this.addLineMrad(0, -maxExtentMrad, 0, maxExtentMrad, mainLineThicknessMrad);

    // Major ticks every 1 mrad, minor ticks every 0.5 mrad
    const majorStep = 1.0;
    const minorStep = 0.5;

    const majorTickLengthMrad = 0.6;
    const minorTickLengthMrad = 0.3;

    // Horizontal axis ticks
    for (let m = minorStep; m <= maxExtentMrad; m += minorStep)
    {
      const isMajor = Math.abs(m % majorStep) < 1e-4;
      const lengthMrad = isMajor ? majorTickLengthMrad : minorTickLengthMrad;
      const thicknessMrad = isMajor ? mainLineThicknessMrad : minorLineThicknessMrad;

      // +X
      this.addLineMrad(
        m,
        -lengthMrad * 0.5,
        m,
        lengthMrad * 0.5,
        thicknessMrad
      );

      // -X
      this.addLineMrad(
        -m,
        -lengthMrad * 0.5,
        -m,
        lengthMrad * 0.5,
        thicknessMrad
      );
    }

    // Vertical axis ticks
    for (let m = minorStep; m <= maxExtentMrad; m += minorStep)
    {
      const isMajor = Math.abs(m % majorStep) < 1e-4;
      const lengthMrad = isMajor ? majorTickLengthMrad : minorTickLengthMrad;
      const thicknessMrad = isMajor ? mainLineThicknessMrad : minorLineThicknessMrad;

      // +Y
      this.addLineMrad(
        -lengthMrad * 0.5,
        m,
        lengthMrad * 0.5,
        m,
        thicknessMrad
      );

      // -Y
      this.addLineMrad(
        -lengthMrad * 0.5,
        -m,
        lengthMrad * 0.5,
        -m,
        thicknessMrad
      );
    }
  }

  /**
   * Update the reticle scale for FFP behavior.
   * Geometry is built at initialFOV; scale changes with currentFOV.
   */
  updateReticleScale()
  {
    if (!this.reticleGroup) return;

    const fovScale = this.initialFOV / this.currentFOV;
    // Factor 2 maps internal reticle space [-0.5,0.5] to HUD space [-1,1]
    const baseScale = 2.0;
    const s = baseScale * fovScale;
    this.reticleGroup.scale.set(s, s, 1);
  }

  zoomIn(factor = 1.1)
  {
    // Default 1.1 for rifle scope, can be overridden for continuous zoom (spotting scope)
    this.setZoomX(this.currentZoomX * factor);
  }

  zoomOut(factor = 1.1)
  {
    // Default 1.1 for rifle scope, can be overridden for continuous zoom (spotting scope)
    this.setZoomX(this.currentZoomX / factor);
  }

  /**
   * Pan scope by explicit yaw/pitch deltas (in radians).
   */
  panBy(deltaYawRad, deltaPitchRad)
  {
    this.yaw = THREE.MathUtils.clamp(this.yaw + deltaYawRad, -this.maxPanAngleRad, this.maxPanAngleRad);
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaPitchRad, -this.maxPitchDownRad, this.maxPitchUpRad);
    this.updateCameraLookAt();
  }

  // Keyboard control helpers (used by spotting scope)
  up(deltaRad)
  {
    this.panBy(0, deltaRad);
  }

  down(deltaRad)
  {
    this.panBy(0, -deltaRad);
  }

  left(deltaRad)
  {
    this.panBy(deltaRad, 0);
  }

  right(deltaRad)
  {
    this.panBy(-deltaRad, 0);
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

  getCamera()
  {
    return this.camera;
  }

  // ===== SCOPE DIAL METHODS =====

  /**
   * Dial scope up (increase elevation - bullet impacts higher)
   * @param {number} clicks - Number of clicks to dial (default 1)
   */
  dialUp(clicks = 1)
  {
    if (!this.hasDials) return;
    const oldClicks = this.elevationClicks;
    const newClicks = oldClicks + clicks;
    if (Math.abs(newClicks) <= this.maxDialClicks)
    {
      this.elevationClicks = newClicks;
      // Play click sound if dial actually changed
      if (oldClicks !== newClicks && this.audioManager)
      {
        this.audioManager.playSound('scope_click');
      }
    }
  }

  /**
   * Dial scope down (decrease elevation - bullet impacts lower)
   * @param {number} clicks - Number of clicks to dial (default 1)
   */
  dialDown(clicks = 1)
  {
    if (!this.hasDials) return;
    const oldClicks = this.elevationClicks;
    const newClicks = oldClicks - clicks;
    if (Math.abs(newClicks) <= this.maxDialClicks)
    {
      this.elevationClicks = newClicks;
      // Play click sound if dial actually changed
      if (oldClicks !== newClicks && this.audioManager)
      {
        this.audioManager.playSound('scope_click');
      }
    }
  }

  /**
   * Dial scope left (decrease windage - bullet impacts left)
   * @param {number} clicks - Number of clicks to dial (default 1)
   */
  dialLeft(clicks = 1)
  {
    if (!this.hasDials) return;
    const oldClicks = this.windageClicks;
    const newClicks = oldClicks + clicks;
    if (Math.abs(newClicks) <= this.maxDialClicks)
    {
      this.windageClicks = newClicks;
      // Play click sound if dial actually changed
      if (oldClicks !== newClicks && this.audioManager)
      {
        this.audioManager.playSound('scope_click');
      }
    }
  }

  /**
   * Dial scope right (increase windage - bullet impacts right)
   * @param {number} clicks - Number of clicks to dial (default 1)
   */
  dialRight(clicks = 1)
  {
    if (!this.hasDials) return;
    const oldClicks = this.windageClicks;
    const newClicks = oldClicks - clicks;
    if (Math.abs(newClicks) <= this.maxDialClicks)
    {
      this.windageClicks = newClicks;
      // Play click sound if dial actually changed
      if (oldClicks !== newClicks && this.audioManager)
      {
        this.audioManager.playSound('scope_click');
      }
    }
  }

  /**
   * Reset dial to zero
   */
  resetDial()
  {
    if (!this.hasDials) return;
    const hadElevation = this.elevationClicks !== 0;
    const hadWindage = this.windageClicks !== 0;
    this.elevationClicks = 0;
    this.windageClicks = 0;
    // Play click sound if dial was actually reset (was non-zero)
    if ((hadElevation || hadWindage) && this.audioManager)
    {
      this.audioManager.playSound('scope_click');
    }
  }

  /**
   * Get current dial position in MRAD
   * @returns {Object} {elevation: number, windage: number} in MRAD
   */
  getDialPositionMRAD()
  {
    if (!this.hasDials) return {
      elevation: 0,
      windage: 0
    };
    return {
      elevation: this.elevationClicks * this.CLICK_VALUE_MRAD,
      windage: this.windageClicks * this.CLICK_VALUE_MRAD
    };
  }

  /**
   * Get current hold position in MRAD
   * @returns {Object} {elevation: number, windage: number} in MRAD
   */
  getHoldPositionMRAD()
  {
    return {
      elevation: this.pitch * 1000,
      windage: this.yaw * 1000
    };
  }

  /**
   * Get current total angle in MRAD
   * @returns {Object} {elevation: number, windage: number} in MRAD
   */
  getTotalAngleMRAD()
  {
    const dialElevation = this.hasDials ? this.elevationClicks * this.CLICK_VALUE_MRAD : 0;
    const dialWindage = this.hasDials ? this.windageClicks * this.CLICK_VALUE_MRAD : 0;
    return {
      elevation: dialElevation + this.pitch * 1000,
      windage: dialWindage + this.yaw * 1000
    };
  }


  render(dt = 0)
  {
    // Lazy resize: update internal render target if output size changed
    const outputWidth = this.outputRenderTarget.width;
    const outputHeight = this.outputRenderTarget.height;

    if (this.sceneRenderTarget &&
      (this.sceneRenderTarget.width !== outputWidth ||
        this.sceneRenderTarget.height !== outputHeight))
    {
      console.log(`[Scope] Render target resized: ${outputWidth}x${outputHeight}`);
      this.sceneRenderTarget.setSize(outputWidth, outputHeight);
      
      // Resize depth texture if it exists
      if (this.depthTexture)
      {
        this.depthTexture.image.width = outputWidth;
        this.depthTexture.image.height = outputHeight;
        this.depthTexture.needsUpdate = true;
      }
      
      // Resize blur render targets
      if (this.blurRenderTargetHorizontal)
      {
        this.blurRenderTargetHorizontal.setSize(outputWidth, outputHeight);
        if (this.blurMeshHorizontal)
        {
          this.blurMeshHorizontal.material.uniforms.resolution.value.set(outputWidth, outputHeight);
        }
      }
      if (this.blurRenderTarget)
      {
        this.blurRenderTarget.setSize(outputWidth, outputHeight);
        if (this.blurMeshVertical)
        {
          this.blurMeshVertical.material.uniforms.resolution.value.set(outputWidth, outputHeight);
        }
      }

      // Update camera aspect to match new size
      if (this.camera)
      {
        this.camera.aspect = outputWidth / outputHeight;
        this.camera.updateProjectionMatrix();
      }
    }

    // Step 1: Render 3D scene to internal render target
    this.renderer.setRenderTarget(this.sceneRenderTarget);
    this.renderer.clear();
    
    if (this.renderStats)
    {
      this.renderStats.render(this.renderer, this.scene, this.camera, `Scope.${this.hasReticle ? 'rifle' : 'spotting'}.3DScene`);
    }
    else
    {
      this.renderer.render(this.scene, this.camera);
    }
    
    // Step 1.5: Apply depth-of-field blur (if optical effects enabled)
    // Uses separable Gaussian blur: horizontal pass, then vertical pass
    if (this.opticalEffectsEnabled && this.blurRenderTarget && this.blurRenderTargetHorizontal && this.blurScene && this.depthTexture)
    {
      const METERS_PER_YARD = 0.9144;
      
      // Derive effective lens focal length and f-number from current FOV and 56mm objective
      const fovRad = THREE.MathUtils.degToRad(this.currentFOV);
      const sensorWidth = this.sensorWidth;
      const eps = 1e-6;
      const F = sensorWidth / (2.0 * Math.tan(Math.max(fovRad * 0.5, eps))); // meters
      const N = F / this.objectiveDiameter; // f-number from focal length & objective diameter
      
      const lensParams = {
        focalDistance: this.focalDistance * METERS_PER_YARD,
        lensFocalLength: F,
        lensFNumber: Math.max(N, 1.0),
        sensorWidth: sensorWidth
      };
      
      // Update horizontal blur shader uniforms
      const uniformsH = this.blurMeshHorizontal.material.uniforms;
      uniformsH.focalDistance.value = lensParams.focalDistance;
      uniformsH.sceneTexture.value = this.sceneRenderTarget.texture;
      uniformsH.depthTexture.value = this.depthTexture;
      uniformsH.lensFocalLength.value = lensParams.lensFocalLength;
      uniformsH.lensFNumber.value = lensParams.lensFNumber;
      uniformsH.sensorWidth.value = lensParams.sensorWidth;
      
      // Render horizontal blur pass
      this.renderer.setRenderTarget(this.blurRenderTargetHorizontal);
      this.renderer.clear();
      this.renderer.render(this.blurMeshHorizontal, this.blurCamera);
      
      // Update vertical blur shader uniforms
      const uniformsV = this.blurMeshVertical.material.uniforms;
      uniformsV.focalDistance.value = lensParams.focalDistance;
      uniformsV.sceneTexture.value = this.blurRenderTargetHorizontal.texture; // Use horizontal blur result
      uniformsV.depthTexture.value = this.depthTexture;
      uniformsV.lensFocalLength.value = lensParams.lensFocalLength;
      uniformsV.lensFNumber.value = lensParams.lensFNumber;
      uniformsV.sensorWidth.value = lensParams.sensorWidth;
      
      // Render vertical blur pass (final result)
      this.renderer.setRenderTarget(this.blurRenderTarget);
      this.renderer.clear();
      this.renderer.render(this.blurMeshVertical, this.blurCamera);
    }
    
    // Step 2: Composite scene (blurred or unblurred) + reticle to output render target
    // Clear with transparent color to preserve alpha channel
    this.renderer.setRenderTarget(this.outputRenderTarget);
    this.renderer.setClearColor(0x000000, 0.0); // Transparent black
    this.renderer.clear();
    
    // Update scope mesh texture: use blurred texture if optical effects enabled, otherwise raw scene
    if (this.scopeMesh)
    {
      this.scopeMesh.material.map = this.opticalEffectsEnabled && this.blurRenderTarget ? 
        this.blurRenderTarget.texture : 
        this.sceneRenderTarget.texture;
      this.scopeMesh.material.needsUpdate = true;
    }
    
    if (this.renderStats)
    {
      this.renderStats.render(this.renderer, this.internalScene, this.internalCamera, `Scope.${this.hasReticle ? 'rifle' : 'spotting'}.InternalScene`);
    }
    else
    {
      this.renderer.render(this.internalScene, this.internalCamera);
    }

    // Mark output texture as updated
    this.outputRenderTarget.texture.needsUpdate = true;

    this.renderer.setRenderTarget(null);
  }

  /**
   * Set the focal distance (in yards)
   * @param {number} yards - Focal distance in yards
   */
  setFocalDistance(yards)
  {
    this.focalDistance = yards;
    // The blur shader uniform will be updated automatically in the render loop
  }

  dispose()
  {
    this.sceneRenderTarget.dispose();
    if (this.blurRenderTargetHorizontal) this.blurRenderTargetHorizontal.dispose();
    if (this.blurRenderTarget) this.blurRenderTarget.dispose();
    
    // Dispose blur pass resources
    if (this.blurScene)
    {
      this.blurScene.traverse((object) =>
      {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
    }
    
    // Dispose all meshes/materials in internal scene
    this.internalScene.traverse((object) =>
    {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
    // Note: renderer is owned by CompositionRenderer, don't dispose it here
  }
}