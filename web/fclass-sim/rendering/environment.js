// environment.js - Environment rendering for FClass simulator

import * as THREE from 'three';
import ResourceManager from '../resources/manager.js';
import
{
  sampleWindAtThreeJsPosition
}
from '../core/btk.js';

export class EnvironmentRenderer
{
  // Default environment configuration
  static MOUNTAIN_COUNT = 16;
  static MOUNTAIN_HEIGHT_MIN = 50; // yards
  static MOUNTAIN_HEIGHT_MAX = 150; // yards
  static MOUNTAIN_DISTANCE_MIN = 1500; // yards
  static MOUNTAIN_DISTANCE_MAX = 2400; // yards

  static CLOUD_COUNT = 60;
  static CLOUD_HEIGHT_MIN = 80; // yards
  static CLOUD_HEIGHT_MAX = 330; // yards
  static CLOUD_FIELD_HALF_WIDTH = 850; // yards - half-width of the cloud field in X
  static CLOUD_FIELD_MARGIN = 700; // yards of cloud field beyond the targets
  static CLOUD_BASE_SIZE = 150; // yards - base billboard width (height = 0.6x)
  static CLOUD_SCALE_MIN = 0.85; // smallest cloud scale multiplier
  static CLOUD_SCALE_MAX = 2.0; // largest cloud scale multiplier
  static CLOUD_FADE_MARGIN = 220; // yards - clouds fade over this band at the field edges

  static TREE_SIDE_MIN_DISTANCE = 30; // yards from center
  static TREE_SIDE_MAX_DISTANCE = 110; // yards from center
  static TREE_BEHIND_TARGET_WIDTH = 80; // yards
  static TREE_BEHIND_TARGET_MIN = 10; // yards behind targets
  static TREE_BEHIND_TARGET_MAX = 130; // yards behind targets
  static TREE_COUNT_SIDES = 160;
  static TREE_COUNT_BEHIND = 80;

  static SHADOW_CAMERA_HORIZONTAL = 350; // yards
  static SHADOW_CAMERA_TOP = 100; // yards from shooter
  static SHADOW_CAMERA_NEAR = 100; // yards

  constructor(config)
  {
    // Required config
    this.scene = config.scene;
    this.renderer = config.renderer;
    this.rangeDistance = config.rangeDistance;
    this.rangeWidth = config.rangeWidth;
    this.rangeTotalWidth = config.rangeTotalWidth;
    this.groundExtension = config.groundExtension;

    // Environment configuration with defaults
    this.cfg = {
      mountainCount: config.mountainCount ?? EnvironmentRenderer.MOUNTAIN_COUNT,
      mountainHeightMin: config.mountainHeightMin ?? EnvironmentRenderer.MOUNTAIN_HEIGHT_MIN,
      mountainHeightMax: config.mountainHeightMax ?? EnvironmentRenderer.MOUNTAIN_HEIGHT_MAX,
      mountainDistanceMin: config.mountainDistanceMin ?? EnvironmentRenderer.MOUNTAIN_DISTANCE_MIN,
      mountainDistanceMax: config.mountainDistanceMax ?? EnvironmentRenderer.MOUNTAIN_DISTANCE_MAX,

      cloudCount: config.cloudCount ?? EnvironmentRenderer.CLOUD_COUNT,
      cloudHeightMin: config.cloudHeightMin ?? EnvironmentRenderer.CLOUD_HEIGHT_MIN,
      cloudHeightMax: config.cloudHeightMax ?? EnvironmentRenderer.CLOUD_HEIGHT_MAX,
      cloudFieldHalfWidth: config.cloudFieldHalfWidth ?? EnvironmentRenderer.CLOUD_FIELD_HALF_WIDTH,
      cloudFieldMargin: config.cloudFieldMargin ?? EnvironmentRenderer.CLOUD_FIELD_MARGIN,
      cloudBaseSize: config.cloudBaseSize ?? EnvironmentRenderer.CLOUD_BASE_SIZE,
      cloudScaleMin: config.cloudScaleMin ?? EnvironmentRenderer.CLOUD_SCALE_MIN,
      cloudScaleMax: config.cloudScaleMax ?? EnvironmentRenderer.CLOUD_SCALE_MAX,
      cloudFadeMargin: config.cloudFadeMargin ?? EnvironmentRenderer.CLOUD_FADE_MARGIN,

      treeSideMinDistance: config.treeSideMinDistance ?? EnvironmentRenderer.TREE_SIDE_MIN_DISTANCE,
      treeSideMaxDistance: config.treeSideMaxDistance ?? EnvironmentRenderer.TREE_SIDE_MAX_DISTANCE,
      treeBehindTargetWidth: config.treeBehindTargetWidth ?? EnvironmentRenderer.TREE_BEHIND_TARGET_WIDTH,
      treeBehindTargetMin: config.treeBehindTargetMin ?? EnvironmentRenderer.TREE_BEHIND_TARGET_MIN,
      treeBehindTargetMax: config.treeBehindTargetMax ?? EnvironmentRenderer.TREE_BEHIND_TARGET_MAX,
      treeCountSides: config.treeCountSides ?? EnvironmentRenderer.TREE_COUNT_SIDES,
      treeCountBehind: config.treeCountBehind ?? EnvironmentRenderer.TREE_COUNT_BEHIND,

      shadowCameraHorizontal: config.shadowCameraHorizontal ?? EnvironmentRenderer.SHADOW_CAMERA_HORIZONTAL,
      shadowCameraTop: config.shadowCameraTop ?? EnvironmentRenderer.SHADOW_CAMERA_TOP,
      shadowCameraNear: config.shadowCameraNear ?? EnvironmentRenderer.SHADOW_CAMERA_NEAR,
      shadowsEnabled: config.shadowsEnabled ?? true,
      shadowMapWidth: config.shadowMapWidth ?? 4096,
      shadowMapHeight: config.shadowMapHeight ?? 8192,
      shadowRadius: config.shadowRadius ?? 3
    };

    // Environment objects
    this.clouds = [];
    this.cloudMesh = null; // single instanced mesh of procedural clouds
    this.cloudGeometry = null; // shared billboard geometry
    this.cloudMaterial = null; // procedural cloud shader material
    this.cloudOpacityAttr = null; // per-instance edge-fade opacity
    this.mountainInstancedMesh = null;
    this.mountainData = [];
    this.treeTrunkInstances = [];
    this.treeFoliageInstances = [];
    this.rangeObjectInstances = [];
    this.ground = null;
    this.brownGround = null;
    this.sun = null;
    this.ambientLight = null;
    this.hemiLight = null;

    // Shared resources
    this.mountainTexture = null;
    this.cloudTextures = [];
    this.foliageTexture = null;
  }

  dispose()
  {
    // Remove instanced clouds
    if (this.cloudMesh)
    {
      this.scene.remove(this.cloudMesh);
      if (this.cloudMesh.customDepthMaterial) this.cloudMesh.customDepthMaterial.dispose();
    }
    if (this.cloudMaterial) this.cloudMaterial.dispose();
    if (this.cloudGeometry) this.cloudGeometry.dispose();

    if (this.mountainInstancedMesh)
    {
      this.scene.remove(this.mountainInstancedMesh);
      this.mountainInstancedMesh.geometry.dispose();
      this.mountainInstancedMesh.material.dispose();
    }

    // Remove tree instances
    for (const instance of this.treeTrunkInstances)
    {
      this.scene.remove(instance);
      instance.geometry.dispose();
      instance.material.dispose();
    }

    for (const instance of this.treeFoliageInstances)
    {
      this.scene.remove(instance);
      instance.geometry.dispose();
      instance.material.dispose();
    }

    // Remove range object instances
    for (const instance of this.rangeObjectInstances)
    {
      this.scene.remove(instance);
      instance.geometry.dispose();
      instance.material.dispose();
    }

    // Remove ground
    if (this.ground)
    {
      this.scene.remove(this.ground);
      this.ground.geometry.dispose();
      if (this.ground.material)
      {
        if (this.ground.material.map) this.ground.material.map.dispose();
        if (this.ground.material.normalMap) this.ground.material.normalMap.dispose();
        if (this.ground.material.roughnessMap) this.ground.material.roughnessMap.dispose();
        this.ground.material.dispose();
      }
    }

    if (this.brownGround)
    {
      this.scene.remove(this.brownGround);
      this.brownGround.geometry.dispose();
      if (this.brownGround.material)
      {
        if (this.brownGround.material.map) this.brownGround.material.map.dispose();
        if (this.brownGround.material.normalMap) this.brownGround.material.normalMap.dispose();
        if (this.brownGround.material.roughnessMap) this.brownGround.material.roughnessMap.dispose();
        this.brownGround.material.dispose();
      }
    }

    // Remove lighting
    if (this.sun)
    {
      this.scene.remove(this.sun);
      this.scene.remove(this.sun.target);
    }
    if (this.ambientLight)
    {
      this.scene.remove(this.ambientLight);
    }
    if (this.hemiLight)
    {
      this.scene.remove(this.hemiLight);
    }

    // Dispose shared textures
    if (this.mountainTexture)
    {
      this.mountainTexture.dispose();
    }
    for (const texture of this.cloudTextures)
    {
      texture.dispose();
    }
    if (this.foliageTexture)
    {
      this.foliageTexture.dispose();
    }

    // Clear arrays
    this.clouds = [];
    this.cloudMesh = null;
    this.cloudGeometry = null;
    this.cloudMaterial = null;
    this.cloudOpacityAttr = null;
    this.mountainData = [];
    this.cloudTextures = [];
    this.treeTrunkInstances = [];
    this.treeFoliageInstances = [];
    this.rangeObjectInstances = [];
    this.sun = null;
    this.ambientLight = null;
    this.hemiLight = null;
    this.mountainTexture = null;
    this.cloudTextures = [];
  }

  setupLighting()
  {
    // Bright ambient light for well-lit scene
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(this.ambientLight);

    // Hemisphere light for natural sky/ground lighting
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    this.scene.add(this.hemiLight);

    // Directional light (sun) for depth and shadows
    this.sun = new THREE.DirectionalLight(0xffffff, 2.0);
    this.sun.position.set(800, 300, 0); // 3-o'clock side lighting for flag direction readability
    this.sun.castShadow = this.cfg.shadowsEnabled;

    // Aim the light toward the middle of the range
    this.sun.target.position.set(0, 0, -this.rangeDistance);
    this.scene.add(this.sun.target);
    this.scene.add(this.sun);

    // Shadow map quality - optimized for long range (more resolution along length)
    this.sun.shadow.mapSize.width = this.cfg.shadowMapWidth; // Width (left-right across range)
    this.sun.shadow.mapSize.height = this.cfg.shadowMapHeight; // Height (downrange length)

    // Shadow camera bounds - cover only range area, not mountains
    this.sun.shadow.camera.left = -this.cfg.shadowCameraHorizontal;
    this.sun.shadow.camera.right = this.cfg.shadowCameraHorizontal;
    this.sun.shadow.camera.top = this.cfg.shadowCameraTop;
    this.sun.shadow.camera.bottom = -this.rangeDistance - this.groundExtension;
    this.sun.shadow.camera.near = this.cfg.shadowCameraNear;
    this.sun.shadow.camera.far = this.rangeDistance + this.groundExtension + 200;

    // Update shadow camera
    this.sun.shadow.camera.updateProjectionMatrix();

    // Shadow quality settings
    this.sun.shadow.bias = -0.0002; // Reduce shadow acne
    this.sun.shadow.normalBias = 0.02; // Reduce shadow acne on angled surfaces
    this.sun.shadow.radius = this.cfg.shadowRadius; // Shadow blur radius
  }

  createMountains()
  {
    // Create mountain peaks in the distance using instanced rendering
    this.mountainData = [];

    // Mountains must sit beyond the target line, never between the shooter and
    // the targets. At long ranges (notably the 1760 yd mile) the default band
    // (1500-2400 yd) straddles the target, so a peak could randomly spawn in
    // front of the frame and hide it on some restarts. Push the near edge back
    // far enough that even the widest peak's base clears the target line.
    const maxRadius = this.cfg.mountainHeightMax * 1.8;
    const distMin = Math.max(this.cfg.mountainDistanceMin, this.rangeDistance + maxRadius + 100);
    const distMax = Math.max(this.cfg.mountainDistanceMax, distMin + 300);

    for (let i = 0; i < this.cfg.mountainCount; i++)
    {
      const x = (Math.random() - 0.5) * 3000;
      const y = this.cfg.mountainHeightMin + Math.random() * (this.cfg.mountainHeightMax - this.cfg.mountainHeightMin);
      const z = -(distMin + Math.random() * (distMax - distMin));

      this.mountainData.push(
      {
        x: x,
        z: z,
        height: y,
        radius: y * 1.8 // Radius proportional to height
      });
    }

    // Create mountain texture (brown base with white snow cap)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Vertical gradient: brown at bottom, white at top
    const gradient = ctx.createLinearGradient(0, 256, 0, 0);
    gradient.addColorStop(0, '#6b5d4f'); // Brown base
    gradient.addColorStop(0.6, '#8b7d6b'); // Lighter brown
    gradient.addColorStop(0.8, '#c0c0c0'); // Gray
    gradient.addColorStop(1, '#ffffff'); // White snow cap

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    this.mountainTexture = new THREE.CanvasTexture(canvas);

    // Use average size for base geometry (we'll scale instances)
    const avgHeight = (this.cfg.mountainHeightMin + this.cfg.mountainHeightMax) / 2;
    const avgRadius = avgHeight * 1.8;
    const geometry = new THREE.ConeGeometry(avgRadius, avgHeight, 8);
    const material = new THREE.MeshLambertMaterial(
    {
      map: this.mountainTexture,
      side: THREE.FrontSide
    });

    this.mountainInstancedMesh = new THREE.InstancedMesh(geometry, material, this.cfg.mountainCount);
    this.mountainInstancedMesh.castShadow = this.cfg.shadowsEnabled;
    this.mountainInstancedMesh.receiveShadow = this.cfg.shadowsEnabled;

    // Set up instance transforms
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < this.mountainData.length; i++)
    {
      const data = this.mountainData[i];
      const scale = data.height / avgHeight; // Scale to actual height
      matrix.compose(
        new THREE.Vector3(data.x, data.height / 2 - 5, data.z),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale)
      );
      this.mountainInstancedMesh.setMatrixAt(i, matrix);
    }

    this.mountainInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.mountainInstancedMesh);
  }

  createClouds()
  {
    // Create clouds at various positions with varied shapes using instanced rendering
    this.clouds = [];

    this.cloudTextures = []; // procedural clouds use no canvas textures

    // Cloud field: a rectangle over the range that the clouds tile within.
    // Clouds drift with the wind and wrap inside this rectangle, so the sky
    // stays uniformly populated and nothing permanently blows out of view.
    const zNear = 200; // a little behind the shooter
    const zFar = -(this.rangeDistance + this.cfg.cloudFieldMargin); // beyond targets
    this.cloudField = {
      centerX: 0,
      halfWidth: this.cfg.cloudFieldHalfWidth,
      centerZ: (zNear + zFar) / 2,
      halfLength: (zNear - zFar) / 2
    };

    // Big puffy billboard. The shape is generated procedurally in the shader
    // from a per-instance seed, so every cloud is unique while still drawing in
    // a single instanced pass.
    const baseScale = this.cfg.cloudBaseSize;
    this.cloudGeometry = new THREE.PlaneGeometry(baseScale, baseScale * 0.6);

    const count = this.cfg.cloudCount;
    const seeds = new Float32Array(count);
    const opacities = new Float32Array(count);

    for (let i = 0; i < count; i++)
    {
      const x = this.cloudField.centerX + (Math.random() - 0.5) * 2 * this.cloudField.halfWidth;
      const z = this.cloudField.centerZ + (Math.random() - 0.5) * 2 * this.cloudField.halfLength;
      const y = this.cfg.cloudHeightMin + Math.random() * (this.cfg.cloudHeightMax - this.cfg.cloudHeightMin);

      const scale = this.cfg.cloudScaleMin + Math.random() * (this.cfg.cloudScaleMax - this.cfg.cloudScaleMin);
      const flip = Math.random() < 0.5 ? -1 : 1; // mirror half of them for variety
      const aspect = 0.8 + Math.random() * 0.4; // height variation

      seeds[i] = Math.random() * 1000.0; // unique procedural shape per cloud
      opacities[i] = EnvironmentRenderer.cloudEdgeOpacity(x, z, this.cloudField, this.cfg.cloudFadeMargin);

      this.clouds.push(
      {
        localId: i,
        randomnessFactor: 0.8 + Math.random() * 0.4,
        position: new THREE.Vector3(x, y, z),
        scale: new THREE.Vector3(scale * flip, scale * aspect, 1)
      });
    }

    this.cloudGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    this.cloudOpacityAttr = new THREE.InstancedBufferAttribute(opacities, 1);
    this.cloudOpacityAttr.setUsage(THREE.DynamicDrawUsage);
    this.cloudGeometry.setAttribute('aOpacity', this.cloudOpacityAttr);

    // Procedural puffy-white cloud, shared by the visible material and the
    // depth material so the cast shadow matches the silhouette.
    const noiseGLSL = `
      float cloudHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float cloudNoise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = cloudHash(i);
        float b = cloudHash(i + vec2(1.0, 0.0));
        float c = cloudHash(i + vec2(0.0, 1.0));
        float d = cloudHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float cloudFbm(vec2 p){
        float v = 0.0; float a = 0.5;
        for (int k = 0; k < 5; k++){ v += a * cloudNoise(p); p = p * 2.0 + 7.3; a *= 0.5; }
        return v;
      }
      // Puffy cloud coverage in [0,1] over uv in [0,1], unique per seed.
      float cloudAlpha(vec2 uv, float seed){
        vec2 so = vec2(seed * 13.7, seed * 7.1);
        float n = cloudFbm(uv * 4.5 + so);
        vec2 c = uv - 0.5;
        c.y *= 1.7; // clouds are wider than tall
        float radial = 1.0 - smoothstep(0.16, 0.5, length(c));
        float density = radial * (0.45 + n);
        return smoothstep(0.32, 0.66, density); // softer edges
      }
    `;

    // Note: position/uv/projectionMatrix/modelViewMatrix and (for InstancedMesh)
    // instanceMatrix are auto-declared by ShaderMaterial; only aSeed is custom.
    const cloudVertex = `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aSeed;
      attribute float aOpacity;
      varying vec2 vUv;
      varying float vSeed;
      varying float vOpacity;
      void main(){
        vUv = uv;
        vSeed = aSeed;
        vOpacity = aOpacity;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `;

    this.cloudMaterial = new THREE.ShaderMaterial(
    {
      uniforms: { uOpacity: { value: 0.82 } },
      vertexShader: cloudVertex,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        varying vec2 vUv;
        varying float vSeed;
        varying float vOpacity;
        uniform float uOpacity;
        ${noiseGLSL}
        void main(){
          #include <logdepthbuf_fragment>
          float a = cloudAlpha(vUv, vSeed);
          if (a <= 0.001) discard;
          // Soft white with subtle bright-range variation so it isn't a flat,
          // blown-out fill (stays light - no dark shading).
          float shade = cloudFbm(vUv * 3.0 + vec2(vSeed * 7.1, vSeed * 13.7));
          vec3 col = vec3(0.88 + 0.12 * shade);
          gl_FragColor = vec4(col, a * uOpacity * vOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.cloudMesh = new THREE.InstancedMesh(this.cloudGeometry, this.cloudMaterial, count);
    this.cloudMesh.castShadow = this.cfg.shadowsEnabled;
    this.cloudMesh.receiveShadow = false;
    // Clouds drift and wrap far from their initial bounds, so disable frustum
    // culling - otherwise the stale bounding volume makes whole batches pop out
    // of existence (the flicker / random disappearing).
    this.cloudMesh.frustumCulled = false;

    // Custom depth material so the cloud casts a shadow shaped like its silhouette
    this.cloudMesh.customDepthMaterial = new THREE.ShaderMaterial(
    {
      vertexShader: cloudVertex,
      fragmentShader: `
        #include <common>
        #include <packing>
        #include <logdepthbuf_pars_fragment>
        varying vec2 vUv;
        varying float vSeed;
        varying float vOpacity;
        ${noiseGLSL}
        void main(){
          #include <logdepthbuf_fragment>
          float a = cloudAlpha(vUv, vSeed) * vOpacity;
          if (a < 0.5) discard;
          gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
        }
      `
    });

    // Place instances
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let i = 0; i < count; i++)
    {
      matrix.compose(this.clouds[i].position, quaternion, this.clouds[i].scale);
      this.cloudMesh.setMatrixAt(i, matrix);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(this.cloudMesh);
  }

  createTrees()
  {
    // Create trees using instanced rendering: dense forest along both sides and behind targets
    const treeCount = this.cfg.treeCountSides + this.cfg.treeCountBehind;

    // Get bark textures from ResourceManager
    const barkColor = ResourceManager.textures.getTexture('bark_color');
    const barkNormal = ResourceManager.textures.getTexture('bark_normal');
    const barkRoughness = ResourceManager.textures.getTexture('bark_roughness');

    // Configure texture repeat
    [barkColor, barkNormal, barkRoughness].forEach(texture =>
    {
      if (texture)
      {
        texture.repeat.set(0.5, 2.0);
      }
    });

    const trunkMaterial = new THREE.MeshStandardMaterial(
    {
      map: barkColor,
      normalMap: barkNormal,
      roughnessMap: barkRoughness,
      color: 0x4a3728,
      roughness: 1.0,
      metalness: 0.0
    });

    const foliageMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x2d5016,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide
    });

    // Create 3 instanced meshes for each size variant (trunk and foliage)
    for (let sizeVariant = 0; sizeVariant < 3; sizeVariant++)
    {
      const trunkRadius = 0.2 + sizeVariant * 0.1;
      const trunkHeight = 3 + sizeVariant * 0.5;
      const trunkGeo = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.2, trunkHeight, 8);

      const foliageRadius = 2 + sizeVariant * 0.5;
      const foliageHeight = 5 + sizeVariant * 1;
      const foliageGeo = new THREE.ConeGeometry(foliageRadius, foliageHeight, 8);

      // Count trees of this size variant
      const treesOfSize = Math.ceil(treeCount / 3);

      const trunkInstance = new THREE.InstancedMesh(trunkGeo, trunkMaterial, treesOfSize);
      trunkInstance.castShadow = this.cfg.shadowsEnabled;
      trunkInstance.receiveShadow = this.cfg.shadowsEnabled;

      const foliageInstance = new THREE.InstancedMesh(foliageGeo, foliageMaterial, treesOfSize);
      foliageInstance.castShadow = this.cfg.shadowsEnabled;
      foliageInstance.receiveShadow = this.cfg.shadowsEnabled;

      this.treeTrunkInstances.push(trunkInstance);
      this.treeFoliageInstances.push(foliageInstance);

      this.scene.add(trunkInstance);
      this.scene.add(foliageInstance);
    }

    // Distribute trees across the 3 size variants
    const matrix = new THREE.Matrix4();
    const instanceCounts = [0, 0, 0];

    for (let i = 0; i < treeCount; i++)
    {
      let x, z;

      // Trees along both sides of the range
      if (i < this.cfg.treeCountSides)
      {
        const side = (i % 2 === 0) ? -1 : 1;
        x = side * (this.cfg.treeSideMinDistance + Math.random() * (this.cfg.treeSideMaxDistance - this.cfg.treeSideMinDistance));
        z = -50 - Math.random() * (this.rangeDistance + 200);
      }
      else
      {
        // Behind targets
        x = (Math.random() - 0.5) * this.cfg.treeBehindTargetWidth;
        z = -(this.rangeDistance + this.cfg.treeBehindTargetMin + Math.random() * (this.cfg.treeBehindTargetMax - this.cfg.treeBehindTargetMin));
      }

      // Assign to size variant
      const sizeVariant = i % 3;
      const instanceId = instanceCounts[sizeVariant]++;

      if (instanceId >= Math.ceil(treeCount / 3)) continue; // Skip if exceeded instance count

      const actualTrunkHeight = 3 + sizeVariant * 0.5;
      const actualFoliageHeight = 5 + sizeVariant * 1;

      // Trunk
      matrix.compose(
        new THREE.Vector3(x, actualTrunkHeight / 2, z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1)
      );
      this.treeTrunkInstances[sizeVariant].setMatrixAt(instanceId, matrix);

      // Foliage
      matrix.compose(
        new THREE.Vector3(x, actualTrunkHeight + actualFoliageHeight / 2 - actualFoliageHeight * 0.25, z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1)
      );
      this.treeFoliageInstances[sizeVariant].setMatrixAt(instanceId, matrix);
    }

    // Update instance matrices
    for (let i = 0; i < 3; i++)
    {
      this.treeTrunkInstances[i].instanceMatrix.needsUpdate = true;
      this.treeFoliageInstances[i].instanceMatrix.needsUpdate = true;
    }
  }

  createGround()
  {
    const rangeLength = this.rangeDistance;
    const groundLength = rangeLength + this.groundExtension;

    // Create brown ground (dirt) outside the range
    const brownGroundGeometry = new THREE.PlaneGeometry(this.rangeTotalWidth * 4, groundLength);

    // Get dirt textures from ResourceManager
    const dirtColor = ResourceManager.textures.getTexture('dirt_color');
    const dirtNormal = ResourceManager.textures.getTexture('dirt_normal');
    const dirtRoughness = ResourceManager.textures.getTexture('dirt_roughness');

    // Configure texture repeat
    [dirtColor, dirtNormal, dirtRoughness].forEach(texture =>
    {
      if (texture)
      {
        texture.repeat.set(this.rangeTotalWidth * 4 / 20, groundLength / 20);
      }
    });

    const brownGroundMaterial = new THREE.MeshStandardMaterial(
    {
      map: dirtColor,
      normalMap: dirtNormal,
      roughnessMap: dirtRoughness,
      color: 0x8b7355,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.FrontSide
    });
    this.brownGround = new THREE.Mesh(brownGroundGeometry, brownGroundMaterial);
    this.brownGround.rotation.x = -Math.PI / 2;
    this.brownGround.position.set(0, -0.1, -groundLength / 2);
    this.brownGround.receiveShadow = this.cfg.shadowsEnabled;
    this.scene.add(this.brownGround);

    // Add a range plane - just the shooting lanes with grass texture
    const groundSegments = 200;
    const groundGeometry = new THREE.PlaneGeometry(this.rangeWidth, rangeLength, groundSegments, groundSegments);

    // Add subtle rolling hills to the terrain
    const positions = groundGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
    {
      const x = positions.getX(i);
      const y = positions.getY(i);

      const freq1 = 0.05;
      const freq2 = 0.15;
      const freq3 = 0.30;

      const height1 = Math.sin(x * freq1) * Math.cos(y * freq1) * 0.4;
      const height2 = Math.sin(x * freq2 + 1.5) * Math.cos(y * freq2 + 2.3) * 0.25;
      const height3 = Math.sin(x * freq3 + 3.7) * Math.cos(y * freq3 + 4.2) * 0.15;

      const totalHeight = height1 + height2 + height3;
      positions.setZ(i, totalHeight);
    }

    groundGeometry.computeVertexNormals();

    // Get grass textures from ResourceManager
    const grassColor = ResourceManager.textures.getTexture('grass_color');
    const grassNormal = ResourceManager.textures.getTexture('grass_normal');
    const grassRoughness = ResourceManager.textures.getTexture('grass_roughness');

    // Configure texture repeat
    [grassColor, grassNormal, grassRoughness].forEach(texture =>
    {
      if (texture)
      {
        texture.repeat.set(this.rangeWidth / 10, rangeLength / 10);
      }
    });

    const groundMaterial = new THREE.MeshStandardMaterial(
    {
      map: grassColor,
      normalMap: grassNormal,
      roughnessMap: grassRoughness,
      color: 0x6b8e23,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.FrontSide
    });

    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, 0, -rangeLength / 2);
    this.ground.receiveShadow = this.cfg.shadowsEnabled;
    this.scene.add(this.ground);
  }

  updateClouds(deltaTime, windGenerator, currentTime)
  {
    // Update each cloud's position based on wind
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const field = this.cloudField;

    for (const cloud of this.clouds)
    {
      // Sample wind at cloud's position
      const wind = sampleWindAtThreeJsPosition(windGenerator, cloud.position.x, cloud.position.y, cloud.position.z);
      const velX_yds = wind.x * 0.4889;
      const velZ_yds = wind.z * 0.4889;

      // Move cloud
      cloud.position.x += velX_yds * deltaTime * cloud.randomnessFactor;
      cloud.position.z += velZ_yds * deltaTime * cloud.randomnessFactor;

      // Wrap within the cloud field so density stays uniform and clouds never
      // permanently leave the sky (a cloud exiting one edge re-enters the other).
      cloud.position.x = EnvironmentRenderer.wrapToField(cloud.position.x, field.centerX, field.halfWidth);
      cloud.position.z = EnvironmentRenderer.wrapToField(cloud.position.z, field.centerZ, field.halfLength);

      // Fade near the field edges so wrapping clouds ease out/in instead of popping
      this.cloudOpacityAttr.array[cloud.localId] = EnvironmentRenderer.cloudEdgeOpacity(
        cloud.position.x, cloud.position.z, field, this.cfg.cloudFadeMargin);

      // Update instance matrix
      matrix.compose(cloud.position, quaternion, cloud.scale);
      this.cloudMesh.setMatrixAt(cloud.localId, matrix);
    }

    this.cloudOpacityAttr.needsUpdate = true;

    this.cloudMesh.instanceMatrix.needsUpdate = true;
  }

  // Wrap a coordinate into [center - half, center + half] (toroidal field)
  static wrapToField(value, center, half)
  {
    const min = center - half;
    const span = 2 * half;
    let d = value - min;
    d = ((d % span) + span) % span;
    return d + min;
  }

  // Opacity [0,1] that fades to 0 within `margin` yards of the field edges, so
  // clouds ease out before wrapping and ease back in on the opposite side.
  static cloudEdgeOpacity(x, z, field, margin)
  {
    const dx = field.halfWidth - Math.abs(x - field.centerX);
    const dz = field.halfLength - Math.abs(z - field.centerZ);
    const ox = Math.min(1, Math.max(0, dx / margin));
    const oz = Math.min(1, Math.max(0, dz / margin));
    return ox * oz;
  }

  createRangeObjects()
  {
    // Add random objects scattered on the range for mirage reference using instanced rendering
    const rockColor = ResourceManager.textures.getTexture('rock_color');
    const rockNormal = ResourceManager.textures.getTexture('rock_normal');
    const rockRoughness = ResourceManager.textures.getTexture('rock_roughness');

    const rockMaterial = new THREE.MeshStandardMaterial(
    {
      map: rockColor,
      normalMap: rockNormal,
      roughnessMap: rockRoughness,
      roughness: 0.9,
      metalness: 0.1
    });

    const bushMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x3a5f0b,
      roughness: 1.0,
      metalness: 0.0
    });

    const postMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0xffa500,
      roughness: 0.7,
      metalness: 0.1
    });

    // Create geometry for each object type
    const rockSize = 0.4;
    const rockGeometry = new THREE.SphereGeometry(rockSize, 8, 6);
    rockGeometry.scale(1, 0.6, 1);

    const bushSize = 0.5;
    const bushGeometry = new THREE.SphereGeometry(bushSize, 6, 4);

    const postHeight = 1.25;
    const postRadius = 0.05;
    const postGeometry = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8);

    // Count objects by type
    const objectCount = 30 + Math.floor(Math.random() * 20);
    const rocks = [];
    const bushes = [];
    const posts = [];

    for (let i = 0; i < objectCount; i++)
    {
      const x = (Math.random() - 0.5) * this.rangeWidth * 0.8;
      const z = -Math.random() * this.rangeDistance * 0.95;
      const terrainHeight = this.getTerrainHeight(x, z);

      const objType = Math.random();

      if (objType < 0.6)
      {
        rocks.push(
        {
          x,
          y: terrainHeight + rockSize * 0.3,
          z
        });
      }
      else if (objType < 0.85)
      {
        bushes.push(
        {
          x,
          y: terrainHeight + bushSize * 0.5,
          z
        });
      }
      else
      {
        posts.push(
        {
          x,
          y: terrainHeight + postHeight / 2,
          z
        });
      }
    }

    // Create instanced meshes for each object type
    const matrix = new THREE.Matrix4();

    if (rocks.length > 0)
    {
      const rockInstance = new THREE.InstancedMesh(rockGeometry, rockMaterial, rocks.length);
      rockInstance.castShadow = this.cfg.shadowsEnabled;
      rockInstance.receiveShadow = this.cfg.shadowsEnabled;

      for (let i = 0; i < rocks.length; i++)
      {
        const rock = rocks[i];
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          Math.random() * Math.PI,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI
        ));
        matrix.compose(
          new THREE.Vector3(rock.x, rock.y, rock.z),
          rotation,
          new THREE.Vector3(1, 1, 1)
        );
        rockInstance.setMatrixAt(i, matrix);
      }

      rockInstance.instanceMatrix.needsUpdate = true;
      this.scene.add(rockInstance);
      this.rangeObjectInstances.push(rockInstance);
    }

    if (bushes.length > 0)
    {
      const bushInstance = new THREE.InstancedMesh(bushGeometry, bushMaterial, bushes.length);
      bushInstance.castShadow = this.cfg.shadowsEnabled;
      bushInstance.receiveShadow = this.cfg.shadowsEnabled;

      for (let i = 0; i < bushes.length; i++)
      {
        const bush = bushes[i];
        matrix.compose(
          new THREE.Vector3(bush.x, bush.y, bush.z),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 0.8, 1)
        );
        bushInstance.setMatrixAt(i, matrix);
      }

      bushInstance.instanceMatrix.needsUpdate = true;
      this.scene.add(bushInstance);
      this.rangeObjectInstances.push(bushInstance);
    }

    if (posts.length > 0)
    {
      const postInstance = new THREE.InstancedMesh(postGeometry, postMaterial, posts.length);
      postInstance.castShadow = this.cfg.shadowsEnabled;
      postInstance.receiveShadow = this.cfg.shadowsEnabled;

      for (let i = 0; i < posts.length; i++)
      {
        const post = posts[i];
        matrix.compose(
          new THREE.Vector3(post.x, post.y, post.z),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 1, 1)
        );
        postInstance.setMatrixAt(i, matrix);
      }

      postInstance.instanceMatrix.needsUpdate = true;
      this.scene.add(postInstance);
      this.rangeObjectInstances.push(postInstance);
    }
  }

  // Helper to get terrain height at a given x, z position
  getTerrainHeight(x, z)
  {
    const freq1 = 0.05;
    const freq2 = 0.15;
    const freq3 = 0.30;

    const height1 = Math.sin(x * freq1) * Math.cos(z * freq1) * 0.4;
    const height2 = Math.sin(x * freq2 + 1.5) * Math.cos(z * freq2 + 2.3) * 0.25;
    const height3 = Math.sin(x * freq3 + 3.7) * Math.cos(z * freq3 + 4.2) * 0.15;

    return height1 + height2 + height3;
  }

  createEnvironment()
  {
    this.setupLighting();
    this.createMountains();
    this.createClouds();
    this.createTrees();
    this.createGround();
    this.createRangeObjects();
  }

  getSun()
  {
    return this.sun;
  }
}