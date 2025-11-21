/**
 * Configuration module for Steel Target Simulator
 * Centralized constants used throughout the application
 */

// ===== CAMERA & SCENE CONSTANTS =====
export const SHOOTER_HEIGHT = 10; // yards - elevated shooter overlooking the landscape
export const CAMERA_FOV = 50; // degrees
export const CAMERA_FAR_PLANE = 2500; // yards - Tightened for better depth precision (landscape is 2000, targets max at ~1760)

// ===== BULLET CONSTANTS =====
export const BULLET_MASS = 0.00907; // kg - 140 grains
export const BULLET_DIAMETER = 0.00762; // meters - .308 caliber
export const BULLET_LENGTH = 0.0305; // meters - ~30mm typical
export const BULLET_BC = 0.3; // Ballistic coefficient
export const BULLET_SPEED_MPS = 800; // m/s - Muzzle velocity

// ===== DUST CLOUD CONFIGURATIONS =====
export const GROUND_DUST_CONFIG = {
  numParticles: 1000,
  color: {
    r: 139,
    g: 115,
    b: 85
  }, // Brown/tan
  initialRadius: 3, // inches - realistic bullet impact dust cloud
  growthRate: 0.1, // feet/second
  particleDiameter: 0.2 // inches
};

export const METAL_DUST_CONFIG = {
  numParticles: 250,
  color: {
    r: 192,
    g: 192,
    b: 192
  }, // Silver/gray
  initialRadius: 1, // inches
  growthRate: 1.0, // feet/second
  particleDiameter: 0.2 // inches
};

// ===== LANDSCAPE CONFIGURATION =====
export const LANDSCAPE_CONFIG = {
  groundWidth: 100, // yards - Green ground width
  groundLength: 2000, // yards - Green ground length
  brownGroundWidth: 1000, // yards - Brown ground width
  brownGroundLength: 2500 // yards - Extended to cover mountains (up to 2400 yards)
};

// ===== WIND GENERATOR CONFIGURATION =====
export const WIND_CONFIG = {
  boxPadding: 50, // yards - padding on all sides of wind sampling box
  boxHeight: 100, // yards - height for elevated sampling
  defaultPreset: 'Moderate' // Default wind preset name
};

// ===== ENVIRONMENT CONFIGURATIONS =====
export const MOUNTAIN_CONFIG = {
  count: 16,
  heightMin: 50, // yards
  heightMax: 150, // yards
  distanceMin: 2000, // yards
  distanceMax: 2500 // yards
};

export const TREE_CONFIG = {
  sideMinDistance: 30, // yards from center
  sideMaxDistance: 110, // yards from center
  behindTargetWidth: 80, // yards
  behindTargetMin: 10, // yards behind targets
  behindTargetMax: 130, // yards behind targets
  countSides: 160,
  countBehind: 80
};

export const ROCK_CONFIG = {
  count: 40,
  sizeMin: 0.2, // yards
  sizeMax: 0.6 // yards
};

export const MARKER_CONFIG = {
  count: 15,
  heightMin: 1.0, // yards
  heightMax: 1.5 // yards
};

// ===== TARGET RACK CONFIGURATIONS =====
export const TARGET_RACKS_CONFIG = [
  {
    x: 0,
    z: -200,
    rackWidth: 1.5,
    rackHeight: 1,
    targets: [
      { width: 5, height: 5, thickness: 0.5, isOval: false },
      { width: 4, height: 4, thickness: 0.5, isOval: false },
      { width: 3, height: 3, thickness: 0.5, isOval: false },
      { width: 2, height: 2, thickness: 0.5, isOval: false }
    ]
  },
  {
    x: 10,
    z: -225,
    rackWidth: 1.5,
    rackHeight: 1,
    targets: [
      { width: 6, height: 6, thickness: 0.5, isOval: true },
      { width: 5, height: 5, thickness: 0.5, isOval: true },
      { width: 4, height: 4, thickness: 0.5, isOval: true },
      { width: 3, height: 3, thickness: 0.5, isOval: true }
    ]
  },
  {
    x: 5,
    z: -500,
    rackWidth: 1.5,
    rackHeight: 1,
    targets: [
      { width: 10, height: 10, thickness: 0.5, isOval: true },
      { width: 5, height: 5, thickness: 0.5, isOval: true },
      { width: 3, height: 3, thickness: 0.5, isOval: true }
    ]
  },
  {
    x: -5,
    z: -1000,
    rackWidth: 2,
    rackHeight: 1,
    targets: [
      { width: 20, height: 20, thickness: 0.5, isOval: true },
      { width: 15, height: 15, thickness: 0.5, isOval: true },
      { width: 10, height: 10, thickness: 0.5, isOval: true }
    ]
  },
  {
    x: 10,
    z: -1000,
    rackWidth: 3,
    rackHeight: 3,
    targets: [
      { width: 12 * 6, height: 12 * 6, thickness: 0.5, isOval: false },
    ]
  },
  {
    x: -10,
    z: -1760,
    rackWidth: 3,
    rackHeight: 2,
    targets: [
      { width: 40, height: 40, thickness: 0.5, isOval: true },
      { width: 20, height: 20, thickness: 0.5, isOval: true }
    ]
  },
  {
    x: 20,
    z: -1760,
    rackWidth: 3,
    rackHeight: 3,
    targets: [
      { width: 12 * 6, height: 12 * 6, thickness: 0.5, isOval: false },
    ]
  }
];


