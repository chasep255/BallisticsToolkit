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
      uniform vec2 windVector;
      uniform float windSpeed;
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
        
        // Mirage is constantly boiling upward at a fixed rate
        // Wind only affects horizontal movement speed
        
        // Convert UV to world-space coordinates (anchored to landscape)
        vec2 worldPos = (uv - 0.5) * worldScale + worldOffset;
        
        // Vertical offset for upward boiling (constant speed in yards/sec)
        // Heat rises at approximately 2 yards/second
        float verticalRise = time * 2.0;
        
        // Horizontal offset from wind (1:1 with wind speed in mph)
        // Convert mph to yards/second: 1 mph = 1.467 yards/second
        float mphToYardsPerSec = 1.467;
        vec2 horizontalDrift = windVector * time * windSpeed * mphToYardsPerSec;
        
        // Create multiple octaves of noise for realistic heat shimmer
        // All layers move upward at constant rate, horizontally at wind speed
        // Use world position so mirage is anchored to landscape
        
        // Layer 1: Large slow waves (scale 0.5)
        float noise1 = snoise(vec2(
          worldPos.x * 0.5 - horizontalDrift.x * 0.5 * 0.3,
          worldPos.y * 0.5 + verticalRise * 0.5 * 0.3
        ));
        
        // Layer 2: Medium waves (scale 1.0)
        float noise2 = snoise(vec2(
          worldPos.x * 1.0 - horizontalDrift.x * 1.0 * 0.5,
          worldPos.y * 1.0 + verticalRise * 1.0 * 0.5
        ));
        
        // Layer 3: Small fast waves (scale 2.0)
        float noise3 = snoise(vec2(
          worldPos.x * 2.0 - horizontalDrift.x * 2.0 * 0.8,
          worldPos.y * 2.0 + verticalRise * 2.0 * 0.8
        ));
        
        // Combine noise layers with different weights
        float noise = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
        
        // Calculate distortion vector
        // The noise pattern itself creates the distortion
        vec2 distortion = vec2(noise * 0.2, noise * 0.8);
        
        // Apply intensity (zoom-dependent)
        distortion *= intensity;
        
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
        windVector: { value: new THREE.Vector2(0, 0) },
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
   * @param {number} yaw - Scope yaw offset in radians
   * @param {number} pitch - Scope pitch offset in radians
   */
  update(time, fov, windGenerator, intersection, yaw, pitch)
  {
    // Update time for animation
    this.material.uniforms.time.value = time;
    
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
    
    // Sample wind at multiple distances and compute weighted average
    // Heavily weighted toward where scope is pointing, but includes downrange wind
    const targetDistance = intersection.distance;
    
    // Sample points: 8 samples from 12.5% to 100%, weighted heavily toward target
    const sampleDistances = [
      { distance: targetDistance * 0.125, weight: 0.05 },
      { distance: targetDistance * 0.250, weight: 0.05 },
      { distance: targetDistance * 0.375, weight: 0.05 },
      { distance: targetDistance * 0.500, weight: 0.10 },
      { distance: targetDistance * 0.625, weight: 0.10 },
      { distance: targetDistance * 0.750, weight: 0.15 },
      { distance: targetDistance * 0.875, weight: 0.20 },
      { distance: targetDistance * 1.000, weight: 0.30 }  // Heavily weighted to target
    ];
    
    let totalWindX = 0;
    let totalWindZ = 0;
    let totalWeight = 0;
    
    for (const sample of sampleDistances)
    {
      // Calculate position at this distance along the line of sight
      const ratio = sample.distance / targetDistance;
      const sampleX = intersection.x * ratio;
      const sampleY = intersection.y * ratio;
      const sampleZ = intersection.z * ratio;
      
      const wind = windGenerator.getWindAt(sampleX, sampleY, sampleZ, time);
      totalWindX += wind.x * sample.weight;
      totalWindZ += wind.z * sample.weight;
      totalWeight += sample.weight;
    }
    
    // Compute weighted average wind
    const avgWindX = totalWindX / totalWeight;
    const avgWindZ = totalWindZ / totalWeight;
    const windSpeedMph = Math.sqrt(avgWindX * avgWindX + avgWindZ * avgWindZ);
    
    // Normalize wind direction (X is left-right, Z is downrange)
    const windLength = Math.sqrt(avgWindX * avgWindX + avgWindZ * avgWindZ);
    let windDir = new THREE.Vector2(0, 0);
    if (windLength > 0.01)
    {
      windDir = new THREE.Vector2(avgWindX / windLength, avgWindZ / windLength);
    }
    
    this.material.uniforms.windVector.value = windDir;
    
    // Wind speed should move mirage at 1:1 ratio
    // windSpeedMph is already in mph, just pass it through
    this.material.uniforms.windSpeed.value = windSpeedMph;
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

