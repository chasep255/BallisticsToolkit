import * as THREE from 'three';

/**
 * ImpactMarkFactory - Manages bullet impact marks using a single InstancedMesh
 * 
 * Uses a pool of instances for efficiency (one draw call for all marks).
 * Marks persist until simulation restart. When pool is full, oldest marks are recycled.
 * Supports per-instance colors and sizes for different surface types.
 */
export class ImpactMarkFactory
{
  static MAX_MARKS = 500;
  static MARK_RADIUS = 0.05; // Base radius 5cm (scaled per-instance)
  static MARK_OFFSET = 0.01; // 1cm offset from surface to prevent z-fighting

  // Static state
  static scene = null;
  static mesh = null;
  static geometry = null;
  static material = null;
  static texture = null;
  static count = 0; // Current number of marks
  static nextIndex = 0; // Next index to write to (wraps around)

  // Stretch limits
  static MAX_STRETCH = 4.0; // Maximum elongation ratio
  static MIN_COS_ANGLE = 0.15; // Minimum cos(angle) to prevent infinite stretch

  // Temporary objects for matrix calculations (reused to avoid allocations)
  static _matrix = new THREE.Matrix4();
  static _position = new THREE.Vector3();
  static _quaternion = new THREE.Quaternion();
  static _scale = new THREE.Vector3(1, 1, 1);
  static _up = new THREE.Vector3(0, 1, 0);
  static _color = new THREE.Color();
  static _velocityDir = new THREE.Vector3();
  static _projectedVelocity = new THREE.Vector3();
  static _rotationMatrix = new THREE.Matrix4();

  /**
   * Create a procedural splat texture using canvas
   * Creates a circular gradient with rough edges for a natural dirt splatter look
   */
  static createSplatTexture()
  {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 4;

    // Create radial gradient for soft edges
    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, radius
    );

    // White color (will be tinted by instance color), varying alpha
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    // Draw main splat
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Add some noise/texture for a more natural look
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4)
    {
      // Add slight noise to alpha channel
      const noise = (Math.random() - 0.5) * 30;
      data[i + 3] = Math.max(0, Math.min(255, data[i + 3] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Initialize the factory with a scene
   * Must be called before creating any marks
   * @param {THREE.Scene} scene - The Three.js scene
   */
  static init(scene)
  {
    if (ImpactMarkFactory.mesh)
    {
      // Already initialized, just update scene reference
      ImpactMarkFactory.scene = scene;
      return;
    }

    ImpactMarkFactory.scene = scene;

    // Create procedural splat texture
    ImpactMarkFactory.texture = ImpactMarkFactory.createSplatTexture();

    // Create shared geometry - plane for proper UV mapping
    ImpactMarkFactory.geometry = new THREE.PlaneGeometry(
      ImpactMarkFactory.MARK_RADIUS * 2,
      ImpactMarkFactory.MARK_RADIUS * 2
    );

    // Create shared material with texture and per-instance colors
    ImpactMarkFactory.material = new THREE.MeshBasicMaterial({
      map: ImpactMarkFactory.texture,
      color: 0xffffff, // White base, tinted by instance color
      transparent: true,
      side: THREE.DoubleSide, // Visible from both sides
      depthWrite: false, // Prevent z-fighting with transparent objects
      alphaTest: 0.01 // Discard nearly transparent pixels
    });

    // Create instanced mesh
    ImpactMarkFactory.mesh = new THREE.InstancedMesh(
      ImpactMarkFactory.geometry,
      ImpactMarkFactory.material,
      ImpactMarkFactory.MAX_MARKS
    );

    // Enable per-instance colors
    ImpactMarkFactory.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(ImpactMarkFactory.MAX_MARKS * 3),
      3
    );

    // Initially hide all instances by setting count to 0
    ImpactMarkFactory.mesh.count = 0;
    ImpactMarkFactory.mesh.frustumCulled = false; // Don't cull - marks are small and scattered

    // Add to scene
    scene.add(ImpactMarkFactory.mesh);

    ImpactMarkFactory.count = 0;
    ImpactMarkFactory.nextIndex = 0;
  }

  /**
   * Create a new impact mark at the specified position
   * @param {Object} options
   * @param {THREE.Vector3} options.position - Impact position in world space
   * @param {THREE.Vector3} options.normal - Surface normal at impact point
   * @param {THREE.Vector3} options.velocity - Bullet velocity at impact (optional, for stretch calculation)
   * @param {THREE.Color|number} options.color - Optional color (default: dark brown)
   * @param {number} options.size - Optional size multiplier (default: 1.0)
   */
  static create(options)
  {
    const { position, normal, velocity, color, size = 1.0 } = options;

    if (!ImpactMarkFactory.mesh)
    {
      console.error('[ImpactMarkFactory] Not initialized. Call init(scene) first.');
      return;
    }

    // Calculate position offset slightly above surface
    ImpactMarkFactory._position.copy(position);
    ImpactMarkFactory._position.addScaledVector(normal, ImpactMarkFactory.MARK_OFFSET);

    // Normalize the surface normal
    const normalNorm = normal.clone().normalize();

    // Calculate stretch based on impact angle if velocity is provided
    let stretchX = 1.0;
    let stretchY = 1.0;

    // Project velocity onto surface plane to get stretch direction
    let stretchDir = null;
    
    if (velocity && velocity.lengthSq() > 0)
    {
      // Get velocity direction
      ImpactMarkFactory._velocityDir.copy(velocity).normalize();

      // Calculate angle between velocity and surface normal
      // cosAngle = |dot(velocityDir, normal)| (absolute because we care about angle magnitude)
      const cosAngle = Math.abs(ImpactMarkFactory._velocityDir.dot(normalNorm));

      // Clamp cosAngle to prevent infinite stretch at grazing angles
      const clampedCos = Math.max(cosAngle, ImpactMarkFactory.MIN_COS_ANGLE);

      // Stretch factor: perpendicular hit (cos=1) -> stretch=1, grazing hit (cos~0) -> more stretch
      const stretch = Math.min(1.0 / clampedCos, ImpactMarkFactory.MAX_STRETCH);

      stretchX = stretch;
      stretchY = 1.0;

      // Project velocity onto surface plane: projectedVel = velocity - normal * dot(velocity, normal)
      const dotVN = ImpactMarkFactory._velocityDir.dot(normalNorm);
      ImpactMarkFactory._projectedVelocity.copy(ImpactMarkFactory._velocityDir);
      ImpactMarkFactory._projectedVelocity.addScaledVector(normalNorm, -dotVN);

      if (ImpactMarkFactory._projectedVelocity.lengthSq() > 0.0001)
      {
        stretchDir = ImpactMarkFactory._projectedVelocity.clone().normalize();
      }
    }

    // Build rotation matrix using basis vectors
    // We want: local X = stretch direction, local Y = perpendicular, local Z = surface normal
    // PlaneGeometry lies in XY plane facing +Z, so after rotation:
    // - Plane faces along surface normal
    // - X axis (stretch) aligns with projected velocity
    
    let xAxis, yAxis, zAxis;
    zAxis = normalNorm.clone(); // Plane faces along normal
    
    if (stretchDir)
    {
      // X axis is the stretch direction (projected velocity)
      xAxis = stretchDir.clone();
      // Y axis is perpendicular to both (cross product)
      yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
      // Re-orthogonalize X to ensure perfect orthonormality
      xAxis.crossVectors(yAxis, zAxis).normalize();
    }
    else
    {
      // No velocity - use arbitrary orientation
      // Pick an arbitrary vector not parallel to normal
      const arbitrary = Math.abs(normalNorm.y) < 0.9 
        ? new THREE.Vector3(0, 1, 0) 
        : new THREE.Vector3(1, 0, 0);
      yAxis = new THREE.Vector3().crossVectors(zAxis, arbitrary).normalize();
      xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    }

    // Build rotation matrix from basis vectors and extract quaternion
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(xAxis, yAxis, zAxis);
    ImpactMarkFactory._quaternion.setFromRotationMatrix(rotMatrix);

    // Apply size and stretch scaling
    ImpactMarkFactory._scale.set(size * stretchX, size * stretchY, size);

    // Compose transformation matrix
    ImpactMarkFactory._matrix.compose(
      ImpactMarkFactory._position,
      ImpactMarkFactory._quaternion,
      ImpactMarkFactory._scale
    );

    // Set instance matrix
    const index = ImpactMarkFactory.nextIndex;
    ImpactMarkFactory.mesh.setMatrixAt(index, ImpactMarkFactory._matrix);
    ImpactMarkFactory.mesh.instanceMatrix.needsUpdate = true;

    // Set instance color (default to dark brown if not provided)
    if (color instanceof THREE.Color)
    {
      ImpactMarkFactory._color.copy(color);
    }
    else if (color !== undefined)
    {
      ImpactMarkFactory._color.set(color);
    }
    else
    {
      ImpactMarkFactory._color.set(0x3d2817); // Default dark brown
    }
    ImpactMarkFactory.mesh.setColorAt(index, ImpactMarkFactory._color);
    ImpactMarkFactory.mesh.instanceColor.needsUpdate = true;

    // Update indices
    ImpactMarkFactory.nextIndex = (ImpactMarkFactory.nextIndex + 1) % ImpactMarkFactory.MAX_MARKS;
    
    // Update visible count (grows until we hit max, then stays at max)
    if (ImpactMarkFactory.count < ImpactMarkFactory.MAX_MARKS)
    {
      ImpactMarkFactory.count++;
      ImpactMarkFactory.mesh.count = ImpactMarkFactory.count;
    }
  }

  /**
   * Delete all impact marks
   */
  static deleteAll()
  {
    if (ImpactMarkFactory.mesh)
    {
      ImpactMarkFactory.mesh.count = 0;
      ImpactMarkFactory.count = 0;
      ImpactMarkFactory.nextIndex = 0;
    }
  }

  /**
   * Dispose all resources
   */
  static dispose()
  {
    if (ImpactMarkFactory.mesh && ImpactMarkFactory.scene)
    {
      ImpactMarkFactory.scene.remove(ImpactMarkFactory.mesh);
    }

    if (ImpactMarkFactory.geometry)
    {
      ImpactMarkFactory.geometry.dispose();
      ImpactMarkFactory.geometry = null;
    }

    if (ImpactMarkFactory.texture)
    {
      ImpactMarkFactory.texture.dispose();
      ImpactMarkFactory.texture = null;
    }

    if (ImpactMarkFactory.material)
    {
      ImpactMarkFactory.material.dispose();
      ImpactMarkFactory.material = null;
    }

    if (ImpactMarkFactory.mesh)
    {
      ImpactMarkFactory.mesh.dispose();
      ImpactMarkFactory.mesh = null;
    }

    ImpactMarkFactory.scene = null;
    ImpactMarkFactory.count = 0;
    ImpactMarkFactory.nextIndex = 0;
  }

  /**
   * Get current mark count
   * @returns {number} Number of active marks
   */
  static getCount()
  {
    return ImpactMarkFactory.count;
  }
}

