import * as THREE from 'three';
import
{
  Config
}
from './config.js';

// Atlas configuration - texture is 2x width for front/back halves
const ATLAS_TILE_WIDTH = 1024;  // 2x for front/back
const ATLAS_TILE_HEIGHT = 512;

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
    this.steelTarget = new btk.SteelTarget(width, height, thickness, isOval, initialPos, defaultNormal, ATLAS_TILE_HEIGHT);
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
   * Update instance attributes (called by factory for moving targets)
   */
  updateMesh()
  {
    if (!this.steelTarget || this.targetIndex === null) return;
    SteelTargetFactory.updateInstanceAttributes(this);
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

  // Instanced mesh state
  static rectInstancedMesh = null;
  static ovalInstancedMesh = null;
  static edgeInstancedMesh = null;
  static atlasTexture = null;
  static atlasData = null;

  // Instance data tracking
  static instanceData = new Map(); // target -> {instanceId, isOval}
  static nextInstanceId = 0;

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
   * Initialize instanced meshes after all targets are created.
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

    // Separate targets by shape
    const rectTargets = [];
    const ovalTargets = [];

    for (const target of targets)
    {
      const isOval = target.steelTarget.isOval();
      if (isOval)
      {
        ovalTargets.push(target);
      }
      else
      {
        rectTargets.push(target);
      }
    }

    // Create texture array (one layer per target)
    const pixelsPerLayer = ATLAS_TILE_WIDTH * ATLAS_TILE_HEIGHT * 4;
    this.atlasData = new Uint8Array(pixelsPerLayer * numTargets);

    this.atlasTexture = new THREE.DataArrayTexture(
      this.atlasData,
      ATLAS_TILE_WIDTH,
      ATLAS_TILE_HEIGHT,
      numTargets
    );
    this.atlasTexture.format = THREE.RGBAFormat;
    this.atlasTexture.type = THREE.UnsignedByteType;
    this.atlasTexture.minFilter = THREE.LinearFilter;
    this.atlasTexture.magFilter = THREE.LinearFilter;
    this.atlasTexture.flipY = false;
    this.atlasTexture.colorSpace = THREE.LinearSRGBColorSpace;

    // Copy textures to array
    let targetIndex = 0;
    for (const target of targets)
    {
      target.targetIndex = targetIndex;
      target.atlasOffset = targetIndex;

      const srcData = target.steelTarget.getTexture();
      const layerOffset = targetIndex * pixelsPerLayer;
      this.atlasData.set(srcData, layerOffset);
      targetIndex++;
    }

    // Create base geometries
    const unitQuadGeometry = this.createUnitQuadGeometry();
    const unitCircleGeometry = this.createUnitCircleGeometry();

    // Create materials with custom shaders for texture array
    const rectMaterial = this.createInstancedMaterial();
    const ovalMaterial = this.createInstancedMaterial();

    // Create instanced meshes using standard Three.js setMatrixAt approach
    if (rectTargets.length > 0)
    {
      this.rectInstancedMesh = new THREE.InstancedMesh(unitQuadGeometry, rectMaterial, rectTargets.length);
      this.rectInstancedMesh.castShadow = true;
      this.rectInstancedMesh.receiveShadow = true;
      this.setupInstanceMatrices(this.rectInstancedMesh, rectTargets);
      scene.add(this.rectInstancedMesh);
      console.log(`  Created rect instanced mesh: ${rectTargets.length} instances`);
    }

    if (ovalTargets.length > 0)
    {
      this.ovalInstancedMesh = new THREE.InstancedMesh(unitCircleGeometry, ovalMaterial, ovalTargets.length);
      this.ovalInstancedMesh.castShadow = true;
      this.ovalInstancedMesh.receiveShadow = true;
      this.setupInstanceMatrices(this.ovalInstancedMesh, ovalTargets);
      scene.add(this.ovalInstancedMesh);
      console.log(`  Created oval instanced mesh: ${ovalTargets.length} instances`);
    }

    this.atlasTexture.needsUpdate = true;

    console.log(`  Texture array: ${ATLAS_TILE_WIDTH}x${ATLAS_TILE_HEIGHT} x ${numTargets} layers`);
    console.log(`  Rect instances: ${rectTargets.length}, Oval instances: ${ovalTargets.length}`);
  }

  /**
   * Create unit box geometry (1x1x1, centered at origin) with custom UVs
   * Front and back faces get proper texture UVs, edge faces get -1 UVs (for shader to color gray)
   */
  static createUnitQuadGeometry()
  {
    const geometry = new THREE.BufferGeometry();

    // Half dimensions
    const hw = 0.5, hh = 0.5, hd = 0.5;

    // Vertices: front face (z=-0.5), back face (z=+0.5), and 4 edge faces
    const positions = new Float32Array([
      // Front face (facing -Z) - 2 triangles
      -hw, -hh, -hd,  hw, -hh, -hd,  hw,  hh, -hd,
      -hw, -hh, -hd,  hw,  hh, -hd, -hw,  hh, -hd,
      // Back face (facing +Z) - 2 triangles
      hw, -hh,  hd, -hw, -hh,  hd, -hw,  hh,  hd,
      hw, -hh,  hd, -hw,  hh,  hd,  hw,  hh,  hd,
      // Bottom edge (facing -Y)
      -hw, -hh, -hd, -hw, -hh,  hd,  hw, -hh,  hd,
      -hw, -hh, -hd,  hw, -hh,  hd,  hw, -hh, -hd,
      // Top edge (facing +Y)
      -hw,  hh,  hd, -hw,  hh, -hd,  hw,  hh, -hd,
      -hw,  hh,  hd,  hw,  hh, -hd,  hw,  hh,  hd,
      // Left edge (facing -X)
      -hw, -hh,  hd, -hw, -hh, -hd, -hw,  hh, -hd,
      -hw, -hh,  hd, -hw,  hh, -hd, -hw,  hh,  hd,
      // Right edge (facing +X)
      hw, -hh, -hd,  hw, -hh,  hd,  hw,  hh,  hd,
      hw, -hh, -hd,  hw,  hh,  hd,  hw,  hh, -hd,
    ]);

    // UVs: texture is 2x width - left half (u=0-0.5) for front, right half (u=0.5-1) for back
    // Edges get -1 UVs (shader will color gray)
    const uvs = new Float32Array([
      // Front face - uses left half of texture (u=0 to 0.5)
      // Vertices: (-hw,-hh,-hd), (hw,-hh,-hd), (hw,hh,-hd), (-hw,-hh,-hd), (hw,hh,-hd), (-hw,hh,-hd)
      0, 0,    0.5, 0,    0.5, 1,
      0, 0,    0.5, 1,    0, 1,
      // Back face - uses right half of texture (u=0.5 to 1.0)
      // Vertices: (hw,-hh,hd), (-hw,-hh,hd), (-hw,hh,hd), (hw,-hh,hd), (-hw,hh,hd), (hw,hh,hd)
      // When viewed from +Z: (hw,-hh) is RIGHT, (-hw,-hh) is LEFT
      // Map so right side gets u=1, left side gets u=0.5
      1, 0,    0.5, 0,    0.5, 1,
      1, 0,    0.5, 1,    1, 1,
      // Edge faces - negative UVs to signal "no texture"
      -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1,
    ]);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create unit cylinder geometry with custom UVs for oval targets
   * Front and back circular faces get texture, edge ring gets -1 UVs
   */
  static createUnitCircleGeometry()
  {
    const segments = 32;
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];

    const rx = 0.5, ry = 0.5, hd = 0.5; // Half dimensions

    // Front face (z = -hd) - triangle fan from center
    // Uses left half of texture (u=0 to 0.5)
    for (let i = 0; i < segments; i++)
    {
      const angle1 = (2 * Math.PI * i) / segments;
      const angle2 = (2 * Math.PI * (i + 1)) / segments;

      const cos1 = Math.cos(angle1), sin1 = Math.sin(angle1);
      const cos2 = Math.cos(angle2), sin2 = Math.sin(angle2);

      // Triangle: center, v1, v2
      positions.push(0, 0, -hd);
      positions.push(rx * cos1, ry * sin1, -hd);
      positions.push(rx * cos2, ry * sin2, -hd);

      // UVs: map to left half (u=0 to 0.5)
      uvs.push(0.25, 0.5);  // center at u=0.25
      uvs.push(0.25 + cos1 * 0.25, 0.5 + sin1 * 0.5);
      uvs.push(0.25 + cos2 * 0.25, 0.5 + sin2 * 0.5);
    }

    // Back face (z = +hd) - triangle fan from center (reversed winding)
    // Uses right half of texture (u=0.5 to 1.0)
    for (let i = 0; i < segments; i++)
    {
      const angle1 = (2 * Math.PI * i) / segments;
      const angle2 = (2 * Math.PI * (i + 1)) / segments;

      const cos1 = Math.cos(angle1), sin1 = Math.sin(angle1);
      const cos2 = Math.cos(angle2), sin2 = Math.sin(angle2);

      // Triangle: center, v2, v1 (reversed for correct facing)
      positions.push(0, 0, hd);
      positions.push(rx * cos2, ry * sin2, hd);
      positions.push(rx * cos1, ry * sin1, hd);

      // UVs: map to right half (u=0.5 to 1.0), flipped horizontally
      uvs.push(0.75, 0.5);  // center at u=0.75
      uvs.push(0.75 - cos2 * 0.25, 0.5 + sin2 * 0.5);
      uvs.push(0.75 - cos1 * 0.25, 0.5 + sin1 * 0.5);
    }

    // Edge faces (connecting front and back) - quads as 2 triangles each
    for (let i = 0; i < segments; i++)
    {
      const angle1 = (2 * Math.PI * i) / segments;
      const angle2 = (2 * Math.PI * (i + 1)) / segments;

      const cos1 = Math.cos(angle1), sin1 = Math.sin(angle1);
      const cos2 = Math.cos(angle2), sin2 = Math.sin(angle2);

      const x1 = rx * cos1, y1 = ry * sin1;
      const x2 = rx * cos2, y2 = ry * sin2;

      // Two triangles for the edge quad
      positions.push(x1, y1, -hd);
      positions.push(x1, y1, hd);
      positions.push(x2, y2, -hd);

      positions.push(x2, y2, -hd);
      positions.push(x1, y1, hd);
      positions.push(x2, y2, hd);

      // Edge UVs: -1 to signal "no texture"
      uvs.push(-1, -1, -1, -1, -1, -1);
      uvs.push(-1, -1, -1, -1, -1, -1);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create material with texture array for instanced rendering
   */
  static createInstancedMaterial()
  {
    const material = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    material.onBeforeCompile = (shader) => {
      // Add per-instance target index attribute and varying
      shader.vertexShader = `
        attribute float instanceTargetIndex;
        varying float vTargetIndex;
        varying vec2 vUv;
      ` + shader.vertexShader;

      // Pass target index to fragment shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `
        #include <uv_vertex>
        vTargetIndex = instanceTargetIndex;
        vUv = uv;
        `
      );

      // Add texture array uniform
      shader.uniforms.mapArray = { value: this.atlasTexture };

      shader.fragmentShader = `
        uniform sampler2DArray mapArray;
        varying float vTargetIndex;
        varying vec2 vUv;
      ` + shader.fragmentShader;

      // Sample texture array (or use gray for edge faces with negative UVs)
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `
        vec4 diffuseColor;
        if (vUv.x < 0.0) {
          // Edge face - metal gray
          diffuseColor = vec4(0.55, 0.55, 0.55, opacity);
        } else {
          // Front/back face - sample texture array
          vec4 texColor = texture(mapArray, vec3(vUv, vTargetIndex));
          diffuseColor = texColor;
        }
        `
      );

      // Remove default map sampling
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        '// map_fragment replaced by texture array sampling'
      );
    };

    return material;
  }

  // Reusable objects for matrix computation
  static _matrix = new THREE.Matrix4();
  static _position = new THREE.Vector3();
  static _quaternion = new THREE.Quaternion();
  static _scale = new THREE.Vector3();

  /**
   * Setup instance matrices and target index attributes using standard Three.js approach
   */
  static setupInstanceMatrices(instancedMesh, targets)
  {
    const count = targets.length;
    const targetIndexArray = new Float32Array(count);

    for (let i = 0; i < count; i++)
    {
      const target = targets[i];
      const pos = target.steelTarget.getCenterOfMass();
      const orient = target.steelTarget.getOrientation();
      const dims = target.steelTarget.getDimensions();

      // Set position
      this._position.set(pos.x, pos.y, pos.z);

      // Set orientation (from C++ quaternion)
      this._quaternion.set(orient.x, orient.y, orient.z, orient.w);
      this._quaternion.normalize();

      // Set scale (width, height, thickness)
      this._scale.set(dims.x, dims.y, dims.z);

      // Compose matrix and set
      this._matrix.compose(this._position, this._quaternion, this._scale);
      instancedMesh.setMatrixAt(i, this._matrix);

      // Store target index for texture array
      targetIndexArray[i] = target.targetIndex;

      // Store instance info for updates
      this.instanceData.set(target, { instanceId: i, isOval: target.steelTarget.isOval() });
    }

    // Add target index as instanced attribute
    instancedMesh.geometry.setAttribute('instanceTargetIndex', new THREE.InstancedBufferAttribute(targetIndexArray, 1));
    instancedMesh.instanceMatrix.needsUpdate = true;
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
   * Update instance matrix for a target (called when target moves)
   * @param {SteelTarget} target
   */
  static updateInstanceAttributes(target)
  {
    const instanceInfo = this.instanceData.get(target);
    if (!instanceInfo) return;

    const { instanceId, isOval } = instanceInfo;
    const instancedMesh = isOval ? this.ovalInstancedMesh : this.rectInstancedMesh;
    if (!instancedMesh) return;

    const pos = target.steelTarget.getCenterOfMass();
    const orient = target.steelTarget.getOrientation();
    const dims = target.steelTarget.getDimensions();

    // Update matrix
    this._position.set(pos.x, pos.y, pos.z);
    this._quaternion.set(orient.x, orient.y, orient.z, orient.w);
    this._quaternion.normalize();
    this._scale.set(dims.x, dims.y, dims.z);

    this._matrix.compose(this._position, this._quaternion, this._scale);
    instancedMesh.setMatrixAt(instanceId, this._matrix);
    instancedMesh.instanceMatrix.needsUpdate = true;
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
    const pixelsPerLayer = ATLAS_TILE_WIDTH * ATLAS_TILE_HEIGHT * 4;
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

    if (this.rectInstancedMesh && this.scene)
    {
      this.scene.remove(this.rectInstancedMesh);
      this.rectInstancedMesh.geometry.dispose();
      this.rectInstancedMesh.material.dispose();
      this.rectInstancedMesh = null;
    }

    if (this.ovalInstancedMesh && this.scene)
    {
      this.scene.remove(this.ovalInstancedMesh);
      this.ovalInstancedMesh.geometry.dispose();
      this.ovalInstancedMesh.material.dispose();
      this.ovalInstancedMesh = null;
    }

    if (this.edgeInstancedMesh && this.scene)
    {
      this.scene.remove(this.edgeInstancedMesh);
      this.edgeInstancedMesh.geometry.dispose();
      this.edgeInstancedMesh.material.dispose();
      this.edgeInstancedMesh = null;
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

    this.atlasData = null;
    this.instanceData.clear();
    this.nextInstanceId = 0;
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
