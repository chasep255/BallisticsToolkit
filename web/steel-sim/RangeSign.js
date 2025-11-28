import * as THREE from 'three';
import
{
  mergeGeometries
}
from 'three/addons/utils/BufferGeometryUtils.js';
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
 * RangeSign - A sign that displays the distance to a target rack in yards
 * Positioned next to target racks to show range information
 */
export class RangeSign
{
  /**
   * Create a range sign
   * @param {Object} options
   * @param {THREE.Vector3} options.position - Position in world space (meters)
   * @param {string} options.text - Text to display on sign
   * @param {THREE.Scene} options.scene - Three.js scene
   * @param {Object} options.config - Optional config overrides
   */
  constructor(options)
  {
    const
    {
      position,
      text,
      scene,
      textureManager = null,
      config = {}
    } = options;

    this.scene = scene;
    this.text = text;
    this.group = new THREE.Group();

    // Get dimensions from config (allow overrides)
    const postHeight = config.postHeight || Config.RANGE_SIGN_CONFIG.postHeight;
    const postWidth = config.postWidth || Config.RANGE_SIGN_CONFIG.postWidth;
    const postGeometry = new THREE.BoxGeometry(postWidth, postHeight, postWidth);

    // Use bark textures if available, otherwise fallback to plain color
    let postMaterial;
    if (textureManager)
    {
      const barkColor = textureManager.getTexture('bark_color');
      const barkNormal = textureManager.getTexture('bark_normal');
      const barkRoughness = textureManager.getTexture('bark_roughness');

      // Configure texture repeat for vertical bark pattern
      [barkColor, barkNormal, barkRoughness].forEach(texture =>
      {
        if (texture)
        {
          texture.repeat.set(0.5, 2.0); // Vertical bark pattern
        }
      });

      postMaterial = new THREE.MeshStandardMaterial(
      {
        map: barkColor,
        normalMap: barkNormal,
        roughnessMap: barkRoughness,
        color: 0x8b4513, // Brown wood color tint
        roughness: 1.0,
        metalness: 0.0
      });
    }
    else
    {
      // Fallback to plain color if textures not available
      postMaterial = new THREE.MeshStandardMaterial(
      {
        color: 0x8b4513, // Brown wood color
        roughness: 0.9,
        metalness: 0.0
      });
    }
    this.postMesh = new THREE.Mesh(postGeometry, postMaterial);
    this.postMesh.position.y = postHeight / 2;
    this.postMesh.castShadow = true;
    this.postMesh.receiveShadow = true;
    this.group.add(this.postMesh);

    // Create text canvas texture first
    this.createTextTexture(text);

    // Create sign board with text texture applied
    const signWidth = config.signWidth || Config.RANGE_SIGN_CONFIG.signWidth;
    const signHeight = config.signHeight || Config.RANGE_SIGN_CONFIG.signHeight;
    const signThickness = config.signThickness || Config.RANGE_SIGN_CONFIG.signThickness;
    const signGeometry = new THREE.BoxGeometry(signWidth, signHeight, signThickness);
    const signMaterial = new THREE.MeshStandardMaterial(
    {
      map: this.textTexture, // Apply text texture directly to sign board
      color: 0xffffff, // White background
      roughness: 0.5,
      metalness: 0.1,
      transparent: true // Allow transparency for text
    });
    this.signBoardMesh = new THREE.Mesh(signGeometry, signMaterial);
    this.signBoardMesh.position.y = postHeight - signHeight / 2 - 0.05; // Near top of post
    this.signBoardMesh.position.x = 0;
    this.signBoardMesh.position.z = 0;
    this.signBoardMesh.castShadow = true;
    this.signBoardMesh.receiveShadow = true;
    this.group.add(this.signBoardMesh);

    // Position the post behind the sign (in local space, before rotation)
    this.postMesh.position.z = -postWidth / 2 - signThickness / 2;

    // Position and orient the entire group
    this.group.position.copy(position);
    // Don't rotate - signs face in positive Z direction by default, which is towards the shooter
    // (negative Z is downrange, positive Z is back towards shooter)

    // Add to scene
    scene.add(this.group);
  }

  /**
   * Create a canvas texture with the text
   * @param {string} text - Text to display
   */
  createTextTexture(text)
  {
    const canvas = document.createElement('canvas');
    canvas.width = Config.RANGE_SIGN_CONFIG.canvasWidth;
    canvas.height = Config.RANGE_SIGN_CONFIG.canvasHeight;
    const ctx = canvas.getContext('2d');

    // Clear background (transparent)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw text
    ctx.fillStyle = '#000000'; // Black text
    ctx.font = Config.RANGE_SIGN_CONFIG.textFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    // Create texture
    this.textTexture = new THREE.CanvasTexture(canvas);
    this.textTexture.needsUpdate = true;
  }

  /**
   * Get the meshes (post and sign board) for collision detection
   * @returns {THREE.Mesh[]} Array of meshes
   */
  getMeshes()
  {
    const meshes = [];
    if (this.postMesh) meshes.push(this.postMesh);
    if (this.signBoardMesh) meshes.push(this.signBoardMesh);
    return meshes;
  }

  /**
   * Get the group containing all meshes (for world transform)
   * @returns {THREE.Group}
   */
  getGroup()
  {
    return this.group;
  }

  /**
   * Register meshes with the impact detector
   * @param {ImpactDetector} impactDetector - The impact detector to register with
   */
  registerWithImpactDetector(impactDetector)
  {
    if (!impactDetector) return;

    const meshes = this.getMeshes();
    this.group.updateMatrixWorld();

    for (const mesh of meshes)
    {
      // Clone geometry and apply world transform
      const transformedGeometry = mesh.geometry.clone();
      mesh.updateMatrixWorld();
      transformedGeometry.applyMatrix4(mesh.matrixWorld);

      // Determine if this is the wood post or sign board
      const isPost = mesh === this.postMesh;

      impactDetector.addMeshFromGeometry(
        transformedGeometry,
        {
          name: isPost ? 'SignPost' : 'SignBoard',
          soundName: null, // Signs are silent (wood/plastic)
          mesh: mesh, // Store mesh reference for decal projection
          onImpact: (impactPosition, normal, velocity, scene, windGenerator, targetMesh) =>
          {
            const pos = new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z);

            // Wood splinter dust for post, white dust for sign board
            const dustConfig = isPost ? Config.WOOD_DUST_CONFIG : Config.SIGN_BOARD_DUST_CONFIG;
            DustCloudFactory.create(
            {
              position: pos,
              scene: scene,
              numParticles: dustConfig.numParticles,
              color: dustConfig.color,
              initialRadius: dustConfig.initialRadius,
              growthRate: dustConfig.growthRate,
              particleDiameter: dustConfig.particleDiameter
            });

            if (isPost)
            {
              // Light tan patch for wood post
              ImpactMarkFactory.create(
              {
                position: pos,
                normal: normal,
                mesh: targetMesh,
                color: 0xd4c4a8, // Light tan
                size: 0.2 // 2.5cm patch
              });
            }
            else
            {
              // Small dark impact mark for sign board
              ImpactMarkFactory.create(
              {
                position: pos,
                normal: normal,
                mesh: targetMesh,
                color: 0x404040, // Dark grey for sign
                size: 0.2 // 1cm
              });
            }
          }
        }
      );
    }
  }

  /**
   * Dispose of the sign and clean up resources
   */
  dispose()
  {
    if (this.textTexture)
    {
      this.textTexture.dispose();
    }

    // Remove from scene and dispose geometry/materials
    this.group.traverse((object) =>
    {
      if (object.geometry) object.geometry.dispose();
      if (object.material)
      {
        if (Array.isArray(object.material))
        {
          object.material.forEach(mat => mat.dispose());
        }
        else
        {
          object.material.dispose();
        }
      }
    });

    this.scene.remove(this.group);
  }
}

/**
 * Factory for managing range signs
 */
export class RangeSignFactory
{
  static signs = [];
  static mergedPostMesh = null;
  static mergedSignBoardMesh = null;
  static textureAtlas = null;
  static scene = null;

  /**
   * Create a range sign
   * @param {Object} options - Same as RangeSign constructor
   * @returns {RangeSign}
   */
  static create(options)
  {
    const sign = new RangeSign(options);
    this.signs.push(sign);
    return sign;
  }

  /**
   * Merge all signs into single meshes with a texture atlas for text
   * @param {THREE.Scene} scene - Three.js scene
   * @param {Object} impactDetector - Impact detector instance (optional)
   */
  static mergeSigns(scene, impactDetector = null)
  {
    if (this.signs.length === 0) return;

    // Store scene reference for cleanup
    this.scene = scene;

    // Create texture atlas with all text
    this.createTextureAtlas();

    // Collect geometries for merging
    const postGeometries = [];
    const signBoardGeometries = [];
    let postMaterial = null;
    let signBoardMaterial = null;

    const canvasWidth = Config.RANGE_SIGN_CONFIG.canvasWidth;
    const canvasHeight = Config.RANGE_SIGN_CONFIG.canvasHeight;

    // Calculate atlas layout (assume square-ish layout)
    const cols = Math.ceil(Math.sqrt(this.signs.length));
    const rows = Math.ceil(this.signs.length / cols);
    const atlasWidth = cols * canvasWidth;
    const atlasHeight = rows * canvasHeight;

    // UV scale factors for mapping to atlas
    const uScale = canvasWidth / atlasWidth;
    const vScale = canvasHeight / atlasHeight;

    for (let i = 0; i < this.signs.length; i++)
    {
      const sign = this.signs[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      // Calculate UV offset for this sign in the atlas
      const uOffset = col * uScale;
      const vOffset = 1.0 - (row + 1) * vScale; // Flip V coordinate

      // Update group matrix world before processing
      sign.group.updateMatrixWorld();

      // Process post
      if (sign.postMesh)
      {
        const clonedPostGeom = sign.postMesh.geometry.clone();
        sign.postMesh.updateMatrixWorld();
        clonedPostGeom.applyMatrix4(sign.postMesh.matrixWorld);
        postGeometries.push(clonedPostGeom);
        if (!postMaterial)
        {
          postMaterial = sign.postMesh.material;
        }
      }

      // Process sign board with UV remapping for texture atlas
      if (sign.signBoardMesh)
      {
        const clonedBoardGeom = sign.signBoardMesh.geometry.clone();
        sign.signBoardMesh.updateMatrixWorld();
        clonedBoardGeom.applyMatrix4(sign.signBoardMesh.matrixWorld);

        // Remap UVs to point to this sign's region in the atlas
        // BoxGeometry has 6 faces, we need to remap the front face (facing +Z) to the text region
        // Other faces should map to a white region (we'll use the first sign's region which is white)
        const uvAttribute = clonedBoardGeom.attributes.uv;
        if (uvAttribute)
        {
          // BoxGeometry UV layout: each face has 4 vertices
          // Face order: right (+X), left (-X), top (+Y), bottom (-Y), front (+Z), back (-Z)
          // Front face is indices 16-19 (4 vertices * 4 faces before it)
          const frontFaceStart = 16;
          const frontFaceEnd = 20;
          
          // Use first sign's region for non-front faces (white background)
          const whiteUOffset = 0;
          const whiteVOffset = 1.0 - vScale; // First row, flipped
          
          for (let j = 0; j < uvAttribute.count; j++)
          {
            const u = uvAttribute.getX(j);
            const v = uvAttribute.getY(j);
            
            if (j >= frontFaceStart && j < frontFaceEnd)
            {
              // Front face: map to this sign's text region in the atlas
              uvAttribute.setXY(j, uOffset + u * uScale, vOffset + v * vScale);
            }
            else
            {
              // Other faces: map to white region (first sign's region)
              uvAttribute.setXY(j, whiteUOffset + u * uScale, whiteVOffset + v * vScale);
            }
          }
          uvAttribute.needsUpdate = true;
        }

        signBoardGeometries.push(clonedBoardGeom);
        if (!signBoardMaterial)
        {
          signBoardMaterial = sign.signBoardMesh.material;
        }
      }

      // Remove sign group from scene (this removes all children)
      scene.remove(sign.group);
    }

    // Merge posts
    if (postGeometries.length > 0)
    {
      const mergedPostGeometry = mergeGeometries(postGeometries);
      this.mergedPostMesh = new THREE.Mesh(mergedPostGeometry, postMaterial);
      this.mergedPostMesh.castShadow = true;
      this.mergedPostMesh.receiveShadow = true;
      scene.add(this.mergedPostMesh);
    }

    // Merge sign boards with texture atlas
    if (signBoardGeometries.length > 0)
    {
      const mergedBoardGeometry = mergeGeometries(signBoardGeometries);
      // Create material with texture atlas
      const boardMaterialWithAtlas = signBoardMaterial.clone();
      boardMaterialWithAtlas.map = this.textureAtlas;
      this.mergedSignBoardMesh = new THREE.Mesh(mergedBoardGeometry, boardMaterialWithAtlas);
      this.mergedSignBoardMesh.castShadow = true;
      this.mergedSignBoardMesh.receiveShadow = true;
      scene.add(this.mergedSignBoardMesh);
    }

    // Register merged meshes for impact detection
    if (impactDetector)
    {
      if (this.mergedPostMesh)
      {
        const impactGeometry = this.mergedPostMesh.geometry.clone();
        impactDetector.addMeshFromGeometry(
          impactGeometry,
          {
            name: 'SignPost',
            soundName: null,
            mesh: this.mergedPostMesh,
            onImpact: (impactPosition, normal, velocity, scene, windGenerator, targetMesh) =>
            {
              const pos = new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z);
              DustCloudFactory.create(
              {
                position: pos,
                scene: scene,
                numParticles: Config.WOOD_DUST_CONFIG.numParticles,
                color: Config.WOOD_DUST_CONFIG.color,
                initialRadius: Config.WOOD_DUST_CONFIG.initialRadius,
                growthRate: Config.WOOD_DUST_CONFIG.growthRate,
                particleDiameter: Config.WOOD_DUST_CONFIG.particleDiameter
              });
              ImpactMarkFactory.create(
              {
                position: pos,
                normal: normal,
                mesh: targetMesh,
                color: 0xd4c4a8,
                size: 0.2
              });
            }
          }
        );
      }

      if (this.mergedSignBoardMesh)
      {
        const impactGeometry = this.mergedSignBoardMesh.geometry.clone();
        impactDetector.addMeshFromGeometry(
          impactGeometry,
          {
            name: 'SignBoard',
            soundName: null,
            mesh: this.mergedSignBoardMesh,
            onImpact: (impactPosition, normal, velocity, scene, windGenerator, targetMesh) =>
            {
              const pos = new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z);
              DustCloudFactory.create(
              {
                position: pos,
                scene: scene,
                numParticles: Config.SIGN_BOARD_DUST_CONFIG.numParticles,
                color: Config.SIGN_BOARD_DUST_CONFIG.color,
                initialRadius: Config.SIGN_BOARD_DUST_CONFIG.initialRadius,
                growthRate: Config.SIGN_BOARD_DUST_CONFIG.growthRate,
                particleDiameter: Config.SIGN_BOARD_DUST_CONFIG.particleDiameter
              });
              ImpactMarkFactory.create(
              {
                position: pos,
                normal: normal,
                mesh: targetMesh,
                color: 0x404040,
                size: 0.2
              });
            }
          }
        );
      }
    }

    // Dispose original geometries
    for (const sign of this.signs)
    {
      if (sign.textTexture) sign.textTexture.dispose();
      if (sign.postMesh && sign.postMesh.geometry) sign.postMesh.geometry.dispose();
      if (sign.signBoardMesh && sign.signBoardMesh.geometry) sign.signBoardMesh.geometry.dispose();
    }
  }

  /**
   * Create a texture atlas containing all sign text
   */
  static createTextureAtlas()
  {
    const canvasWidth = Config.RANGE_SIGN_CONFIG.canvasWidth;
    const canvasHeight = Config.RANGE_SIGN_CONFIG.canvasHeight;

    // Calculate atlas layout
    const cols = Math.ceil(Math.sqrt(this.signs.length));
    const rows = Math.ceil(this.signs.length / cols);
    const atlasWidth = cols * canvasWidth;
    const atlasHeight = rows * canvasHeight;

    // Create canvas for atlas
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = atlasWidth;
    atlasCanvas.height = atlasHeight;
    const atlasCtx = atlasCanvas.getContext('2d');

    // Fill entire atlas with white background
    atlasCtx.fillStyle = '#ffffff';
    atlasCtx.fillRect(0, 0, atlasWidth, atlasHeight);

    // Draw each sign's text into the atlas
    for (let i = 0; i < this.signs.length; i++)
    {
      const sign = this.signs[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * canvasWidth;
      const y = row * canvasHeight;

      // Draw text on white background
      atlasCtx.fillStyle = '#000000';
      atlasCtx.font = Config.RANGE_SIGN_CONFIG.textFont;
      atlasCtx.textAlign = 'center';
      atlasCtx.textBaseline = 'middle';
      atlasCtx.fillText(sign.text, x + canvasWidth / 2, y + canvasHeight / 2);
    }

    // Create texture from atlas
    this.textureAtlas = new THREE.CanvasTexture(atlasCanvas);
    this.textureAtlas.needsUpdate = true;
  }

  /**
   * Delete all range signs
   */
  static deleteAll()
  {
    for (const sign of this.signs)
    {
      sign.dispose();
    }
    this.signs = [];

    // Dispose merged meshes
    if (this.mergedPostMesh && this.scene)
    {
      this.scene.remove(this.mergedPostMesh);
      if (this.mergedPostMesh.geometry) this.mergedPostMesh.geometry.dispose();
      if (this.mergedPostMesh.material) this.mergedPostMesh.material.dispose();
      this.mergedPostMesh = null;
    }

    if (this.mergedSignBoardMesh && this.scene)
    {
      this.scene.remove(this.mergedSignBoardMesh);
      if (this.mergedSignBoardMesh.geometry) this.mergedSignBoardMesh.geometry.dispose();
      if (this.mergedSignBoardMesh.material) this.mergedSignBoardMesh.material.dispose();
      this.mergedSignBoardMesh = null;
    }

    if (this.textureAtlas)
    {
      this.textureAtlas.dispose();
      this.textureAtlas = null;
    }

    this.scene = null;
  }

  /**
   * Get all range signs
   * @returns {RangeSign[]}
   */
  static getAll()
  {
    return this.signs;
  }
}