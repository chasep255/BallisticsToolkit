// environment-system.js - Environment system for FClass simulator

import * as THREE from 'three';

export class EnvironmentSystem
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
  static CLOUD_SPAWN_RANGE = 2000; // yards

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
      mountainCount: config.mountainCount ?? EnvironmentSystem.MOUNTAIN_COUNT,
      mountainHeightMin: config.mountainHeightMin ?? EnvironmentSystem.MOUNTAIN_HEIGHT_MIN,
      mountainHeightMax: config.mountainHeightMax ?? EnvironmentSystem.MOUNTAIN_HEIGHT_MAX,
      mountainDistanceMin: config.mountainDistanceMin ?? EnvironmentSystem.MOUNTAIN_DISTANCE_MIN,
      mountainDistanceMax: config.mountainDistanceMax ?? EnvironmentSystem.MOUNTAIN_DISTANCE_MAX,
      
      cloudCount: config.cloudCount ?? EnvironmentSystem.CLOUD_COUNT,
      cloudHeightMin: config.cloudHeightMin ?? EnvironmentSystem.CLOUD_HEIGHT_MIN,
      cloudHeightMax: config.cloudHeightMax ?? EnvironmentSystem.CLOUD_HEIGHT_MAX,
      cloudSpawnRange: config.cloudSpawnRange ?? EnvironmentSystem.CLOUD_SPAWN_RANGE,
      
      treeSideMinDistance: config.treeSideMinDistance ?? EnvironmentSystem.TREE_SIDE_MIN_DISTANCE,
      treeSideMaxDistance: config.treeSideMaxDistance ?? EnvironmentSystem.TREE_SIDE_MAX_DISTANCE,
      treeBehindTargetWidth: config.treeBehindTargetWidth ?? EnvironmentSystem.TREE_BEHIND_TARGET_WIDTH,
      treeBehindTargetMin: config.treeBehindTargetMin ?? EnvironmentSystem.TREE_BEHIND_TARGET_MIN,
      treeBehindTargetMax: config.treeBehindTargetMax ?? EnvironmentSystem.TREE_BEHIND_TARGET_MAX,
      treeCountSides: config.treeCountSides ?? EnvironmentSystem.TREE_COUNT_SIDES,
      treeCountBehind: config.treeCountBehind ?? EnvironmentSystem.TREE_COUNT_BEHIND,
      
      shadowCameraHorizontal: config.shadowCameraHorizontal ?? EnvironmentSystem.SHADOW_CAMERA_HORIZONTAL,
      shadowCameraTop: config.shadowCameraTop ?? EnvironmentSystem.SHADOW_CAMERA_TOP,
      shadowCameraNear: config.shadowCameraNear ?? EnvironmentSystem.SHADOW_CAMERA_NEAR
    };
    
    // Environment objects
    this.clouds = [];
    this.mountains = [];
    this.trees = [];
    this.ground = null;
    this.brownGround = null;
    this.sun = null;
    this.ambientLight = null;
    this.hemiLight = null;
    
    // Shared resources
    this.mountainTexture = null;
    this.cloudTextures = [];
    this.grassTextures = [];
    this.dirtTextures = [];
    this.barkTextures = [];
    this.foliageTexture = null;
    this.rangeObjects = [];
  }

  dispose()
  {
    // Remove clouds
    for (const cloud of this.clouds)
    {
      this.scene.remove(cloud.mesh);
      cloud.mesh.geometry.dispose();
      cloud.mesh.material.dispose();
    }
    
    // Remove mountains
    for (const mountain of this.mountains)
    {
      this.scene.remove(mountain);
      mountain.geometry.dispose();
      mountain.material.dispose();
    }
    
    // Remove trees
    for (const tree of this.trees)
    {
      this.scene.remove(tree);
      tree.geometry.dispose();
      if (tree.material)
      {
        if (tree.material.map) tree.material.map.dispose();
        if (tree.material.normalMap) tree.material.normalMap.dispose();
        if (tree.material.roughnessMap) tree.material.roughnessMap.dispose();
        tree.material.dispose();
      }
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
    
    // Remove range objects
    for (const obj of this.rangeObjects)
    {
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
    this.rangeObjects = [];
    
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
    for (const texture of this.grassTextures)
    {
      texture.dispose();
    }
    for (const texture of this.dirtTextures)
    {
      texture.dispose();
    }
    for (const texture of this.barkTextures)
    {
      texture.dispose();
    }
    if (this.foliageTexture)
    {
      this.foliageTexture.dispose();
    }
    
    // Clear arrays
    this.clouds = [];
    this.mountains = [];
    this.trees = [];
    this.cloudTextures = [];
    this.grassTextures = [];
    this.dirtTextures = [];
    this.barkTextures = [];
    
    this.clouds = [];
    this.sun = null;
    this.ambientLight = null;
    this.hemiLight = null;
    this.mountainTexture = null;
    this.cloudTextures = [];
    this.treeTrunkTexture = null;
    this.treeCrownTexture = null;
    this.treeTrunkGeometry = null;
    this.treeCrownGeometry = null;
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
    this.sun.position.set(300, 600, 0); // Higher above and in front of shooter for cloud shadows on range
    this.sun.castShadow = true;

    // Aim the light toward the middle of the range
    this.sun.target.position.set(0, 0, -this.rangeDistance);
    this.scene.add(this.sun.target);
    this.scene.add(this.sun);

    // Shadow map quality - optimized for long range (more resolution along length)
    this.sun.shadow.mapSize.width = 4096;  // Width (left-right across range)
    this.sun.shadow.mapSize.height = 8192; // Height (downrange length)

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
    this.sun.shadow.radius = 3; // Softer shadows with moderate blur
    // Renderer shadow settings are handled by main simulator
  }

  createMountains()
  {
    // Create mountain peaks in the distance
    const mountainData = [];
    
    
    for (let i = 0; i < this.cfg.mountainCount; i++)
    {
      const x = (Math.random() - 0.5) * 3000;
      const y = this.cfg.mountainHeightMin + Math.random() * (this.cfg.mountainHeightMax - this.cfg.mountainHeightMin);
      const z = -(this.cfg.mountainDistanceMin + Math.random() * (this.cfg.mountainDistanceMax - this.cfg.mountainDistanceMin));
      
      mountainData.push({
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

    // Create mountains
    for (const data of mountainData)
    {
      const geometry = new THREE.ConeGeometry(data.radius, data.height, 8);
      const material = new THREE.MeshLambertMaterial({
        map: this.mountainTexture,
        side: THREE.FrontSide
      });
      
      const mountain = new THREE.Mesh(geometry, material);
      // Position slightly below ground to ensure no gap (cone center is at geometric center)
      mountain.position.set(data.x, data.height / 2 - 5, data.z);
      mountain.castShadow = true;
      mountain.receiveShadow = true;
      
      this.scene.add(mountain);
      this.mountains.push(mountain);
    }
  }

  createClouds()
  {
    // Create clouds at various positions with varied shapes
    this.clouds = [];


    for (let i = 0; i < this.cfg.cloudCount; i++)
    {
      // Create fluffy cloud texture with varied shapes
      const canvas = document.createElement('canvas');
      canvas.width = 512; // Higher resolution for smoother edges
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      // Draw fluffy cloud shape with multiple overlapping circles
      ctx.clearRect(0, 0, 512, 256);

      // Randomize cloud shape by varying circle positions and sizes
      const numCircles = 5 + Math.floor(Math.random() * 4); // 5-8 circles per cloud
      const cloudCircles = [];

      // Create overlapping circles across the canvas width
      for (let j = 0; j < numCircles; j++)
      {
        const t = j / (numCircles - 1); // 0 to 1
        cloudCircles.push({
          x: 100 + t * 312 + (Math.random() - 0.5) * 60, // Spread across canvas
          y: 128 + (Math.random() - 0.5) * 80, // Vertical variation
          r: 40 + Math.random() * 40 // Larger, more varied circles
        });
      }

      // Draw with soft gradients to eliminate hard edges
      cloudCircles.forEach(circle => {
        const gradient = ctx.createRadialGradient(circle.x, circle.y, 0, circle.x, circle.y, circle.r);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.7)');
        gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); // Fade to transparent

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
        ctx.fill();
      });

      const cloudTexture = new THREE.CanvasTexture(canvas);
      this.cloudTextures.push(cloudTexture);

      // Use MeshStandardMaterial for lighting interaction
      const cloudMaterial = new THREE.MeshStandardMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.85,
        alphaTest: 0.01, // Discard fully transparent pixels
        depthWrite: false, // Prevent z-fighting between clouds
        side: THREE.DoubleSide, // Visible from both sides
        roughness: 1.0, // Fully diffuse
        metalness: 0.0, // Not metallic
        emissive: new THREE.Color(0.95, 0.95, 0.95), // Slight self-illumination
        emissiveIntensity: 0.3 // Subtle glow so clouds aren't too dark
      });

      // Use a plane geometry instead of sprite for lighting interaction
      const baseScale = 60 + Math.random() * 60; // CLOUD_BASE_SCALE_MIN + random * (CLOUD_BASE_SCALE_MAX - CLOUD_BASE_SCALE_MIN)
      const cloudGeometry = new THREE.PlaneGeometry(baseScale, baseScale / 2);
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);

      // Enable shadow casting for clouds
      cloud.castShadow = true;
      cloud.receiveShadow = false; // Clouds don't receive shadows from other clouds

      // Position clouds at varying heights over the range (matching original exactly)
      const x = (Math.random() - 0.5) * 600; // CLOUD_HORIZONTAL_SPREAD
      const y = this.cfg.cloudHeightMin + Math.random() * (this.cfg.cloudHeightMax - this.cfg.cloudHeightMin);
      const z = 200 - Math.random() * (this.rangeDistance + 500 + 200); // CLOUD_BEHIND_SHOOTER - random * (distance + CLOUD_BEYOND_TARGETS + CLOUD_BEHIND_SHOOTER)

      cloud.position.set(x, y, z);

      // Scale with distance for perspective (matching original)
      const distanceFactor = Math.abs(z) / 500;
      const scale = 0.5 + distanceFactor * 0.5;
      cloud.scale.set(scale, scale, 1);

      // Store randomness factor for wind variation (each cloud drifts slightly differently)
      const randomnessFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2x wind speed

      this.clouds.push({
        mesh: cloud,
        randomnessFactor: randomnessFactor,
        initialY: y,
        initialZ: z,
        baseScale: baseScale
      });

      this.scene.add(cloud);
    }
  }

  createTrees()
  {
    // Create trees: dense forest along both sides and behind targets
    const treeCount = this.cfg.treeCountSides + this.cfg.treeCountBehind;

    // Load bark textures for tree trunks
    const barkLoader = new THREE.TextureLoader();
    const barkColor = barkLoader.load('textures/bark/Bark012_1K-JPG_Color.jpg');
    const barkNormal = barkLoader.load('textures/bark/Bark012_1K-JPG_NormalGL.jpg');
    const barkRoughness = barkLoader.load('textures/bark/Bark012_1K-JPG_Roughness.jpg');
    
    // Configure texture wrapping and repeat
    [barkColor, barkNormal, barkRoughness].forEach(texture => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(0.5, 2.0); // Vertical bark pattern
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    });
    this.barkTextures.push(barkColor, barkNormal, barkRoughness);
    
    const trunkMaterial = new THREE.MeshStandardMaterial({
      map: barkColor,
      normalMap: barkNormal,
      roughnessMap: barkRoughness,
      color: 0x4a3728, // Darker brown tint
      roughness: 1.0,
      metalness: 0.0
    });

    // Foliage material - darker green with some variation
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5016, // Dark green
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide
    });

    // Cache tree geometries - multiple sizes
    const trunkGeometries = [];
    const foliageGeometries = [];

    for (let i = 0; i < 3; i++)
    {
      const trunkRadius = 0.2 + i * 0.1;
      const trunkHeight = 3 + i * 0.5;
      const trunkGeo = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.2, trunkHeight, 8);
      trunkGeometries.push(trunkGeo);

      const foliageRadius = 2 + i * 0.5;
      const foliageHeight = 5 + i * 1;
      const foliageGeo = new THREE.ConeGeometry(foliageRadius, foliageHeight, 8);
      foliageGeometries.push(foliageGeo);
    }

    // Create trees
    for (let i = 0; i < treeCount; i++)
    {
      let x, z;

      // Trees along both sides of the range
      if (i < this.cfg.treeCountSides)
      {
        // Dense trees along both sides
        const side = (i % 2 === 0) ? -1 : 1;
        x = side * (this.cfg.treeSideMinDistance + Math.random() * (this.cfg.treeSideMaxDistance - this.cfg.treeSideMinDistance));
        z = -50 - Math.random() * (this.rangeDistance + 200);
      }
      else
      {
        // Behind targets - dense backdrop
        x = (Math.random() - 0.5) * this.cfg.treeBehindTargetWidth;
        z = -(this.rangeDistance + this.cfg.treeBehindTargetMin + Math.random() * (this.cfg.treeBehindTargetMax - this.cfg.treeBehindTargetMin));
      }

      // Vary tree size
      const sizeVariant = Math.floor(Math.random() * 3);
      const trunkGeo = trunkGeometries[sizeVariant];
      const foliageGeo = foliageGeometries[sizeVariant];

      const height = 8 + Math.random() * 7; // 8-15 yards total tree height
      const actualTrunkHeight = 3 + sizeVariant * 0.5;
      const actualFoliageHeight = 5 + sizeVariant * 1;

      // Create trunk - positioned so bottom is at ground (Y=0)
      const trunk = new THREE.Mesh(trunkGeo, trunkMaterial);
      trunk.position.set(x, actualTrunkHeight / 2, z);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      this.scene.add(trunk);
      this.trees.push(trunk);

      // Create foliage - positioned so base overlaps with top of trunk
      const foliage = new THREE.Mesh(foliageGeo, foliageMaterial);
      foliage.position.set(x, actualTrunkHeight + actualFoliageHeight / 2 - actualFoliageHeight * 0.25, z);
      foliage.castShadow = true;
      foliage.receiveShadow = true;
      this.scene.add(foliage);
      this.trees.push(foliage);
    }
  }

  createGround()
  {
    const rangeLength = this.rangeDistance; // yards
    const groundLength = rangeLength + this.groundExtension;
    
    // Create brown ground (dirt) outside the range
    const brownGroundGeometry = new THREE.PlaneGeometry(this.rangeTotalWidth * 4, groundLength);
    
    // Load dirt textures for brown ground
    const dirtLoader = new THREE.TextureLoader();
    const dirtColor = dirtLoader.load('textures/dirt/Ground082S_1K-JPG_Color.jpg');
    const dirtNormal = dirtLoader.load('textures/dirt/Ground082S_1K-JPG_NormalGL.jpg');
    const dirtRoughness = dirtLoader.load('textures/dirt/Ground082S_1K-JPG_Roughness.jpg');
    
    // Configure texture wrapping and repeat
    [dirtColor, dirtNormal, dirtRoughness].forEach(texture => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(this.rangeTotalWidth * 4 / 20, groundLength / 20); // Repeat every 20 yards
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    });
    this.dirtTextures.push(dirtColor, dirtNormal, dirtRoughness);
    
    const brownGroundMaterial = new THREE.MeshStandardMaterial({
      map: dirtColor,
      normalMap: dirtNormal,
      roughnessMap: dirtRoughness,
      color: 0x8b7355, // Darker brown tint
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.FrontSide // Single-sided to avoid shadow acne
    });
    this.brownGround = new THREE.Mesh(brownGroundGeometry, brownGroundMaterial);
    this.brownGround.rotation.x = -Math.PI / 2; // Rotate to lie in XZ plane (horizontal)
    this.brownGround.position.set(0, -0.1, -groundLength / 2); // Center downrange (negative Z), slightly below ground
    this.brownGround.receiveShadow = true; // Enable shadow receiving on ground
    this.scene.add(this.brownGround);

    // Add a range plane - just the shooting lanes with grass texture
    // Use higher segments for terrain variation
    const groundSegments = 200; // High resolution for smooth rolling hills
    const groundGeometry = new THREE.PlaneGeometry(this.rangeWidth, rangeLength, groundSegments, groundSegments);
    
    // Add subtle rolling hills to the terrain (< 1 yard variation)
    const positions = groundGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
    {
      const x = positions.getX(i);
      const y = positions.getY(i);
      
      // Multiple octaves of noise for natural-looking terrain
      // Use Perlin-like noise with sine waves
      const freq1 = 0.05; // Large rolling hills
      const freq2 = 0.15; // Medium undulations
      const freq3 = 0.30; // Small bumps
      
      const height1 = Math.sin(x * freq1) * Math.cos(y * freq1) * 0.4;
      const height2 = Math.sin(x * freq2 + 1.5) * Math.cos(y * freq2 + 2.3) * 0.25;
      const height3 = Math.sin(x * freq3 + 3.7) * Math.cos(y * freq3 + 4.2) * 0.15;
      
      // Combine heights (total variation < 0.8 yards)
      const totalHeight = height1 + height2 + height3;
      
      // Set Z coordinate (height) - positions are in X,Y plane before rotation
      positions.setZ(i, totalHeight);
    }
    
    // Recompute normals for proper lighting on the terrain
    groundGeometry.computeVertexNormals();
    
    // Load grass textures
    const grassLoader = new THREE.TextureLoader();
    const grassColor = grassLoader.load('textures/grass/Grass004_1K-JPG_Color.jpg');
    const grassNormal = grassLoader.load('textures/grass/Grass004_1K-JPG_NormalGL.jpg');
    const grassRoughness = grassLoader.load('textures/grass/Grass004_1K-JPG_Roughness.jpg');
    
    // Configure texture wrapping and repeat
    [grassColor, grassNormal, grassRoughness].forEach(texture => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(this.rangeWidth / 10, rangeLength / 10); // Repeat every 10 yards
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    });
    this.grassTextures.push(grassColor, grassNormal, grassRoughness);

    // Create grass material with PBR textures
    const groundMaterial = new THREE.MeshStandardMaterial({
      map: grassColor,
      normalMap: grassNormal,
      roughnessMap: grassRoughness,
      color: 0x6b8e23, // Darker green tint
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.FrontSide // Single-sided to avoid shadow acne
    });

    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2; // Rotate to lie in XZ plane (horizontal)
    this.ground.position.set(0, 0, -rangeLength / 2); // Center downrange (negative Z)
    this.ground.receiveShadow = true; // Enable shadow receiving on grass
    this.scene.add(this.ground);
  }

  updateClouds(deltaTime, windGenerator, currentTime)
  {
    // Move clouds with wind
    for (const cloud of this.clouds)
    {
      // Get wind at cloud position using the wrapper (returns mph in Three.js coords)
      const windVector = windGenerator.getWindAt(cloud.mesh.position.x, cloud.mesh.position.y, cloud.mesh.position.z, currentTime);
      
      // Wind crosswind component (x in Three.js coords, in mph)
      // Convert mph to yards/s: mph * (1760 yards/mile) / (3600 s/hour) = mph * 0.4889
      const windX = windVector.x * 0.4889; // mph to yards/s
      const windZ = windVector.z * 0.4889; // mph to yards/s
      
      // Move cloud with wind (scaled for visible movement)
      cloud.mesh.position.x += windX * deltaTime * cloud.randomnessFactor;
      cloud.mesh.position.z += windZ * deltaTime * cloud.randomnessFactor;
      
      // Respawn clouds that have moved too far
      const distanceFromCenter = Math.sqrt(cloud.mesh.position.x * cloud.mesh.position.x + cloud.mesh.position.z * cloud.mesh.position.z);
      if (distanceFromCenter > this.cfg.cloudSpawnRange * 1.5)
      {
        // Respawn at random position on the opposite side
        const angle = Math.random() * Math.PI * 2;
        const spawnDistance = this.cfg.cloudSpawnRange * 0.8;
        cloud.mesh.position.x = Math.cos(angle) * spawnDistance;
        cloud.mesh.position.z = Math.sin(angle) * spawnDistance;
        cloud.mesh.position.y = this.cfg.cloudHeightMin + Math.random() * (this.cfg.cloudHeightMax - this.cfg.cloudHeightMin);
      }
    }
  }

  createRangeObjects()
  {
    // Add random objects scattered on the range for mirage reference
    // Rocks, bushes, range markers, etc.
    
    const rockLoader = new THREE.TextureLoader();
    const rockColor = rockLoader.load('textures/rock/Rock030_256_Color.jpg');
    const rockNormal = rockLoader.load('textures/rock/Rock030_256_NormalGL.jpg');
    const rockRoughness = rockLoader.load('textures/rock/Rock030_256_Roughness.jpg');
    
    const rockMaterial = new THREE.MeshStandardMaterial({
      map: rockColor,
      normalMap: rockNormal,
      roughnessMap: rockRoughness,
      roughness: 0.9,
      metalness: 0.1
    });
    
    // Create 30-50 random objects
    const objectCount = 30 + Math.floor(Math.random() * 20);
    
    for (let i = 0; i < objectCount; i++)
    {
      // Random position within range bounds
      const x = (Math.random() - 0.5) * this.rangeWidth * 0.8; // Stay within 80% of range width
      const z = -Math.random() * this.rangeDistance * 0.95; // 0 to 95% downrange
      
      // Sample terrain height at this position
      const terrainHeight = this.getTerrainHeight(x, z);
      
      // Random object type
      const objType = Math.random();
      
      if (objType < 0.6)
      {
        // Rock (60% chance)
        const rockSize = 0.2 + Math.random() * 0.4; // 0.2 to 0.6 yards
        const geometry = new THREE.SphereGeometry(rockSize, 8, 6);
        // Squash it a bit to make it look more like a rock
        geometry.scale(1, 0.6, 1);
        
        const rock = new THREE.Mesh(geometry, rockMaterial.clone());
        rock.position.set(x, terrainHeight + rockSize * 0.3, z);
        rock.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI
        );
        rock.castShadow = true;
        rock.receiveShadow = true;
        
        this.scene.add(rock);
        this.rangeObjects.push(rock);
      }
      else if (objType < 0.85)
      {
        // Bush/shrub (25% chance)
        const bushSize = 0.3 + Math.random() * 0.5; // 0.3 to 0.8 yards
        const geometry = new THREE.SphereGeometry(bushSize, 6, 4);
        
        const bushMaterial = new THREE.MeshStandardMaterial({
          color: 0x3a5f0b, // Dark green
          roughness: 1.0,
          metalness: 0.0
        });
        
        const bush = new THREE.Mesh(geometry, bushMaterial);
        bush.position.set(x, terrainHeight + bushSize * 0.5, z);
        bush.scale.set(1, 0.8, 1); // Squash vertically
        bush.castShadow = true;
        bush.receiveShadow = true;
        
        this.scene.add(bush);
        this.rangeObjects.push(bush);
      }
      else
      {
        // Range marker post (15% chance)
        const postHeight = 1.0 + Math.random() * 0.5; // 1.0 to 1.5 yards tall
        const postRadius = 0.05; // 0.05 yards (about 2 inches)
        const geometry = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8);
        
        const postMaterial = new THREE.MeshStandardMaterial({
          color: 0xffa500, // Orange
          roughness: 0.7,
          metalness: 0.1
        });
        
        const post = new THREE.Mesh(geometry, postMaterial);
        post.position.set(x, terrainHeight + postHeight / 2, z);
        post.castShadow = true;
        post.receiveShadow = true;
        
        this.scene.add(post);
        this.rangeObjects.push(post);
      }
    }
  }
  
  // Helper to get terrain height at a given x, z position
  getTerrainHeight(x, z)
  {
    // Match the terrain generation from createGround()
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
