/**
 * VirtualCoordinates - Resolution-independent coordinate system
 * 
 * Provides a fixed virtual coordinate space that Three.js orthographic camera
 * maps to any canvas size automatically. This is the game-dev standard approach
 * for resolution-independent UI.
 * 
 * Coordinate System:
 * - Horizontal: -100 to +100 (200 units wide)
 * - Vertical: -75 to +75 (150 units tall, maintains 4:3 aspect ratio)
 * - Origin: Center of screen (0, 0)
 * - Top-right corner: (100, 75)
 * - Bottom-left corner: (-100, -75)
 */

export class VirtualCoordinates
{
  // Virtual viewport dimensions
  static WIDTH = 200; // -100 to +100
  static HEIGHT = 150; // -75 to +75 (maintains 4:3 aspect ratio)

  // Edge positions
  static RIGHT = 100;
  static LEFT = -100;
  static TOP = 75;
  static BOTTOM = -75;

  // Standard margins (in virtual units)
  static MARGIN_SMALL = 2;
  static MARGIN_MEDIUM = 4;
  static MARGIN_LARGE = 8;

  /**
   * Calculate X position from right edge
   * @param {number} offset - Offset from right edge in virtual units
   * @returns {number} X coordinate
   */
  static fromRight(offset)
  {
    return this.RIGHT - offset;
  }

  /**
   * Calculate X position from left edge
   * @param {number} offset - Offset from left edge in virtual units
   * @returns {number} X coordinate
   */
  static fromLeft(offset)
  {
    return this.LEFT + offset;
  }

  /**
   * Calculate Y position from top edge
   * @param {number} offset - Offset from top edge in virtual units
   * @returns {number} Y coordinate
   */
  static fromTop(offset)
  {
    return this.TOP - offset;
  }

  /**
   * Calculate Y position from bottom edge
   * @param {number} offset - Offset from bottom edge in virtual units
   * @returns {number} Y coordinate
   */
  static fromBottom(offset)
  {
    return this.BOTTOM + offset;
  }
}