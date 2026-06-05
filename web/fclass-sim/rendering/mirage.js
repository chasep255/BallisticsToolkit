/**
 * MirageEffect - Layered heat-mirage shimmer for scope views.
 *
 * The atmosphere along the line of sight is modeled as N independent slabs
 * (LAYER_FRACS), each with its own:
 *   - wind sample, EMA-smoothed
 *   - accumulated wind drift (cross, vertical + heat-rise)
 *   - simplex noise field (uncorrelated across layers via their world-space depth)
 *   - attenuation derived from the layer's local horizontal wind speed
 *
 * Each layer's world scale is `layer_distance * tan(fov/2) * 2`, so a
 * fixed-physical-size noise feature appears 1/t larger in the viewport at
 * shallower layers. The near layer (20%) reads as big soft blobs and the
 * far layer (100%) reads as crisp small features without any explicit blur:
 * simplex noise is C^2 continuous, and the multi-scale stacking of layers
 * gives the depth-of-field appearance for free.
 *
 * This file incorporates GLSL Simplex noise code derived from work by
 * Stefan Gustavson and Ashima Arts, distributed under the MIT License.
 * Original sources:
 * - https://github.com/stegu/webgl-noise
 * - https://github.com/ashima/webgl-noise
 */

import * as THREE from 'three';
import ResourceManager from '../resources/manager.js';
import
{
  sampleWindAtThreeJsPosition
}
from '../core/btk.js';

export class MirageEffect
{
  // Constants
  static BASE_FOV = 30; // Reference FOV for 1x zoom (matches main camera FOV)
  static BASE_INTENSITY = 0.025; // Per-layer mirage intensity at 1x zoom (pre-normalization)
  static MPH_TO_YARDS_PER_SEC = 0.4888889; // 1 mph = 0.4888889 yd/s
  static HEAT_RISE_SPEED = 1.0; // Heat rise speed in yards/second
  static WIND_SMOOTHING_ALPHA = 0.01; // EMA smoothing factor for per-layer wind [0..1]

  // Per-layer attenuation: layer fades to 0 by this horizontal wind speed (mph)
  static WIND_FADE_SPEED_MPH = 15.0;

  // Slabs of atmosphere sampled along the line of sight (fractions of the
  // intersection distance). Each entry becomes one independent noise layer.
  static LAYER_FRACS = [0.20, 0.40, 0.60, 0.80, 1.00];

  // Debug: per-layer enable mask. Set to [1,1,1,1,1] for normal operation;
  // zero out specific entries to isolate a single layer's contribution.
  // Per-layer normalization is recomputed from the active count so the
  // remaining layer(s) display at their natural single-layer magnitude.
  static DEBUG_LAYER_MASK = [1.0, 1.0, 1.0, 1.0, 1.0];

  // Each slab samples wind at multiple positions and averages them before
  // EMA-smoothing, giving each layer a smoother, less point-y wind reading.
  // Offsets are in fractions of intersection distance, added to the layer's
  // center fraction (clamped to [0, 1] to stay inside the wind field).
  static LAYER_SAMPLE_OFFSETS = [-0.10, 0.0, +0.10];

  // Spatial frequency (1/yards) of heat-column features inside a single layer.
  // ~1 yd features at 1.0 is in the ballpark of real near-ground convective
  // plumes once you sum across layers.
  static NOISE_FREQ = 1.5;

  // The summed per-layer distortion drives two separate visual effects.
  // They share the same underlying noise field but have independent scales
  // so they can be tuned independently:
  //   - Spatial: how far the UV is warped (the visible "warble" of the image)
  //   - Shading: how strongly the chromatic edge tint is applied
  static SPATIAL_DISTORTION_SCALE = 0.003; // UV displacement scale
  static SHADING_INTENSITY_SCALE = 2.0;    // tint strength scale

  constructor(renderer)
  {
    this.renderer = renderer;
    this.numLayers = MirageEffect.LAYER_FRACS.length;

    // Create orthographic camera for full-screen quad rendering
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Create scene for post-processing
    this.scene = new THREE.Scene();

    // Create material with mirage shader
    this.material = this.createMaterial();

    // Create full-screen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.quad);

    // Per-layer EMA-smoothed wind (cross, vertical, head) in mph.
    // Head is tracked solely to compute per-layer attenuation.
    this.smoothedWind = [];
    // Per-layer accumulated drift (cross, vertical) in yards. Head wind does
    // not advect the noise — it would only slide heat columns along the line
    // of sight, which doesn't change their apparent position.
    this.accumulatedDrift = [];
    for (let i = 0; i < this.numLayers; i++)
    {
      this.smoothedWind.push(new THREE.Vector3(0, 0, 0));
      this.accumulatedDrift.push(new THREE.Vector2(0, 0));
    }
  }

  createMaterial()
  {
    const NUM_LAYERS = this.numLayers;

    // Simplex noise function for GLSL
    const simplexNoise = `
      // Simplex 3D noise
      vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
      vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

        // First corner
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);

        // Other corners
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);

        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;

        // Permutations
        i = mod(i, 289.0);
        vec4 p = permute(permute(permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));

        // Gradients
        float n_ = 0.142857142857; // 1.0/7.0
        vec3 ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);

        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);

        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);

        // Normalize gradients
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        // Mix final noise value
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }
    `;

    const vertexShader = `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      #define NUM_LAYERS ${NUM_LAYERS}

      uniform sampler2D tDiffuse;
      uniform float noiseFreq;
      uniform float spatialScale;                // UV displacement multiplier
      uniform float shadingScale;                // chromatic tint multiplier
      uniform vec3 layerOffsets[NUM_LAYERS];     // world-space anchor (yards) per layer
      uniform float layerScales[NUM_LAYERS];     // viewport world width (yards) per layer
      uniform vec2 layerDrifts[NUM_LAYERS];      // accumulated wind drift (cross, vertical) yards
      uniform float layerIntensities[NUM_LAYERS]; // per-layer noise weight (zoom * fade / sqrt(N))

      varying vec2 vUv;

      ${simplexNoise}

      void main() {
        vec2 uv = vUv;

        float totalDistortion = 0.0;

        // One noise sample per layer. Layers are decorrelated because each
        // layer's world-space anchor (especially the z coordinate) is many
        // yards from the others — far beyond simplex's correlation length.
        for (int i = 0; i < NUM_LAYERS; i++) {
          vec3 worldPos = vec3(
            ((uv.x - 0.5) * layerScales[i] + layerOffsets[i].x - layerDrifts[i].x) * noiseFreq,
            ((uv.y - 0.5) * layerScales[i] + layerOffsets[i].y - layerDrifts[i].y) * noiseFreq,
             layerOffsets[i].z                                                       * noiseFreq
          );

          float n = snoise(worldPos);
          totalDistortion += n * layerIntensities[i];
        }

        // Mirage refracts light vertically (rising hot air = vertical n-gradient).
        // Spatial and shading scales are independent so each can be tuned alone.
        vec2 distortedUV = uv + vec2(0.0, totalDistortion) * spatialScale;

        vec4 color = texture2D(tDiffuse, distortedUV);

        // Chromatic edge tint scales with total distortion magnitude
        float tintStrength = clamp(abs(totalDistortion) * shadingScale, 0.0, 0.4);
        color.rgb = mix(color.rgb, color.rgb * vec3(0.85, 0.9, 1.0), tintStrength);

        gl_FragColor = color;
      }
    `;

    // Initialize uniform array storage
    const layerOffsetsInit = [];
    const layerScalesInit = [];
    const layerDriftsInit = [];
    const layerIntensitiesInit = [];
    for (let i = 0; i < NUM_LAYERS; i++)
    {
      layerOffsetsInit.push(new THREE.Vector3(0, 0, 0));
      layerScalesInit.push(0);
      layerDriftsInit.push(new THREE.Vector2(0, 0));
      layerIntensitiesInit.push(0);
    }

    return new THREE.ShaderMaterial(
    {
      uniforms:
      {
        tDiffuse:
        {
          value: null
        },
        noiseFreq:
        {
          value: MirageEffect.NOISE_FREQ
        },
        spatialScale:
        {
          value: MirageEffect.SPATIAL_DISTORTION_SCALE
        },
        shadingScale:
        {
          value: MirageEffect.SHADING_INTENSITY_SCALE
        },
        layerOffsets:
        {
          value: layerOffsetsInit
        },
        layerScales:
        {
          value: layerScalesInit
        },
        layerDrifts:
        {
          value: layerDriftsInit
        },
        layerIntensities:
        {
          value: layerIntensitiesInit
        }
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      depthTest: false,
      depthWrite: false
    });
  }

  /**
   * Update mirage effect parameters
   * @param {number} fov - Current field of view in degrees
   * @param {Object} windGenerator - Wind generator instance
   * @param {Object} intersection - Range box intersection {x, y, z, distance}
   */
  update(fov, windGenerator, intersection)
  {
    // Get delta time from TimeManager (already clamped and pause-aware)
    const dt = ResourceManager.time.getDeltaTime();

    // Zoom-dependent base intensity (smaller FOV = more visible mirage)
    const zoomFactor = MirageEffect.BASE_FOV / fov;
    const baseIntensity = Math.min(zoomFactor * MirageEffect.BASE_INTENSITY, 1.0);

    // Normalize per-layer intensity so the RMS of the summed contributions
    // matches what a single-layer model produced at the same baseIntensity.
    // Uses the squared-mask sum so the active-layer count drives normalization;
    // turning layers off via DEBUG_LAYER_MASK doesn't dim the remaining ones.
    const mask = MirageEffect.DEBUG_LAYER_MASK;
    let maskSqSum = 0;
    for (let i = 0; i < this.numLayers; i++) maskSqSum += mask[i] * mask[i];
    const perLayerNorm = baseIntensity / Math.sqrt(Math.max(maskSqSum, 1e-6));

    const halfFovRad = (fov * Math.PI / 180) * 0.5;
    const tanHalfFov = Math.tan(halfFovRad);

    const layerOffsetsArr = this.material.uniforms.layerOffsets.value;
    const layerScalesArr = this.material.uniforms.layerScales.value;
    const layerDriftsArr = this.material.uniforms.layerDrifts.value;
    const layerIntensitiesArr = this.material.uniforms.layerIntensities.value;

    const alpha = MirageEffect.WIND_SMOOTHING_ALPHA;
    const yardsPerSecPerMph = MirageEffect.MPH_TO_YARDS_PER_SEC;
    const heatRiseDelta = MirageEffect.HEAT_RISE_SPEED * dt;
    const fadeSpeed = MirageEffect.WIND_FADE_SPEED_MPH;

    const sampleOffsets = MirageEffect.LAYER_SAMPLE_OFFSETS;
    const samplesPerLayer = sampleOffsets.length;

    for (let i = 0; i < this.numLayers; i++)
    {
      const t = MirageEffect.LAYER_FRACS[i];

      // Layer anchor (noise lookup origin) at the slab center
      const sampleX = intersection.x * t;
      const sampleY = intersection.y * t;
      const sampleZ = intersection.z * t;

      // Average wind over multiple positions inside the slab so each layer
      // gets a smoother local wind reading than a single point sample.
      let avgWindX = 0;
      let avgWindY = 0;
      let avgWindZ = 0;
      for (let s = 0; s < samplesPerLayer; s++)
      {
        let ts = t + sampleOffsets[s];
        if (ts < 0) ts = 0;
        else if (ts > 1) ts = 1;
        const wind = sampleWindAtThreeJsPosition(
          windGenerator,
          intersection.x * ts,
          intersection.y * ts,
          intersection.z * ts
        );
        avgWindX += wind.x;
        avgWindY += wind.y;
        avgWindZ += wind.z;
      }
      avgWindX /= samplesPerLayer;
      avgWindY /= samplesPerLayer;
      avgWindZ /= samplesPerLayer;

      // EMA-smooth the averaged wind in place
      const sw = this.smoothedWind[i];
      sw.x = sw.x * (1 - alpha) + avgWindX * alpha;
      sw.y = sw.y * (1 - alpha) + avgWindY * alpha;
      sw.z = sw.z * (1 - alpha) + avgWindZ * alpha;

      // Accumulate drift (cross + vertical; vertical includes heat rise).
      // Head wind is intentionally omitted — it slides columns along the line
      // of sight without changing their apparent screen position.
      const drift = this.accumulatedDrift[i];
      drift.x += sw.x * yardsPerSecPerMph * dt;
      drift.y += sw.y * yardsPerSecPerMph * dt + heatRiseDelta;

      // Per-layer attenuation from this layer's horizontal wind magnitude.
      // High wind well-mixes the slab and visibly suppresses its shimmer.
      const horizSpeed = Math.hypot(sw.x, sw.z);
      const fade = Math.max(0, Math.min(1, 1 - horizSpeed / fadeSpeed));

      // Layer world geometry: scale grows linearly with depth so a fixed
      // physical noise feature appears 1/t larger in the viewport at near layers
      const layerDistance = intersection.distance * t;
      const layerScale = layerDistance * tanHalfFov * 2;

      // Write uniforms (mutate-in-place; three.js picks up the changes)
      layerOffsetsArr[i].set(sampleX, sampleY, sampleZ);
      layerScalesArr[i] = layerScale;
      layerDriftsArr[i].set(drift.x, drift.y);
      layerIntensitiesArr[i] = perLayerNorm * fade * mask[i];
    }
  }

  /**
   * Apply mirage effect to input texture
   * @param {THREE.Texture} inputTexture - Input texture to distort
   * @param {THREE.WebGLRenderTarget} outputTarget - Output render target
   */
  apply(inputTexture, outputTarget)
  {
    this.material.uniforms.tDiffuse.value = inputTexture;
    this.renderer.setRenderTarget(outputTarget);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Get current crosswind for HUD display (target-end layer — what the eye
   * actually reads off the in-focus part of the mirage).
   * @returns {number} Crosswind in mph (positive = right, negative = left)
   */
  getSmoothedWindSpeed()
  {
    return this.smoothedWind[this.numLayers - 1].x;
  }

  /**
   * Get current smoothed wind vector (cross, vertical) at the target layer.
   */
  getSmoothedWindVector()
  {
    const sw = this.smoothedWind[this.numLayers - 1];
    return {
      x: sw.x,
      y: sw.y
    };
  }

  /**
   * Clean up resources
   */
  dispose()
  {
    if (this.quad)
    {
      this.quad.geometry.dispose();
      this.quad.material.dispose();
    }
  }
}
