/**
 * MirageEffect - Layered heat-mirage shimmer for scope views.
 *
 * The atmosphere along the line of sight is modeled as N independent slabs
 * (LAYER_FRACS), each with its own wind sample, EMA, drift, and attenuation.
 * All slabs sample one shared 4D simplex field at (x, y, z, t); the slabs are
 * decorrelated by their distinct world-space downrange (z) anchors.
 *
 * Each layer's world scale is `layer_distance * tan(fov/2) * 2`, so a
 * fixed-physical-size noise feature appears 1/t larger in the viewport at
 * shallower layers, near columns read as big soft blobs, far columns as
 * crisp small features without any explicit blur.
 *
 * The four noise axes (each with its own frequency, NOISE_FREQ_X/Y/Z/T) are
 * advected by independent drivers:
 *   x  ← crosswind            (translates the pattern left/right on screen)
 *   y  ← vertical wind + heat rise (translates it up, the boil)
 *   z  ← headwind             (downrange; low frequency so it churns slowly)
 *   t  ← constant clock       (plumes form and dissipate in place over time)
 *
 * Anisotropy (X higher than Y) makes the features taller than wide, the
 * vertical structure the eye reads as a "column". Head wind doesn't translate the
 * pattern on screen (columns slide along the line of sight), so it only churns
 * the z-axis; with NOISE_FREQ_Z small, the column refreshes gradually. Head
 * wind also feeds the per-layer attenuation via the horizontal-wind magnitude.
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
  // ===========================================================================
  // Tuning hyperparameters, edit anything below to tweak the mirage look/feel.
  // ===========================================================================

  // ---- Reference / zoom ----
  static BASE_FOV                 = 30;     // FOV (deg) treated as "1x zoom"

  // ---- Intensity / appearance ----
  static BASE_INTENSITY           = 0.025;  // per-layer noise weight at 1x zoom (pre-1/sqrt(N) normalization)
  static ZOOM_INTENSITY_CAP       = 2.0;    // ceiling on the zoom-driven intensity growth. Mirage wobble
                                            // scales with magnification; this caps it so the UV warp can't
                                            // sample absurdly far off-pixel at extreme zoom.
  static SPATIAL_DISTORTION_SCALE = 0.003;  // UV displacement scale, how far the image warbles
  static SHADING_INTENSITY_SCALE  = 1.0;    // chromatic edge-tint multiplier
  static SHADING_MAX_STRENGTH     = 0.85;   // clamp on the tint mix amount. Keep high enough that
                                            // heavier presets don't all saturate to the same tint.

  // ---- Height / line-of-sight elevation falloff ----
  // Mirage is densest near the ground and thins with height, so it should cover
  // the whole target frame and then taper off in the gap above it, fading out
  // around the number board that floats over the frame. Each pixel's view
  // elevation (deg, relative to the level aim line) drives an exponential
  // falloff: full at/below ELEV_FULL_DEG, then a gradual, edge-free taper with
  // e-folding width ELEV_FALLOFF_DEG. Reference geometry at 1000yd (aim at frame
  // center): frame top ≈ 0.086 deg up, number-board top ≈ 0.21 deg up, so FULL
  // ≈ frame top keeps the whole frame boiling, and FALLOFF carries the fade up
  // to the number. Closer targets subtend more, so the boil rides a bit lower on
  // them. Raise FULL to push the full zone up; raise FALLOFF for a softer/taller
  // tail (0.0167 deg = 1 MOA).
  static ELEV_FULL_DEG            = 0.08;
  static ELEV_FALLOFF_DEG         = 0.14;

  // ---- Motion ----
  static HEAT_RISE_SPEED          = 1.0;    // yards/sec, constant vertical advection (the boil)
  static WIND_SMOOTHING_ALPHA     = 0.01;   // per-frame EMA weight on new wind sample [0..1]

  // ---- 4D noise frequencies ----
  // The shimmer is a single 4D simplex field sampled at (x, y, z, t). Each axis
  // is advected by its own driver, crosswind→x, vertical wind + heat rise→y,
  // headwind→z, constant clock→t, and each frequency below converts that
  // axis's units into noise space. Higher frequency = smaller/faster features.
  //   X (1/yd): horizontal feature size. Higher → narrower features.
  //   Y (1/yd): vertical feature size.   Lower than X → taller than wide (columns).
  //   Z (1/yd): downrange. Low, so the air column along the line of sight is
  //             nearly uniform, headwind churns it only slowly, and the
  //             per-layer slabs stay decorrelated by their distinct depth.
  //   T (1/s):  in-place evolution rate (plumes form and dissipate). Lower is
  //             slower; without it a calm-wind scope view would freeze.
  static NOISE_FREQ_X             = 3;
  static NOISE_FREQ_Y             = 2;
  static NOISE_FREQ_Z             = 0.05;
  static NOISE_FREQ_T             = 0.2;

  // ---- Layered atmosphere ----
  // Each slab covers the depth range from the previous fraction to its own
  // (the first spans 0→first). Each frame the slab samples wind at one random
  // point in that range and mixes it into the EMA, which converges on the
  // slab's average wind, full coverage of the range, one sample per frame.
  static LAYER_FRACS              = [0.5, 0.8, 1.0]; // far-edge depth fraction of each slab
  static WIND_FADE_SPEED_MPH      = 15.0;             // per-layer attenuation: layer fades to 0 by this horizontal wind speed

  // ---- Debug ----
  // Per-layer enable mask (1=on, 0=off). Per-layer normalization is recomputed
  // from the active count so isolating one layer shows it at its natural
  // single-layer magnitude rather than dimmed by 1/sqrt(N).
  static DEBUG_LAYER_MASK         = [1.0, 1.0, 1.0];

  // ---- Physical conversion (not a tuning knob) ----
  static MPH_TO_YARDS_PER_SEC     = 0.4888889;

  constructor(renderer, intensityScale = 1.0)
  {
    this.renderer = renderer;
    this.numLayers = MirageEffect.LAYER_FRACS.length;

    // Strength multiplier from the Light/Medium/Heavy preset, applied on top of
    // the zoom-dependent intensity (scales both spatial warble and shading).
    this.intensityScale = intensityScale;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.material = this.createMaterial();

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.quad);

    // Per-layer EMA-smoothed wind (cross, vertical, head) in mph, and the
    // accumulated drift (cross, vertical, head) in yards that advects the noise.
    this.smoothedWind = [];
    this.accumulatedDrift = [];
    for (let i = 0; i < this.numLayers; i++)
    {
      this.smoothedWind.push(new THREE.Vector3(0, 0, 0));
      this.accumulatedDrift.push(new THREE.Vector3(0, 0, 0));
    }

    // Elapsed time (seconds) driving the noise t-axis.
    this.elapsedTime = 0;
  }

  createMaterial()
  {
    const NUM_LAYERS = this.numLayers;

    // Simplex 4D noise (Gustavson/Ashima, MIT). 4D so the shimmer has an
    // independent time axis (t) on top of the three spatial axes (x, y, z).
    const simplexNoise = `
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      float mod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      float permute(float x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float taylorInvSqrt(float r) { return 1.79284291400159 - 0.85373472095314 * r; }

      vec4 grad4(float j, vec4 ip) {
        const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
        vec4 p, s;
        p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
        p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
        s = vec4(lessThan(p, vec4(0.0)));
        p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
        return p;
      }

      float snoise(vec4 v) {
        const vec4 C = vec4( 0.138196601125011,   // (5 - sqrt(5))/20  = G4
                             0.276393202250021,   // 2 * G4
                             0.414589803375032,   // 3 * G4
                            -0.447213595499958);  // -1 + 4 * G4

        // First corner
        vec4 i  = floor(v + dot(v, vec4(0.309016994374947451)));
        vec4 x0 = v - i + dot(i, C.xxxx);

        // Rank sort to find which simplex cell we are in
        vec4 i0;
        vec3 isX = step(x0.yzw, x0.xxx);
        vec3 isYZ = step(x0.zww, x0.yyz);
        i0.x = isX.x + isX.y + isX.z;
        i0.yzw = 1.0 - isX;
        i0.y += isYZ.x + isYZ.y;
        i0.zw += 1.0 - isYZ.xy;
        i0.z += isYZ.z;
        i0.w += 1.0 - isYZ.z;

        vec4 i3 = clamp(i0, 0.0, 1.0);
        vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
        vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

        vec4 x1 = x0 - i1 + C.xxxx;
        vec4 x2 = x0 - i2 + C.yyyy;
        vec4 x3 = x0 - i3 + C.zzzz;
        vec4 x4 = x0 + C.wwww;

        // Permutations
        i = mod289(i);
        float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
        vec4 j1 = permute(permute(permute(permute(
                   i.w + vec4(i1.w, i2.w, i3.w, 1.0))
                 + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
                 + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
                 + i.x + vec4(i1.x, i2.x, i3.x, 1.0));

        // Gradients
        vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0);
        vec4 p0 = grad4(j0,   ip);
        vec4 p1 = grad4(j1.x, ip);
        vec4 p2 = grad4(j1.y, ip);
        vec4 p3 = grad4(j1.z, ip);
        vec4 p4 = grad4(j1.w, ip);

        // Normalize gradients
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        p4 *= taylorInvSqrt(dot(p4,p4));

        // Mix contributions from the five corners
        vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
        vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)), 0.0);
        m0 = m0 * m0;
        m1 = m1 * m1;
        return 49.0 * (dot(m0*m0, vec3(dot(p0,x0), dot(p1,x1), dot(p2,x2)))
                     + dot(m1*m1, vec2(dot(p3,x3), dot(p4,x4))));
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
      uniform vec4  noiseFreq;                    // (x, y, z, t) per-axis frequency
      uniform float noiseTime;                    // elapsed seconds, drives the t axis
      uniform float spatialScale;                 // UV displacement multiplier
      uniform float shadingScale;                 // chromatic tint multiplier
      uniform vec3  layerOffsets[NUM_LAYERS];     // world-space anchor (yards) per layer
      uniform float layerScales[NUM_LAYERS];      // viewport world width (yards) per layer
      uniform vec3  layerDrifts[NUM_LAYERS];      // accumulated wind drift (cross, vertical, head) yards
      uniform float layerIntensities[NUM_LAYERS]; // per-layer noise weight (zoom * fade / sqrt(N))
      uniform float viewPitch;                    // elevation of view center (radians, +up)
      uniform float vFovRad;                      // vertical field of view (radians)

      varying vec2 vUv;

      ${simplexNoise}

      void main() {
        vec2 uv = vUv;

        float totalDistortion = 0.0;

        // One 4D noise sample per layer. The three spatial axes are advected by
        // their wind drivers (cross→x, vertical+heat→y, head→z); the fourth axis
        // is the shared clock so the field evolves in place. Layers are
        // decorrelated by their distinct world-space z (downrange) anchors,
        // which sit far beyond the noise correlation length.
        float tCoord = noiseTime * noiseFreq.w;
        for (int i = 0; i < NUM_LAYERS; i++) {
          vec4 noisePos = vec4(
            ((uv.x - 0.5) * layerScales[i] + layerOffsets[i].x - layerDrifts[i].x) * noiseFreq.x,
            ((uv.y - 0.5) * layerScales[i] + layerOffsets[i].y - layerDrifts[i].y) * noiseFreq.y,
            (layerOffsets[i].z - layerDrifts[i].z) * noiseFreq.z,
            tCoord
          );

          float n = snoise(noisePos);
          totalDistortion += n * layerIntensities[i];
        }

        // Height falloff: this pixel's line-of-sight elevation is the view-center
        // pitch plus its vertical offset across the FOV. Mirage is full when the
        // sight grazes the deck, then tapers off exponentially as it tilts up
        // into the sky, a gradual fade with no hard edge, so the sky band above
        // the target thins away smoothly instead of cutting off at a line.
        float elevDeg = (viewPitch + (uv.y - 0.5) * vFovRad) * 57.2957795;
        float elevAtten = exp(-max(elevDeg - ${MirageEffect.ELEV_FULL_DEG.toFixed(4)}, 0.0) / ${MirageEffect.ELEV_FALLOFF_DEG.toFixed(4)});
        totalDistortion *= elevAtten;

        // Mirage refracts light vertically (rising hot air = vertical n-gradient).
        // Spatial and shading scales are independent so each can be tuned alone.
        vec2 distortedUV = uv + vec2(0.0, totalDistortion) * spatialScale;

        vec4 color = texture2D(tDiffuse, distortedUV);

        // Chromatic edge tint scales with total distortion magnitude
        float tintStrength = clamp(abs(totalDistortion) * shadingScale, 0.0, ${MirageEffect.SHADING_MAX_STRENGTH.toFixed(3)});
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
      layerDriftsInit.push(new THREE.Vector3(0, 0, 0));
      layerIntensitiesInit.push(0);
    }

    const noiseFreqVec = new THREE.Vector4(
      MirageEffect.NOISE_FREQ_X,
      MirageEffect.NOISE_FREQ_Y,
      MirageEffect.NOISE_FREQ_Z,
      MirageEffect.NOISE_FREQ_T
    );

    return new THREE.ShaderMaterial(
    {
      uniforms:
      {
        tDiffuse:         { value: null },
        noiseFreq:        { value: noiseFreqVec },
        noiseTime:        { value: 0 },
        spatialScale:     { value: MirageEffect.SPATIAL_DISTORTION_SCALE },
        shadingScale:     { value: MirageEffect.SHADING_INTENSITY_SCALE },
        layerOffsets:     { value: layerOffsetsInit },
        layerScales:      { value: layerScalesInit },
        layerDrifts:      { value: layerDriftsInit },
        layerIntensities: { value: layerIntensitiesInit },
        viewPitch:        { value: 0 },
        vFovRad:          { value: 0 }
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      depthTest: false,
      depthWrite: false
    });
  }

  /**
   * Update mirage effect parameters
   * @param {number} fov - Current (vertical) field of view in degrees
   * @param {Object} windGenerator - Wind generator instance
   * @param {Object} intersection - Range box intersection {x, y, z, distance}
   * @param {number} viewPitchRad - Elevation of the view center in radians (+up),
   *        used to fade the shimmer out as the sight tilts up off the deck.
   */
  update(fov, windGenerator, intersection, viewPitchRad = 0)
  {
    // Get delta time from TimeManager (already clamped and pause-aware)
    const dt = ResourceManager.time.getDeltaTime();

    // Line-of-sight geometry for the height (elevation) falloff in the shader.
    this.material.uniforms.viewPitch.value = viewPitchRad;
    this.material.uniforms.vFovRad.value = fov * Math.PI / 180;

    // Advance the noise t-axis so the field morphs in place (boil even without
    // wind). Shared across layers; they stay decorrelated through their
    // distinct downrange (z) anchors. NOISE_FREQ_T sets the evolution rate.
    this.elapsedTime += dt;
    this.material.uniforms.noiseTime.value = this.elapsedTime;

    // Zoom-dependent base intensity (smaller FOV = more visible mirage). The
    // clamp caps the zoom contribution so it doesn't run away at high zoom;
    // the user strength preset is applied *after* the clamp, otherwise every
    // preset would saturate to the same value once zoomed in.
    const zoomFactor = MirageEffect.BASE_FOV / fov;
    const zoomIntensity = Math.min(zoomFactor * MirageEffect.BASE_INTENSITY, MirageEffect.ZOOM_INTENSITY_CAP);
    const baseIntensity = zoomIntensity * this.intensityScale;

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

    for (let i = 0; i < this.numLayers; i++)
    {
      const t = MirageEffect.LAYER_FRACS[i];

      // Noise anchor at the slab's far edge along the line of sight.
      const anchorX = intersection.x * t;
      const anchorY = intersection.y * t;
      const anchorZ = intersection.z * t;

      // Sample wind at one random point in this slab's depth range [prevFrac, t]
      // and mix it into the EMA, which converges on the slab's average wind.
      const loFrac = i === 0 ? 0 : MirageEffect.LAYER_FRACS[i - 1];
      const ts = loFrac + Math.random() * (t - loFrac);
      const wind = sampleWindAtThreeJsPosition(
        windGenerator,
        intersection.x * ts,
        intersection.y * ts,
        intersection.z * ts
      );

      const sw = this.smoothedWind[i];
      sw.x = sw.x * (1 - alpha) + wind.x * alpha;
      sw.y = sw.y * (1 - alpha) + wind.y * alpha;
      sw.z = sw.z * (1 - alpha) + wind.z * alpha;

      // Advect the noise: cross + vertical (with heat rise) translate the field
      // on screen; head churns the downrange axis.
      const drift = this.accumulatedDrift[i];
      drift.x += sw.x * yardsPerSecPerMph * dt;
      drift.y += sw.y * yardsPerSecPerMph * dt + heatRiseDelta;
      drift.z += sw.z * yardsPerSecPerMph * dt;

      // Attenuate the slab by its horizontal wind magnitude, strong wind mixes
      // the air and washes the shimmer out.
      const horizSpeed = Math.hypot(sw.x, sw.z);
      const fade = Math.max(0, Math.min(1, 1 - horizSpeed / fadeSpeed));

      // World scale grows linearly with depth, so a fixed-size feature appears
      // 1/t larger in the viewport at nearer slabs.
      const layerScale = intersection.distance * t * tanHalfFov * 2;

      layerOffsetsArr[i].set(anchorX, anchorY, anchorZ);
      layerScalesArr[i] = layerScale;
      layerDriftsArr[i].set(drift.x, drift.y, drift.z);
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
   * Set the user strength multiplier (Light/Medium/Heavy). Takes effect on the
   * next update(). A scale of 0 produces no visible mirage, though callers that
   * want the perf win should skip the render pass entirely instead.
   */
  setIntensityScale(scale)
  {
    this.intensityScale = scale;
  }

  /**
   * Get current crosswind for HUD display (target-end layer, what the eye
   * actually reads off the in-focus part of the mirage).
   * @returns {number} Crosswind in mph (positive = right, negative = left)
   */
  getSmoothedWindSpeed()
  {
    return this.smoothedWind[this.numLayers - 1].x;
  }

  /**
   * Get current smoothed wind vector (cross, head) in mph at the target layer,
   * the two horizontal components a shooter reads (vertical is ~0 in this field).
   */
  getSmoothedWindVector()
  {
    const sw = this.smoothedWind[this.numLayers - 1];
    return {
      x: sw.x,
      y: sw.z
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
