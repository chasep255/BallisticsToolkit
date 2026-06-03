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

/**
 * Wind socks: tapered open-ended tubes that hang from a pole on two strings.
 * They droop straight down when calm and lift toward horizontal pointing
 * downwind as the wind builds. Their 3D structure makes the head/tail (toward/
 * away) wind component easier to read than a flat flag.
 *
 * WindSockFactory mirrors WindFlagFactory's static interface
 * (createFlagsAtPositions / updateAll / registerWithImpactDetector / getAll /
 * deleteAll) so the simulator can swap between markers transparently. All units
 * are SI (meters); wind comes from windGenerator.sample() in m/s.
 */
export class WindSockFactory
{
  static sockData = []; // Per-sock: { anchor, polePosition, currentAngle, currentDirection, swayPhase }
  static poleMesh = null; // InstancedMesh for poles
  static sockMesh = null; // InstancedMesh for sock bodies
  static stringLines = null; // LineSegments for the swivel strings
  static scene = null;
  static config = null;

  // Shared geometry/material (built once per createFlagsAtPositions)
  static sockGeometry = null;
  static sockMaterial = null;

  // Per-frame scratch (allocated in createFlagsAtPositions)
  static _matrix = null;
  static _quat = null;
  static _axis = null;
  static _scale = null;
  static _xAxis = null;
  static _rimUp = null;
  static _rimDown = null;
  static _pos = null;

  /**
   * Create all socks at the given ground positions.
   * @param {THREE.Scene} scene
   * @param {Array} positions - Array of {x, y, z} ground positions (meters)
   * @param {Object} config - Optional overrides of WIND_SOCK_CONFIG
   */
  static createFlagsAtPositions(scene, positions, config = {})
  {
    this.deleteAll();
    this.scene = scene;

    const numSocks = positions.length;
    if (numSocks === 0)
    {
      console.warn('[WindSockFactory] No positions provided');
      return;
    }

    const c = Config.WIND_SOCK_CONFIG;
    this.config = {
      poleHeight: config.poleHeight ?? c.poleHeight,
      poleThickness: config.poleThickness ?? c.poleThickness,
      sockLength: config.sockLength ?? c.sockLength,
      sockMouthRadius: config.sockMouthRadius ?? c.sockMouthRadius,
      sockTailRadius: config.sockTailRadius ?? c.sockTailRadius,
      stringLength: config.stringLength ?? c.stringLength,
      radialSegments: config.radialSegments ?? c.radialSegments,
      lengthSegments: config.lengthSegments ?? c.lengthSegments,
      minAngle: config.sockMinAngle ?? c.sockMinAngle,
      maxAngle: config.sockMaxAngle ?? c.sockMaxAngle,
      angleResponseK: config.sockAngleResponseK ?? c.sockAngleResponseK,
      angleInterpolationSpeed: config.sockAngleInterpolationSpeed ?? c.sockAngleInterpolationSpeed,
      directionInterpolationSpeed: config.sockDirectionInterpolationSpeed ?? c.sockDirectionInterpolationSpeed,
      swayFrequencyBase: config.swayFrequencyBase ?? c.swayFrequencyBase,
      swayFrequencyScale: config.swayFrequencyScale ?? c.swayFrequencyScale,
      swayAmplitude: config.swayAmplitude ?? c.swayAmplitude
    };

    // Scratch objects
    this._matrix = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._scale = new THREE.Vector3(1, 1, 1);
    this._xAxis = new THREE.Vector3(1, 0, 0);
    this._rimUp = new THREE.Vector3();
    this._rimDown = new THREE.Vector3();
    this._pos = new THREE.Vector3();

    // Per-sock state: anchor = top of pole (swivel point)
    this.sockData = positions.map(pos => (
    {
      anchor: new THREE.Vector3(pos.x, pos.y + this.config.poleHeight, pos.z),
      polePosition: new THREE.Vector3(pos.x, pos.y + this.config.poleHeight / 2, pos.z),
      currentAngle: this.config.minAngle,
      currentDirection: 0,
      swayPhase: Math.random() * Math.PI * 2
    }));

    this.createInstancedPoles(scene, numSocks);
    this.createInstancedSocks(scene, numSocks);
    this.createStrings(scene, numSocks);

    // Prime the first frame so nothing pops at the origin
    this.updateTransforms(0, null);

    console.log(`[WindSockFactory] Created ${numSocks} wind socks`);
  }

  static createInstancedPoles(scene, numSocks)
  {
    const poleRadius = this.config.poleThickness / 2;
    const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, this.config.poleHeight, 16);
    const poleMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x606060,
      metalness: 0.4,
      roughness: 0.6
    });

    this.poleMesh = new THREE.InstancedMesh(poleGeometry, poleMaterial, numSocks);
    this.poleMesh.castShadow = true;
    this.poleMesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    for (let i = 0; i < numSocks; i++)
    {
      const pos = this.sockData[i].polePosition;
      matrix.makeTranslation(pos.x, pos.y, pos.z);
      this.poleMesh.setMatrixAt(i, matrix);
    }
    this.poleMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.poleMesh);
  }

  static createInstancedSocks(scene, numSocks)
  {
    this.sockGeometry = this.createSockGeometry();
    this.sockMaterial = new THREE.MeshStandardMaterial(
    {
      map: this.createSockTexture(),
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide // open tube - inside is visible
    });

    this.sockMesh = new THREE.InstancedMesh(this.sockGeometry, this.sockMaterial, numSocks);
    this.sockMesh.castShadow = true;
    this.sockMesh.receiveShadow = true;
    this.sockMesh.frustumCulled = false; // per-frame matrices, computed on CPU
    this.sockMesh.raycast = () =>
    {}; // not interactive
    scene.add(this.sockMesh);
  }

  static createStrings(scene, numSocks)
  {
    // 2 lines * 2 endpoints * 3 coords = 12 floats per sock
    const stringPositions = new Float32Array(numSocks * 12);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(stringPositions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x333333 });
    this.stringLines = new THREE.LineSegments(geometry, material);
    this.stringLines.frustumCulled = false;
    scene.add(this.stringLines);
  }

  /**
   * Tapered open-ended tube along local +X (mouth at 0, tail at sockLength).
   * The whole mesh is rotated as a rigid body each frame to point downwind.
   */
  static createSockGeometry()
  {
    const radial = this.config.radialSegments;
    const lengthSegs = this.config.lengthSegments;
    const length = this.config.sockLength;
    const mouthR = this.config.sockMouthRadius;
    const tailR = this.config.sockTailRadius;

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let j = 0; j <= lengthSegs; j++)
    {
      const t = j / lengthSegs;
      const x = length * t;
      const r = mouthR + (tailR - mouthR) * t;
      for (let k = 0; k <= radial; k++)
      {
        const theta = (k / radial) * Math.PI * 2;
        positions.push(x, r * Math.cos(theta), r * Math.sin(theta));
        uvs.push(t, k / radial);
      }
    }

    const ringStride = radial + 1;
    for (let j = 0; j < lengthSegs; j++)
    {
      for (let k = 0; k < radial; k++)
      {
        const a = j * ringStride + k;
        const b = a + 1;
        const cc = a + ringStride;
        const d = cc + 1;
        indices.push(a, cc, b);
        indices.push(b, cc, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Iconic orange / white banded texture. Bands run along the length (UV.x).
   */
  static createSockTexture()
  {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');

    const bands = 5;
    const bandWidth = canvas.width / bands;
    for (let i = 0; i < bands; i++)
    {
      ctx.fillStyle = (i % 2 === 0) ? '#ff6a00' : '#f2f2f2';
      ctx.fillRect(i * bandWidth, 0, Math.ceil(bandWidth), canvas.height);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Update all socks - samples wind, smooths orientation, sets matrices/strings.
   * @param {Object} windGenerator - BTK WindGenerator instance
   * @param {number} deltaTime - Time step in seconds
   */
  static updateAll(windGenerator, deltaTime)
  {
    if (!this.sockMesh) return;
    this.updateTransforms(deltaTime, windGenerator);
  }

  static updateTransforms(deltaTime, windGenerator)
  {
    const stringPos = this.stringLines.geometry.getAttribute('position');
    const deg2rad = Math.PI / 180;
    const cfg = this.config;

    for (let i = 0; i < this.sockData.length; i++)
    {
      const sock = this.sockData[i];
      const anchor = sock.anchor;

      let targetAngleDeg = sock.currentAngle;
      let targetDirection = sock.currentDirection;
      let windHoriz_mph = 0;

      if (windGenerator)
      {
        const wind = windGenerator.sample(anchor.x, anchor.y, anchor.z);
        const windX = wind.x; // cross (m/s)
        const windZ = wind.z; // head/tail (m/s)
        wind.delete();

        windHoriz_mph = Math.hypot(windX, windZ) * 2.237; // m/s -> mph

        const span = cfg.maxAngle - cfg.minAngle;
        targetAngleDeg = cfg.minAngle + span * (1 - Math.exp(-cfg.angleResponseK * windHoriz_mph * windHoriz_mph));

        // -windZ because Three.js negative Z is downrange (BTK convention)
        targetDirection = windHoriz_mph > 1e-6 ? Math.atan2(-windZ, windX) : sock.currentDirection;
      }

      // Smooth toward target lift angle
      const angleDiff = targetAngleDeg - sock.currentAngle;
      const angleStep = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), cfg.angleInterpolationSpeed * deltaTime);
      sock.currentAngle += angleStep;

      // Smooth toward target direction (shortest way around the circle)
      let dirDiff = targetDirection - sock.currentDirection;
      while (dirDiff > Math.PI) dirDiff -= 2 * Math.PI;
      while (dirDiff < -Math.PI) dirDiff += 2 * Math.PI;
      const dirStep = Math.sign(dirDiff) * Math.min(Math.abs(dirDiff), cfg.directionInterpolationSpeed * deltaTime);
      sock.currentDirection += dirStep;

      // Small wind-scaled swing so it never looks rigid
      const swayFreq = cfg.swayFrequencyBase + windHoriz_mph * cfg.swayFrequencyScale;
      sock.swayPhase = (sock.swayPhase + swayFreq * 2 * Math.PI * deltaTime) % (2 * Math.PI);
      const windFactor = Math.min(1, windHoriz_mph / 12);
      const swayDeg = Math.sin(sock.swayPhase) * cfg.swayAmplitude * windFactor;

      const pitch = sock.currentAngle * deg2rad;
      const dir = sock.currentDirection + swayDeg * deg2rad;

      const sinP = Math.sin(pitch);
      const cosP = Math.cos(pitch);
      const cosDir = Math.cos(dir);
      const sinDir = Math.sin(dir);

      // Axis the sock points along: straight down when calm, horizontal &
      // downwind in strong wind (matches the flag convention).
      this._axis.set(sinP * cosDir, -cosP, -sinP * sinDir).normalize();
      this._quat.setFromUnitVectors(this._xAxis, this._axis);

      // Mouth sits one string-length out from the anchor along the axis
      const mouthX = anchor.x + this._axis.x * cfg.stringLength;
      const mouthY = anchor.y + this._axis.y * cfg.stringLength;
      const mouthZ = anchor.z + this._axis.z * cfg.stringLength;

      this._matrix.compose(this._pos.set(mouthX, mouthY, mouthZ), this._quat, this._scale);
      this.sockMesh.setMatrixAt(i, this._matrix);

      // Strings: anchor -> two opposite points on the mouth rim (local +/-Y)
      this._rimUp.set(0, cfg.sockMouthRadius, 0).applyQuaternion(this._quat);
      this._rimDown.set(0, -cfg.sockMouthRadius, 0).applyQuaternion(this._quat);

      const base = i * 12;
      stringPos.array[base + 0] = anchor.x;
      stringPos.array[base + 1] = anchor.y;
      stringPos.array[base + 2] = anchor.z;
      stringPos.array[base + 3] = mouthX + this._rimUp.x;
      stringPos.array[base + 4] = mouthY + this._rimUp.y;
      stringPos.array[base + 5] = mouthZ + this._rimUp.z;
      stringPos.array[base + 6] = anchor.x;
      stringPos.array[base + 7] = anchor.y;
      stringPos.array[base + 8] = anchor.z;
      stringPos.array[base + 9] = mouthX + this._rimDown.x;
      stringPos.array[base + 10] = mouthY + this._rimDown.y;
      stringPos.array[base + 11] = mouthZ + this._rimDown.z;
    }

    this.sockMesh.instanceMatrix.needsUpdate = true;
    stringPos.needsUpdate = true;
  }

  /**
   * Register all sock poles with the impact detector (mirror of the flag poles).
   */
  static registerWithImpactDetector(impactDetector)
  {
    if (!impactDetector || !this.config) return;

    const poleRadius = this.config.poleThickness / 2;
    const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, this.config.poleHeight, 16);

    for (let i = 0; i < this.sockData.length; i++)
    {
      const data = this.sockData[i];
      const geometry = poleGeometry.clone();
      const matrix = new THREE.Matrix4().makeTranslation(
        data.polePosition.x,
        data.polePosition.y,
        data.polePosition.z
      );
      geometry.applyMatrix4(matrix);

      impactDetector.addMeshFromGeometry(geometry,
      {
        name: `SockPole_${i}`,
        soundName: 'ricochet',
        mesh: this.poleMesh,
        onImpact: (impactPosition) =>
        {
          const pos = new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z);
          DustCloudFactory.create(
          {
            position: pos,
            color: Config.METAL_FRAME_DUST_CONFIG.color,
            initialRadius: Config.METAL_FRAME_DUST_CONFIG.initialRadius,
            growthRate: Config.METAL_FRAME_DUST_CONFIG.growthRate,
            particleDiameter: Config.METAL_FRAME_DUST_CONFIG.particleDiameter
          });
        }
      });
    }

    poleGeometry.dispose();
  }

  /**
   * Get all sock data (mirrors WindFlagFactory.getAll for compatibility).
   */
  static getAll()
  {
    return this.sockData.map(d => (
    {
      position: d.anchor
    }));
  }

  static deleteAll()
  {
    if (this.poleMesh && this.scene)
    {
      this.scene.remove(this.poleMesh);
      this.poleMesh.geometry.dispose();
      this.poleMesh.material.dispose();
      this.poleMesh = null;
    }

    if (this.sockMesh && this.scene)
    {
      this.scene.remove(this.sockMesh);
      this.sockMesh = null;
    }

    if (this.stringLines && this.scene)
    {
      this.scene.remove(this.stringLines);
      this.stringLines.geometry.dispose();
      this.stringLines.material.dispose();
      this.stringLines = null;
    }

    if (this.sockGeometry) this.sockGeometry.dispose();
    if (this.sockMaterial)
    {
      this.sockMaterial.map?.dispose();
      this.sockMaterial.dispose();
    }

    this.sockData = [];
    this.sockGeometry = null;
    this.sockMaterial = null;
    this.scene = null;
    this.config = null;
  }
}
