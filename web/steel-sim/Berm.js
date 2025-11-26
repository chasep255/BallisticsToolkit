import * as THREE from 'three';
import
{
  DustCloudFactory
}
from './DustCloud.js';

/**
 * Berm - A sand/dirt mound behind a target rack to catch missed shots
 * Flat-topped with sloping sides, positioned behind target racks
 */
export class Berm
{
  /**
   * Create a berm
   * @param {Object} options
   * @param {THREE.Vector3} options.position - Center position in world space (meters)
   * @param {number} options.width - Width of flat top (meters)
   * @param {number} options.height - Height of berm (meters)
   * @param {number} options.depth - Depth of berm (meters, downrange)
   * @param {THREE.Scene} options.scene - Three.js scene
   * @param {Object} options.textureManager - Optional texture manager for materials
   */
  constructor(options)
  {
    const
    {
      position,
      width,
      height,
      depth,
      scene,
      textureManager = null
    } = options;

    this.scene = scene;
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.mesh = null;

    // Create berm material - sandy/dirt color
    let bermMaterial;
    if (textureManager)
    {
      // Clone textures to avoid modifying shared instances from texture manager
      const dirtColorBase = textureManager.getTexture('dirt_color');
      const dirtNormalBase = textureManager.getTexture('dirt_normal');
      const dirtRoughnessBase = textureManager.getTexture('dirt_roughness');

      const dirtColor = dirtColorBase ? dirtColorBase.clone() : null;
      const dirtNormal = dirtNormalBase ? dirtNormalBase.clone() : null;
      const dirtRoughness = dirtRoughnessBase ? dirtRoughnessBase.clone() : null;

      dirtColor.repeat.set(10, 10);
      dirtNormal.repeat.set(10, 10);
      dirtRoughness.repeat.set(10, 10);

      bermMaterial = new THREE.MeshStandardMaterial(
      {
        map: dirtColor,
        normalMap: dirtNormal,
        roughnessMap: dirtRoughness,
        color: 0xF5DEB3, // Lighter wheat/tan tint for better texture visibility
        roughness: 0.8,
        metalness: 0.0
      });
    }
    else
    {
      // Fallback to plain color if textures not available
      bermMaterial = new THREE.MeshStandardMaterial(
      {
        color: 0xF4A460, // Sandy
        roughness: 0.8,
        metalness: 0.0
      });
    }

    // Create berm geometry - flat-topped mound with sloping sides
    const segments = 32; // Smooth curve resolution
    const geometry = new THREE.PlaneGeometry(width * 2, depth, segments, segments); // Wider base for tapering

    // Modify vertices to create a flat-topped berm with sloping sides
    // PlaneGeometry: X = crossrange, Y = downrange (before rotation), Z = 0
    // After rotation by -90° around X: X stays X, Y becomes -Z (downrange), Z becomes Y (up)
    const vertices = geometry.attributes.position.array;
    const halfWidth = width;
    const halfDepth = depth / 2;

    // Flat top region: same width as rack, 70% of depth
    const flatTopWidth = width;
    const flatTopDepth = depth * 0.7;
    const flatTopHalfWidth = flatTopWidth / 2;
    const flatTopHalfDepth = flatTopDepth / 2;

    // Slope region: remaining width extends to sides, remaining depth extends back
    const slopeWidth = width; // Total width extends to 2x width (taper to sides)
    const slopeDepth = depth - flatTopDepth;

    for (let i = 0; i < vertices.length; i += 3)
    {
      const x = vertices[i]; // X coordinate (crossrange) - stays X after rotation
      const y = vertices[i + 1]; // Y coordinate (becomes -Z/downrange after rotation)

      // Check distance from center in each direction
      const absX = Math.abs(x);
      const absY = Math.abs(y);

      let height;
      if (absX <= flatTopHalfWidth && absY <= flatTopHalfDepth)
      {
        // Inside flat top region - full height
        height = this.height;
      }
      else
      {
        // On slope - calculate distance from flat top edge
        const distX = Math.max(0, absX - flatTopHalfWidth);
        const distY = Math.max(0, absY - flatTopHalfDepth);

        // Use Manhattan distance for more rectangular flat top with linear slopes
        const maxDist = Math.max(distX / (slopeWidth / 2), distY / (slopeDepth / 2));
        const slopeRatio = Math.min(maxDist, 1.0);
        height = this.height * (1.0 - slopeRatio);
      }

      // Set Z coordinate (becomes Y/up after rotation)
      vertices[i + 2] = height;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    this.mesh = new THREE.Mesh(geometry, bermMaterial);
    this.mesh.position.copy(position);
    this.mesh.rotation.x = -Math.PI / 2; // Rotate XY plane to XZ plane (ground plane)
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    scene.add(this.mesh);
  }

  /**
   * Get the berm mesh for impact detection registration
   * @returns {THREE.Mesh}
   */
  getMesh()
  {
    return this.mesh;
  }

  /**
   * Dispose of the berm and clean up resources
   */
  dispose()
  {
    if (this.mesh)
    {
      this.scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material)
      {
        if (Array.isArray(this.mesh.material))
        {
          this.mesh.material.forEach(mat => mat.dispose());
        }
        else
        {
          this.mesh.material.dispose();
        }
      }
      this.mesh = null;
    }
  }
}

/**
 * Factory for managing berms
 */
export class BermFactory
{
  static berms = [];

  /**
   * Create a berm
   * @param {Object} options - Same as Berm constructor
   * @returns {Berm}
   */
  static create(options)
  {
    const berm = new Berm(options);
    this.berms.push(berm);
    return berm;
  }

  /**
   * Delete all berms
   */
  static deleteAll()
  {
    for (const berm of this.berms)
    {
      berm.dispose();
    }
    this.berms = [];
  }

  /**
   * Get all berms
   * @returns {Berm[]}
   */
  static getAll()
  {
    return this.berms;
  }
}