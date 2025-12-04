import * as THREE from 'three';
import
{
  Config
}
from './config.js';
import
{
  DustCloudFactory
}
from './DustCloud.js';
import
{
  ImpactMarkFactory
}
from './ImpactMark.js';

/**
 * GPU-based wind flag with shader-driven animation.
 * Uses static geometry with custom vertex shader for wind deformation.
 * No per-frame C++ calls - just uniform updates.
 */
export class WindFlag
{
  /**
   * Create a new wind flag
   * @param {Object} options - Configuration options
   * @param {Object} options.position - Position in meters (SI units) {x, y, z} (required)
   * @param {THREE.Scene} options.scene - Three.js scene to add pole/flag to (required)
   * @param {Object} options.config - Optional flag configuration (uses defaults if not provided)
   */
  constructor(options)
  {
    const
    {
      position,
      scene,
      config = {}
    } = options;

    if (!scene) throw new Error('Scene is required');
    if (!position) throw new Error('Position is required');

    this.scene = scene;

    // Flag configuration
    this.flagBaseWidth = config.flagBaseWidth ?? Config.WIND_FLAG_CONFIG.flagBaseWidth;
    this.flagTipWidth = config.flagTipWidth ?? Config.WIND_FLAG_CONFIG.flagTipWidth;
    this.flagLength = config.flagLength ?? Config.WIND_FLAG_CONFIG.flagLength;
    this.flagThickness = config.flagThickness ?? Config.WIND_FLAG_CONFIG.flagThickness;
    this.flagSegments = config.flagSegments ?? Config.WIND_FLAG_CONFIG.flagSegments;

    // Physics parameters (now used in shader)
    this.flagMinAngle = config.flagMinAngle ?? Config.WIND_FLAG_CONFIG.flagMinAngle;
    this.flagMaxAngle = config.flagMaxAngle ?? Config.WIND_FLAG_CONFIG.flagMaxAngle;
    this.flagAngleResponseK = config.flagAngleResponseK ?? Config.WIND_FLAG_CONFIG.flagAngleResponseK;
    this.flagFlapFrequencyBase = config.flagFlapFrequencyBase ?? Config.WIND_FLAG_CONFIG.flagFlapFrequencyBase;
    this.flagFlapFrequencyScale = config.flagFlapFrequencyScale ?? Config.WIND_FLAG_CONFIG.flagFlapFrequencyScale;
    this.flagFlapAmplitude = config.flagFlapAmplitude ?? Config.WIND_FLAG_CONFIG.flagFlapAmplitude;
    this.flagWaveLength = config.flagWaveLength ?? Config.WIND_FLAG_CONFIG.flagWaveLength;

    // Store pole height for flag positioning (meters)
    this.poleHeight = Config.WIND_FLAG_CONFIG.poleHeight;

    // Flag attaches at pole top minus half flag base width
    this.position = new THREE.Vector3(
      position.x,
      position.y + this.poleHeight - this.flagBaseWidth / 2,
      position.z
    );

    // Track wave phase incrementally to avoid large time * freq issues
    this.wavePhase = 0;

    // Create pole
    this.pole = this.createPole(position);

    // Create flag texture
    this.flagTexture = this.createFlagTexture();

    // Create shader material
    this.flagMaterial = this.createFlagMaterial();

    // Create static flag geometry
    this.flagGeometry = this.createStaticFlagGeometry();

    // Create flag mesh - positioned at flag attachment point
    this.flagMesh = new THREE.Mesh(this.flagGeometry, this.flagMaterial);
    this.flagMesh.position.copy(this.position);
    this.flagMesh.castShadow = true;
    this.flagMesh.receiveShadow = true;

    // Add to scene
    scene.add(this.pole);
    scene.add(this.flagMesh);
  }

  /**
   * Create pole mesh
   * @private
   */
  createPole(basePosition)
  {
    const poleThickness = Config.WIND_FLAG_CONFIG.poleThickness;
    const poleRadius = poleThickness / 2;
    const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, this.poleHeight, 16);
    const poleMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x606060,
      metalness: 0.4,
      roughness: 0.6
    });

    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(
      basePosition.x,
      basePosition.y + this.poleHeight / 2,
      basePosition.z
    );
    pole.castShadow = true;
    pole.receiveShadow = true;

    return pole;
  }

  /**
   * Create flag texture (red/yellow)
   * @private
   */
  createFlagTexture()
  {
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
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Create static flag geometry with segmentT attribute
   * Geometry is in local space - shader transforms to world position
   * @private
   */
  createStaticFlagGeometry()
  {
    const segments = this.flagSegments;
    const halfThickness = this.flagThickness / 2;

    const positions = [];
    const uvs = [];
    const segmentTs = [];
    const indices = [];

    // Generate vertices for each segment
    // Local space: X along flag length, Y is top/bottom, Z is front/back
    for (let i = 0; i < segments; i++)
    {
      const t = i / (segments - 1);
      const halfWidth = this.flagBaseWidth / 2 + (this.flagTipWidth / 2 - this.flagBaseWidth / 2) * t;
      const x = this.flagLength * t;

      // Front face vertices (z = +halfThickness)
      // Top front
      positions.push(x, halfWidth, halfThickness);
      uvs.push(t, 0.0);
      segmentTs.push(t);

      // Bottom front
      positions.push(x, -halfWidth, halfThickness);
      uvs.push(t, 1.0);
      segmentTs.push(t);

      // Back face vertices (z = -halfThickness)
      // Top back
      positions.push(x, halfWidth, -halfThickness);
      uvs.push(t, 0.0);
      segmentTs.push(t);

      // Bottom back
      positions.push(x, -halfWidth, -halfThickness);
      uvs.push(t, 1.0);
      segmentTs.push(t);
    }

    // Generate indices for front and back faces
    for (let i = 0; i < segments - 1; i++)
    {
      const idx = i * 4;

      // Front face triangles
      indices.push(idx, idx + 1, idx + 4);
      indices.push(idx + 1, idx + 5, idx + 4);

      // Back face triangles (reverse winding)
      indices.push(idx + 2, idx + 6, idx + 3);
      indices.push(idx + 3, idx + 6, idx + 7);
    }

    // Side faces (top and bottom edges)
    for (let i = 0; i < segments - 1; i++)
    {
      const idx = i * 4;

      // Top edge
      indices.push(idx, idx + 4, idx + 2);
      indices.push(idx + 2, idx + 4, idx + 6);

      // Bottom edge
      indices.push(idx + 1, idx + 3, idx + 5);
      indices.push(idx + 3, idx + 7, idx + 5);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('segmentT', new THREE.Float32BufferAttribute(segmentTs, 1));
    geometry.setIndex(indices);

    return geometry;
  }

  /**
   * Create shader material with wind deformation
   * Uses MeshStandardMaterial with onBeforeCompile for PBR lighting
   * @private
   */
  createFlagMaterial()
  {
    const material = new THREE.MeshStandardMaterial({
      map: this.flagTexture,
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide
    });

    // Store uniforms for updating
    this.uniforms = {
      uWindVector: { value: new THREE.Vector3(0, 0, 0) },
      uWavePhase: { value: 0 },  // Accumulated phase, not time
      uFlagLength: { value: this.flagLength },
      uMinAngle: { value: this.flagMinAngle },
      uMaxAngle: { value: this.flagMaxAngle },
      uAngleResponseK: { value: this.flagAngleResponseK },
      uFlapAmplitude: { value: this.flagFlapAmplitude },
      uWaveLength: { value: this.flagWaveLength }
    };

    material.onBeforeCompile = (shader) =>
    {
      // Add uniforms
      shader.uniforms.uWindVector = this.uniforms.uWindVector;
      shader.uniforms.uWavePhase = this.uniforms.uWavePhase;
      shader.uniforms.uFlagLength = this.uniforms.uFlagLength;
      shader.uniforms.uMinAngle = this.uniforms.uMinAngle;
      shader.uniforms.uMaxAngle = this.uniforms.uMaxAngle;
      shader.uniforms.uAngleResponseK = this.uniforms.uAngleResponseK;
      shader.uniforms.uFlapAmplitude = this.uniforms.uFlapAmplitude;
      shader.uniforms.uWaveLength = this.uniforms.uWaveLength;

      // Vertex shader: add attribute and uniforms
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `
        #include <common>
        
        attribute float segmentT;
        
        uniform vec3 uWindVector;
        uniform float uWavePhase;  // Pre-accumulated phase (0 to 2π)
        uniform float uFlagLength;
        uniform float uMinAngle;
        uniform float uMaxAngle;
        uniform float uAngleResponseK;
        uniform float uFlapAmplitude;
        uniform float uWaveLength;
        `
      );

      // Vertex shader: deform in local space, let Three.js handle world transform
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        
        // Extract horizontal wind components
        float windX = uWindVector.x;  // Crossrange
        float windZ = -uWindVector.z; // Downrange (BTK convention)
        float windSpeed = sqrt(windX * windX + windZ * windZ);
        float windSpeedMph = windSpeed * 2.237; // m/s to mph
        
        // Wind direction (atan2 of horizontal components)
        float windDir = windSpeed > 0.001 ? atan(windZ, windX) : 0.0;
        
        // Nonlinear angle response: angle = min + span * (1 - exp(-k * v^2))
        float angleSpan = uMaxAngle - uMinAngle;
        float angleDeg = uMinAngle + angleSpan * (1.0 - exp(-uAngleResponseK * windSpeedMph * windSpeedMph));
        float angleRad = angleDeg * 0.01745329; // deg to rad
        
        // Local space: X = along flag, Y = width, Z = thickness
        float localX = position.x; // 0 to flagLength
        float localY = position.y; // -halfWidth to +halfWidth  
        float localZ = position.z; // -halfThickness to +halfThickness
        float t = segmentT;
        
        // Direction vectors for rotating flag into wind direction
        float cosDir = cos(windDir);
        float sinDir = sin(windDir);
        float cosPitch = cos(angleRad);
        float sinPitch = sin(angleRad);
        
        // Wave/flapping animation - phase is pre-accumulated in JS to avoid time*freq jumps
        float waveArg = uWavePhase + t * uWaveLength * 6.28318;
        float waveOffset = sin(waveArg) * uFlapAmplitude * t;
        
        // Deform in LOCAL space:
        // 1. Start with base position along flag
        // 2. Apply pitch (tilt down based on wind)
        // 3. Rotate into wind direction
        // 4. Add wave perpendicular to wind direction
        
        // Position after pitch rotation (rotate around horizontal axis perpendicular to wind)
        // Pitch rotates the flag down from vertical
        float pitchedX = localX * sinPitch;  // Horizontal extension
        float pitchedY = -localX * cosPitch; // Vertical droop
        
        // Rotate into wind direction (around Y axis)
        float rotatedX = pitchedX * cosDir + waveOffset * sinDir;
        float rotatedY = pitchedY + localY; // Add width offset
        float rotatedZ = -pitchedX * sinDir + waveOffset * cosDir + localZ;
        
        // Final local position
        transformed = vec3(rotatedX, rotatedY, rotatedZ);
        `
      );

      // Also override normal calculation to account for wave deformation
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        // Compute deformed normal in local space
        
        // Recompute wind parameters (same as above)
        float nWindX = uWindVector.x;
        float nWindZ = -uWindVector.z;
        float nWindSpeed = sqrt(nWindX * nWindX + nWindZ * nWindZ);
        float nWindSpeedMph = nWindSpeed * 2.237;
        float nWindDir = nWindSpeed > 0.001 ? atan(nWindZ, nWindX) : 0.0;
        
        float nAngleSpan = uMaxAngle - uMinAngle;
        float nAngleDeg = uMinAngle + nAngleSpan * (1.0 - exp(-uAngleResponseK * nWindSpeedMph * nWindSpeedMph));
        float nAngleRad = nAngleDeg * 0.01745329;
        
        float nCosDir = cos(nWindDir);
        float nSinDir = sin(nWindDir);
        float nCosPitch = cos(nAngleRad);
        float nSinPitch = sin(nAngleRad);
        
        // Use pre-accumulated phase from JS
        float nWaveArg = uWavePhase + segmentT * uWaveLength * 6.28318;
        
        // Derivative of wave offset with respect to t (along flag)
        float dWave = cos(nWaveArg) * uFlapAmplitude * uWaveLength * 6.28318 * segmentT
                    + sin(nWaveArg) * uFlapAmplitude;
        
        // Tangent along flag (derivative of position with respect to t)
        vec3 localTangent;
        localTangent.x = nSinPitch * nCosDir + dWave * nSinDir;
        localTangent.y = -nCosPitch;
        localTangent.z = -nSinPitch * nSinDir + dWave * nCosDir;
        localTangent = normalize(localTangent);
        
        // Bitangent is the width direction (Y axis in local space)
        vec3 localBitangent = vec3(0.0, 1.0, 0.0);
        
        // Normal = tangent × bitangent
        vec3 objectNormal = normalize(cross(localTangent, localBitangent));
        
        // Flip for back face (negative Z in local space)
        if (position.z < 0.0) {
          objectNormal = -objectNormal;
        }
        `
      );

      // Fragment shader: use Three.js's normal pipeline (no custom injection needed)
      // The vertex shader sets objectNormal which flows through normalMatrix automatically
    };

    return material;
  }

  /**
   * Update flag based on wind
   * @param {Object} windGenerator - BTK WindGenerator instance
   * @param {number} deltaTime - Time step in seconds
   */
  update(windGenerator, deltaTime)
  {
    if (!windGenerator) return;

    // Sample wind at flag position
    const wind = windGenerator.sample(this.position.x, this.position.y, this.position.z);

    // Calculate horizontal wind speed for frequency
    const windX = wind.x;
    const windZ = -wind.z;
    const windSpeed = Math.sqrt(windX * windX + windZ * windZ);
    const windSpeedMph = windSpeed * 2.237; // m/s to mph

    // Calculate flap frequency based on wind speed
    const flapFreq = this.flagFlapFrequencyBase + windSpeedMph * this.flagFlapFrequencyScale;

    // Accumulate phase incrementally (avoids time*freq jumps when freq changes)
    this.wavePhase += flapFreq * deltaTime * 2 * Math.PI;

    // Wrap to 0-2π to avoid floating point issues
    this.wavePhase = this.wavePhase % (2 * Math.PI);

    // Update uniforms
    this.uniforms.uWindVector.value.set(wind.x, wind.y, wind.z);
    this.uniforms.uWavePhase.value = this.wavePhase;

    // Clean up C++ object
    wind.delete();
  }

  /**
   * Get the pole mesh for collision detection
   * @returns {THREE.Mesh}
   */
  getPoleMesh()
  {
    return this.pole;
  }

  /**
   * Register pole with the impact detector
   * @param {ImpactDetector} impactDetector - The impact detector to register with
   */
  registerWithImpactDetector(impactDetector)
  {
    if (!impactDetector || !this.pole) return;

    // Clone geometry and apply world transform
    const transformedGeometry = this.pole.geometry.clone();
    this.pole.updateMatrixWorld();
    transformedGeometry.applyMatrix4(this.pole.matrixWorld);

    impactDetector.addMeshFromGeometry(
      transformedGeometry,
      {
        name: 'FlagPole',
        soundName: 'ricochet',
        mesh: this.pole,
        onImpact: (impactPosition, normal, velocity, scene, windGenerator, targetMesh) =>
        {
          const pos = new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z);

          // Small metal dust puff
          DustCloudFactory.create(
          {
            position: pos,
            scene: scene,
            numParticles: Config.METAL_FRAME_DUST_CONFIG.numParticles,
            color: Config.METAL_FRAME_DUST_CONFIG.color,
            initialRadius: Config.METAL_FRAME_DUST_CONFIG.initialRadius,
            growthRate: Config.METAL_FRAME_DUST_CONFIG.growthRate,
            particleDiameter: Config.METAL_FRAME_DUST_CONFIG.particleDiameter
          });

          // Small dark impact mark
          ImpactMarkFactory.create(
          {
            position: pos,
            normal: normal,
            mesh: targetMesh,
            color: 0x2a2a2a,
            size: 0.2
          });
        }
      }
    );
  }

  /**
   * Dispose of resources
   */
  dispose()
  {
    if (this.pole)
    {
      this.scene.remove(this.pole);
      this.pole.geometry.dispose();
      this.pole.material.dispose();
    }

    if (this.flagMesh)
    {
      this.scene.remove(this.flagMesh);
      this.flagGeometry.dispose();
      this.flagMaterial.dispose();
      if (this.flagTexture)
      {
        this.flagTexture.dispose();
      }
    }
  }
}

/**
 * Factory class for managing multiple wind flags
 */
export class WindFlagFactory
{
  static flags = [];
  static poleMesh = null;
  static polePositions = [];
  static scene = null;

  /**
   * Create a single wind flag
   * @param {Object} options - Same as WindFlag constructor
   * @returns {WindFlag}
   */
  static create(options)
  {
    const flag = new WindFlag(options);
    this.flags.push(flag);
    return flag;
  }

  /**
   * Initialize instanced pole mesh (call after all flags are created)
   * @param {THREE.Scene} scene - Three.js scene
   */
  static initializePoleInstancing(scene)
  {
    if (this.flags.length === 0) return;

    this.scene = scene;

    // Create shared pole geometry and material
    const poleThickness = Config.WIND_FLAG_CONFIG.poleThickness;
    const poleHeight = Config.WIND_FLAG_CONFIG.poleHeight;
    const poleRadius = poleThickness / 2;
    const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 16);
    const poleMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x606060,
      metalness: 0.4,
      roughness: 0.6
    });

    // Create instanced mesh for all poles
    this.poleMesh = new THREE.InstancedMesh(poleGeometry, poleMaterial, this.flags.length);
    this.poleMesh.castShadow = true;
    this.poleMesh.receiveShadow = true;
    scene.add(this.poleMesh);

    // Set instance matrices for all poles
    const instanceMatrix = new THREE.Matrix4();
    for (let i = 0; i < this.flags.length; i++)
    {
      const flag = this.flags[i];
      const polePosition = flag.pole.position;
      instanceMatrix.makeTranslation(polePosition.x, polePosition.y, polePosition.z);
      this.poleMesh.setMatrixAt(i, instanceMatrix);
      this.polePositions.push(polePosition.clone());

      // Remove individual pole from scene
      scene.remove(flag.pole);
    }

    this.poleMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Create all flags along the range
   * @param {THREE.Scene} scene - Three.js scene
   * @param {Landscape} landscape - Landscape instance for height queries
   * @param {Object} options - Optional configuration
   */
  static createFlags(scene, landscape, options = {})
  {
    const
    {
      maxRange = Config.LANDSCAPE_CONFIG.groundLength,
        interval = Config.WIND_FLAG_CONFIG.interval,
        sideOffset = Config.LANDSCAPE_CONFIG.groundWidth / 2,
        config = {}
    } = options;

    // Clear existing flags
    this.deleteAll();

    // Create flags every interval
    for (let distance = interval; distance <= maxRange; distance += interval)
    {
      const z = -distance;

      // Left side flag
      const leftX = -sideOffset;
      const leftY = landscape.getHeightAt(leftX, z) || 0;
      const leftFlag = new WindFlag(
      {
        position: { x: leftX, y: leftY, z },
        scene,
        config
      });
      this.flags.push(leftFlag);

      // Right side flag
      const rightX = sideOffset;
      const rightY = landscape.getHeightAt(rightX, z) || 0;
      const rightFlag = new WindFlag(
      {
        position: { x: rightX, y: rightY, z },
        scene,
        config
      });
      this.flags.push(rightFlag);
    }

    // Initialize pole instancing after all flags are created
    this.initializePoleInstancing(scene);
  }

  /**
   * Update all flags
   * @param {Object} windGenerator - BTK WindGenerator instance
   * @param {number} deltaTime - Time step in seconds
   */
  static updateAll(windGenerator, deltaTime)
  {
    for (const flag of this.flags)
    {
      flag.update(windGenerator, deltaTime);
    }
  }

  /**
   * Delete all flags
   */
  static deleteAll()
  {
    for (const flag of this.flags)
    {
      flag.dispose();
    }
    this.flags = [];

    if (this.poleMesh && this.scene)
    {
      this.scene.remove(this.poleMesh);
      this.poleMesh.geometry.dispose();
      this.poleMesh.material.dispose();
      this.poleMesh = null;
    }
    this.polePositions = [];
    this.scene = null;
  }

  /**
   * Get all flags
   * @returns {WindFlag[]}
   */
  static getAll()
  {
    return this.flags;
  }
}
