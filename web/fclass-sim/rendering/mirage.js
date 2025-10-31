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

    // Accumulated advection (integrated wind over time) in yards: (cross, head)
    this.accumulatedDriftVec = new THREE.Vector2(0, 0);
    this.lastUpdateTime = 0;
    this.smoothedWind = new THREE.Vector2(0, 0); // (cross, head) in mph
    this.windSmoothingAlpha = 1.0; // No smoothing (use instantaneous sampled wind)
  }

  createMaterial()
  {
    // Simplex noise function for GLSL
    const simplexNoise = `
      // Simplex 2D noise
      vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                 -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
          dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
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
      uniform float time;
      uniform float intensity;
      uniform vec2 driftOffset; // Accumulated advection (cross, head) in yards
      uniform float windSpeed;  // Crosswind speed in mph (for lean)
      uniform float windSpeedTotal; // Total wind speed in mph (for attenuation)
      uniform vec2 windDir; // Normalized 2D wind direction in screen/world space (x=cross, y=head)
      uniform vec2 worldOffset;  // World-space offset for anchoring mirage
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
        
        // Convert UV to world-space coordinates (anchored to landscape)
        vec2 worldPos = (uv - 0.5) * worldScale + worldOffset;
        
        // This creates the "boiling" effect
        float verticalSpeed = 2.0; // yards/second
        float verticalRise = time * verticalSpeed;
        
        // Wind interaction with mirage:
        // < 3 mph: vertical boil dominates
        // 3-6 mph: shimmer leans (mix of vertical and horizontal)
        // > 8 mph: horizontal flow dominates, boil fades
        float absCross = abs(windSpeed);
        float absTotal = abs(windSpeedTotal);
        // Lean mixes derive from crosswind magnitude, normalized to 15 mph limit
        float horizontalFactor = clamp(absCross / 15.0, 0.0, 1.0);
        float verticalFactor = 1.0 - horizontalFactor;
        
        // Adjust vertical rise based on wind (strong wind suppresses vertical convection)
        float effectiveVerticalRise = verticalRise * (0.3 + 0.7 * verticalFactor);
        
        // Create multiple octaves of noise for realistic heat shimmer
        // Subtract verticalRise so mirage appears to rise (hot air rises from ground)
        // Layer 1: Large slow waves (scale 0.5)
        float noise1 = snoise(vec2(
          worldPos.x * 0.5 - driftOffset.x * 0.5 * 0.3,
          worldPos.y * 0.5 - effectiveVerticalRise * 0.5 * 0.3
        ));
        
        // Layer 2: Medium waves (scale 1.0)
        float noise2 = snoise(vec2(
          worldPos.x * 1.0 - driftOffset.x * 1.0 * 0.5,
          worldPos.y * 1.0 - effectiveVerticalRise * 1.0 * 0.5
        ));
        
        // Layer 3: Small fast waves (scale 2.0)
        float noise3 = snoise(vec2(
          worldPos.x * 2.0 - driftOffset.x * 2.0 * 0.8,
          worldPos.y * 2.0 - effectiveVerticalRise * 2.0 * 0.8
        ));
        
        // Combine noise layers with different weights
        float noise = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
        
        // Build a direction that blends vertical (rising) with wind direction
        // horizontalFactor mixes from vertical (0) to wind-aligned (1)
        vec2 baseVertical = vec2(0.0, 1.0);
        vec2 baseWind = normalize(windDir);
        vec2 baseDir = normalize(mix(baseVertical, baseWind, horizontalFactor));
        
        // Distortion oriented along blended direction; sign(wind.x) is embedded in windDir.x
        vec2 distortion = noise * baseDir;
        
        // Apply intensity (zoom-dependent) and fade out with total wind speed
        // Smooth continuous fade from 0 to 15 mph (completely gone at 15 mph)
        float fade = clamp(1.0 - (absTotal / 15.0), 0.0, 1.0);
        
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
        time:
        {
          value: 0
        },
        intensity:
        {
          value: 0
        },
        windSpeed:
        {
          value: 0
        },
        windSpeedTotal:
        {
          value: 0
        },
        windDir:
        {
          value: new THREE.Vector2(0, 1)
        },
        worldOffset:
        {
          value: new THREE.Vector2(0, 0)
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
   * @param {number} time - Current time in seconds
   * @param {number} fov - Current field of view in degrees
   * @param {Object} windGenerator - Wind generator instance
   * @param {Object} intersection - Range box intersection {x, y, z, distance}
   */
  update(time, fov, windGenerator, intersection)
  {
    // Update time for animation
    this.material.uniforms.time.value = time;

    // Calculate delta time for integration
    // Clamp dt to [0, 0.05] seconds for stability (prevents large jumps from pause/resume)
    const dt = this.lastUpdateTime > 0 ? Math.min(Math.max(0, time - this.lastUpdateTime), 0.05) : 0;
    this.lastUpdateTime = time;

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
    // This is where the scope's center ray hits the range box
    const worldOffsetX = intersection.x;
    const worldOffsetY = intersection.z; // Z is downrange, use as Y in 2D noise space
    this.material.uniforms.worldOffset.value.set(worldOffsetX, worldOffsetY);

    // Calculate world scale based on FOV and distance to intersection
    // Larger FOV = more world space visible = larger scale
    const worldScale = intersection.distance * Math.tan((fov * Math.PI / 180) / 2) * 2;
    this.material.uniforms.worldScale.value = worldScale;

    // Sample wind in the last 25% of distance before intersection (5 samples at 75%, 80%, 85%, 90%, 95%, plus 100%)
    const targetDistance = intersection.distance;
    const numSamples = 6;
    let totalCross = 0; // crosswind accumulator (wind.x)
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

      // BTK wrapper: wind.x = crosswind, wind.z = headwind, wind.y = vertical
      totalCross += wind.x; // crosswind for lean
      totalHead += wind.z;
      const horizontalMag = Math.sqrt(wind.x * wind.x + wind.z * wind.z); // horizontal wind magnitude
      totalMag += horizontalMag;
    }

    // Use non-weighted average
    // Wind from BTK wrapper is already in mph
    const avgCross_mph = totalCross / numSamples;
    const avgHead_mph = totalHead / numSamples;
    const avgTotal_mph = totalMag / numSamples;

    // Apply EMA smoothing to wind vector (cross, head)
    const a = this.windSmoothingAlpha;
    this.smoothedWind.x = this.smoothedWind.x * (1 - a) + avgCross_mph * a;
    this.smoothedWind.y = this.smoothedWind.y * (1 - a) + avgHead_mph * a;

    // Integrate wind speed over time to get accumulated drift
    // Convert mph to yards/second: 1 mph = 0.4888889 yd/s
    const mphToYardsPerSec = 0.4888889;
    // Drift vector this frame in yards (cross, head)
    const driftX = this.smoothedWind.x * mphToYardsPerSec * dt;
    const driftY = this.smoothedWind.y * mphToYardsPerSec * dt;
    this.accumulatedDriftVec.x += driftX;
    this.accumulatedDriftVec.y += driftY;

    // Pass wind data to shader (defensive init for hot-reload cases)
    const uniforms = this.material.uniforms;
    if (!uniforms.driftOffset) uniforms.driftOffset = {
      value: new THREE.Vector2(0, 0)
    };
    if (!uniforms.windDir) uniforms.windDir = {
      value: new THREE.Vector2(0, 1)
    };
    this.material.uniforms.driftOffset.value.set(this.accumulatedDriftVec.x, this.accumulatedDriftVec.y);
    this.material.uniforms.windSpeed.value = Math.abs(this.smoothedWind.x); // crosswind (mph) for lean
    const smoothedTotal = Math.hypot(this.smoothedWind.x, this.smoothedWind.y);
    this.material.uniforms.windSpeedTotal.value = smoothedTotal; // total (mph) for attenuation
    // Wind direction in shader space (x=cross, y=head). Default to vertical if near zero.
    const len = smoothedTotal;
    if (len > 1e-3)
    {
      this.material.uniforms.windDir.value.set(this.smoothedWind.x / len, this.smoothedWind.y / len);
    }
    else
    {
      this.material.uniforms.windDir.value.set(0, 1);
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