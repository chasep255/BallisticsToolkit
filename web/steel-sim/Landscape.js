import * as THREE from 'three';

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
   * @param {Object} options - Configuration options
   * @param {number} options.groundWidth - Width of ground in yards (default 100)
   * @param {number} options.groundLength - Length of ground in yards (default 2000)
   * @param {number} options.brownGroundWidth - Width of brown background ground in yards (default 500)
   * @param {number} options.brownGroundLength - Length of brown background ground in yards (default 2000)
   */
  constructor(scene, options = {})
  {
    this.scene = scene;
    const
    {
      groundWidth = 100, // yards
        groundLength = 2000, // yards
        brownGroundWidth = 500, // yards
        brownGroundLength = 2000 // yards
    } = options;

    this.groundWidth = groundWidth;
    this.groundLength = groundLength;
    this.brownGroundWidth = brownGroundWidth;
    this.brownGroundLength = brownGroundLength;

    // Create green ground plane (flat)
    // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
    const greenGroundGeometry = new THREE.PlaneGeometry(groundWidth, groundLength);
    const greenGroundMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x4a7c59, // Green
      roughness: 0.8,
      metalness: 0.2
    });
    this.greenGroundMesh = new THREE.Mesh(greenGroundGeometry, greenGroundMaterial);
    this.greenGroundMesh.rotation.x = -Math.PI / 2; // Rotate to horizontal (XZ plane)
    this.greenGroundMesh.position.set(0, 0, -groundLength / 2); // Center downrange

    this.greenGroundMesh.receiveShadow = true;
    this.greenGroundMesh.material.side = THREE.DoubleSide;
    scene.add(this.greenGroundMesh);

    // Create brown ground plane (background, wider and longer)
    const brownGroundGeometry = new THREE.PlaneGeometry(brownGroundWidth, brownGroundLength);
    const brownGroundMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x8b6f47, // Brown
      roughness: 0.8,
      metalness: 0.2
    });
    this.brownGroundMesh = new THREE.Mesh(brownGroundGeometry, brownGroundMaterial);
    this.brownGroundMesh.rotation.x = -Math.PI / 2; // Rotate to horizontal (XZ plane)
    this.brownGroundMesh.position.set(0, -0.1, -brownGroundLength / 2); // Slightly below green ground
    this.brownGroundMesh.receiveShadow = true;
    this.brownGroundMesh.material.side = THREE.DoubleSide;
    scene.add(this.brownGroundMesh);
  }

  /**
   * Get the height (Y coordinate) at a given point in the XZ plane
   * @param {number} x - X coordinate in yards (crossrange, centered at 0)
   * @param {number} z - Z coordinate in yards (downrange, negative Z = downrange)
   * @returns {number|null} Height in yards, or null if point is outside ground bounds
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
   * Clean up and dispose of all resources
   */
  dispose()
  {
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
}