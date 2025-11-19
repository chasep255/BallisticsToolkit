import * as THREE from 'three';

/**
 * Landscape class for managing ground planes and terrain
 * Handles green foreground ground and brown background ground
 * Can track bullet impacts and other terrain interactions
 */
export class Landscape {
  /**
   * Create a new Landscape instance
   * @param {THREE.Scene} scene - Three.js scene to add ground to
   * @param {Object} options - Configuration options
   * @param {number} options.groundWidth - Width of ground in yards (default 100)
   * @param {number} options.groundLength - Length of ground in yards (default 2000)
   * @param {number} options.brownGroundWidth - Width of brown background ground in yards (default 500)
   * @param {number} options.brownGroundLength - Length of brown background ground in yards (default 2000)
   * @param {number} options.slopeAngle - Slope angle in degrees (default 0, positive = uphill downrange)
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    const {
      groundWidth = 100, // yards
      groundLength = 2000, // yards
      brownGroundWidth = 500, // yards
      brownGroundLength = 2000, // yards
      slopeAngle = 0 // degrees (positive = uphill downrange)
    } = options;

    this.groundWidth = groundWidth;
    this.groundLength = groundLength;
    this.brownGroundWidth = brownGroundWidth;
    this.brownGroundLength = brownGroundLength;
    this.slopeAngle = slopeAngle;

    // Create green ground plane with slope
    // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
    // Ground starts at shooter position (0, 0, 0) and slopes up downrange
    const slopeRadians = (slopeAngle * Math.PI) / 180;
    
    // Calculate the hypotenuse length (actual surface length)
    // groundLength is the horizontal distance, hypotenuse = groundLength / cos(slopeAngle)
    const hypotenuseLength = groundLength / Math.cos(slopeRadians);
    
    const greenGroundGeometry = new THREE.PlaneGeometry(groundWidth, hypotenuseLength);
    const greenGroundMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a7c59, // Green
      roughness: 0.8,
      metalness: 0.2
    });
    this.greenGroundMesh = new THREE.Mesh(greenGroundGeometry, greenGroundMaterial);
    
    // Rotate to horizontal first, then add slope
    // Start with plane in XZ plane (horizontal), then rotate around X axis for slope
    this.greenGroundMesh.rotation.x = -Math.PI / 2 + slopeRadians;
    
    // Position so the front edge starts at origin (shooter position)
    // The plane extends from origin downrange along the slope
    const halfHypotenuse = hypotenuseLength / 2;
    this.greenGroundMesh.position.set(0, halfHypotenuse * Math.sin(slopeRadians), -halfHypotenuse * Math.cos(slopeRadians));
    
    this.greenGroundMesh.receiveShadow = true;
    this.greenGroundMesh.material.side = THREE.DoubleSide;
    scene.add(this.greenGroundMesh);

    // Create brown ground plane (background, wider and longer)
    const brownGroundGeometry = new THREE.PlaneGeometry(brownGroundWidth, brownGroundLength);
    const brownGroundMaterial = new THREE.MeshStandardMaterial({
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
  getHeightAt(x, z) {
    // Check if point is within ground bounds
    const halfWidth = this.groundWidth / 2;
    if (Math.abs(x) > halfWidth) {
      return null; // Outside width bounds
    }

    // Check if point is within ground length bounds (downrange)
    // Ground starts at z = 0 and extends to z = -groundLength
    if (z > 0 || z < -this.groundLength) {
      return null; // Outside length bounds
    }

    // Calculate height based on slope
    // Ground starts at (0, 0, 0) and slopes up as Z becomes more negative
    // Y = -Z * tan(slopeAngle) because Z is negative downrange
    const slopeRadians = (this.slopeAngle * Math.PI) / 180;
    const height = -z * Math.tan(slopeRadians);
    
    return height;
  }

  /**
   * Check if a ray intersects the landscape
   * @param {THREE.Raycaster} raycaster - Three.js raycaster
   * @returns {THREE.Intersection|null} Intersection point or null
   */
  intersectRaycaster(raycaster) {
    const greenIntersects = raycaster.intersectObject(this.greenGroundMesh);
    if (greenIntersects.length > 0) {
      return greenIntersects[0];
    }
    const brownIntersects = raycaster.intersectObject(this.brownGroundMesh);
    if (brownIntersects.length > 0) {
      return brownIntersects[0];
    }
    return null;
  }

  /**
   * Get the green ground mesh (for raycaster or other operations)
   * @returns {THREE.Mesh} Green ground mesh
   */
  getGreenGroundMesh() {
    return this.greenGroundMesh;
  }

  /**
   * Get the brown ground mesh
   * @returns {THREE.Mesh} Brown ground mesh
   */
  getBrownGroundMesh() {
    return this.brownGroundMesh;
  }

  /**
   * Get the maximum height of the landscape (at the far end of the range)
   * @returns {number} Maximum height in yards
   */
  getMaxHeight() {
    // Maximum height is at the far end of the range (z = -groundLength)
    const slopeRadians = (this.slopeAngle * Math.PI) / 180;
    return this.groundLength * Math.tan(slopeRadians);
  }

  /**
   * Configure a directional light's shadow camera to match the landscape dimensions
   * @param {THREE.DirectionalLight} directionalLight - The directional light to configure
   */
  configureShadowCamera(directionalLight) {
    if (!directionalLight) return;
    
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = this.groundLength * 1.25; // Cover entire range depth with some margin
    
    // Top should cover max landscape height plus margin for targets/structures
    const maxHeight = this.getMaxHeight();
    const top = maxHeight + 10; // Max height plus 10 yards margin
    const bottom = -this.groundLength; // Full range length downrange
    
    // Use actual scene dimensions - shadow map will handle the aspect ratio
    directionalLight.shadow.camera.left = -this.groundWidth / 2;
    directionalLight.shadow.camera.right = this.groundWidth / 2;
    directionalLight.shadow.camera.top = top;
    directionalLight.shadow.camera.bottom = bottom;
    
    // Update shadow map size to better match the aspect ratio
    // Scene is much taller than wide, so use a taller shadow map
    const aspectRatio = (top - bottom) / this.groundWidth;
    if (aspectRatio > 1) {
      // Taller than wide - use more vertical resolution
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = Math.min(4096, Math.round(2048 * aspectRatio));
    } else {
      // Wider than tall - use more horizontal resolution
      directionalLight.shadow.mapSize.width = Math.min(4096, Math.round(2048 / aspectRatio));
      directionalLight.shadow.mapSize.height = 2048;
    }
  }

  /**
   * Clean up and dispose of all resources
   */
  dispose() {
    if (this.greenGroundMesh) {
      this.scene.remove(this.greenGroundMesh);
      if (this.greenGroundMesh.geometry) {
        this.greenGroundMesh.geometry.dispose();
      }
      if (this.greenGroundMesh.material) {
        this.greenGroundMesh.material.dispose();
      }
    }
    if (this.brownGroundMesh) {
      this.scene.remove(this.brownGroundMesh);
      if (this.brownGroundMesh.geometry) {
        this.brownGroundMesh.geometry.dispose();
      }
      if (this.brownGroundMesh.material) {
        this.brownGroundMesh.material.dispose();
      }
    }
  }
}

