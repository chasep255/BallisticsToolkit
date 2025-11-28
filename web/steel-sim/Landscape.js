import * as THREE from 'three';
import
{
  Config
}
from './config.js';
import
{
  DustCloudFactory
}
from './DustCloud.js';
import
{
  ImpactMarkFactory
}
from './ImpactMark.js';

/**
 * Landscape class for managing ground planes and terrain
 * Handles green foreground ground and brown background ground
 * Can track bullet impacts and other terrain interactions
 */
export class Landscape
{
  /**
   * Create a new Landscape instance
   * @param {THREE.Scene} scene - Three.js scene to add ground to
   * @param {Object} options - Optional configuration overrides (defaults to Config.LANDSCAPE_CONFIG)
   * @param {number} options.groundWidth - Width of ground in meters
   * @param {number} options.groundLength - Length of ground in meters
   * @param {number} options.brownGroundWidth - Width of brown background ground in meters
   * @param {number} options.brownGroundLength - Length of brown background ground in meters
   */
  constructor(scene, options = {})
  {
    this.scene = scene;
    const
    {
      groundWidth = Config.LANDSCAPE_CONFIG.groundWidth,
        groundLength = Config.LANDSCAPE_CONFIG.groundLength,
        brownGroundWidth = Config.LANDSCAPE_CONFIG.brownGroundWidth,
        brownGroundLength = Config.LANDSCAPE_CONFIG.brownGroundLength,
        textureManager = null
    } = options;

    this.groundWidth = groundWidth;
    this.groundLength = groundLength;
    this.brownGroundWidth = brownGroundWidth;
    this.brownGroundLength = brownGroundLength;
    this.textureManager = textureManager;

    // Environment objects
    this.mountainMesh = null;

    // Instanced meshes for trees (no per-tree tracking)
    this.treeTrunkMesh = null;
    this.treeFoliageMesh = null;

    // Create green ground plane (flat)
    // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
    const greenGroundGeometry = new THREE.PlaneGeometry(groundWidth, groundLength);

    // Get grass textures if available
    let greenGroundMaterial;
    if (this.textureManager)
    {
      const grassColor = this.textureManager.getTexture('grass_color');
      const grassNormal = this.textureManager.getTexture('grass_normal');
      const grassRoughness = this.textureManager.getTexture('grass_roughness');

      // Configure texture repeat (repeat every 10 yards, matching F-Class)
      // Convert meters to yards for repeat calculation
      const btk = window.btk;
      const groundWidth_yards = btk.Conversions.metersToYards(groundWidth);
      const groundLength_yards = btk.Conversions.metersToYards(groundLength);
      const repeatX = groundWidth_yards / 10;
      const repeatY = groundLength_yards / 10;
      [grassColor, grassNormal, grassRoughness].forEach(texture =>
      {
        if (texture)
        {
          texture.repeat.set(repeatX, repeatY);
        }
      });

      greenGroundMaterial = new THREE.MeshStandardMaterial(
      {
        map: grassColor,
        normalMap: grassNormal,
        roughnessMap: grassRoughness,
        color: 0x8fb04a, // Lighter green tint (original was 0x6b8e23)
        roughness: 1.0,
        metalness: 0.0
      });
    }
    else
    {
      // Fallback to plain color if textures not available
      greenGroundMaterial = new THREE.MeshStandardMaterial(
      {
        color: 0x4a7c59, // Green
        roughness: 0.8,
        metalness: 0.2
      });
    }

    this.greenGroundMesh = new THREE.Mesh(greenGroundGeometry, greenGroundMaterial);
    this.greenGroundMesh.rotation.x = -Math.PI / 2; // Rotate to horizontal (XZ plane)
    this.greenGroundMesh.position.set(0, 0, -groundLength / 2); // Center downrange

    this.greenGroundMesh.receiveShadow = true;
    this.greenGroundMesh.material.side = THREE.DoubleSide;
    scene.add(this.greenGroundMesh);

    // Create brown ground plane (background, wider and longer)
    const brownGroundGeometry = new THREE.PlaneGeometry(brownGroundWidth, brownGroundLength);

    // Get dirt textures if available
    let brownGroundMaterial;
    if (this.textureManager)
    {
      const dirtColor = this.textureManager.getTexture('dirt_color');
      const dirtNormal = this.textureManager.getTexture('dirt_normal');
      const dirtRoughness = this.textureManager.getTexture('dirt_roughness');

      // Configure texture repeat (repeat every 10 yards, matching F-Class)
      // Convert meters to yards for repeat calculation
      const btk = window.btk;
      const brownGroundWidth_yards = btk.Conversions.metersToYards(brownGroundWidth);
      const brownGroundLength_yards = btk.Conversions.metersToYards(brownGroundLength);
      const repeatX = brownGroundWidth_yards / 10;
      const repeatY = brownGroundLength_yards / 10;
      [dirtColor, dirtNormal, dirtRoughness].forEach(texture =>
      {
        if (texture)
        {
          texture.repeat.set(repeatX, repeatY);
        }
      });

      brownGroundMaterial = new THREE.MeshStandardMaterial(
      {
        map: dirtColor,
        normalMap: dirtNormal,
        roughnessMap: dirtRoughness,
        color: 0xb89d6f, // Lighter brown tint (original was 0x8b6f47)
        roughness: 1.0,
        metalness: 0.0
      });
    }
    else
    {
      // Fallback to plain color if textures not available
      brownGroundMaterial = new THREE.MeshStandardMaterial(
      {
        color: 0x8b6f47, // Brown
        roughness: 0.8,
        metalness: 0.2
      });
    }

    this.brownGroundMesh = new THREE.Mesh(brownGroundGeometry, brownGroundMaterial);
    this.brownGroundMesh.rotation.x = -Math.PI / 2; // Rotate to horizontal (XZ plane)
    this.brownGroundMesh.position.set(0, -0.1, -brownGroundLength / 2); // Slightly below green ground
    this.brownGroundMesh.receiveShadow = true;
    this.brownGroundMesh.material.side = THREE.DoubleSide;
    scene.add(this.brownGroundMesh);

    // Create environment features
    this.createEnvironment();
  }

  /**
   * Get the height (Y coordinate) at a given point in the XZ plane
   * @param {number} x - X coordinate in meters (crossrange, centered at 0)
   * @param {number} z - Z coordinate in meters (downrange, negative Z = downrange)
   * @returns {number|null} Height in meters, or null if point is outside ground bounds
   */
  getHeightAt(x, z)
  {
    // Check if point is within ground bounds
    const halfWidth = this.groundWidth / 2;
    if (Math.abs(x) > halfWidth)
    {
      return null; // Outside width bounds
    }

    // Check if point is within ground length bounds (downrange)
    // Ground starts at z = 0 and extends to z = -groundLength
    if (z > 0 || z < -this.groundLength)
    {
      return null; // Outside length bounds
    }

    // Flat ground - always at Y = 0
    return 0;
  }

  /**
   * Check if a ray intersects the landscape
   * @param {THREE.Raycaster} raycaster - Three.js raycaster
   * @returns {THREE.Intersection|null} Intersection point or null
   */
  intersectRaycaster(raycaster)
  {
    const greenIntersects = raycaster.intersectObject(this.greenGroundMesh);
    if (greenIntersects.length > 0)
    {
      return greenIntersects[0];
    }
    const brownIntersects = raycaster.intersectObject(this.brownGroundMesh);
    if (brownIntersects.length > 0)
    {
      return brownIntersects[0];
    }
    return null;
  }

  /**
   * Get the green ground mesh (for raycaster or other operations)
   * @returns {THREE.Mesh} Green ground mesh
   */
  getGreenGroundMesh()
  {
    return this.greenGroundMesh;
  }

  /**
   * Get the brown ground mesh
   * @returns {THREE.Mesh} Brown ground mesh
   */
  getBrownGroundMesh()
  {
    return this.brownGroundMesh;
  }

  /**
   * Create all environment features (mountains, trees, rocks)
   */
  createEnvironment()
  {
    this.createMountains();
    this.createTrees();
  }

  /**
   * Create distant mountain peaks
   */
  createMountains()
  {
    // Create shared mountain texture (brown base with white snow cap)
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

    const mountainTexture = new THREE.CanvasTexture(canvas);

    // Shared mountain material
    const mountainMaterial = new THREE.MeshLambertMaterial(
    {
      map: mountainTexture,
      side: THREE.FrontSide
    });

    // Base cone geometry (unit height, unit radius); per-mountain variation via instance scale
    const baseHeight = 1.0;
    const baseRadius = 1.0;
    const mountainGeometry = new THREE.ConeGeometry(baseRadius, baseHeight, 8);

    const mountainCount = Config.MOUNTAIN_CONFIG.count;
    const mountainMesh = new THREE.InstancedMesh(mountainGeometry, mountainMaterial, mountainCount);
    mountainMesh.castShadow = true;
    mountainMesh.receiveShadow = true;

    // Spread mountains across the full brown ground width, ensuring coverage at edges
    const mountainSpread = this.brownGroundWidth * 0.9; // Use 90% of brown ground width for spread

    // Reusable objects for building instance transform matrices
    const instanceMatrix = new THREE.Matrix4();
    const instanceScale = new THREE.Vector3();
    const instancePosition = new THREE.Vector3();
    const identityRotation = new THREE.Quaternion(); // No rotation needed

    for (let i = 0; i < mountainCount; i++)
    {
      // Distribute evenly across width with some randomness, ensuring coverage at edges
      const normalizedPos = mountainCount > 1 ? i / (mountainCount - 1) : 0.5; // 0 to 1, or 0.5 if only one mountain
      const baseX = (normalizedPos - 0.5) * mountainSpread;
      const x = baseX + (Math.random() - 0.5) * (mountainSpread / Math.max(mountainCount, 1)); // Add small random offset
      const height = Config.MOUNTAIN_CONFIG.heightMin + Math.random() * (Config.MOUNTAIN_CONFIG.heightMax - Config.MOUNTAIN_CONFIG.heightMin);
      const z = -(Config.MOUNTAIN_CONFIG.distanceMin + Math.random() * (Config.MOUNTAIN_CONFIG.distanceMax - Config.MOUNTAIN_CONFIG.distanceMin));
      const radius = height * 1.8; // Radius proportional to height

      // Scale: radius in X/Z, height in Y
      instanceScale.set(radius / baseRadius, height / baseHeight, radius / baseRadius);

      // Position matching original: center at height/2 - 5
      // ConeGeometry extends from y=0 (base) to y=height (tip), center is at height/2
      // Original code: mountain.position.set(x, height/2 - 5, z)
      const centerY = height / 2 - 5;
      instancePosition.set(x, centerY, z);

      instanceMatrix.compose(instancePosition, identityRotation, instanceScale);
      mountainMesh.setMatrixAt(i, instanceMatrix);
    }

    mountainMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mountainMesh);
    this.mountainMesh = mountainMesh;

    // Store texture reference for cleanup
    this.mountainTexture = mountainTexture;
  }

  /**
   * Create trees along sides and behind targets
   */
  createTrees()
  {
    const treeCount = Config.TREE_CONFIG.countSides + Config.TREE_CONFIG.countBehind;

    // Trunk material - use bark textures if available
    let trunkMaterial;
    if (this.textureManager)
    {
      const barkColor = this.textureManager.getTexture('bark_color');
      const barkNormal = this.textureManager.getTexture('bark_normal');
      const barkRoughness = this.textureManager.getTexture('bark_roughness');

      // Configure texture repeat for vertical bark pattern
      [barkColor, barkNormal, barkRoughness].forEach(texture =>
      {
        if (texture)
        {
          texture.repeat.set(0.5, 2.0); // Vertical bark pattern
        }
      });

      trunkMaterial = new THREE.MeshStandardMaterial(
      {
        map: barkColor,
        normalMap: barkNormal,
        roughnessMap: barkRoughness,
        color: 0x4a3728, // Darker brown tint
        roughness: 1.0,
        metalness: 0.0
      });
    }
    else
    {
      // Fallback to plain color if textures not available
      trunkMaterial = new THREE.MeshStandardMaterial(
      {
        color: 0x4a3728, // Dark brown
        roughness: 1.0,
        metalness: 0.0
      });
    }

    // Foliage material - use grass textures if available (leaves/foliage can use grass-like textures)
    let foliageMaterial;

    // Clone textures for foliage to avoid overwriting ground texture repeat
    const grassColorGround = this.textureManager.getTexture('grass_color');
    const grassNormalGround = this.textureManager.getTexture('grass_normal');
    const grassRoughnessGround = this.textureManager.getTexture('grass_roughness');

    // Clone textures for foliage use (so we don't overwrite ground repeat)
    const grassColor = grassColorGround.clone();
    const grassNormal = grassNormalGround.clone();
    const grassRoughness = grassRoughnessGround.clone();

    // Configure texture repeat for foliage (smaller repeat for detail)
    grassColor.repeat.set(0.5, 0.5);
    grassNormal.repeat.set(0.5, 0.5);
    grassRoughness.repeat.set(0.5, 0.5);

    foliageMaterial = new THREE.MeshStandardMaterial(
    {
      map: grassColor,
      normalMap: grassNormal,
      roughnessMap: grassRoughness,
      color: 0x2d5016, // Dark green tint
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide
    });


    // Base tree geometries (single geometry for trunks and foliage)
    const trunkRadius = 0.25;
    const trunkHeight = 3.5;
    const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.2, trunkHeight, 8);

    const foliageRadius = 2.5;
    const foliageHeight = 5.5;
    const foliageGeometry = new THREE.ConeGeometry(foliageRadius, foliageHeight, 8);

    // Create instanced meshes (one for all trunks, one for all foliage)
    const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCount);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    this.scene.add(trunkMesh);
    this.treeTrunkMesh = trunkMesh;

    const foliageMesh = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, treeCount);
    foliageMesh.castShadow = true;
    foliageMesh.receiveShadow = true;
    this.scene.add(foliageMesh);
    this.treeFoliageMesh = foliageMesh;

    // Reusable objects for building instance transform matrices
    const instanceMatrix = new THREE.Matrix4();
    const instanceScale = new THREE.Vector3();
    const identityRotation = new THREE.Quaternion(); // No rotation needed

    // Create trees as instances in the instanced meshes
    for (let i = 0; i < treeCount; i++)
    {
      let x, z;

      // Trees along both sides of the range
      if (i < Config.TREE_CONFIG.countSides)
      {
        // Dense trees along both sides
        const side = (i % 2 === 0) ? -1 : 1;
        x = side * (Config.TREE_CONFIG.sideMinDistance + Math.random() * (Config.TREE_CONFIG.sideMaxDistance - Config.TREE_CONFIG.sideMinDistance));
        z = -50 - Math.random() * (this.groundLength + 200);
      }
      else
      {
        // Behind targets - dense backdrop
        x = (Math.random() - 0.5) * Config.TREE_CONFIG.behindTargetWidth;
        z = -(this.groundLength + Config.TREE_CONFIG.behindTargetMin + Math.random() * (Config.TREE_CONFIG.behindTargetMax - Config.TREE_CONFIG.behindTargetMin));
      }

      // Get ground height at this position
      const groundHeight = this.getHeightAt(x, z) || 0;

      // Simple size variation using uniform scale
      const sizeVariant = Math.random(); // 0..1
      const scale = 0.85 + sizeVariant * 0.6; // ~0.85x to 1.45x
      instanceScale.set(scale, scale, scale);

      // Trunk instance matrix
      const trunkHeightScaled = trunkHeight * scale;
      instanceMatrix.compose(
        new THREE.Vector3(x, groundHeight + trunkHeightScaled / 2, z),
        identityRotation,
        instanceScale
      );
      trunkMesh.setMatrixAt(i, instanceMatrix);

      // Foliage instance matrix
      const foliageHeightScaled = foliageHeight * scale;
      const foliageY = groundHeight + trunkHeightScaled + foliageHeightScaled / 2 - foliageHeightScaled * 0.25;
      instanceMatrix.compose(
        new THREE.Vector3(x, foliageY, z),
        identityRotation,
        instanceScale
      );
      foliageMesh.setMatrixAt(i, instanceMatrix);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    foliageMesh.instanceMatrix.needsUpdate = true;
  }



  /**
   * Clean up and dispose of all resources
   */
  dispose()
  {
    // Remove mountains
    if (this.mountainMesh)
    {
      this.scene.remove(this.mountainMesh);
      this.mountainMesh.geometry.dispose();
      this.mountainMesh.material.dispose();
      this.mountainMesh = null;
    }
    // Dispose shared mountain texture
    if (this.mountainTexture)
    {
      this.mountainTexture.dispose();
      this.mountainTexture = null;
    }

    // Remove instanced tree meshes
    if (this.treeTrunkMesh)
    {
      this.scene.remove(this.treeTrunkMesh);
      this.treeTrunkMesh.geometry.dispose();
      this.treeTrunkMesh.material.dispose();
      this.treeTrunkMesh = null;
    }
    if (this.treeFoliageMesh)
    {
      this.scene.remove(this.treeFoliageMesh);
      this.treeFoliageMesh.geometry.dispose();
      this.treeFoliageMesh.material.dispose();
      this.treeFoliageMesh = null;
    }

    if (this.greenGroundMesh)
    {
      this.scene.remove(this.greenGroundMesh);
      if (this.greenGroundMesh.geometry)
      {
        this.greenGroundMesh.geometry.dispose();
      }
      if (this.greenGroundMesh.material)
      {
        this.greenGroundMesh.material.dispose();
      }
    }
    if (this.brownGroundMesh)
    {
      this.scene.remove(this.brownGroundMesh);
      if (this.brownGroundMesh.geometry)
      {
        this.brownGroundMesh.geometry.dispose();
      }
      if (this.brownGroundMesh.material)
      {
        this.brownGroundMesh.material.dispose();
      }
    }
  }

  /**
   * Register landscape objects with the ImpactDetector
   * @param {ImpactDetector} impactDetector - The impact detector to register with
   */
  registerWithImpactDetector(impactDetector)
  {
    if (!impactDetector) return;

  }
}