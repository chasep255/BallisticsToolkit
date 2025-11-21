import * as THREE from 'three';

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
   * @param {Object} options.position - Position in yards {x, y, z} (required)
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

    // Provide defaults matching flags.js constants
    const flagConfig = {
      flagBaseWidth: config.flagBaseWidth ?? (60.0 / 36.0),
      flagTipWidth: config.flagTipWidth ?? (24.0 / 36.0),
      flagLength: config.flagLength ?? (16.0 / 3.0),
      flagThickness: config.flagThickness ?? 0.05,
      flagSegments: config.flagSegments ?? 10,
      flagMinAngle: config.flagMinAngle ?? 1.0,
      flagMaxAngle: config.flagMaxAngle ?? 90.0,
      flagAngleResponseK: config.flagAngleResponseK ?? 0.0205,
      flagAngleInterpolationSpeed: config.flagAngleInterpolationSpeed ?? 30.0,
      flagDirectionInterpolationSpeed: config.flagDirectionInterpolationSpeed ?? 1.0,
      flagFlapFrequencyBase: config.flagFlapFrequencyBase ?? 0.5,
      flagFlapFrequencyScale: config.flagFlapFrequencyScale ?? 0.25,
      flagFlapAmplitude: config.flagFlapAmplitude ?? 0.3,
      flagWaveLength: config.flagWaveLength ?? 1.5
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

    // Store pole height for flag positioning
    this.poleHeight = 12.0; // yards
    this.flagBaseWidth = flagConfig.flagBaseWidth;

    // Flag attaches at pole top minus half flag base width
    // Set C++ flag position (flag center position)
    const flagY = position.y + this.poleHeight - this.flagBaseWidth / 2;
    this.windFlag.setPosition(position.x, flagY, position.z);

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
    const poleThickness = 0.1; // yards
    const baseY = this.windFlag.getPosition().y - this.poleHeight + this.flagBaseWidth / 2;

    const poleGeometry = new THREE.BoxGeometry(poleThickness, this.poleHeight, poleThickness);
    const poleMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0xc0c0c0,
      metalness: 0.8,
      roughness: 0.2
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

    // Get vertices, UVs, and indices from C++
    const vertexView = this.windFlag.getVertices();
    const uvView = this.windFlag.getUVs();
    const indexView = this.windFlag.getIndices();

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

    const indices = new Uint32Array(indexView.length);
    indices.set(indexView);

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

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

    const btk = window.btk;
    const pos = this.windFlag.getPosition();

    // Convert Three.js position (yards) to BTK position (meters)
    const posBtk = new btk.Vector3D(
      btk.Conversions.yardsToMeters(-pos.z), // Three Z (downrange) → BTK X (downrange)
      btk.Conversions.yardsToMeters(pos.x),  // Three X (crossrange) → BTK Y (crossrange)
      btk.Conversions.yardsToMeters(pos.y)   // Three Y (up) → BTK Z (up)
    );

    // Sample wind in BTK coordinates (m/s)
    const windBtk = windGenerator.sample(posBtk.x, posBtk.y, posBtk.z);
    posBtk.delete();

    // Update C++ flag physics
    this.windFlag.update(deltaTime, windBtk);
    windBtk.delete();

    // Update display geometry
    this.windFlag.updateDisplay();

    // Update Three.js geometry from C++ buffers
    const vertexView = this.windFlag.getVertices();
    const uvView = this.windFlag.getUVs();

    if (vertexView && vertexView.length > 0)
    {
      const positions = this.flagMesh.geometry.attributes.position.array;
      positions.set(vertexView);
      this.flagMesh.geometry.attributes.position.needsUpdate = true;
    }

    if (uvView && uvView.length > 0)
    {
      const uvs = this.flagMesh.geometry.attributes.uv.array;
      uvs.set(uvView);
      this.flagMesh.geometry.attributes.uv.needsUpdate = true;
    }

    // Recompute normals for lighting
    this.flagMesh.geometry.computeVertexNormals();
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
   * Create all flags along the range
   * @param {THREE.Scene} scene - Three.js scene
   * @param {Landscape} landscape - Landscape instance for height queries
   * @param {Object} options - Optional configuration
   * @param {number} options.maxRange - Maximum range in yards (default: 2000)
   * @param {number} options.interval - Flag interval in yards (default: 100)
   * @param {number} options.sideOffset - Distance from center to flag positions in yards (default: 50)
   * @param {Object} options.config - Flag configuration overrides
   */
  static createFlags(scene, landscape, options = {})
  {
    const
    {
      maxRange = 2000,
      interval = 100,
      sideOffset = 50,
      config = {}
    } = options;

    // Clear existing flags
    this.deleteAll();

    // Create flags every interval yards from interval to maxRange
    for (let distance = interval; distance <= maxRange; distance += interval)
    {
      const z = -distance; // Negative Z = downrange

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

