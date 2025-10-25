/**
 * MirageEffect - Heat mirage/shimmer effect for realistic scope views
 * Applies distortion based on wind speed, direction, and zoom level
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
    
    // Accumulated horizontal drift (integrated wind speed over time)
    this.accumulatedDrift = 0;
    this.lastUpdateTime = 0;
    this.currentWindX = 0;
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
      uniform float horizontalDrift;  // Accumulated drift in yards (integrated wind speed)
      uniform float windSpeed;  // Current wind speed in mph (for wind-dependent effects)
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
        
        // Vertical convection speed: 1-4 mph typical (use 2 mph = 2.93 yards/sec)
        // This creates the "boiling" effect
        float verticalSpeed = 2.93; // yards/second
        float verticalRise = time * verticalSpeed;
        
        // Wind interaction with mirage:
        // < 3 mph: vertical boil dominates
        // 3-6 mph: shimmer leans (mix of vertical and horizontal)
        // > 8 mph: horizontal flow dominates, boil fades
        float absWindSpeed = abs(windSpeed);
        float verticalFactor = smoothstep(8.0, 0.0, absWindSpeed); // 1.0 at calm, 0.0 at 8+ mph
        float horizontalFactor = smoothstep(0.0, 8.0, absWindSpeed); // 0.0 at calm, 1.0 at 8+ mph
        
        // Adjust vertical rise based on wind (strong wind suppresses vertical convection)
        float effectiveVerticalRise = verticalRise * (0.3 + 0.7 * verticalFactor);
        
        // Create multiple octaves of noise for realistic heat shimmer
        // Layer 1: Large slow waves (scale 0.5)
        float noise1 = snoise(vec2(
          worldPos.x * 0.5 - horizontalDrift * 0.5 * 0.3,
          worldPos.y * 0.5 + effectiveVerticalRise * 0.5 * 0.3
        ));
        
        // Layer 2: Medium waves (scale 1.0)
        float noise2 = snoise(vec2(
          worldPos.x * 1.0 - horizontalDrift * 1.0 * 0.5,
          worldPos.y * 1.0 + effectiveVerticalRise * 1.0 * 0.5
        ));
        
        // Layer 3: Small fast waves (scale 2.0)
        float noise3 = snoise(vec2(
          worldPos.x * 2.0 - horizontalDrift * 2.0 * 0.8,
          worldPos.y * 2.0 + effectiveVerticalRise * 2.0 * 0.8
        ));
        
        // Combine noise layers with different weights
        float noise = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
        
        // Calculate distortion vector with wind-dependent balance
        // Low wind: mostly vertical (0.2 horizontal, 0.8 vertical)
        // High wind: mostly horizontal (0.8 horizontal, 0.2 vertical)
        float horizontalMag = mix(0.2, 0.8, horizontalFactor);
        float verticalMag = mix(0.8, 0.2, horizontalFactor);
        vec2 distortion = vec2(noise * horizontalMag, noise * verticalMag);
        
        // Apply intensity (zoom-dependent and wind-dependent)
        // Strong wind reduces overall mirage intensity
        float windAttenuation = mix(1.0, 0.3, smoothstep(3.0, 10.0, absWindSpeed));
        distortion *= intensity * windAttenuation;
        
        // Scale distortion to pixel space
        vec2 distortedUV = uv + distortion * 0.01;
        
        // Sample texture with distorted UV coordinates
        vec4 color = texture2D(tDiffuse, distortedUV);
        
        gl_FragColor = color;
      }
    `;
    
    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        intensity: { value: 0 },
        horizontalDrift: { value: 0 },
        windSpeed: { value: 0 },
        worldOffset: { value: new THREE.Vector2(0, 0) },
        worldScale: { value: 1.0 }
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
    const dt = this.lastUpdateTime > 0 ? time - this.lastUpdateTime : 0;
    this.lastUpdateTime = time;
    
    // Calculate intensity based on FOV (smaller FOV = more zoom = more mirage)
    const baseFOV = 30; // Reference FOV (main camera)
    const zoomFactor = baseFOV / fov;
    
    // Exponential scaling for more pronounced effect at high zoom
    // At 1x zoom (FOV=30): intensity = 0.025
    // At 10x zoom (FOV=3): intensity = 0.25
    // At 100x zoom (FOV=0.3): intensity = 0.6 (clamped)
    const baseIntensity = 0.025;
    this.material.uniforms.intensity.value = Math.min(zoomFactor * baseIntensity, 0.6);
    
    // Use intersection point for world-space anchoring
    // This is where the scope's center ray hits the range box
    const worldOffsetX = intersection.x;
    const worldOffsetY = intersection.z; // Z is downrange, use as Y in 2D noise space
    this.material.uniforms.worldOffset.value.set(worldOffsetX, worldOffsetY);
    
    // Calculate world scale based on FOV and distance to intersection
    // Larger FOV = more world space visible = larger scale
    const worldScale = intersection.distance * Math.tan((fov * Math.PI / 180) / 2) * 2;
    this.material.uniforms.worldScale.value = worldScale;
    
    // Sample wind at fixed intervals along line of sight
    // Using fixed positions eliminates sampling noise
    const targetDistance = intersection.distance;
    const numSamples = 10; // Number of sample points
    
    let totalWindX = 0;
    let totalWeight = 0;
    
    for (let i = 0; i < numSamples; i++)
    {
      const t = (i + 1) / numSamples; // 0.1, 0.2, ..., 1.0
      const biasedT = Math.pow(t, 0.5); // bias toward target
      const sampleDistance = targetDistance * biasedT;
      
      // Calculate position at this distance along the line of sight
      const ratio = sampleDistance / targetDistance;
      const sampleX = intersection.x * ratio;
      const sampleY = intersection.y * ratio;
      const sampleZ = intersection.z * ratio;
        
      const wind = windGenerator.getWindAt(
        sampleX,
        sampleY,
        sampleZ,
        time
      );
      
      // Weight samples by distance (farther = more important)
      const weight = biasedT;
      totalWindX += wind.x * weight;
      totalWeight += weight;
    }
    
    // Compute weighted average crosswind
    this.currentWindX = totalWindX / totalWeight;
    
    // Integrate wind speed over time to get accumulated drift
    // Convert mph to yards/second: 1 mph = 1.467 yards/second
    const mphToYardsPerSec = 1.467;
    const driftThisFrame = this.currentWindX * mphToYardsPerSec * dt;
    this.accumulatedDrift += driftThisFrame;
    
    // Pass wind data to shader
    this.material.uniforms.horizontalDrift.value = this.accumulatedDrift;
    this.material.uniforms.windSpeed.value = Math.abs(this.currentWindX); // Shader uses absolute value for wind effects
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
    return this.currentWindX;
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

