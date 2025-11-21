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
   * @param {number} options.slopeAngle - Slope angle in degrees (default 0, positive = uphill downrange)
   */
  constructor(scene, options = {})
  {
    this.scene = scene;
    const
    {
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
    this.slopeRadians = (this.slopeAngle * Math.PI) / 180;

    // ===== GREEN GROUND: HEIGHTFIELD TERRAIN =====
    // Three.js: X=right, Y=up, Z=towards-camera (negative Z = downrange)
    // Ground starts at shooter position (0, 0, 0) and extends to z = -groundLength.

    // Create a moderately tessellated plane in XZ and displace vertices with a shared height function.
    const segmentsX = 64;
    const segmentsZ = 256;
    const greenGroundGeometry = new THREE.PlaneGeometry(groundWidth, groundLength, segmentsX, segmentsZ);

    // Rotate geometry so it lies in the XZ plane (Y is up).
    greenGroundGeometry.rotateX(-Math.PI / 2);

    // Center the geometry at z = -groundLength / 2 so the near edge is at z = 0.
    const centerOffsetZ = -groundLength / 2;

    const positions = greenGroundGeometry.attributes.position;
    const vertex = new THREE.Vector3();

    for(let i = 0; i < positions.count; ++i)
    {
      vertex.fromBufferAttribute(positions, i);

      // Local X already matches world X (rack/targets are centered at X = 0).
      const worldX = vertex.x;

      // Local Z is in [-groundLength/2, +groundLength/2]; shift so world Z is [0, -groundLength].
      const worldZ = vertex.z + centerOffsetZ;

      const heightY = this.sampleHeightYards(worldX, worldZ);
      positions.setY(i, heightY);
    }

    positions.needsUpdate = true;
    greenGroundGeometry.computeVertexNormals();
    greenGroundGeometry.computeBoundingBox();
    greenGroundGeometry.computeBoundingSphere();

    const greenGroundMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x4a7c59, // Green
      roughness: 0.8,
      metalness: 0.2
    });
    this.greenGroundMesh = new THREE.Mesh(greenGroundGeometry, greenGroundMaterial);

    // Position so the front edge starts at origin (shooter position)
    // The plane extends from z = 0 to z = -groundLength with baked-in height variation.
    this.greenGroundMesh.position.set(0, 0, centerOffsetZ);

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
    if(z > 0 || z < -this.groundLength)
    {
      return null; // Outside length bounds
    }

    // Use the same height function that generated the mesh so physics and visuals match.
    return this.sampleHeightYards(x, z);
  }

  /**
   * Sample the landscape height at a given X/Z in yards.
   * Combines the global slope with a few broad features to give depth cues.
   *
   * Coordinate system:
   * - X: crossrange (yards), centered at 0
   * - Z: downrange (yards), 0 at shooter, negative downrange
   */
  sampleHeightYards(x, z)
  {
    // Base global slope: same behavior as original implementation.
    // Ground starts at (0,0,0) and slopes up as Z becomes more negative.
    let height = -z * Math.tan(this.slopeRadians);

    // Foreground berm: very gentle rise around 150–300 yards that stays below the
    // line of sight to 1000-yard targets.
    const bermCenterZ = -225; // yards
    const bermHalfWidth = 125; // influence radius
    const bermHeight = 1.0; // yards
    const dzBerm = z - bermCenterZ;
    const bermT = 1 - (dzBerm * dzBerm) / (bermHalfWidth * bermHalfWidth);
    if(bermT > 0)
    {
      // Parabolic falloff
      height += bermHeight * bermT;
    }

    // Mid-range ridge: broad hill placed BEHIND the 1000-yard line so it
    // adds depth without blocking long-range targets.
    const ridgeCenterZ = -1400; // yards (beyond 1000)
    const ridgeHalfWidth = 500;
    const ridgeHeight = 4.0; // yards
    const dzRidge = z - ridgeCenterZ;
    const ridgeT = 1 - (dzRidge * dzRidge) / (ridgeHalfWidth * ridgeHalfWidth);
    if(ridgeT > 0)
    {
      // Crossrange modulation so the hill isn't perfectly flat across X.
      const crossPhase = (x / this.groundWidth) * Math.PI;
      const crossFactor = 0.5 + 0.5 * Math.cos(crossPhase); // [0,1]
      height += ridgeHeight * ridgeT * crossFactor;
    }

    // Gentle low-frequency undulations for extra depth cues.
    const undulationAmp = 0.5; // yards
    height += undulationAmp * Math.sin(z / 150) * Math.cos(x / 60);

    return height;
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
   * Get the maximum height of the landscape (at the far end of the range)
   * @returns {number} Maximum height in yards
   */
  getMaxHeight()
  {
    // Sample a modest grid over the landscape to estimate the maximum height.
    const samplesX = 16;
    const samplesZ = 64;

    const halfWidth = this.groundWidth / 2;
    let maxHeight = 0;

    for(let ix = 0; ix <= samplesX; ++ix)
    {
      const fx = ix / samplesX;
      const x = -halfWidth + fx * this.groundWidth;

      for(let iz = 0; iz <= samplesZ; ++iz)
      {
        const fz = iz / samplesZ;
        const z = -this.groundLength * fz; // 0 (near) to -groundLength (far)
        const h = this.sampleHeightYards(x, z);
        if(h > maxHeight)
        {
          maxHeight = h;
        }
      }
    }

    return maxHeight;
  }

  /**
   * Configure a directional light's shadow camera to match the landscape dimensions
   * @param {THREE.DirectionalLight} directionalLight - The directional light to configure
   */
  configureShadowCamera(directionalLight)
  {
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

    // Set shadow map size to one pixel per square yard
    const shadowWidth = Math.round(this.groundWidth);
    const shadowHeight = Math.round(top - bottom);
    directionalLight.shadow.mapSize.width = shadowWidth;
    directionalLight.shadow.mapSize.height = shadowHeight;
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