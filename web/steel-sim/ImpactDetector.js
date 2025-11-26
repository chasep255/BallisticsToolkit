/**
 * ImpactDetector.js - JavaScript wrapper for C++ ImpactDetector
 * Manages registration of hittable objects and trajectory impact queries
 */

export class ImpactDetector
{
  constructor(config)
  {
    const btk = window.btk;

    // All values must be provided - no defaults
    const binSize = config.binSize;
    const minX = config.minX;
    const maxX = config.maxX;
    const minZ = config.minZ;
    const maxZ = config.maxZ;

    // Create C++ detector
    this.detector = new btk.ImpactDetector(binSize, minX, maxX, minZ, maxZ);

    // Map from C++ object ID to user data (arbitrary JS values)
    this.userData = new Map();
    this.nextObjectId = 0;
  }

  /**
   * Register a static mesh collider from Three.js geometry.
   * 
   * @param {THREE.BufferGeometry} geometry Three.js buffer geometry
   * @param {*} userData Arbitrary user data to associate with this collider
   * @returns {number} Collider handle or -1 on error
   */
  addMeshFromGeometry(geometry, userData = null)
  {
    // Extract position attribute
    const positionAttr = geometry.getAttribute('position');
    if (!positionAttr)
    {
      console.error('[ImpactDetector] Geometry has no position attribute');
      return -1;
    }

    // Get vertices as Float32Array
    const vertices = positionAttr.array;

    // Get indices if available
    let indices = null;
    if (geometry.index)
    {
      indices = geometry.index.array;
    }

    // Vertices are already in BTK-compatible coordinates (geometry should be pre-transformed)
    // BTK: X=crossrange, Y=up, Z=-downrange (same as Three.js world space for this sim)
    const verticesBTK = new Float32Array(vertices.length);
    for (let i = 0; i < vertices.length; i += 3)
    {
      verticesBTK[i] = vertices[i]; // X unchanged
      verticesBTK[i + 1] = vertices[i + 1]; // Y unchanged
      verticesBTK[i + 2] = vertices[i + 2]; // Z unchanged - geometry is already in world/BTK coords
    }

    // Allocate object ID and store user data
    const objectId = this.nextObjectId++;
    this.userData.set(objectId, userData);

    // Register with C++ detector
    const indicesArray = indices || new Uint32Array(0);
    const handle = this.detector.addMeshCollider(verticesBTK, indicesArray, objectId);
    
    if (handle < 0)
    {
      console.error(`[ImpactDetector] Failed to register mesh collider: id=${objectId}`);
      this.userData.delete(objectId); // Clean up on failure
    }

    return handle;
  }

  /**
   * Register a moving steel target.
   * 
   * @param {btk.SteelTarget} steelTarget BTK SteelTarget instance
   * @param {number} radius Radius for bin coverage in meters (accounts for swing)
   * @param {*} userData Arbitrary user data to associate with this collider
   * @returns {number} Collider handle or -1 on error
   */
  addSteelTarget(steelTarget, radius, userData = null)
  {
    // Allocate object ID and store user data
    const objectId = this.nextObjectId++;
    this.userData.set(objectId, userData);

    const handle = this.detector.addSteelCollider(steelTarget, radius, objectId);

    if (handle >= 0)
    {
      console.log(`[ImpactDetector] Registered steel collider: handle=${handle}, id=${objectId}, radius=${radius.toFixed(2)}m`);
    }
    else
    {
      console.error(`[ImpactDetector] Failed to register steel collider: id=${objectId}`);
      this.userData.delete(objectId); // Clean up on failure
    }

    return handle;
  }

  /**
   * Find first impact of a trajectory in time interval [t0, t1].
   * 
   * @param {btk.Trajectory} trajectory BTK Trajectory instance
   * @param {number} t0 Start time in seconds
   * @param {number} t1 End time in seconds
   * @returns {Object|null} Impact result {position, normal, time, userData} or null if no hit
   */
  findFirstImpact(trajectory, t0, t1)
  {
    const result = this.detector.findFirstImpact(trajectory, t0, t1);

    if (!result)
    {
      return null;
    }

    // Retrieve user data associated with this object
    const userData = this.userData.get(result.objectId);

    // Convert to plain JS object for easier use
    return {
      position:
      {
        x: result.position.x,
        y: result.position.y,
        z: result.position.z
      },
      normal:
      {
        x: result.normal.x,
        y: result.normal.y,
        z: result.normal.z
      },
      time: result.time,
      userData: userData
    };
  }

  /**
   * Get statistics about registered colliders.
   */
  getStats()
  {
    return {
      totalColliders: this.userData.size
    };
  }

  /**
   * Dispose the C++ detector.
   */
  dispose()
  {
    if (this.detector)
    {
      this.detector.delete();
      this.detector = null;
    }

    this.userData.clear();
  }
}