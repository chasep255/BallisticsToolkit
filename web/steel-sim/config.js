/**
 * Configuration module for Steel Target Simulator
 * Centralized constants used throughout the application
 * 
 * All values are in SI units (meters, m/s, kg, radians) internally
 * Call initConfig() after BTK loads to populate these values
 */

// Export config object that will be populated after BTK loads
export const Config = {};

/**
 * Initialize config with SI unit values after BTK loads
 * Uses window.btk.Conversions for unit conversion
 */
export function initConfig()
{
  const btk = window.btk;

  // ===== PHYSICS INTEGRATION CONSTANTS =====
  Config.INTEGRATION_STEP_S = 0.005; // 5ms physics step
  Config.BULLET_SUBSTEP_S = 0.001; // 1ms BTK integration
  Config.TIME_MANAGER_MAX_DT_S = 0.05; // 50ms max frame time
  Config.TIME_MANAGER_MIN_DT_S = 0; // No minimum (clamp to 0)

  // ===== CAMERA & SCENE CONSTANTS =====
  Config.SHOOTER_HEIGHT = btk.Conversions.yardsToMeters(5); // 5 yards
  Config.CAMERA_FOV = 35; // degrees (Three.js uses degrees)
  Config.CAMERA_FAR_PLANE = btk.Conversions.yardsToMeters(2500); // 2500 yards

  // ===== BULLET CONSTANTS =====
  Config.BULLET_MASS = 0.00907; // kg - 140 grains (already SI)
  Config.BULLET_DIAMETER = 0.00762; // meters - .308 caliber (already SI)
  Config.BULLET_LENGTH = 0.0305; // meters - ~30mm typical (already SI)
  Config.BULLET_BC = 0.3; // Ballistic coefficient (dimensionless)
  Config.BULLET_SPEED_MPS = 800; // m/s - Muzzle velocity (already SI)

  // ===== TARGET CONSTANTS =====
  Config.TARGET_CONFIG = {
    defaultBeamHeight: btk.Conversions.yardsToMeters(2.5), // 2.5 yards - default overhead beam height
    chainRadius: btk.Conversions.inchesToMeters(0.25), // 1/2" diameter chains
    beamRadius: btk.Conversions.inchesToMeters(1.0), // 2" diameter beams
    postRadius: btk.Conversions.inchesToMeters(1.0) // 2" diameter posts
  };
  // ===== DUST CLOUD CONFIGURATIONS =====
  Config.GROUND_DUST_CONFIG = {
    numParticles: 1000,
    color:
    {
      r: 139,
      g: 115,
      b: 85
    }, // Brown/tan
    initialRadius: btk.Conversions.inchesToMeters(3), // 3 inches
    growthRate: btk.Conversions.feetToMeters(0.1), // 0.1 feet/second
    particleDiameter: btk.Conversions.inchesToMeters(0.2) // 0.2 inches
  };

  Config.METAL_DUST_CONFIG = {
    numParticles: 250,
    color:
    {
      r: 192,
      g: 192,
      b: 192
    }, // Silver/gray
    initialRadius: btk.Conversions.inchesToMeters(1), // 1 inch
    growthRate: btk.Conversions.feetToMeters(1.0), // 1.0 feet/second
    particleDiameter: btk.Conversions.inchesToMeters(0.2) // 0.2 inches
  };

  // ===== LANDSCAPE CONFIGURATION =====
  Config.LANDSCAPE_CONFIG = {
    groundWidth: btk.Conversions.yardsToMeters(100), // 100 yards
    groundLength: btk.Conversions.yardsToMeters(2000), // 2000 yards
    brownGroundWidth: btk.Conversions.yardsToMeters(1000), // 1000 yards
    brownGroundLength: btk.Conversions.yardsToMeters(2500) // 2500 yards
  };

  // ===== WIND GENERATOR CONFIGURATION =====
  Config.WIND_CONFIG = {
    boxPadding: btk.Conversions.yardsToMeters(50), // 50 yards
    boxHeight: btk.Conversions.yardsToMeters(100), // 100 yards
    defaultPreset: 'Moderate'
  };

  // ===== WIND FLAG CONFIGURATION =====
  Config.WIND_FLAG_CONFIG = {
    interval: btk.Conversions.yardsToMeters(100), // 100 yards - spacing between flags
    poleHeight: btk.Conversions.yardsToMeters(12.0), // 12 yards - pole height
    poleThickness: btk.Conversions.yardsToMeters(0.1), // 0.1 yards - pole thickness
    flagBaseWidth: btk.Conversions.yardsToMeters(60.0 / 36.0), // 60 inches = 1.67 yards
    flagTipWidth: btk.Conversions.yardsToMeters(24.0 / 36.0), // 24 inches = 0.67 yards
    flagLength: btk.Conversions.yardsToMeters(16.0 / 3.0), // 16 feet = 5.33 yards
    flagThickness: btk.Conversions.yardsToMeters(0.05), // 0.05 yards
    flagSegments: 10,
    flagMinAngle: 1.0, // degrees
    flagMaxAngle: 90.0, // degrees
    flagAngleResponseK: 0.0205,
    flagAngleInterpolationSpeed: 30.0, // deg/s
    flagDirectionInterpolationSpeed: 1.0, // rad/s
    flagFlapFrequencyBase: 0.5, // Hz
    flagFlapFrequencyScale: 0.25, // Hz/mph
    flagFlapAmplitude: btk.Conversions.yardsToMeters(0.3), // 0.3 yards
    flagWaveLength: 1.5
  };

  // ===== ENVIRONMENT CONFIGURATIONS =====
  Config.MOUNTAIN_CONFIG = {
    count: 16,
    heightMin: btk.Conversions.yardsToMeters(50), // 50 yards
    heightMax: btk.Conversions.yardsToMeters(150), // 150 yards
    distanceMin: btk.Conversions.yardsToMeters(2200), // 2200 yards
    distanceMax: btk.Conversions.yardsToMeters(2500) // 2500 yards
  };

  Config.TREE_CONFIG = {
    sideMinDistance: btk.Conversions.yardsToMeters(60), // 60 yards
    sideMaxDistance: btk.Conversions.yardsToMeters(110), // 110 yards
    behindTargetWidth: btk.Conversions.yardsToMeters(80), // 80 yards
    behindTargetMin: btk.Conversions.yardsToMeters(10), // 10 yards
    behindTargetMax: btk.Conversions.yardsToMeters(100), // 100 yards
    countSides: 160,
    countBehind: 80
  };

  Config.ROCK_CONFIG = {
    count: 40,
    sizeMin: btk.Conversions.yardsToMeters(0.2), // 0.2 yards
    sizeMax: btk.Conversions.yardsToMeters(0.6) // 0.6 yards
  };

  Config.MARKER_CONFIG = {
    count: 15,
    heightMin: btk.Conversions.yardsToMeters(1.0), // 1.0 yards
    heightMax: btk.Conversions.yardsToMeters(1.5), // 1.5 yards
    postRadius: btk.Conversions.yardsToMeters(0.05) // 0.05 yards (~2 inches)
  };

  // ===== TARGET RACK CONFIGURATIONS =====
  // All positions in meters, all dimensions in meters
  Config.TARGET_RACKS_CONFIG = [

    // Zero confirmation rack at 100 yards, at eye height
    {
      x: 0,
      z: btk.Conversions.yardsToMeters(-100), // -100 yards (zero distance)
      useCustomY: true, // Use custom Y instead of ground height
      rackWidth: btk.Conversions.yardsToMeters(1.5), // 1.5 yards
      rackHeight: btk.Conversions.yardsToMeters(1), // 1 yard
      targets: [
        {
          width: btk.Conversions.inchesToMeters(5),
          height: btk.Conversions.inchesToMeters(5),
          thickness: btk.Conversions.inchesToMeters(0.5),
          isOval: false
        },
        {
          width: btk.Conversions.inchesToMeters(4),
          height: btk.Conversions.inchesToMeters(4),
          thickness: btk.Conversions.inchesToMeters(0.5),
          isOval: false
        },
        {
          width: btk.Conversions.inchesToMeters(3),
          height: btk.Conversions.inchesToMeters(3),
          thickness: btk.Conversions.inchesToMeters(0.5),
          isOval: false
        },
        {
          width: btk.Conversions.inchesToMeters(2),
          height: btk.Conversions.inchesToMeters(2),
          thickness: btk.Conversions.inchesToMeters(0.5),
          isOval: false
        }
      ]
    },

    {
      x: 0,
      z: btk.Conversions.yardsToMeters(-200), // -200 yards
      rackWidth: btk.Conversions.yardsToMeters(1.5), // 1.5 yards
      rackHeight: btk.Conversions.yardsToMeters(1), // 1 yard
      targets: [
      {
        width: btk.Conversions.inchesToMeters(5),
        height: btk.Conversions.inchesToMeters(5),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(4),
        height: btk.Conversions.inchesToMeters(4),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(3),
        height: btk.Conversions.inchesToMeters(3),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(2),
        height: btk.Conversions.inchesToMeters(2),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      }]
    },
    {
      x: btk.Conversions.yardsToMeters(10), // 10 yards
      z: btk.Conversions.yardsToMeters(-225), // -225 yards
      rackWidth: btk.Conversions.yardsToMeters(1.5),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(6),
        height: btk.Conversions.inchesToMeters(6),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(5),
        height: btk.Conversions.inchesToMeters(5),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(4),
        height: btk.Conversions.inchesToMeters(4),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(3),
        height: btk.Conversions.inchesToMeters(3),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      }]
    },
    {
      x: btk.Conversions.yardsToMeters(5), // 5 yards
      z: btk.Conversions.yardsToMeters(-500), // -500 yards
      rackWidth: btk.Conversions.yardsToMeters(1.5),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(10),
        height: btk.Conversions.inchesToMeters(10),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(5),
        height: btk.Conversions.inchesToMeters(5),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(3),
        height: btk.Conversions.inchesToMeters(3),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      }]
    },
    {
      x: btk.Conversions.yardsToMeters(-5), // -5 yards
      z: btk.Conversions.yardsToMeters(-1000), // -1000 yards
      rackWidth: btk.Conversions.yardsToMeters(2),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(20),
        height: btk.Conversions.inchesToMeters(20),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(15),
        height: btk.Conversions.inchesToMeters(15),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(10),
        height: btk.Conversions.inchesToMeters(10),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      }]
    },
    {
      x: btk.Conversions.yardsToMeters(10), // 10 yards
      z: btk.Conversions.yardsToMeters(-1000), // -1000 yards
      rackWidth: btk.Conversions.yardsToMeters(3),
      rackHeight: btk.Conversions.yardsToMeters(3),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(12 * 6),
        height: btk.Conversions.inchesToMeters(12 * 6),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      }]
    },
    {
      x: btk.Conversions.yardsToMeters(-10), // -10 yards
      z: btk.Conversions.yardsToMeters(-1760), // -1760 yards
      rackWidth: btk.Conversions.yardsToMeters(3),
      rackHeight: btk.Conversions.yardsToMeters(2),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(40),
        height: btk.Conversions.inchesToMeters(40),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(20),
        height: btk.Conversions.inchesToMeters(20),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      }]
    },
    {
      x: btk.Conversions.yardsToMeters(30), // 30 yards
      z: btk.Conversions.yardsToMeters(-1760), // -1760 yards
      rackWidth: btk.Conversions.yardsToMeters(3),
      rackHeight: btk.Conversions.yardsToMeters(3),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(12 * 6),
        height: btk.Conversions.inchesToMeters(12 * 6),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      }]
    }
  ];
}
