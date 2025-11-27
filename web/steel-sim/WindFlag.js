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
 * Wrapper class for C++ WindFlag that manages Three.js rendering resources
 * Creates pole geometry and flag texture, uses C++ WindFlag for flag geometry
 * 
 * Requires window.btk to be initialized (loaded by main application).
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

    const btk = window.btk;
    this.scene = scene;

    // Use config defaults, allow overrides
    const flagConfig = {
      flagBaseWidth: config.flagBaseWidth ?? Config.WIND_FLAG_CONFIG.flagBaseWidth,
      flagTipWidth: config.flagTipWidth ?? Config.WIND_FLAG_CONFIG.flagTipWidth,
      flagLength: config.flagLength ?? Config.WIND_FLAG_CONFIG.flagLength,
      flagThickness: config.flagThickness ?? Config.WIND_FLAG_CONFIG.flagThickness,
      flagSegments: config.flagSegments ?? Config.WIND_FLAG_CONFIG.flagSegments,
      flagMinAngle: config.flagMinAngle ?? Config.WIND_FLAG_CONFIG.flagMinAngle,
      flagMaxAngle: config.flagMaxAngle ?? Config.WIND_FLAG_CONFIG.flagMaxAngle,
      flagAngleResponseK: config.flagAngleResponseK ?? Config.WIND_FLAG_CONFIG.flagAngleResponseK,
      flagAngleInterpolationSpeed: config.flagAngleInterpolationSpeed ?? Config.WIND_FLAG_CONFIG.flagAngleInterpolationSpeed,
      flagDirectionInterpolationSpeed: config.flagDirectionInterpolationSpeed ?? Config.WIND_FLAG_CONFIG.flagDirectionInterpolationSpeed,
      flagFlapFrequencyBase: config.flagFlapFrequencyBase ?? Config.WIND_FLAG_CONFIG.flagFlapFrequencyBase,
      flagFlapFrequencyScale: config.flagFlapFrequencyScale ?? Config.WIND_FLAG_CONFIG.flagFlapFrequencyScale,
      flagFlapAmplitude: config.flagFlapAmplitude ?? Config.WIND_FLAG_CONFIG.flagFlapAmplitude,
      flagWaveLength: config.flagWaveLength ?? Config.WIND_FLAG_CONFIG.flagWaveLength
    };

    // Create C++ WindFlag instance with configurable parameters
    this.windFlag = new btk.WindFlag(
      flagConfig.flagBaseWidth,
      flagConfig.flagTipWidth,
      flagConfig.flagLength,
      flagConfig.flagThickness,
      flagConfig.flagSegments,
      flagConfig.flagMinAngle,
      flagConfig.flagMaxAngle,
      flagConfig.flagAngleResponseK,
      flagConfig.flagAngleInterpolationSpeed,
      flagConfig.flagDirectionInterpolationSpeed,
      flagConfig.flagFlapFrequencyBase,
      flagConfig.flagFlapFrequencyScale,
      flagConfig.flagFlapAmplitude,
      flagConfig.flagWaveLength
    );

    // Store pole height for flag positioning (meters - Three.js scene is in meters)
    this.poleHeight = Config.WIND_FLAG_CONFIG.poleHeight; // meters
    this.flagBaseWidth = flagConfig.flagBaseWidth; // meters from C++

    // Flag attaches at pole top minus half flag base width
    // Position is in meters (Three.js scene is in meters)
    const flagY = position.y + this.poleHeight - this.flagBaseWidth / 2;
    this.windFlag.setPosition(
      position.x,
      flagY,
      position.z
    );

    // Create pole
    this.pole = this.createPole();

    // Create flag texture
    this.flagTexture = this.createFlagTexture();

    // Create flag mesh (this will call updateDisplay() internally)
    this.flagMesh = this.createFlagMesh();

    // Ensure mesh was created successfully
    if (!this.flagMesh)
    {
      throw new Error('Failed to create flag mesh - vertices buffer is empty. Check that flagSegments > 0.');
    }

    // Add to scene
    scene.add(this.pole);
    if (this.flagMesh)
    {
      scene.add(this.flagMesh);
    }
  }

  /**
   * Create pole mesh
   * @private
   */
  createPole()
  {
    const poleThickness = Config.WIND_FLAG_CONFIG.poleThickness;
    const baseY = this.windFlag.getPosition().y - this.poleHeight + this.flagBaseWidth / 2;

    const poleRadius = poleThickness / 2;
    const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, this.poleHeight, 16);
    const poleMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x606060, // Darker metal gray (original)
      metalness: 0.4,
      roughness: 0.6
    });

    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(
      this.windFlag.getPosition().x,
      baseY + this.poleHeight / 2,
      this.windFlag.getPosition().z
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
   * Create flag mesh from C++ geometry
   * @private
   */
  createFlagMesh()
  {
    // Update display to generate initial geometry
    this.windFlag.updateDisplay();

    // Get vertices, UVs, indices, and normals from C++
    const vertexView = this.windFlag.getVertices();
    const uvView = this.windFlag.getUVs();
    const indexView = this.windFlag.getIndices();
    const normalView = this.windFlag.getNormals();

    if (!vertexView || vertexView.length === 0)
    {
      console.error('getVertices returned empty or invalid view');
      return null;
    }

    // Create Float32Arrays from memory views
    const positions = new Float32Array(vertexView.length);
    positions.set(vertexView);

    const uvs = new Float32Array(uvView.length);
    uvs.set(uvView);

    const normals = new Float32Array(normalView.length);
    normals.set(normalView);

    const indices = new Uint32Array(indexView.length);
    indices.set(indexView);

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    
    // Mark position and normal as stream (updated every frame, rendered once)
    geometry.attributes.position.setUsage(THREE.StreamDrawUsage);
    geometry.attributes.normal.setUsage(THREE.StreamDrawUsage);

    // Create material with flag texture
    const material = new THREE.MeshStandardMaterial(
    {
      map: this.flagTexture,
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    // Vertices from C++ are already in world space, so mesh is at origin
    // Position is already included in vertex coordinates
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Update flag physics and geometry based on wind
   * @param {Object} windGenerator - BTK WindGenerator instance (required)
   * @param {number} deltaTime - Time step in seconds
   */
  update(windGenerator, deltaTime)
  {
    if (!this.windFlag || !this.flagMesh || !windGenerator) return;

    const pos = this.windFlag.getPosition();

    // Sample wind in BTK coordinates (m/s) - pos is already a Vector3D
    const windBtk = windGenerator.sample(pos.x, pos.y, pos.z);

    // Update C++ flag physics
    this.windFlag.update(deltaTime, windBtk);
    windBtk.delete();

    // Update display geometry (includes normals computation in C++)
    this.windFlag.updateDisplay();

    // Update Three.js geometry from C++ buffers
    const positions = this.flagMesh.geometry.attributes.position.array;
    positions.set(this.windFlag.getVertices());
    this.flagMesh.geometry.attributes.position.needsUpdate = true;

    const normals = this.flagMesh.geometry.attributes.normal.array;
    normals.set(this.windFlag.getNormals());
    this.flagMesh.geometry.attributes.normal.needsUpdate = true;
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
        soundName: 'ricochet', // Metal ricochet sound
        mesh: this.pole, // Store mesh reference for decal projection
        onImpact: (impactPosition, normal, velocity, scene, windGenerator, targetMesh) =>
        {
          const pos = new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z);

          // Small metal dust puff
          DustCloudFactory.create(
          {
            position: pos,
            scene: scene,
            numParticles: 150,
            color:
            {
              r: 160,
              g: 160,
              b: 160
            }, // Light grey
            windGenerator: windGenerator,
            initialRadius: 0.02,
            growthRate: 0.06,
            particleDiameter: 0.3
          });

          // Small dark impact mark (1cm)
          ImpactMarkFactory.create(
          {
            position: pos,
            normal: normal,
            velocity: velocity,
            mesh: targetMesh,
            color: 0x2a2a2a, // Dark grey
            size: 0.2 // 1cm
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
      this.flagMesh.geometry.dispose();
      this.flagMesh.material.dispose();
      if (this.flagTexture)
      {
        this.flagTexture.dispose();
      }
    }

    if (this.windFlag)
    {
      this.windFlag.delete();
    }
  }
}

/**
 * Factory class for managing multiple wind flags
 */
export class WindFlagFactory
{
  static flags = [];

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
   * Create all flags along the range (legacy method for fclass-sim compatibility)
   * @param {THREE.Scene} scene - Three.js scene
   * @param {Landscape} landscape - Landscape instance for height queries
   * @param {Object} options - Optional configuration (all in meters, SI units)
   * @param {number} options.maxRange - Maximum range in meters
   * @param {number} options.interval - Flag interval in meters
   * @param {number} options.sideOffset - Distance from center to flag positions in meters
   * @param {Object} options.config - Flag configuration overrides
   */
  static createFlags(scene, landscape, options = {})
  {
    const btk = window.btk;
    const
    {
      maxRange = Config.LANDSCAPE_CONFIG.groundLength,
        interval = Config.WIND_FLAG_CONFIG.interval,
        sideOffset = Config.LANDSCAPE_CONFIG.groundWidth / 2,
        config = {}
    } = options;

    // Clear existing flags
    this.deleteAll();

    // All values are in meters - Three.js scene is in meters
    // Create flags every interval from interval to maxRange
    for (let distance = interval; distance <= maxRange; distance += interval)
    {
      const z = -distance; // Negative Z = downrange (meters)

      // Left side flag
      const leftX = -sideOffset; // meters
      const leftY = landscape.getHeightAt(leftX, z) || 0;
      const leftFlag = new WindFlag(
      {
        position:
        {
          x: leftX,
          y: leftY,
          z
        },
        scene,
        config
      });
      this.flags.push(leftFlag);

      // Right side flag
      const rightX = sideOffset; // meters
      const rightY = landscape.getHeightAt(rightX, z) || 0;
      const rightFlag = new WindFlag(
      {
        position:
        {
          x: rightX,
          y: rightY,
          z
        },
        scene,
        config
      });
      this.flags.push(rightFlag);
    }
  }

  /**
   * Update all flags
   * @param {Object} windGenerator - BTK WindGenerator instance (optional)
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