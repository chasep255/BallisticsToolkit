// windsocks.js - Wind sock rendering for FClass simulator
//
// A wind sock is a tapered open-ended tube (frustum) that hangs from the top of
// a pole on a pair of strings. In calm air it droops straight down; as the wind
// picks up it lifts toward horizontal and points downwind. They tend to read
// more clearly at distance than flags, since the whole cone fills with air.
//
// This renderer mirrors the public interface of FlagRenderer (initialize,
// addFlag, finalizePoles, updateFlags, dispose) so the simulator can swap
// between the two without caring which it has.

import * as THREE from 'three';
import ResourceManager from '../resources/manager.js';
import
{
  sampleWindAtThreeJsPosition
}
from '../core/btk.js';

export class WindSockRenderer
{
  // Pole (shared look with the flag poles so the field is consistent)
  static POLE_HEIGHT = 12; // yards
  static POLE_THICKNESS = 0.1; // yards

  // Sock dimensions (yards)
  static SOCK_LENGTH = 4.5;
  static SOCK_MOUTH_RADIUS = 0.7; // wide intake end (attached to strings)
  static SOCK_TAIL_RADIUS = 0.32; // narrow trailing end
  static STRING_LENGTH = 0.6; // gap between pole-top swivel and the mouth

  // Same nonlinear lift response as the flags so both react identically to wind.
  // angle = MIN + (MAX-MIN) * (1 - exp(-K * v_h^2)), v_h in mph, ~90° by ~15 mph.
  static SOCK_MIN_ANGLE = 2; // degrees from vertical (slight droop when calm)
  static SOCK_MAX_ANGLE = 90; // degrees from vertical (horizontal in strong wind)
  static SOCK_ANGLE_RESPONSE_K = 0.0205;
  static SOCK_ANGLE_INTERPOLATION_SPEED = 30; // degrees per second
  static SOCK_DIRECTION_INTERPOLATION_SPEED = 1.0; // radians per second

  // Liveliness: a small swing layered on top of the steady orientation so the
  // sock never looks perfectly rigid. Scales with wind so it's still in calm air.
  static SOCK_SWAY_FREQUENCY_BASE = 0.4; // Hz at 0 mph
  static SOCK_SWAY_FREQUENCY_SCALE = 0.12; // additional Hz per mph
  static SOCK_SWAY_AMPLITUDE = 7; // degrees of swing at full strength

  constructor(config)
  {
    this.scene = config.scene;
    this.renderer = config.renderer;
    this.shadowsEnabled = config.shadowsEnabled ?? true;

    // Reuse the flag's segment-quality knob: more segments = smoother cone.
    const flagSegments = config.flagSegments ?? 20;

    this.cfg = {
      poleHeight: config.poleHeight ?? WindSockRenderer.POLE_HEIGHT,
      poleThickness: config.poleThickness ?? WindSockRenderer.POLE_THICKNESS,
      sockLength: config.sockLength ?? WindSockRenderer.SOCK_LENGTH,
      sockMouthRadius: config.sockMouthRadius ?? WindSockRenderer.SOCK_MOUTH_RADIUS,
      sockTailRadius: config.sockTailRadius ?? WindSockRenderer.SOCK_TAIL_RADIUS,
      stringLength: config.stringLength ?? WindSockRenderer.STRING_LENGTH,
      // Map flag segment quality onto the tube's radial/length resolution
      radialSegments: Math.max(8, Math.min(24, flagSegments)),
      lengthSegments: Math.max(4, Math.round(flagSegments / 2.5)),
      minAngle: config.minAngle ?? WindSockRenderer.SOCK_MIN_ANGLE,
      maxAngle: config.maxAngle ?? WindSockRenderer.SOCK_MAX_ANGLE,
      angleResponseK: config.angleResponseK ?? WindSockRenderer.SOCK_ANGLE_RESPONSE_K,
      angleInterpolationSpeed: config.angleInterpolationSpeed ?? WindSockRenderer.SOCK_ANGLE_INTERPOLATION_SPEED,
      directionInterpolationSpeed: config.directionInterpolationSpeed ?? WindSockRenderer.SOCK_DIRECTION_INTERPOLATION_SPEED,
      swayFrequencyBase: config.swayFrequencyBase ?? WindSockRenderer.SOCK_SWAY_FREQUENCY_BASE,
      swayFrequencyScale: config.swayFrequencyScale ?? WindSockRenderer.SOCK_SWAY_FREQUENCY_SCALE,
      swayAmplitude: config.swayAmplitude ?? WindSockRenderer.SOCK_SWAY_AMPLITUDE
    };

    // Per-sock animation state and anchor (pole-top) positions
    this.socks = [];
    this.polePositions = [];

    // Shared resources
    this.poleGeometry = null;
    this.sockGeometry = null;
    this.sockMaterial = null;
    this.poleMaterial = null;
    this.stringMaterial = null;

    // Batched meshes (built in finalizePoles)
    this.poleInstancedMesh = null;
    this.sockInstancedMesh = null;
    this.stringLines = null;

    // Scratch objects reused every frame to avoid per-frame allocation
    this._matrix = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._scale = new THREE.Vector3(1, 1, 1);
    this._xAxis = new THREE.Vector3(1, 0, 0);
    this._rimUp = new THREE.Vector3();
    this._rimDown = new THREE.Vector3();
    this._pos = new THREE.Vector3();
  }

  initialize()
  {
    this.poleGeometry = new THREE.BoxGeometry(
      this.cfg.poleThickness,
      this.cfg.poleHeight,
      this.cfg.poleThickness
    );

    this.sockGeometry = this.createSockGeometry();

    const sockTexture = this.createSockTexture();

    this.poleMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0xc0c0c0,
      metalness: 0.8,
      roughness: 0.2,
      envMapIntensity: 1.0
    });

    this.sockMaterial = new THREE.MeshStandardMaterial(
    {
      map: sockTexture,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide // open tube - inside is visible
    });

    this.stringMaterial = new THREE.LineBasicMaterial({ color: 0x333333 });
  }

  /**
   * Build the iconic orange / white banded canvas texture. Bands run along the
   * length of the sock (mapped to UV.x), which is the most recognizable and
   * visible wind-sock look.
   */
  createSockTexture()
  {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');

    const bands = 5;
    const orange = '#ff6a00';
    const white = '#f2f2f2';
    const bandWidth = canvas.width / bands;
    for (let i = 0; i < bands; i++)
    {
      ctx.fillStyle = (i % 2 === 0) ? orange : white;
      ctx.fillRect(i * bandWidth, 0, Math.ceil(bandWidth), canvas.height);
    }

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Tapered open-ended tube along local +X. Mouth (radius = mouthRadius) sits at
   * x = 0, tail (radius = tailRadius) at x = length. The whole mesh is rotated as
   * a rigid body each frame to point downwind, so the geometry itself is static.
   */
  createSockGeometry()
  {
    const geometry = new THREE.BufferGeometry();
    const radial = this.cfg.radialSegments;
    const lengthSegs = this.cfg.lengthSegments;
    const length = this.cfg.sockLength;
    const mouthR = this.cfg.sockMouthRadius;
    const tailR = this.cfg.sockTailRadius;

    const positions = [];
    const uvs = [];
    const indices = [];

    // Rings of vertices, one extra radial vertex to give the seam its own UV
    for (let j = 0; j <= lengthSegs; j++)
    {
      const t = j / lengthSegs;
      const x = length * t;
      const r = mouthR + (tailR - mouthR) * t;

      for (let k = 0; k <= radial; k++)
      {
        const theta = (k / radial) * Math.PI * 2;
        const y = r * Math.cos(theta);
        const z = r * Math.sin(theta);
        positions.push(x, y, z);
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
        const c = a + ringStride;
        const d = c + 1;
        // Two triangles per quad (outward winding; material is DoubleSide anyway)
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  addFlag(xPosition, zPosition)
  {
    // Pole shares the flag-pole placement (center at half height)
    this.polePositions.push(
    {
      x: xPosition,
      y: this.cfg.poleHeight / 2,
      z: zPosition
    });

    // Swivel anchor = top of the pole. Socks pivot about this point.
    this.socks.push(
    {
      anchor:
      {
        x: xPosition,
        y: this.cfg.poleHeight,
        z: zPosition
      },
      currentAngle: this.cfg.minAngle,
      currentDirection: 0,
      swayPhase: Math.random() * Math.PI * 2
    });
  }

  finalizePoles()
  {
    if (this.socks.length === 0) return;

    const count = this.socks.length;

    // ----- Poles (instanced) -----
    this.poleInstancedMesh = new THREE.InstancedMesh(
      this.poleGeometry,
      this.poleMaterial,
      count
    );
    this.poleInstancedMesh.castShadow = this.shadowsEnabled;
    this.poleInstancedMesh.receiveShadow = this.shadowsEnabled;

    const matrix = new THREE.Matrix4();
    const ident = new THREE.Quaternion();
    const unit = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++)
    {
      const pos = this.polePositions[i];
      matrix.compose(new THREE.Vector3(pos.x, pos.y, pos.z), ident, unit);
      this.poleInstancedMesh.setMatrixAt(i, matrix);
    }
    this.poleInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.poleInstancedMesh);

    // ----- Socks (instanced; per-frame matrices set in updateFlags) -----
    this.sockInstancedMesh = new THREE.InstancedMesh(
      this.sockGeometry,
      this.sockMaterial,
      count
    );
    this.sockInstancedMesh.castShadow = this.shadowsEnabled;
    this.sockInstancedMesh.receiveShadow = this.shadowsEnabled;
    this.sockInstancedMesh.frustumCulled = false; // matrices live on the GPU
    this.scene.add(this.sockInstancedMesh);

    // ----- Strings (two per sock, batched into one LineSegments) -----
    // 2 lines * 2 endpoints * 3 coords = 12 floats per sock
    const stringPositions = new Float32Array(count * 12);
    const stringGeometry = new THREE.BufferGeometry();
    stringGeometry.setAttribute('position', new THREE.BufferAttribute(stringPositions, 3));
    this.stringLines = new THREE.LineSegments(stringGeometry, this.stringMaterial);
    this.stringLines.frustumCulled = false;
    this.scene.add(this.stringLines);

    // Prime the first frame so nothing pops at origin before the first update
    this.updateSockTransforms(0);
  }

  updateFlags(windGenerator)
  {
    const deltaTime = ResourceManager.time.getDeltaTime();
    this.updateSockTransforms(deltaTime, windGenerator);
  }

  updateSockTransforms(deltaTime, windGenerator)
  {
    if (!this.sockInstancedMesh) return;

    const stringPos = this.stringLines.geometry.getAttribute('position');
    const deg2rad = Math.PI / 180;

    for (let i = 0; i < this.socks.length; i++)
    {
      const sock = this.socks[i];
      const anchor = sock.anchor;

      // Default to a steady droop if we have no wind generator yet (priming)
      let targetAngleDeg = sock.currentAngle;
      let targetDirection = sock.currentDirection;
      let windHoriz_mph = 0;

      if (windGenerator)
      {
        const wind = sampleWindAtThreeJsPosition(windGenerator, anchor.x, anchor.y, anchor.z);
        const windX_mph = wind.x; // cross
        const windZ_mph = wind.z; // head/tail
        windHoriz_mph = Math.hypot(windX_mph, windZ_mph);

        const span = this.cfg.maxAngle - this.cfg.minAngle;
        targetAngleDeg = this.cfg.minAngle + span * (1 - Math.exp(-this.cfg.angleResponseK * windHoriz_mph * windHoriz_mph));

        // -windZ because Three.js negative Z is downrange
        targetDirection = windHoriz_mph > 1e-6 ? Math.atan2(-windZ_mph, windX_mph) : sock.currentDirection;
      }

      // Smooth toward target lift angle
      const angleDiff = targetAngleDeg - sock.currentAngle;
      const angleStep = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.cfg.angleInterpolationSpeed * deltaTime);
      sock.currentAngle += angleStep;

      // Smooth toward target direction (shortest way around the circle)
      let dirDiff = targetDirection - sock.currentDirection;
      while (dirDiff > Math.PI) dirDiff -= 2 * Math.PI;
      while (dirDiff < -Math.PI) dirDiff += 2 * Math.PI;
      const dirStep = Math.sign(dirDiff) * Math.min(Math.abs(dirDiff), this.cfg.directionInterpolationSpeed * deltaTime);
      sock.currentDirection += dirStep;

      // Layer a small wind-scaled swing on top so it never looks rigid
      const swayFreq = this.cfg.swayFrequencyBase + windHoriz_mph * this.cfg.swayFrequencyScale;
      sock.swayPhase = (sock.swayPhase + swayFreq * 2 * Math.PI * deltaTime) % (2 * Math.PI);
      const windFactor = Math.min(1, windHoriz_mph / 12);
      const swayDeg = Math.sin(sock.swayPhase) * this.cfg.swayAmplitude * windFactor;

      const pitch = (sock.currentAngle) * deg2rad;
      const dir = sock.currentDirection + swayDeg * deg2rad;

      const sinP = Math.sin(pitch);
      const cosP = Math.cos(pitch);
      const cosDir = Math.cos(dir);
      const sinDir = Math.sin(dir);

      // Axis direction the sock points along (matches the flag convention):
      // straight down when calm, horizontal & downwind in strong wind.
      this._axis.set(sinP * cosDir, -cosP, -sinP * sinDir).normalize();
      this._quat.setFromUnitVectors(this._xAxis, this._axis);

      // Mouth sits one string-length out from the anchor along the axis
      const mouthX = anchor.x + this._axis.x * this.cfg.stringLength;
      const mouthY = anchor.y + this._axis.y * this.cfg.stringLength;
      const mouthZ = anchor.z + this._axis.z * this.cfg.stringLength;

      this._matrix.compose(
        this._pos.set(mouthX, mouthY, mouthZ),
        this._quat,
        this._scale
      );
      this.sockInstancedMesh.setMatrixAt(i, this._matrix);

      // Strings: anchor -> two opposite points on the mouth rim (local ±Y)
      this._rimUp.set(0, this.cfg.sockMouthRadius, 0).applyQuaternion(this._quat);
      this._rimDown.set(0, -this.cfg.sockMouthRadius, 0).applyQuaternion(this._quat);

      const base = i * 12;
      // String 1: anchor -> upper rim
      stringPos.array[base + 0] = anchor.x;
      stringPos.array[base + 1] = anchor.y;
      stringPos.array[base + 2] = anchor.z;
      stringPos.array[base + 3] = mouthX + this._rimUp.x;
      stringPos.array[base + 4] = mouthY + this._rimUp.y;
      stringPos.array[base + 5] = mouthZ + this._rimUp.z;
      // String 2: anchor -> lower rim
      stringPos.array[base + 6] = anchor.x;
      stringPos.array[base + 7] = anchor.y;
      stringPos.array[base + 8] = anchor.z;
      stringPos.array[base + 9] = mouthX + this._rimDown.x;
      stringPos.array[base + 10] = mouthY + this._rimDown.y;
      stringPos.array[base + 11] = mouthZ + this._rimDown.z;
    }

    this.sockInstancedMesh.instanceMatrix.needsUpdate = true;
    stringPos.needsUpdate = true;
  }

  dispose()
  {
    if (this.poleInstancedMesh)
    {
      this.scene.remove(this.poleInstancedMesh);
      this.poleInstancedMesh = null;
    }
    if (this.sockInstancedMesh)
    {
      this.scene.remove(this.sockInstancedMesh);
      this.sockInstancedMesh = null;
    }
    if (this.stringLines)
    {
      this.scene.remove(this.stringLines);
      this.stringLines.geometry.dispose();
      this.stringLines = null;
    }

    if (this.poleGeometry) this.poleGeometry.dispose();
    if (this.sockGeometry) this.sockGeometry.dispose();
    if (this.poleMaterial) this.poleMaterial.dispose();
    if (this.stringMaterial) this.stringMaterial.dispose();
    if (this.sockMaterial)
    {
      if (this.sockMaterial.map) this.sockMaterial.map.dispose();
      this.sockMaterial.dispose();
    }

    this.socks = [];
    this.polePositions = [];
    this.poleGeometry = null;
    this.sockGeometry = null;
    this.sockMaterial = null;
    this.poleMaterial = null;
    this.stringMaterial = null;
  }
}
