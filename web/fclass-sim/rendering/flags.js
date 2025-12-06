// flags.js - Wind flag rendering for FClass simulator

import * as THREE from 'three';
import ResourceManager from '../resources/manager.js';
import
{
  sampleWindAtThreeJsPosition
}
from '../core/btk.js';

export class FlagRenderer
{
  // Default flag configuration
  static POLE_HEIGHT = 12; // yards
  static POLE_THICKNESS = 0.1; // yards
  static FLAG_BASE_WIDTH = 60 / 36; // 60 inches = 1.67 yards
  static FLAG_TIP_WIDTH = 24 / 36; // 24 inches = 0.67 yards
  static FLAG_LENGTH = 16 / 3; // 16 feet = 5.33 yards
  static FLAG_THICKNESS = 0.05; // yards
  static FLAG_SEGMENTS = 10; // Number of segments for flag geometry
  static FLAG_MIN_ANGLE = 1; // degrees from vertical
  static FLAG_MAX_ANGLE = 90; // degrees from vertical
  // Nonlinear response: angle = MIN + (MAX-MIN) * (1 - exp(-K * v_h^2)), with v_h in mph
  // Choose K so ~90° at ~15 mph (≈99% of span) → K ≈ 0.0205
  static FLAG_ANGLE_RESPONSE_K = 0.0205;
  static FLAG_ANGLE_INTERPOLATION_SPEED = 30; // degrees per second
  static FLAG_DIRECTION_INTERPOLATION_SPEED = 1.0; // radians per second
  static FLAG_FLAP_FREQUENCY_BASE = 0.5; // Hz at 10 mph
  static FLAG_FLAP_FREQUENCY_SCALE = 0.25; // Additional Hz per mph
  static FLAG_FLAP_AMPLITUDE = 0.3; // Max ripple amplitude in yards
  static FLAG_WAVE_LENGTH = 1.5; // Wavelength along flag length
  static FLAG_PHASE_DRIFT_RANGE = Math.PI * 2; // Random phase offset range

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
      flagDegreesPerMph: config.flagDegreesPerMph ?? FlagRenderer.FLAG_DEGREES_PER_MPH,
      flagAngleInterpolationSpeed: config.flagAngleInterpolationSpeed ?? FlagRenderer.FLAG_ANGLE_INTERPOLATION_SPEED,
      flagDirectionInterpolationSpeed: config.flagDirectionInterpolationSpeed ?? FlagRenderer.FLAG_DIRECTION_INTERPOLATION_SPEED,
      flagFlapFrequencyBase: config.flagFlapFrequencyBase ?? FlagRenderer.FLAG_FLAP_FREQUENCY_BASE,
      flagFlapFrequencyScale: config.flagFlapFrequencyScale ?? FlagRenderer.FLAG_FLAP_FREQUENCY_SCALE,
      flagFlapAmplitude: config.flagFlapAmplitude ?? FlagRenderer.FLAG_FLAP_AMPLITUDE,
      flagWaveLength: config.flagWaveLength ?? FlagRenderer.FLAG_WAVE_LENGTH,
      flagPhaseDriftRange: config.flagPhaseDriftRange ?? FlagRenderer.FLAG_PHASE_DRIFT_RANGE
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

    // Remove all flag cloth meshes from scene
    for (const flag of this.flagMeshes)
    {
      this.scene.remove(flag.flagMesh);
      flag.flagGeometry.dispose();
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
      if (this.sharedMaterials.flag)
      {
        if (this.sharedMaterials.flag.map) this.sharedMaterials.flag.map.dispose();
        if (this.sharedMaterials.flag.normalMap) this.sharedMaterials.flag.normalMap.dispose();
        if (this.sharedMaterials.flag.roughnessMap) this.sharedMaterials.flag.roughnessMap.dispose();
        this.sharedMaterials.flag.dispose();
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
      flag: new THREE.MeshStandardMaterial(
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

  // Helper method - calculates vertex positions for one flag segment
  calculateFlagSegmentPosition(segmentIndex, angleDeg, direction, flapPhase)
  {
    const halfBase = this.cfg.flagBaseWidth / 2;
    const halfTip = this.cfg.flagTipWidth / 2;
    const length = this.cfg.flagLength;
    const thickness = this.cfg.flagThickness;
    const numSegments = this.cfg.flagSegments;

    const t = segmentIndex / (numSegments - 1);
    const halfWidth = halfBase + (halfTip - halfBase) * t;

    // Calculate position with wind angle and flapping
    const angleRad = angleDeg * Math.PI / 180;
    const cosDir = Math.cos(direction);
    const sinDir = Math.sin(direction);
    const cosPitch = Math.cos(angleRad);
    const sinPitch = Math.sin(angleRad);

    // In Three.js coords: X=right, Y=up, Z=towards camera (negative Z = downrange)
    // Flag extends from pole: 0° = hanging down, 90° = horizontal
    // Wind angle determines how much the flag lifts (0° = hanging down, 90° = straight out)
    // direction parameter is the wind direction angle (0° = right, 90° = up, 180° = left, 270° = down)

    const segmentX = Math.cos(direction) * sinPitch * length * t; // Horizontal extension in wind direction
    const segmentY = -cosPitch * length * t; // Vertical droop (negative Y = down)
    const segmentZ = Math.sin(direction) * sinPitch * length * t; // Depth extension in wind direction

    // Flapping animation - flag waves in the wind
    const wavePosition = t * this.cfg.flagWaveLength;
    const waveOffset = Math.sin(flapPhase + wavePosition * 2 * Math.PI) * this.cfg.flagFlapAmplitude;
    const flapAmplitude = waveOffset * t;

    // Flapping perpendicular to wind direction (makes flag visible from all angles)
    // When wind blows right (0°), flag flaps in Z (depth)
    // When wind blows downrange (90°), flag flaps in X (horizontal)
    const flapX = -Math.sin(direction) * flapAmplitude; // Horizontal flapping
    const flapY = 0; // No vertical flapping
    const flapZ = Math.cos(direction) * flapAmplitude; // Depth flapping

    // Return 4 vertices: [topFront, bottomFront, topBack, bottomBack]
    // Flag is vertical (in XY plane), with top/bottom in Y direction
    // Front/back faces are offset in Z direction (thickness)
    return {
      topFront: [segmentX + flapX, segmentY + flapY + halfWidth, segmentZ + flapZ + thickness / 2],
      bottomFront: [segmentX + flapX, segmentY + flapY - halfWidth, segmentZ + flapZ + thickness / 2],
      topBack: [segmentX + flapX, segmentY + flapY + halfWidth, segmentZ + flapZ - thickness / 2],
      bottomBack: [segmentX + flapX, segmentY + flapY - halfWidth, segmentZ + flapZ - thickness / 2]
    };
  }

  createFlagGeometry()
  {
    // Create thick segmented trapezoid flag with configurable segments for flapping animation
    // Uses helper method for initial positions (no wind, no flapping)
    const geometry = new THREE.BufferGeometry();
    const numSegments = this.cfg.flagSegments;

    // Create vertices for thick flag using multiple layers
    const vertices = [];
    const uvs = [];
    const indices = [];

    // Create front and back faces for each segment using helper
    for (let i = 0; i < numSegments; i++)
    {
      const t = i / (numSegments - 1); // 0 to 1

      // Get initial positions (no wind, no flapping)
      const positions = this.calculateFlagSegmentPosition(i, 0, 0, 0);

      // Add vertices in order: topFront, bottomFront, topBack, bottomBack
      vertices.push(...positions.topFront);
      vertices.push(...positions.bottomFront);
      vertices.push(...positions.topBack);
      vertices.push(...positions.bottomBack);

      // UV coordinates (red top, yellow bottom) for both faces
      uvs.push(t, 0); // Top front
      uvs.push(t, 1); // Bottom front
      uvs.push(t, 0); // Top back
      uvs.push(t, 1); // Bottom back
    }

    // Create indices for front and back faces
    for (let i = 0; i < numSegments - 1; i++)
    {
      const idx = i * 4; // 4 vertices per segment (2 front + 2 back)

      // Front face triangles
      indices.push(idx, idx + 1, idx + 4); // First triangle
      indices.push(idx + 1, idx + 5, idx + 4); // Second triangle

      // Back face triangles (reverse winding)
      indices.push(idx + 2, idx + 6, idx + 3); // First triangle
      indices.push(idx + 3, idx + 6, idx + 7); // Second triangle
    }

    // Add side faces to connect front and back
    for (let i = 0; i < numSegments - 1; i++)
    {
      const idx = i * 4;

      // Top edge side face
      indices.push(idx, idx + 4, idx + 2); // First triangle
      indices.push(idx + 2, idx + 4, idx + 6); // Second triangle

      // Bottom edge side face
      indices.push(idx + 1, idx + 3, idx + 5); // First triangle
      indices.push(idx + 3, idx + 7, idx + 5); // Second triangle
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

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

    // Create flag (unique geometry per flag for animation, share material)
    const flagGeometry = this.createFlagGeometry();
    const flagMesh = new THREE.Mesh(flagGeometry, this.sharedMaterials.flag);
    flagMesh.castShadow = this.shadowsEnabled;
    flagMesh.receiveShadow = this.shadowsEnabled;

    const flagY = this.cfg.poleHeight - this.cfg.flagBaseWidth / 2;
    flagMesh.position.set(xPosition, flagY, zPosition);
    this.scene.add(flagMesh);

    // Store flag data
    this.flagMeshes.push(
    {
      flagGeometry: flagGeometry,
      flagMesh: flagMesh,
      position:
      {
        x: xPosition,
        y: flagY,
        z: zPosition
      },
      currentAngle: this.cfg.flagMinAngle,
      targetAngle: this.cfg.flagMinAngle,
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
    const currentTime = ResourceManager.time.getElapsedTime();

    // Update each flag mesh based on wind
    for (let i = 0; i < this.flagMeshes.length; i++)
    {
      const flag = this.flagMeshes[i];
      const pos = flag.position;

      // Get wind at flag position
      const wind = sampleWindAtThreeJsPosition(windGenerator, pos.x, pos.y, pos.z);
      const windX_mph = wind.x; // cross
      const windZ_mph = wind.z; // head/tail
      const windHoriz_mph = Math.hypot(windX_mph, windZ_mph);

      // Nonlinear angle response: angle = min + span * (1 - exp(-K * v_h^2))
      const span = this.cfg.flagMaxAngle - this.cfg.flagMinAngle;
      const targetAngleDeg = this.cfg.flagMinAngle + span * (1 - Math.exp(-FlagRenderer.FLAG_ANGLE_RESPONSE_K * windHoriz_mph * windHoriz_mph));

      // Wind direction in ground plane
      const targetDirection = windHoriz_mph > 1e-6 ? Math.atan2(windZ_mph, windX_mph) : flag.currentDirection;

      // Smooth interpolate current angle toward target
      const angleDiff = targetAngleDeg - flag.currentAngle;
      const angleStep = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.cfg.flagAngleInterpolationSpeed * deltaTime);
      flag.currentAngle += angleStep;

      // Smooth interpolate current direction toward target
      let dirDiff = targetDirection - flag.currentDirection;
      while (dirDiff > Math.PI) dirDiff -= 2 * Math.PI;
      while (dirDiff < -Math.PI) dirDiff += 2 * Math.PI;
      const dirStep = Math.sign(dirDiff) * Math.min(Math.abs(dirDiff), this.cfg.flagDirectionInterpolationSpeed * deltaTime);
      flag.currentDirection += dirStep;

      // Update flap phase based on horizontal wind speed
      const flapFrequency = this.cfg.flagFlapFrequencyBase + windHoriz_mph * this.cfg.flagFlapFrequencyScale;
      flag.flapPhase += flapFrequency * 2 * Math.PI * deltaTime;

      // Update flag geometry with flapping
      this.updateFlagVertices(flag, flag.currentAngle, flag.currentDirection, windHoriz_mph);
    }
  }

  updateFlagVertices(flag, angleDeg, direction, windSpeedMph)
  {
    // Update all segments with flapping animation
    const numSegments = this.cfg.flagSegments;

    // Get the position attribute from the geometry
    const positions = flag.flagGeometry.attributes.position.array;

    // Update each segment (4 vertices per segment: 2 front + 2 back)
    for (let i = 0; i < numSegments; i++)
    {
      // Get positions using helper method with actual wind parameters
      const segmentPositions = this.calculateFlagSegmentPosition(i, angleDeg, direction, flag.flapPhase);

      // Update all 4 vertices for this segment (front and back faces)
      const idx = i * 4; // 4 vertices per segment

      // Front face vertices (positive X)
      positions[idx * 3 + 0] = segmentPositions.topFront[0]; // Top front X
      positions[idx * 3 + 1] = segmentPositions.topFront[1]; // Top front Y
      positions[idx * 3 + 2] = segmentPositions.topFront[2]; // Top front Z

      positions[(idx + 1) * 3 + 0] = segmentPositions.bottomFront[0]; // Bottom front X
      positions[(idx + 1) * 3 + 1] = segmentPositions.bottomFront[1]; // Bottom front Y
      positions[(idx + 1) * 3 + 2] = segmentPositions.bottomFront[2]; // Bottom front Z

      // Back face vertices (negative X)
      positions[(idx + 2) * 3 + 0] = segmentPositions.topBack[0]; // Top back X
      positions[(idx + 2) * 3 + 1] = segmentPositions.topBack[1]; // Top back Y
      positions[(idx + 2) * 3 + 2] = segmentPositions.topBack[2]; // Top back Z

      positions[(idx + 3) * 3 + 0] = segmentPositions.bottomBack[0]; // Bottom back X
      positions[(idx + 3) * 3 + 1] = segmentPositions.bottomBack[1]; // Bottom back Y
      positions[(idx + 3) * 3 + 2] = segmentPositions.bottomBack[2]; // Bottom back Z
    }

    // Mark the geometry as needing an update
    flag.flagGeometry.attributes.position.needsUpdate = true;
    flag.flagGeometry.computeVertexNormals();
  }
}