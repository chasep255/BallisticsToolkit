// Import Three.js
import * as THREE from 'three';

export class SmokeSimulation
{
  constructor(btk, scene, windGenerator, bounds, maxParticles = 10000)
  {
    this.btk = btk;
    this.scene = scene;
    this.windGenerator = windGenerator;
    this.enabled = false;
    this.maxParticles = maxParticles;
    this.bounds = bounds; // { minX_m, maxX_m, minY_m, maxY_m }
    this.currentTime = 0.0;

    // Constants
    this.MAX_AGE = 20.0; // seconds
    this.BASE_SIZE = 0.5; // base particle size
    this.METERS_TO_YARDS = 1.09361;

    // Create particle array
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++)
    {
      this.particles.push(
      {
        position:
        {
          x: 0,
          y: 0,
          z: 0
        },
        velocity:
        {
          x: 0,
          y: 0,
          z: 0
        },
        birthTime: Math.random() * this.MAX_AGE, // Random initial age
        active: false
      });
    }

    // Initialize particles with random positions
    for (let i = 0; i < this.maxParticles; i++)
    {
      this.resetParticle(this.particles[i]);
    }

    this.createParticleSystem();
  }

  resetParticle(particle)
  {
    // Spawn at random position within bounds
    particle.position.x = this.bounds.minX_m + Math.random() * (this.bounds.maxX_m - this.bounds.minX_m);
    particle.position.y = this.bounds.minY_m + Math.random() * (this.bounds.maxY_m - this.bounds.minY_m);
    particle.position.z = 0.0;
    particle.velocity.x = 0.0;
    particle.velocity.y = 0.0;
    particle.velocity.z = 0.0;
    particle.birthTime = Math.random() * this.MAX_AGE; // Random age for staggered appearance
    particle.active = true;
  }

  createParticleSystem()
  {
    // Create Three.js geometry for particles
    this.geometry = new THREE.BufferGeometry();

    // Attributes for particle positions, colors, and sizes
    const positions = new Float32Array(this.maxParticles * 3);
    const colors = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);
    const alphas = new Float32Array(this.maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    // Create shader material for particles
    this.material = new THREE.ShaderMaterial(
    {
      uniforms:
      {
        pointTexture:
        {
          value: this.createParticleTexture()
        }
      },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        varying vec3 vColor;
        
        void main() {
          vAlpha = alpha;
          vColor = color;
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 10.0; // Larger particles for better visibility
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying float vAlpha;
        varying vec3 vColor;
        
        void main() {
          vec4 texColor = texture2D(pointTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor, vAlpha * texColor.a);
        }
      `,
      blending: THREE.AdditiveBlending, // Additive blending for glowing effect
      depthTest: true,
      transparent: true,
      vertexColors: true
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.visible = true;
    this.points.frustumCulled = false; // Disable frustum culling for debugging
    this.scene.add(this.points);
  }

  createParticleTexture()
  {
    // Create a soft circular gradient texture for particles
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;

    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  setEnabled(enabled)
  {
    this.enabled = enabled;
    if (this.points)
    {
      this.points.visible = enabled;
    }
  }

  advanceTime(currentTime)
  {
    if (!this.enabled) return;

    // Calculate dt
    const dt = currentTime - this.currentTime;
    this.currentTime = currentTime;

    // Update particle physics
    this.updatePhysics(dt);

    // Update GPU buffers with particle data
    this.updateParticles();
  }

  updatePhysics(dt)
  {
    // Update each particle
    for (let i = 0; i < this.maxParticles; i++)
    {
      const particle = this.particles[i];

      if (!particle.active) continue;

      // Particle position is stored in a 2D ground plane (meters):
      // particle.position.x = downrange distance (0 → maxX_m)
      // particle.position.y = crossrange position (minY_m → maxY_m, left to right)
      // Embed into world / BTK coordinates:
      // World: X = crossrange-right, Y = up, Z = towards camera (negative Z = downrange)
      const downrange_m = particle.position.x;
      const crossrange_m = particle.position.y;
      const worldX_m = crossrange_m;
      const worldY_m = 0.0;
      const worldZ_m = -downrange_m;

      // Sample wind at this world position
      const wind = this.windGenerator.sample(
        worldX_m,
        worldY_m,
        worldZ_m
      );

      // Convert world wind vector into (downrange, crossrange) components in the simulation plane
      // Downrange component is along -Z (toward target), crossrange along +X (right)
      particle.velocity.x = -wind.z; // downrange velocity
      particle.velocity.y = wind.x;  // crossrange velocity
      particle.velocity.z = 0.0;

      // Clean up WASM object
      wind.delete();

      // Update position
      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      particle.position.z += particle.velocity.z * dt;

      // Update age
      particle.birthTime += dt;

      // Check if particle is too old or out of bounds
      if (particle.birthTime >= this.MAX_AGE ||
        particle.position.x < this.bounds.minX_m ||
        particle.position.x > this.bounds.maxX_m ||
        particle.position.y < this.bounds.minY_m ||
        particle.position.y > this.bounds.maxY_m)
      {
        // Respawn particle
        this.resetParticle(particle);
      }
    }
  }

  updateParticles()
  {
    // Get Three.js arrays
    const positions = this.geometry.attributes.position.array;
    const colors = this.geometry.attributes.color.array;
    const sizes = this.geometry.attributes.size.array;
    const alphas = this.geometry.attributes.alpha.array;

    // Process each particle
    for (let i = 0; i < this.maxParticles; i++)
    {
      const particle = this.particles[i];

      if (particle.active)
      {
        // Convert simulation-plane meters to yards for display:
        // particle.position.x = downrange (meters), particle.position.y = crossrange-right (meters)
        // Display: X increases downrange (right), Y increases downward; negate crossrange for screen Y
        positions[i * 3] = particle.position.x * this.METERS_TO_YARDS; // X: downrange
        positions[i * 3 + 1] = -particle.position.y * this.METERS_TO_YARDS; // Y: screen-space crossrange
        positions[i * 3 + 2] = particle.position.z; // Z: unchanged

        // Calculate color based on speed (m/s)
        const speed = Math.sqrt(particle.velocity.x * particle.velocity.x + particle.velocity.y * particle.velocity.y);
        const normalizedSpeed = Math.min(speed / 6.7056, 1.0); // 15 mph = 6.7056 m/s

        colors[i * 3] = 0.6 + normalizedSpeed * 0.4; // R
        colors[i * 3 + 1] = 0.6 + (1.0 - normalizedSpeed) * 0.4; // G
        colors[i * 3 + 2] = 0.9; // B

        // Calculate size and opacity based on age
        const age = particle.birthTime;
        const lifeRatio = age / this.MAX_AGE;
        const size = this.BASE_SIZE * (1.0 + lifeRatio * 0.5);
        const opacity = 1.0 - lifeRatio;

        sizes[i] = size * 2.0; // Scale for rendering
        alphas[i] = opacity * 0.9; // Use calculated opacity
      }
      else
      {
        // Hide inactive particles
        positions[i * 3] = 0.0;
        positions[i * 3 + 1] = 0.0;
        positions[i * 3 + 2] = -1000.0; // Move far away
        alphas[i] = 0.0;
        sizes[i] = 0.0;
        colors[i * 3] = 0.0;
        colors[i * 3 + 1] = 0.0;
        colors[i * 3 + 2] = 0.0;
      }
    }

    // Mark attributes as needing update
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  dispose()
  {
    if (this.points)
    {
      this.scene.remove(this.points);
      if (this.geometry) this.geometry.dispose();
      if (this.material) this.material.dispose();
      this.points = null;
    }

    // Clear particles
    this.particles = [];
  }
}