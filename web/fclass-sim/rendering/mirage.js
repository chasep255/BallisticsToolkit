/**
 * MirageEffect - Heat mirage/shimmer effect for realistic scope views
 * Applies distortion based on wind speed, direction, and zoom level
 *
 * This file incorporates GLSL Simplex noise code derived from work by
 * Stefan Gustavson and Ashima Arts, distributed under the MIT License.
 * Original sources:
 * - https://github.com/stegu/webgl-noise
 * - https://github.com/ashima/webgl-noise
 */

import * as THREE from 'three';
import ResourceManager from '../resources/manager.js';

export class MirageEffect
{
  constructor(renderer)
  {
    this.renderer = renderer;

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

    // Accumulated advection (integrated wind over time) in yards: (cross, vertical, head)
    this.accumulatedDriftVec = new THREE.Vector3(0, 0, 0);
    this.smoothedWind = new THREE.Vector3(0, 0, 0); // (cross, vertical, head) in mph
    // Smooth wind to reduce visible jitter in the mirage pattern
    this.windSmoothingAlpha = 0.01; // EMA smoothing factor in [0..1]
  }

  createMaterial()
  {
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
      uniform sampler2D tDiffuse;
      uniform float intensity;
      uniform vec3 windAdvection; // Accumulated 3D wind advection (cross, vertical, head) in yards
      uniform float windSpeedTotal; // Total wind speed in mph (for attenuation)
      uniform vec3 worldOffset;  // World-space 3D offset for anchoring mirage (x, y, z)
      uniform float worldScale;  // Scale factor for world coordinates
      
      varying vec2 vUv;
      
      ${simplexNoise}
      
      void main() {
        vec2 uv = vUv;
        
        // Early exit if intensity is very low
        if (intensity < 0.001) {
          gl_FragColor = texture2D(tDiffuse, uv);
          return;
        }
        
        // Convert UV to 3D world-space coordinates (anchored to landscape)
        // UV maps to X (horizontal) and Y (vertical) in view space
        // Z (downrange) comes from worldOffset.z
        vec3 worldPos = vec3(
          (uv.x - 0.5) * worldScale + worldOffset.x,
          (uv.y - 0.5) * worldScale + worldOffset.y,
          worldOffset.z
        );
        
        // Create multiple octaves of 3D noise for realistic heat shimmer
        // Apply full 3D wind advection (includes heat rise baked into Y component)
        // Layer 1: Large slow waves (scale 0.5)
        float noise1 = snoise(vec3(
          worldPos.x * 0.5 - windAdvection.x * 0.5 * 0.8,
          worldPos.y * 0.5 - windAdvection.y * 0.5 * 0.8,
          worldPos.z * 0.5 - windAdvection.z * 0.5 * 0.8
        ));
        
        // Layer 2: Medium waves (scale 1.0)
        float noise2 = snoise(vec3(
          worldPos.x * 1.0 - windAdvection.x * 1.0 * 0.9,
          worldPos.y * 1.0 - windAdvection.y * 1.0 * 0.9,
          worldPos.z * 1.0 - windAdvection.z * 1.0 * 0.9
        ));
        
        // Layer 3: Small fast waves (scale 2.0)
        float noise3 = snoise(vec3(
          worldPos.x * 2.0 - windAdvection.x * 2.0 * 1.0,
          worldPos.y * 2.0 - windAdvection.y * 2.0 * 1.0,
          worldPos.z * 2.0 - windAdvection.z * 2.0 * 1.0
        ));
        
        // Combine noise layers with different weights
        float noise = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
        
        // Distortion is purely vertical; horizontal drift comes from advection
        vec2 distortion = vec2(0.0, noise);
        
        // Apply intensity (zoom-dependent) and fade out with total wind speed
        // Smooth continuous fade from 0 to 15 mph (completely gone at 15 mph)
        float fade = clamp(1.0 - (abs(windSpeedTotal) / 15.0), 0.0, 1.0);
        
        // Calculate tint strength from raw noise before scaling (noise ranges ~-1 to 1)
        float noiseMag = abs(noise); // Absolute value of noise for edge detection
        float tintStrength = noiseMag * intensity * fade * 2.0; // Scale with intensity and fade
        
        distortion *= intensity * fade;
        
        // Scale distortion to pixel space
        vec2 distortedUV = uv + distortion * 0.01;
        
        // Sample texture with distorted UV coordinates
        vec4 color = texture2D(tDiffuse, distortedUV);
        
        // Add edge tint based on noise magnitude
        // Heat mirage creates chromatic aberration at edges
        tintStrength = clamp(tintStrength, 0.0, 0.4); // Cap at 40% for visible effect
        
        // Blue/purple tint at edges (heat refraction effect)
        color.rgb = mix(color.rgb, color.rgb * vec3(0.85, 0.9, 1.0), tintStrength);
        
        gl_FragColor = color;
      }
    `;

    return new THREE.ShaderMaterial(
    {
      uniforms:
      {
        tDiffuse:
        {
          value: null
        },
        intensity:
        {
          value: 0
        },
        windAdvection:
        {
          value: new THREE.Vector3(0, 0, 0)
        },
        windSpeedTotal:
        {
          value: 0
        },
        worldOffset:
        {
          value: new THREE.Vector3(0, 0, 0)
        },
        worldScale:
        {
          value: 1.0
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
    // Get delta time from TimeManager (already clamped to [0.0005, 0.05] and handles pause/resume)
    const dt = ResourceManager.time.getDeltaTime();

    // Calculate intensity based on FOV (smaller FOV = more zoom = more mirage)
    const baseFOV = 30; // Reference FOV (main camera)
    const zoomFactor = baseFOV / fov;

    // Exponential scaling for more pronounced effect at high zoom
    // At 1x zoom (FOV=30): intensity = 0.04
    // At 10x zoom (FOV=3): intensity = 0.4
    // At 100x zoom (FOV=0.3): intensity = 0.8 (clamped)
    const baseIntensity = 0.03;
    this.material.uniforms.intensity.value = Math.min(zoomFactor * baseIntensity, 1.0);

    // Use intersection point for world-space anchoring
    // This is where the scope's center ray hits the range box (3D world position)
    // For 3D noise: X = left/right, Y = vertical height, Z = downrange distance
    const worldOffsetX = intersection.x; // Left-right position
    const worldOffsetY = intersection.y; // Vertical height above ground
    const worldOffsetZ = intersection.z; // Downrange distance (negative)
    this.material.uniforms.worldOffset.value.set(worldOffsetX, worldOffsetY, worldOffsetZ);

    // Calculate world scale based on FOV and distance to intersection
    // Larger FOV = more world space visible = larger scale
    const worldScale = intersection.distance * Math.tan((fov * Math.PI / 180) / 2) * 2;
    this.material.uniforms.worldScale.value = worldScale;

    // Sample wind in the last 25% of distance before intersection (5 samples at 75%, 80%, 85%, 90%, 95%, plus 100%)
    const targetDistance = intersection.distance;
    const numSamples = 6;
    let totalCross = 0; // crosswind accumulator (wind.x)
    let totalVertical = 0; // vertical wind accumulator (wind.y)
    let totalHead = 0; // headwind accumulator (wind.z)
    let totalMag = 0; // horizontal wind magnitude accumulator

    for (let i = 0; i < numSamples; i++)
    {
      const t = 0.75 + (i * 0.05); // 0.75, 0.80, 0.85, 0.90, 0.95, 1.00
      const sampleDistance = targetDistance * t;

      // Calculate position at this distance along the line of sight
      const ratio = t;
      const sampleX = intersection.x * ratio;
      const sampleY = intersection.y * ratio;
      const sampleZ = intersection.z * ratio;

      const wind = windGenerator.getWindAt(
        sampleX,
        sampleY,
        sampleZ
      );

      // BTK wrapper: wind.x = crosswind, wind.y = vertical, wind.z = headwind
      totalCross += wind.x;
      totalVertical += wind.y;
      totalHead += wind.z;
      const horizontalMag = Math.sqrt(wind.x * wind.x + wind.z * wind.z); // horizontal wind magnitude
      totalMag += horizontalMag;
    }

    // Use non-weighted average
    // Wind from BTK wrapper is already in mph
    const avgCross_mph = totalCross / numSamples;
    const avgVertical_mph = totalVertical / numSamples;
    const avgHead_mph = totalHead / numSamples;

    // Apply EMA smoothing to wind vector (cross, vertical, head)
    const a = this.windSmoothingAlpha;
    this.smoothedWind.x = this.smoothedWind.x * (1 - a) + avgCross_mph * a;
    this.smoothedWind.y = this.smoothedWind.y * (1 - a) + avgVertical_mph * a;
    this.smoothedWind.z = this.smoothedWind.z * (1 - a) + avgHead_mph * a;

    // Integrate wind speed over time to get accumulated 3D advection
    // Convert mph to yards/second: 1 mph = 0.4888889 yd/s
    const mphToYardsPerSec = 0.4888889;
    // Heat rise: constant upward advection (hot air rises from ground)
    const heatRiseSpeed = 2.0; // yards/second
    // Advection vector this frame in yards (cross, vertical + heat rise, head)
    const advectX = this.smoothedWind.x * mphToYardsPerSec * dt;
    const advectY = this.smoothedWind.y * mphToYardsPerSec * dt + heatRiseSpeed * dt;
    const advectZ = this.smoothedWind.z * mphToYardsPerSec * dt;
    this.accumulatedDriftVec.x += advectX;
    this.accumulatedDriftVec.y += advectY;
    this.accumulatedDriftVec.z += advectZ;

    // Pass wind data to shader (defensive init for hot-reload cases)
    const uniforms = this.material.uniforms;
    if (!uniforms.windAdvection) uniforms.windAdvection = {
      value: new THREE.Vector3(0, 0, 0)
    };
    this.material.uniforms.windAdvection.value.set(
      this.accumulatedDriftVec.x,
      this.accumulatedDriftVec.y,
      this.accumulatedDriftVec.z
    );
    // Total horizontal wind speed for attenuation (mirage fades in high wind)
    const smoothedTotal = Math.hypot(this.smoothedWind.x, this.smoothedWind.z);
    this.material.uniforms.windSpeedTotal.value = smoothedTotal;
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
   * Get current wind speed (crosswind component only)
   * @returns {number} Current wind speed in mph (positive = right, negative = left)
   */
  getSmoothedWindSpeed()
  {
    return this.smoothedWind.x;
  }

  /**
   * Get current smoothed wind vector (cross, head) in mph
   */
  getSmoothedWindVector()
  {
    return {
      x: this.smoothedWind.x,
      y: this.smoothedWind.y
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