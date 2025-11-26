import * as THREE from 'three';
import
{
  Config
}
from './config.js';

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
      config = {}
    } = options;

    this.scene = scene;
    this.text = text;
    this.group = new THREE.Group();

    // Get dimensions from config (allow overrides)
    const postHeight = config.postHeight || Config.RANGE_SIGN_CONFIG.postHeight;
    const postWidth = config.postWidth || Config.RANGE_SIGN_CONFIG.postWidth;
    const postGeometry = new THREE.BoxGeometry(postWidth, postHeight, postWidth);
    const postMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x8b4513, // Brown wood color
      roughness: 0.9,
      metalness: 0.0
    });
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.y = postHeight / 2;
    post.castShadow = true;
    post.receiveShadow = true;
    this.group.add(post);

    // Create sign board (white background)
    const signWidth = config.signWidth || Config.RANGE_SIGN_CONFIG.signWidth;
    const signHeight = config.signHeight || Config.RANGE_SIGN_CONFIG.signHeight;
    const signThickness = config.signThickness || Config.RANGE_SIGN_CONFIG.signThickness;
    const signGeometry = new THREE.BoxGeometry(signWidth, signHeight, signThickness);
    const signMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0xffffff, // White
      roughness: 0.5,
      metalness: 0.1
    });
    const signBoard = new THREE.Mesh(signGeometry, signMaterial);
    signBoard.position.y = postHeight - signHeight / 2 - 0.05; // Near top of post
    signBoard.position.x = 0;
    signBoard.position.z = 0;
    signBoard.castShadow = true;
    signBoard.receiveShadow = true;
    this.group.add(signBoard);

    // Create text canvas texture
    this.createTextTexture(text);

    // Create text plane on sign (facing forward in local space)
    const textGeometry = new THREE.PlaneGeometry(signWidth * 0.9, signHeight * 0.9);
    const textMaterial = new THREE.MeshBasicMaterial(
    {
      map: this.textTexture,
      transparent: true,
      depthTest: true,
      depthWrite: false
    });
    const textPlane = new THREE.Mesh(textGeometry, textMaterial);
    textPlane.position.y = signBoard.position.y;
    textPlane.position.x = 0;
    textPlane.position.z = signThickness / 2 + 0.002; // In front of sign board
    this.group.add(textPlane);

    // Position the post behind the sign (in local space, before rotation)
    post.position.z = -postWidth / 2 - signThickness / 2;

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
   * Delete all range signs
   */
  static deleteAll()
  {
    for (const sign of this.signs)
    {
      sign.dispose();
    }
    this.signs = [];
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