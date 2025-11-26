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
  static MAX_MARKS = 500;
  static MARK_SIZE = 0.10; // Base size 10cm

  // Stretch limits for grazing angles
  static MAX_STRETCH = 4.0;
  static MIN_COS_ANGLE = 0.15;

  // Static state
  static scene = null;
  static texture = null;
  static decals = []; // Array of decal meshes
  static materials = new Map(); // Cache materials by color

  // Temporary vectors
  static _orientation = new THREE.Euler();
  static _size = new THREE.Vector3();
  static _velocityDir = new THREE.Vector3();
  static _projectedVelocity = new THREE.Vector3();

  /**
   * Create a procedural splat texture
   */
  static createSplatTexture()
  {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 4;

    // Radial gradient for soft edges
    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, radius
    );

    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Add noise
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4)
    {
      const noise = (Math.random() - 0.5) * 30;
      data[i + 3] = Math.max(0, Math.min(255, data[i + 3] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Get or create a material for a given color
   */
  static getMaterial(color)
  {
    const colorKey = typeof color === 'number' ? color : color.getHex();

    if (!ImpactMarkFactory.materials.has(colorKey))
    {
      const material = new THREE.MeshBasicMaterial(
      {
        map: ImpactMarkFactory.texture,
        color: colorKey,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4, // Push decal towards camera to avoid z-fighting
        polygonOffsetUnits: -4
      });
      ImpactMarkFactory.materials.set(colorKey, material);
    }

    return ImpactMarkFactory.materials.get(colorKey);
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
   * @param {THREE.Vector3} options.velocity - Bullet velocity (optional)
   * @param {THREE.Mesh} options.mesh - Target mesh to project onto (optional)
   * @param {number} options.color - Color (default: dark brown)
   * @param {number} options.size - Size multiplier (default: 1.0)
   */
  static create(options)
  {
    const
    {
      position,
      normal,
      velocity,
      mesh,
      color = 0x3d2817,
      size = 1.0
    } = options;

    if (!ImpactMarkFactory.scene)
    {
      console.error('[ImpactMarkFactory] Not initialized. Call init(scene) first.');
      return;
    }

    // Calculate stretch based on impact angle
    let stretchX = 1.0;
    let stretchY = 1.0;
    const normalNorm = normal.clone().normalize();

    if (velocity && velocity.lengthSq() > 0)
    {
      ImpactMarkFactory._velocityDir.copy(velocity).normalize();
      const cosAngle = Math.abs(ImpactMarkFactory._velocityDir.dot(normalNorm));
      const clampedCos = Math.max(cosAngle, ImpactMarkFactory.MIN_COS_ANGLE);
      const stretch = Math.min(1.0 / clampedCos, ImpactMarkFactory.MAX_STRETCH);
      stretchX = stretch;
    }

    // Calculate orientation from normal
    // DecalGeometry expects orientation as Euler angles pointing in the decal's direction
    const lookTarget = position.clone().add(normalNorm);
    const helper = new THREE.Object3D();
    helper.position.copy(position);
    helper.lookAt(lookTarget);

    // If we have velocity, rotate around normal to align stretch with velocity direction
    if (velocity && velocity.lengthSq() > 0)
    {
      // Project velocity onto surface plane
      const dotVN = ImpactMarkFactory._velocityDir.dot(normalNorm);
      ImpactMarkFactory._projectedVelocity.copy(ImpactMarkFactory._velocityDir);
      ImpactMarkFactory._projectedVelocity.addScaledVector(normalNorm, -dotVN);

      if (ImpactMarkFactory._projectedVelocity.lengthSq() > 0.0001)
      {
        ImpactMarkFactory._projectedVelocity.normalize();
        // Calculate rotation angle around normal
        const angle = Math.atan2(
          ImpactMarkFactory._projectedVelocity.x,
          -ImpactMarkFactory._projectedVelocity.z
        );
        helper.rotateZ(angle);
      }
    }

    ImpactMarkFactory._orientation.copy(helper.rotation);

    // Set size with stretch
    const baseSize = ImpactMarkFactory.MARK_SIZE * size;
    ImpactMarkFactory._size.set(baseSize * stretchX, baseSize * stretchY, baseSize);

    // Get material for this color
    const material = ImpactMarkFactory.getMaterial(color);

    let decalMesh;

    if (mesh)
    {
      // Use DecalGeometry to project onto the mesh
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
        // Fallback to plane if DecalGeometry fails
        decalMesh = ImpactMarkFactory.createPlaneMark(position, normalNorm, stretchX, stretchY, baseSize, material, velocity);
      }
    }
    else
    {
      // No mesh provided - use simple plane (for ground, etc.)
      decalMesh = ImpactMarkFactory.createPlaneMark(position, normalNorm, stretchX, stretchY, baseSize, material, velocity);
    }

    decalMesh.renderOrder = 1; // Render after regular geometry
    ImpactMarkFactory.scene.add(decalMesh);
    ImpactMarkFactory.decals.push(decalMesh);

    // Remove oldest if over limit
    while (ImpactMarkFactory.decals.length > ImpactMarkFactory.MAX_MARKS)
    {
      const oldDecal = ImpactMarkFactory.decals.shift();
      ImpactMarkFactory.scene.remove(oldDecal);
      if (oldDecal.geometry) oldDecal.geometry.dispose();
    }
  }

  /**
   * Create a simple plane mark (fallback when no mesh available)
   */
  static createPlaneMark(position, normal, stretchX, stretchY, baseSize, material, velocity)
  {
    const geometry = new THREE.PlaneGeometry(baseSize * stretchX * 2, baseSize * stretchY * 2);
    const planeMesh = new THREE.Mesh(geometry, material);

    // Position slightly above surface
    planeMesh.position.copy(position);
    planeMesh.position.addScaledVector(normal, 0.005);

    // Build orientation from basis vectors (same as DecalGeometry approach)
    const normalNorm = normal.clone().normalize();
    let xAxis, yAxis, zAxis;
    zAxis = normalNorm.clone();

    if (velocity && velocity.lengthSq() > 0)
    {
      // Project velocity onto surface to get stretch direction
      const velocityDir = velocity.clone().normalize();
      const dotVN = velocityDir.dot(normalNorm);
      const projectedVel = velocityDir.clone().addScaledVector(normalNorm, -dotVN);

      if (projectedVel.lengthSq() > 0.0001)
      {
        xAxis = projectedVel.normalize();
        yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
        xAxis.crossVectors(yAxis, zAxis).normalize();
      }
      else
      {
        // Velocity is perpendicular to surface - use arbitrary orientation
        const arbitrary = Math.abs(normalNorm.y) < 0.9 ?
          new THREE.Vector3(0, 1, 0) :
          new THREE.Vector3(1, 0, 0);
        yAxis = new THREE.Vector3().crossVectors(zAxis, arbitrary).normalize();
        xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
      }
    }
    else
    {
      // No velocity - use arbitrary orientation
      const arbitrary = Math.abs(normalNorm.y) < 0.9 ?
        new THREE.Vector3(0, 1, 0) :
        new THREE.Vector3(1, 0, 0);
      yAxis = new THREE.Vector3().crossVectors(zAxis, arbitrary).normalize();
      xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    }

    // Build rotation matrix and apply
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(xAxis, yAxis, zAxis);
    planeMesh.quaternion.setFromRotationMatrix(rotMatrix);

    return planeMesh;
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
      if (decal.geometry) decal.geometry.dispose();
    }
    ImpactMarkFactory.decals = [];
  }

  /**
   * Dispose all resources
   */
  static dispose()
  {
    ImpactMarkFactory.deleteAll();

    if (ImpactMarkFactory.texture)
    {
      ImpactMarkFactory.texture.dispose();
      ImpactMarkFactory.texture = null;
    }

    for (const material of ImpactMarkFactory.materials.values())
    {
      material.dispose();
    }
    ImpactMarkFactory.materials.clear();

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