import * as THREE from 'three';
import
{
  Config
}
from './config.js';

// Atlas configuration
const ATLAS_TILE_SIZE = 512; // Each target gets 512x512 in the atlas

/**
 * Wrapper class for C++ SteelTarget physics object.
 * No longer creates individual meshes - uses merged geometry from factory.
 * 
 * Requires window.btk to be initialized (loaded by main application).
 */
export class SteelTarget
{
  /**
   * Create a new steel target
   * @param {Object} options - Configuration options
   * @param {Object} options.position - Position in meters (SI units) {x, y, z} (required)
   * @param {number} options.width - Width in meters (required)
   * @param {number} options.height - Height in meters (required)
   * @param {number} options.thickness - Thickness in meters (default from config)
   * @param {boolean} options.isOval - True for oval shape, false for rectangle (default false)
   * @param {number} options.beamHeight - Height of overhead beam in meters
   * @param {number} options.attachmentAngle - Angle in radians for oval attachment point
   * @param {number} options.outwardOffset - Outward offset for chain anchors in meters
   * @param {THREE.Scene} options.scene - Three.js scene (required)
   */
  constructor(options)
  {
    const
    {
      position,
      width,
      height,
      thickness,
      isOval = false,
      beamHeight = Config.TARGET_CONFIG.defaultBeamHeight,
      attachmentAngle = Math.PI / 4,
      outwardOffset = 0,
      scene
    } = options;

    if (!scene) throw new Error('Scene is required');
    if (!position) throw new Error('Position is required');
    if (width === undefined || width === null) throw new Error('Width is required');
    if (height === undefined || height === null) throw new Error('Height is required');

    const btk = window.btk;

    this.scene = scene;
    this.outwardOffset = outwardOffset;
    this.isOval = isOval;

    // Target index in merged geometry (assigned by factory)
    this.targetIndex = null;
    this.vertexOffset = null;   // Offset in merged vertex buffer
    this.vertexCount = null;    // Number of vertices for this target
    this.atlasOffset = null;    // Offset in atlas (y position)

    // Calculate attachment points
    let attachmentX, attachmentY;
    if (isOval)
    {
      const radius = width / 2;
      attachmentX = radius * Math.sin(attachmentAngle);
      attachmentY = radius * Math.cos(attachmentAngle);
    }
    else
    {
      attachmentX = width / 3;
      attachmentY = height / 2;
    }

    // Create BTK steel target (physics + rendering data)
    const initialPos = new btk.Vector3D(position.x, position.y, position.z);
    const defaultNormal = new btk.Vector3D(0, 0, -1);
    this.steelTarget = new btk.SteelTarget(width, height, thickness, isOval, initialPos, defaultNormal, ATLAS_TILE_SIZE);
    initialPos.delete();
    defaultNormal.delete();

    // Add chain anchors
    const leftLocalAttach = new btk.Vector3D(-attachmentX, attachmentY, -thickness / 2);
    const rightLocalAttach = new btk.Vector3D(+attachmentX, attachmentY, -thickness / 2);

    const leftWorldAttach = this.steelTarget.localToWorld(leftLocalAttach);
    const rightWorldAttach = this.steelTarget.localToWorld(rightLocalAttach);

    const leftWorldFixed = new btk.Vector3D(
      leftWorldAttach.x + this.outwardOffset,
      beamHeight,
      leftWorldAttach.z
    );
    const rightWorldFixed = new btk.Vector3D(
      rightWorldAttach.x - this.outwardOffset,
      beamHeight,
      rightWorldAttach.z
    );

    this.steelTarget.addChainAnchor(leftLocalAttach, leftWorldFixed);
    this.steelTarget.addChainAnchor(rightLocalAttach, rightWorldFixed);

    leftWorldAttach.delete();
    rightWorldAttach.delete();
    leftLocalAttach.delete();
    rightLocalAttach.delete();
    leftWorldFixed.delete();
    rightWorldFixed.delete();

    // Chain instance indices (assigned by factory)
    this.chainInstanceIndices = [null, null];
  }

  /**
   * Check if target is moving
   * @returns {boolean}
   */
  isMoving()
  {
    return this.steelTarget ? this.steelTarget.isMoving() : false;
  }

  /**
   * Step physics simulation
   * @param {number} dt - Time step in seconds
   */
  stepPhysics(dt)
  {
    if (!this.steelTarget) return;
    this.steelTarget.timeStep(dt);
  }

  /**
   * Update mesh in merged geometry (called by factory for moving targets)
   */
  updateMesh()
  {
    if (!this.steelTarget || this.targetIndex === null) return;
    SteelTargetFactory.copyTargetToMerged(this);
  }

  /**
   * Update texture in atlas
   */
  updateTexture()
  {
    if (!this.steelTarget || this.targetIndex === null) return;
    SteelTargetFactory.copyTextureToAtlas(this);
  }

  /**
   * Update chain positions
   */
  updateChainLines()
  {
    if (!this.steelTarget) return;

    const anchors = this.steelTarget.getAnchors();
    if (anchors.size() === 0) return;

    if (SteelTargetFactory.chainMesh && this.chainInstanceIndices[0] !== null)
    {
      const instanceMatrix = new THREE.Matrix4();
      const up = new THREE.Vector3(0, 1, 0);
      const chainDirection = new THREE.Vector3();

      for (let i = 0; i < Math.min(anchors.size(), 2); i++)
      {
        const instanceIndex = this.chainInstanceIndices[i];
        if (instanceIndex === null) continue;

        const anchor = anchors.get(i);
        const attachWorld = this.steelTarget.localToWorld(anchor.localAttachment);

        const fixed = new THREE.Vector3(
          anchor.worldFixed.x,
          anchor.worldFixed.y,
          anchor.worldFixed.z
        );
        const attach = new THREE.Vector3(
          attachWorld.x,
          attachWorld.y,
          attachWorld.z
        );

        chainDirection.subVectors(attach, fixed);
        const chainLength = chainDirection.length();
        chainDirection.normalize();

        const midpoint = new THREE.Vector3();
        midpoint.addVectors(fixed, attach);
        midpoint.multiplyScalar(0.5);

        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, chainDirection);
        const scale = new THREE.Vector3(1, chainLength, 1);

        instanceMatrix.compose(midpoint, quaternion, scale);
        SteelTargetFactory.chainMesh.setMatrixAt(instanceIndex, instanceMatrix);

        attachWorld.delete();
      }

      SteelTargetFactory.chainMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Apply bullet hit
   * @param {btk.Bullet} bullet
   */
  hit(bullet)
  {
    if (!this.steelTarget) return;
    this.steelTarget.hit(bullet);
    this.updateTexture();
    SteelTargetFactory._moveToMoving(this);
  }

  /**
   * Check trajectory intersection
   * @param {btk.Trajectory} trajectory
   * @returns {btk.TrajectoryPoint|null}
   */
  intersectTrajectory(trajectory)
  {
    if (!this.steelTarget) return null;
    const hit = this.steelTarget.intersectTrajectory(trajectory);
    return (hit !== undefined && hit !== null) ? hit : null;
  }

  /**
   * Enable/disable debug logging
   * @param {boolean} enabled
   */
  setDebug(enabled)
  {
    if (this.steelTarget && typeof this.steelTarget.setDebug === 'function')
    {
      this.steelTarget.setDebug(!!enabled);
    }
  }

  /**
   * Clean up resources
   */
  dispose()
  {
    if (this.steelTarget)
    {
      this.steelTarget.delete();
      this.steelTarget = null;
    }

    this.targetIndex = null;
    this.vertexOffset = null;
    this.vertexCount = null;
    this.atlasOffset = null;
    this.chainInstanceIndices = [null, null];
  }
}

/**
 * Factory class for steel targets with merged geometry rendering.
 * All targets share one BufferGeometry and one texture atlas.
 * Result: 1 draw call for all targets.
 */
export class SteelTargetFactory
{
  // Target collections
  static allTargets = new Set();
  static movingTargets = new Set();

  // Merged geometry state
  static mergedMesh = null;
  static mergedGeometry = null;
  static atlasTexture = null;
  static atlasData = null;
  static targetIndexBuffer = null;

  // Buffer arrays
  static vertexBuffer = null;
  static uvBuffer = null;
  static normalBuffer = null;

  // Chain instancing
  static chainMesh = null;
  static chainScene = null;
  static nextChainInstanceIndex = 0;

  // Scene reference
  static scene = null;

  /**
   * Create a new steel target (adds to pending, no mesh yet)
   * @param {Object} options
   * @returns {SteelTarget}
   */
  static create(options)
  {
    const target = new SteelTarget(options);
    this.allTargets.add(target);
    this.movingTargets.add(target);
    return target;
  }

  /**
   * Initialize merged mesh after all targets are created.
   * Call this once after all targets exist.
   * @param {THREE.Scene} scene
   */
  static initializeMergedMesh(scene)
  {
    this.scene = scene;
    const targets = [...this.allTargets];
    const numTargets = targets.length;

    if (numTargets === 0) return;

    console.log(`SteelTargetFactory.initializeMergedMesh: ${numTargets} targets`);

    // First pass: update display and count total vertices
    let totalVertices = 0;
    const targetVertexCounts = [];

    for (const target of targets)
    {
      target.steelTarget.updateDisplay();
      const vertices = target.steelTarget.getVertices();
      const vertexCount = vertices.length / 3;
      targetVertexCounts.push(vertexCount);
      totalVertices += vertexCount;
    }

    console.log(`  Total vertices: ${totalVertices}`);

    // Create texture array (one layer per target, 256x256 each)
    // Data layout: [layer0, layer1, layer2...] where each layer is 256x256x4 bytes
    const pixelsPerLayer = ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4;
    this.atlasData = new Uint8Array(pixelsPerLayer * numTargets);

    this.atlasTexture = new THREE.DataArrayTexture(
      this.atlasData,
      ATLAS_TILE_SIZE,
      ATLAS_TILE_SIZE,
      numTargets
    );
    this.atlasTexture.format = THREE.RGBAFormat;
    this.atlasTexture.type = THREE.UnsignedByteType;
    this.atlasTexture.minFilter = THREE.LinearFilter;
    this.atlasTexture.magFilter = THREE.LinearFilter;
    this.atlasTexture.flipY = false;

    // Allocate merged buffers
    this.vertexBuffer = new Float32Array(totalVertices * 3);
    this.uvBuffer = new Float32Array(totalVertices * 2);
    this.normalBuffer = new Float32Array(totalVertices * 3);
    this.targetIndexBuffer = new Float32Array(totalVertices); // Layer index per vertex

    // Second pass: assign indices and copy data
    let vertexOffset = 0;

    for (let i = 0; i < targets.length; i++)
    {
      const target = targets[i];
      const vertexCount = targetVertexCounts[i];

      // Assign indices to target
      target.targetIndex = i;
      target.vertexOffset = vertexOffset;
      target.vertexCount = vertexCount;
      target.atlasOffset = i; // Layer index in texture array

      // Copy vertex and normal data
      const srcVertices = target.steelTarget.getVertices();
      const srcNormals = target.steelTarget.getNormals();

      this.vertexBuffer.set(srcVertices, vertexOffset * 3);
      this.normalBuffer.set(srcNormals, vertexOffset * 3);

      // Copy UVs directly (no remapping needed for texture array)
      const srcUVs = target.steelTarget.getUVs();
      this.uvBuffer.set(srcUVs, vertexOffset * 2);

      // Set target index (layer) for all vertices of this target
      for (let j = 0; j < vertexCount; j++)
      {
        this.targetIndexBuffer[vertexOffset + j] = i;
      }

      // Copy texture to array layer (C++ texture matches atlas size)
      const srcData = target.steelTarget.getTexture();
      const pixelsPerLayer = ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4;
      const layerOffset = i * pixelsPerLayer;
      this.atlasData.set(srcData, layerOffset);

      vertexOffset += vertexCount;
    }

    // Create merged geometry
    this.mergedGeometry = new THREE.BufferGeometry();
    this.mergedGeometry.setAttribute('position', new THREE.BufferAttribute(this.vertexBuffer, 3));
    this.mergedGeometry.setAttribute('uv', new THREE.BufferAttribute(this.uvBuffer, 2));
    this.mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(this.normalBuffer, 3));
    this.mergedGeometry.setAttribute('targetIndex', new THREE.BufferAttribute(this.targetIndexBuffer, 1));

    // Mark as dynamic for updates
    this.mergedGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.mergedGeometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);

    // Create material with texture array (requires custom shader)
    const material = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      roughness: 0.5,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    // Patch shader to use texture array
    material.onBeforeCompile = (shader) => {
      // Add targetIndex attribute and varying
      shader.vertexShader = `
        attribute float targetIndex;
        varying float vTargetIndex;
        varying vec2 vUv;
      ` + shader.vertexShader;

      // Pass targetIndex and ensure vUv is set
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `
        #include <uv_vertex>
        vTargetIndex = targetIndex;
        vUv = uv;
        `
      );

      // Add uniform for texture array
      shader.uniforms.mapArray = { value: this.atlasTexture };
      shader.uniforms.map = { value: null }; // Disable regular map

      // Replace fragment shader to use sampler2DArray
      shader.fragmentShader = `
        uniform sampler2DArray mapArray;
        varying float vTargetIndex;
        varying vec2 vUv;
      ` + shader.fragmentShader;

      // Replace map sampling with texture array sampling
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `
        vec4 diffuseColor;
        if (vUv.x < 0.0) {
          // Edge face - metal gray
          diffuseColor = vec4(vec3(0.55), opacity);
        } else {
          // Sample texture array: texture(mapArray, vec3(uv, layerIndex))
          vec4 texColor = texture(mapArray, vec3(vUv, vTargetIndex));
          diffuseColor = texColor;
        }
        `
      );

      // Remove default map sampling
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        '// map_fragment replaced by texture array sampling above'
      );
    };

    // Create merged mesh
    this.mergedMesh = new THREE.Mesh(this.mergedGeometry, material);
    this.mergedMesh.castShadow = true;
    this.mergedMesh.receiveShadow = true;
    scene.add(this.mergedMesh);

    this.atlasTexture.needsUpdate = true;

    console.log(`  Texture array: ${ATLAS_TILE_SIZE}x${ATLAS_TILE_SIZE} x ${numTargets} layers`);
    console.log(`  Merged mesh created`);
  }

  /**
   * Initialize chain instancing
   * @param {THREE.Scene} scene
   */
  static initializeChainInstancing(scene)
  {
    const totalChains = this.allTargets.size * 2;
    if (totalChains === 0) return;

    this.chainScene = scene;

    const chainRadius = Config.TARGET_CONFIG.chainRadius;
    const chainGeometry = new THREE.CylinderGeometry(chainRadius, chainRadius, 1.0, 8);
    chainGeometry.computeVertexNormals();

    const chainMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.5,
      metalness: 0.6
    });

    this.chainMesh = new THREE.InstancedMesh(chainGeometry, chainMaterial, totalChains);
    this.chainMesh.castShadow = true;
    this.chainMesh.receiveShadow = true;
    scene.add(this.chainMesh);

    let instanceIndex = 0;
    for (const target of this.allTargets)
    {
      target.chainInstanceIndices = [instanceIndex++, instanceIndex++];
    }

    for (const target of this.allTargets)
    {
      target.updateChainLines();
    }
  }

  /**
   * Copy a target's vertices/normals to the merged buffer
   * @param {SteelTarget} target
   */
  static copyTargetToMerged(target)
  {
    if (!this.mergedGeometry || target.vertexOffset === null) return;

    // Update C++ display buffer
    target.steelTarget.updateDisplay();

    // Copy vertices
    const srcVertices = target.steelTarget.getVertices();
    this.vertexBuffer.set(srcVertices, target.vertexOffset * 3);

    // Copy normals
    const srcNormals = target.steelTarget.getNormals();
    this.normalBuffer.set(srcNormals, target.vertexOffset * 3);

    // Mark range as needing update
    const posAttr = this.mergedGeometry.attributes.position;
    posAttr.needsUpdate = true;
    // Note: updateRange can be used for partial updates if needed
    // posAttr.updateRange.offset = target.vertexOffset * 3;
    // posAttr.updateRange.count = target.vertexCount * 3;

    const normAttr = this.mergedGeometry.attributes.normal;
    normAttr.needsUpdate = true;
  }

  /**
   * Copy a target's texture to the texture array
   * @param {SteelTarget} target
   */
  static copyTextureToAtlas(target)
  {
    if (!this.atlasTexture || target.atlasOffset === null) return;

    const srcData = target.steelTarget.getTexture();
    const layerIndex = target.atlasOffset;
    const pixelsPerLayer = ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4;
    const layerOffset = layerIndex * pixelsPerLayer;
    
    this.atlasData.set(srcData, layerOffset);
    this.atlasTexture.needsUpdate = true;
  }

  /**
   * Move target to moving set
   * @param {SteelTarget} target
   * @private
   */
  static _moveToMoving(target)
  {
    this.movingTargets.add(target);
  }

  /**
   * Move target to settled set
   * @param {SteelTarget} target
   * @private
   */
  static _moveToSettled(target)
  {
    this.movingTargets.delete(target);
  }

  /**
   * Delete a target
   * @param {SteelTarget} target
   * @returns {boolean}
   */
  static delete(target)
  {
    if (this.allTargets.delete(target))
    {
      this.movingTargets.delete(target);
      target.dispose();
      return true;
    }
    return false;
  }

  /**
   * Delete all targets and cleanup
   */
  static deleteAll()
  {
    for (const target of this.allTargets)
    {
      target.dispose();
    }
    this.allTargets.clear();
    this.movingTargets.clear();

    if (this.mergedMesh && this.scene)
    {
      this.scene.remove(this.mergedMesh);
      this.mergedMesh.geometry.dispose();
      this.mergedMesh.material.dispose();
      this.mergedMesh = null;
    }

    if (this.atlasTexture)
    {
      this.atlasTexture.dispose();
      this.atlasTexture = null;
    }

    if (this.chainMesh && this.chainScene)
    {
      this.chainScene.remove(this.chainMesh);
      this.chainMesh.geometry.dispose();
      this.chainMesh.material.dispose();
      this.chainMesh = null;
    }

    this.mergedGeometry = null;
    this.atlasData = null;
    this.vertexBuffer = null;
    this.uvBuffer = null;
    this.normalBuffer = null;
    this.targetIndexBuffer = null;
    this.chainScene = null;
    this.scene = null;
    this.nextChainInstanceIndex = 0;
  }

  /**
   * Step physics for moving targets
   * @param {number} dt
   */
  static stepPhysics(dt)
  {
    const targetsToProcess = [...this.movingTargets];

    for (const target of targetsToProcess)
    {
      target.stepPhysics(dt);

      if (!target.isMoving())
      {
        this._moveToSettled(target);
      }
    }
  }

  /**
   * Update display for moving targets
   */
  static updateDisplay()
  {
    for (const target of this.movingTargets)
    {
      target.updateMesh();
      target.updateChainLines();
    }
  }

  /**
   * Get all targets
   * @returns {SteelTarget[]}
   */
  static getAll()
  {
    return [...this.allTargets];
  }

  /**
   * Get target count
   * @returns {number}
   */
  static getCount()
  {
    return this.allTargets.size;
  }

  /**
   * Get moving target count
   * @returns {number}
   */
  static getMovingCount()
  {
    return this.movingTargets.size;
  }
}
