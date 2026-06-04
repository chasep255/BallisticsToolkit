// flags.js - Wind flag rendering for FClass simulator

import * as THREE from 'three';
import ResourceManager from '../resources/manager.js';
import
{
  sampleWindAtThreeJsPosition
}
from '../core/btk.js';
import * as Range from '../core/range-constants.js';
import { stepWindMarker } from '../core/wind-marker-response.js';

export class FlagRenderer
{
  // Default flag configuration
  static POLE_HEIGHT = Range.POLE_HEIGHT; // yards
  static POLE_THICKNESS = Range.POLE_THICKNESS; // yards
  static FLAG_BASE_WIDTH = 60 / 36; // 60 inches = 1.67 yards
  static FLAG_TIP_WIDTH = 24 / 36; // 24 inches = 0.67 yards
  static FLAG_LENGTH = 16 / 3; // 16 feet = 5.33 yards
  static FLAG_THICKNESS = 0.05; // yards
  static FLAG_SEGMENTS = 10; // Number of segments for flag geometry
  static FLAG_MIN_ANGLE = 1; // degrees from vertical
  static FLAG_MAX_ANGLE = 90; // degrees from vertical
  // Concave response tuned for reading LIGHT winds (high-power "angle ÷ 4" lore):
  //   frac = clamp(v_h / FLAT_SPEED, 0, 1) ^ EXP,  angle = MIN + (MAX-MIN) * frac
  // EXP < 1 makes the curve steep at the bottom and flatten toward horizontal, so
  // the lightest winds move the flag the most (the opposite of a v^2 toe). Reaches
  // horizontal at FLAT_SPEED. See ssusa.org high-power wind-reading guide.
  static FLAG_ANGLE_FLAT_SPEED = 20; // mph at which the flag reads horizontal
  static FLAG_ANGLE_RESPONSE_EXP = 0.7; // <1 = concave (low-end sensitive)
  static FLAG_ANGLE_INTERPOLATION_SPEED = 30; // degrees per second
  static FLAG_DIRECTION_INTERPOLATION_SPEED = 1.0; // radians per second
  static FLAG_FLAP_FREQUENCY_BASE = 0.5; // Hz at 10 mph
  static FLAG_FLAP_FREQUENCY_SCALE = 0.25; // Additional Hz per mph
  static FLAG_FLAP_AMPLITUDE = 0.3; // Max ripple amplitude in yards
  static FLAG_WAVE_LENGTH = 1.5; // Wavelength along flag length
  static FLAG_PHASE_DRIFT_RANGE = Math.PI * 2; // Random phase offset range
  // Furl: the cloth rolls about its own length axis so it presents a 3D form
  // instead of a flat ribbon (helps read the head/tail wind component). Radians
  // of roll accumulated from root to tip; scaled by wind strength in the shader.
  static FLAG_FURL_BASE = 0.75; // steady roll toward the tip (~43°) - gives 3D belly
  static FLAG_FURL_WAVE = 0.55; // travelling furl flutter layered on top

  constructor(config)
  {
    // Required config
    this.scene = config.scene;
    this.renderer = config.renderer;
    this.shadowsEnabled = config.shadowsEnabled ?? true;

    // Flag configuration with defaults from static constants
    this.cfg = {
      poleHeight: config.poleHeight ?? FlagRenderer.POLE_HEIGHT,
      poleThickness: config.poleThickness ?? FlagRenderer.POLE_THICKNESS,
      flagBaseWidth: config.flagBaseWidth ?? FlagRenderer.FLAG_BASE_WIDTH,
      flagTipWidth: config.flagTipWidth ?? FlagRenderer.FLAG_TIP_WIDTH,
      flagLength: config.flagLength ?? FlagRenderer.FLAG_LENGTH,
      flagThickness: config.flagThickness ?? FlagRenderer.FLAG_THICKNESS,
      flagSegments: config.flagSegments ?? FlagRenderer.FLAG_SEGMENTS,
      flagMinAngle: config.flagMinAngle ?? FlagRenderer.FLAG_MIN_ANGLE,
      flagMaxAngle: config.flagMaxAngle ?? FlagRenderer.FLAG_MAX_ANGLE,
      flagAngleFlatSpeed: config.flagAngleFlatSpeed ?? FlagRenderer.FLAG_ANGLE_FLAT_SPEED,
      flagAngleResponseExp: config.flagAngleResponseExp ?? FlagRenderer.FLAG_ANGLE_RESPONSE_EXP,
      flagAngleInterpolationSpeed: config.flagAngleInterpolationSpeed ?? FlagRenderer.FLAG_ANGLE_INTERPOLATION_SPEED,
      flagDirectionInterpolationSpeed: config.flagDirectionInterpolationSpeed ?? FlagRenderer.FLAG_DIRECTION_INTERPOLATION_SPEED,
      flagFlapFrequencyBase: config.flagFlapFrequencyBase ?? FlagRenderer.FLAG_FLAP_FREQUENCY_BASE,
      flagFlapFrequencyScale: config.flagFlapFrequencyScale ?? FlagRenderer.FLAG_FLAP_FREQUENCY_SCALE,
      flagFlapAmplitude: config.flagFlapAmplitude ?? FlagRenderer.FLAG_FLAP_AMPLITUDE,
      flagWaveLength: config.flagWaveLength ?? FlagRenderer.FLAG_WAVE_LENGTH,
      flagPhaseDriftRange: config.flagPhaseDriftRange ?? FlagRenderer.FLAG_PHASE_DRIFT_RANGE,
      flagFurlBase: config.flagFurlBase ?? FlagRenderer.FLAG_FURL_BASE,
      flagFurlWave: config.flagFurlWave ?? FlagRenderer.FLAG_FURL_WAVE
    };

    this.flagMeshes = [];
    this.poleInstancedMesh = null;
    this.polePositions = []; // Store pole positions for instanced mesh

    // Shared resources (created once, reused for all flags)
    this.sharedMaterials = null;
    this.poleGeometry = null;
  }

  dispose()
  {
    // Remove instanced pole mesh
    if (this.poleInstancedMesh)
    {
      this.scene.remove(this.poleInstancedMesh);
      this.poleInstancedMesh.geometry.dispose();
      this.poleInstancedMesh.material.dispose();
      this.poleInstancedMesh = null;
    }

    // Remove all flag cloth meshes from scene and dispose per-flag materials
    for (const flag of this.flagMeshes)
    {
      this.scene.remove(flag.flagMesh);
      flag.flagGeometry.dispose();
      // Dispose per-flag material (cloned from base)
      if (flag.flagMaterial)
      {
        flag.flagMaterial.dispose();
      }
    }

    // Dispose shared pole geometry
    if (this.poleGeometry)
    {
      this.poleGeometry.dispose();
    }

    // Dispose shared materials and their textures
    if (this.sharedMaterials)
    {
      if (this.sharedMaterials.pole)
      {
        this.sharedMaterials.pole.dispose();
      }
      // Dispose base flag material and its textures
      if (this.sharedMaterials.flagBase)
      {
        if (this.sharedMaterials.flagBase.map) this.sharedMaterials.flagBase.map.dispose();
        if (this.sharedMaterials.flagBase.normalMap) this.sharedMaterials.flagBase.normalMap.dispose();
        if (this.sharedMaterials.flagBase.roughnessMap) this.sharedMaterials.flagBase.roughnessMap.dispose();
        this.sharedMaterials.flagBase.dispose();
      }
    }

    this.flagMeshes = [];
    this.poleGeometry = null;
    this.sharedMaterials = null;
  }

  createSharedMaterials()
  {
    // Create flag texture
    const flagTexture = this.createFlagTexture();

    // Get cloth textures from ResourceManager
    const clothColor = ResourceManager.textures.getTexture('cloth_color');
    const clothNormal = ResourceManager.textures.getTexture('cloth_normal');
    const clothRoughness = ResourceManager.textures.getTexture('cloth_roughness');

    // Clone textures for independent repeat settings
    const clothColorClone = clothColor.clone();
    const clothNormalClone = clothNormal.clone();
    const clothRoughnessClone = clothRoughness.clone();

    [clothColorClone, clothNormalClone, clothRoughnessClone].forEach(texture =>
    {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(0.5, 0.5);
      texture.needsUpdate = true;
    });

    // Create shared materials
    this.sharedMaterials = {
      pole: new THREE.MeshStandardMaterial(
      {
        color: 0xc0c0c0,
        metalness: 0.8,
        roughness: 0.2,
        envMapIntensity: 1.0
      }),
      // Base flag material - will be cloned per flag for individual uniforms
      flagBase: new THREE.MeshStandardMaterial(
      {
        map: flagTexture,
        normalMap: clothNormalClone,
        roughnessMap: clothRoughnessClone,
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.DoubleSide
      })
    };
  }

  /**
   * Create a shader-injected flag material with per-flag uniforms
   * Uses GPU vertex shader for deformation instead of CPU
   */
  createFlagMaterial()
  {
    // Clone base material for independent uniforms
    const material = this.sharedMaterials.flagBase.clone();

    // Store uniforms for this flag
    const uniforms = {
      uAngle: { value: this.cfg.flagMinAngle }, // Current pitch angle in degrees
      uDirection: { value: 0 }, // Current wind direction in radians
      uWavePhase: { value: 0 }, // Accumulated wave phase
      uFlagLength: { value: this.cfg.flagLength },
      uFlapAmplitude: { value: this.cfg.flagFlapAmplitude },
      uWaveLength: { value: this.cfg.flagWaveLength },
      uFurlBase: { value: this.cfg.flagFurlBase },
      uFurlWave: { value: this.cfg.flagFurlWave }
    };

    material.onBeforeCompile = (shader) =>
    {
      // Add uniforms
      shader.uniforms.uAngle = uniforms.uAngle;
      shader.uniforms.uDirection = uniforms.uDirection;
      shader.uniforms.uWavePhase = uniforms.uWavePhase;
      shader.uniforms.uFlagLength = uniforms.uFlagLength;
      shader.uniforms.uFlapAmplitude = uniforms.uFlapAmplitude;
      shader.uniforms.uWaveLength = uniforms.uWaveLength;
      shader.uniforms.uFurlBase = uniforms.uFurlBase;
      shader.uniforms.uFurlWave = uniforms.uFurlWave;

      // Vertex shader: add attribute and uniforms
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `
        #include <common>

        attribute float segmentT;

        uniform float uAngle;      // Pitch angle in degrees (pre-smoothed)
        uniform float uDirection;  // Wind direction in radians (pre-smoothed)
        uniform float uWavePhase;  // Accumulated wave phase
        uniform float uFlagLength;
        uniform float uFlapAmplitude;
        uniform float uWaveLength;
        uniform float uFurlBase;   // steady roll root->tip (radians)
        uniform float uFurlWave;   // travelling furl flutter (radians)

        // Helper function to compute deformed position
        vec3 computeDeformedPosition(float localX, float localY, float localZ, float t) {
          // Convert angle to radians
          float angleRad = uAngle * 0.01745329;

          float cosDir = cos(uDirection);
          float sinDir = sin(uDirection);
          float cosPitch = cos(angleRad);
          float sinPitch = sin(angleRad);

          // Wave/flapping animation
          float waveArg = uWavePhase + t * uWaveLength * 6.28318;
          float waveOffset = sin(waveArg) * uFlapAmplitude * t;

          // Centerline: pitched up into the wind and drooping (extends from the
          // pole along uDirection). This is the flag's local length axis in world.
          vec3 center = vec3(localX * sinPitch * cosDir,
                             -localX * cosPitch,
                             -localX * sinPitch * sinDir);

          // Cross-section frame: width is vertical (W), the out-of-plane / wave
          // direction is horizontal and perpendicular to the wind (N).
          vec3 W = vec3(0.0, 1.0, 0.0);
          vec3 N = vec3(sinDir, 0.0, cosDir);

          // Furl: roll the cross-section about the length axis, accumulating from
          // root to tip with a travelling flutter. Scaled by wind strength so the
          // flag hangs flat/limp when calm and furls into a 3D form when blowing.
          float windFactor = clamp(uAngle / 60.0, 0.0, 1.0);
          float furl = (uFurlBase * t + uFurlWave * sin(waveArg) * t) * windFactor;
          float cf = cos(furl);
          float sf = sin(furl);

          // Roll (localY, localZ) about the length axis, then place on the frame
          float widthCoord = localY * cf - localZ * sf;
          float outOfPlane = localY * sf + localZ * cf + waveOffset;

          vec3 pos = center + W * widthCoord + N * outOfPlane;
          return pos;
        }
        `
      );

      // Vertex shader: deform in local space
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>

        float localX = position.x;
        float localY = position.y;
        float localZ = position.z;
        float t = segmentT;

        transformed = computeDeformedPosition(localX, localY, localZ, t);
        `
      );

      // Normal calculation: compute from deformed geometry
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        // Compute deformed normal
        float nLocalX = position.x;
        float nLocalY = position.y;
        float nLocalZ = position.z;
        float nT = segmentT;

        // Compute position at current point
        vec3 p = computeDeformedPosition(nLocalX, nLocalY, nLocalZ, nT);

        // Compute tangent along flag length
        float dx = uFlagLength * 0.001;
        float tNext = clamp(nT + 0.001, 0.0, 1.0);
        vec3 pt = computeDeformedPosition(nLocalX + dx, nLocalY, nLocalZ, tNext);
        vec3 tangent = normalize(pt - p);

        // Compute bitangent along flag width
        float dy = 0.001;
        vec3 py = computeDeformedPosition(nLocalX, nLocalY + dy, nLocalZ, nT);
        vec3 bitangent = normalize(py - p);

        // Normal = tangent × bitangent
        vec3 objectNormal = normalize(cross(tangent, bitangent));

        // Flip for back face (negative Z in local space)
        if (position.z < 0.0) {
          objectNormal = -objectNormal;
        }
        `
      );
    };

    // Return material and uniforms reference
    return { material, uniforms };
  }

  initialize()
  {
    // Create shared resources once
    this.poleGeometry = new THREE.BoxGeometry(
      this.cfg.poleThickness,
      this.cfg.poleHeight,
      this.cfg.poleThickness
    );
    this.createSharedMaterials();
  }

  addFlag(xPosition, zPosition)
  {
    // Add a single flag at the specified position
    this.createFlagAtPosition(xPosition, zPosition);
  }

  createFlagTexture()
  {
    // Create a canvas for red/yellow flag
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Top half red
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 256, 128);

    // Bottom half yellow
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(0, 128, 256, 128);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  createFlagGeometry()
  {
    // Create static flag geometry in local space with segmentT attribute
    // GPU shader handles all deformation - geometry never changes after creation
    // Local space: X = along flag length, Y = width (top/bottom), Z = thickness (front/back)
    const geometry = new THREE.BufferGeometry();
    const numSegments = this.cfg.flagSegments;
    const halfThickness = this.cfg.flagThickness / 2;

    const positions = [];
    const uvs = [];
    const segmentTs = [];
    const indices = [];

    // Generate vertices for each segment
    for (let i = 0; i < numSegments; i++)
    {
      const t = i / (numSegments - 1); // 0 to 1
      const halfWidth = this.cfg.flagBaseWidth / 2 + (this.cfg.flagTipWidth / 2 - this.cfg.flagBaseWidth / 2) * t;
      const x = this.cfg.flagLength * t;

      // Front face vertices (Z = +halfThickness)
      // Top front
      positions.push(x, halfWidth, halfThickness);
      uvs.push(t, 0);
      segmentTs.push(t);

      // Bottom front
      positions.push(x, -halfWidth, halfThickness);
      uvs.push(t, 1);
      segmentTs.push(t);

      // Back face vertices (Z = -halfThickness)
      // Top back
      positions.push(x, halfWidth, -halfThickness);
      uvs.push(t, 0);
      segmentTs.push(t);

      // Bottom back
      positions.push(x, -halfWidth, -halfThickness);
      uvs.push(t, 1);
      segmentTs.push(t);
    }

    // Create indices for front and back faces
    for (let i = 0; i < numSegments - 1; i++)
    {
      const idx = i * 4;

      // Front face triangles
      indices.push(idx, idx + 1, idx + 4);
      indices.push(idx + 1, idx + 5, idx + 4);

      // Back face triangles (reverse winding)
      indices.push(idx + 2, idx + 6, idx + 3);
      indices.push(idx + 3, idx + 6, idx + 7);
    }

    // Add side faces to connect front and back
    for (let i = 0; i < numSegments - 1; i++)
    {
      const idx = i * 4;

      // Top edge side face
      indices.push(idx, idx + 4, idx + 2);
      indices.push(idx + 2, idx + 4, idx + 6);

      // Bottom edge side face
      indices.push(idx + 1, idx + 3, idx + 5);
      indices.push(idx + 3, idx + 7, idx + 5);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setAttribute('segmentT', new THREE.BufferAttribute(new Float32Array(segmentTs), 1));
    geometry.setIndex(indices);

    return geometry;
  }

  createFlagAtPosition(xPosition, zPosition)
  {
    // Store pole position for later instancing
    this.polePositions.push(
    {
      x: xPosition,
      y: this.cfg.poleHeight / 2,
      z: zPosition
    });

    // Create flag geometry (static - shader handles deformation)
    const flagGeometry = this.createFlagGeometry();

    // Create shader-injected material with per-flag uniforms
    const { material, uniforms } = this.createFlagMaterial();

    const flagMesh = new THREE.Mesh(flagGeometry, material);
    flagMesh.castShadow = this.shadowsEnabled;
    flagMesh.receiveShadow = this.shadowsEnabled;

    const flagY = this.cfg.poleHeight - this.cfg.flagBaseWidth / 2;
    flagMesh.position.set(xPosition, flagY, zPosition);
    this.scene.add(flagMesh);

    // Store flag data with uniforms reference for GPU updates
    this.flagMeshes.push(
    {
      flagGeometry: flagGeometry,
      flagMaterial: material,
      flagMesh: flagMesh,
      uniforms: uniforms, // Reference to shader uniforms for GPU updates
      position:
      {
        x: xPosition,
        y: flagY,
        z: zPosition
      },
      currentAngle: this.cfg.flagMinAngle,
      currentDirection: 0,
      flapPhase: Math.random() * this.cfg.flagPhaseDriftRange
    });
  }

  /**
   * Create instanced mesh for all poles after all flags have been added
   * Call this after all addFlag() calls are complete
   */
  finalizePoles()
  {
    if (this.polePositions.length === 0) return;

    // Create instanced mesh for all poles
    this.poleInstancedMesh = new THREE.InstancedMesh(
      this.poleGeometry,
      this.sharedMaterials.pole,
      this.polePositions.length
    );
    this.poleInstancedMesh.castShadow = this.shadowsEnabled;
    this.poleInstancedMesh.receiveShadow = this.shadowsEnabled;

    // Set instance matrices for all poles
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < this.polePositions.length; i++)
    {
      const pos = this.polePositions[i];
      matrix.compose(
        new THREE.Vector3(pos.x, pos.y, pos.z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1)
      );
      this.poleInstancedMesh.setMatrixAt(i, matrix);
    }

    this.poleInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.poleInstancedMesh);
  }

  updateFlags(windGenerator)
  {
    // Get time from ResourceManager
    const deltaTime = ResourceManager.time.getDeltaTime();

    // Update each flag's uniforms based on wind (GPU handles deformation)
    for (let i = 0; i < this.flagMeshes.length; i++)
    {
      const flag = this.flagMeshes[i];
      const pos = flag.position;

      // Get wind at flag position
      const wind = sampleWindAtThreeJsPosition(windGenerator, pos.x, pos.y, pos.z);

      // Drive the lift angle + heading from the sampled wind (shared with socks)
      const { angle, direction, windHoriz_mph } = stepWindMarker(
      {
        windX_mph: wind.x, // cross
        windZ_mph: wind.z, // head/tail
        currentAngle: flag.currentAngle,
        currentDirection: flag.currentDirection,
        deltaTime,
        minAngle: this.cfg.flagMinAngle,
        maxAngle: this.cfg.flagMaxAngle,
        flatSpeed: this.cfg.flagAngleFlatSpeed,
        responseExp: this.cfg.flagAngleResponseExp,
        angleSpeed: this.cfg.flagAngleInterpolationSpeed,
        directionSpeed: this.cfg.flagDirectionInterpolationSpeed
      });
      flag.currentAngle = angle;
      flag.currentDirection = direction;

      // Update flap phase based on horizontal wind speed
      const flapFrequency = this.cfg.flagFlapFrequencyBase + windHoriz_mph * this.cfg.flagFlapFrequencyScale;
      flag.flapPhase += flapFrequency * 2 * Math.PI * deltaTime;

      // Wrap phase to avoid floating point issues
      flag.flapPhase = flag.flapPhase % (2 * Math.PI);

      // Update shader uniforms (GPU handles all deformation)
      flag.uniforms.uAngle.value = flag.currentAngle;
      flag.uniforms.uDirection.value = flag.currentDirection;
      flag.uniforms.uWavePhase.value = flag.flapPhase;
    }
  }
}