import * as THREE from 'three';
import
{
  DecalGeometry
}
from 'three/addons/geometries/DecalGeometry.js';

/**
 * ImpactMarkFactory - Manages bullet impact marks using DecalGeometry
 * 
 * DecalGeometry projects marks onto mesh surfaces, conforming to the geometry.
 * Marks persist until simulation restart. When pool is full, oldest marks are recycled.
 */
export class ImpactMarkFactory
{
  static MAX_MARKS = 32;
  static MARK_SIZE = 0.1;

  // Static state
  static scene = null;
  static texture = null;
  static decals = []; // Array of decal meshes

  // Temporary vectors
  static _orientation = new THREE.Euler();
  static _size = new THREE.Vector3();

  /**
   * Create a procedural dirt impact texture (dark divot with soft edges)
   */
  static createSplatTexture()
  {
    const size = 512; // Higher resolution for sharper detail
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 4; // Soft outer edge

    // Single smooth radial gradient - grayscale (material color will tint this)
    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, radius
    );
    gradient.addColorStop(0, 'rgba(20, 20, 20, 0.95)'); // Very dark center
    gradient.addColorStop(0.3, 'rgba(40, 40, 40, 0.8)'); // Dark
    gradient.addColorStop(0.6, 'rgba(80, 80, 80, 0.4)'); // Medium
    gradient.addColorStop(0.85, 'rgba(120, 120, 120, 0.15)'); // Light
    gradient.addColorStop(1, 'rgba(140, 140, 140, 0)'); // Transparent edge

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Add irregular edge noise for realism
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4)
    {
      const x = (i / 4) % size;
      const y = Math.floor((i / 4) / size);
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Add noise to alpha channel for irregular edges (only in outer region)
      if (dist > radius * 0.5 && dist < radius)
      {
        const noise = (Math.random() - 0.5) * 20;
        data[i + 3] = Math.max(0, Math.min(255, data[i + 3] + noise));
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter; // Disable mipmapping for sharper detail
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Create a material for a given color
   */
  static createMaterial(color)
  {
    if (!ImpactMarkFactory.texture)
    {
      console.error('[ImpactMarkFactory] Texture not initialized. Call init(scene) first.');
      return null;
    }

    const colorKey = typeof color === 'number' ? color : color.getHex();

    return new THREE.MeshBasicMaterial(
    {
      map: ImpactMarkFactory.texture,
      color: colorKey,
      transparent: true,
      blending: THREE.MultiplyBlending, // Darken surface instead of brightening
      premultipliedAlpha: true, // Required for MultiplyBlending
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4, // Push decal towards camera to avoid z-fighting
      polygonOffsetUnits: -4
    });
  }

  /**
   * Initialize the factory
   * @param {THREE.Scene} scene - The Three.js scene
   */
  static init(scene)
  {
    ImpactMarkFactory.scene = scene;

    if (!ImpactMarkFactory.texture)
    {
      ImpactMarkFactory.texture = ImpactMarkFactory.createSplatTexture();
    }
  }

  /**
   * Create a new impact mark
   * @param {Object} options
   * @param {THREE.Vector3} options.position - Impact position
   * @param {THREE.Vector3} options.normal - Surface normal
   * @param {THREE.Mesh} options.mesh - Target mesh to project onto (required)
   * @param {number} options.color - Color (default: dark brown)
   * @param {number} options.size - Size multiplier (default: 1.0)
   */
  static create(options)
  {
    const
    {
      position,
      normal,
      mesh,
      color = 0x3d2817,
      size = 1.0
    } = options;

    if (!ImpactMarkFactory.scene)
    {
      console.error('[ImpactMarkFactory] Not initialized. Call init(scene) first.');
      return;
    }

    // Require a mesh for DecalGeometry projection
    if (!mesh)
    {
      console.warn('[ImpactMarkFactory] No mesh provided, cannot create impact mark');
      return;
    }

    // Calculate orientation from normal
    // DecalGeometry expects orientation as Euler angles pointing in the decal's direction
    const normalNorm = normal.clone().normalize();
    const lookTarget = position.clone().add(normalNorm);
    const helper = new THREE.Object3D();
    helper.position.copy(position);
    helper.lookAt(lookTarget);
    ImpactMarkFactory._orientation.copy(helper.rotation);

    // Set size (circular mark)
    const baseSize = ImpactMarkFactory.MARK_SIZE * size;
    ImpactMarkFactory._size.set(baseSize, baseSize, baseSize);

    // Create material for this color
    const material = ImpactMarkFactory.createMaterial(color);
    if (!material)
    {
      return; // Texture not initialized
    }

    // Use DecalGeometry to project onto the mesh
    let decalMesh;
    try
    {
      const decalGeometry = new DecalGeometry(
        mesh,
        position,
        ImpactMarkFactory._orientation,
        ImpactMarkFactory._size
      );
      decalMesh = new THREE.Mesh(decalGeometry, material);
    }
    catch (e)
    {
      console.error('[ImpactMarkFactory] Failed to create DecalGeometry:', e);
      return;
    }

    decalMesh.renderOrder = 1; // Render after regular geometry
    ImpactMarkFactory.scene.add(decalMesh);
    ImpactMarkFactory.decals.push(decalMesh);

    // Remove oldest if over limit
    while (ImpactMarkFactory.decals.length > ImpactMarkFactory.MAX_MARKS)
    {
      const oldDecal = ImpactMarkFactory.decals.shift();
      ImpactMarkFactory.scene.remove(oldDecal);
      if (oldDecal.geometry)
      {
        oldDecal.geometry.dispose();
      }
      if (oldDecal.material)
      {
        oldDecal.material.dispose();
      }
    }
  }


  /**
   * Delete all impact marks
   */
  static deleteAll()
  {
    for (const decal of ImpactMarkFactory.decals)
    {
      if (ImpactMarkFactory.scene)
      {
        ImpactMarkFactory.scene.remove(decal);
      }
      if (decal.geometry)
      {
        decal.geometry.dispose();
      }
      if (decal.material)
      {
        decal.material.dispose();
      }
    }
    ImpactMarkFactory.decals = [];
  }

  /**
   * Dispose all resources
   */
  static dispose()
  {
    ImpactMarkFactory.deleteAll();

    // Dispose texture
    if (ImpactMarkFactory.texture)
    {
      ImpactMarkFactory.texture.dispose();
      ImpactMarkFactory.texture = null;
    }

    // Clear scene reference
    ImpactMarkFactory.scene = null;
  }

  /**
   * Get current mark count
   */
  static getCount()
  {
    return ImpactMarkFactory.decals.length;
  }
}