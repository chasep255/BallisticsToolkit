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

  // ===== FPS TRACKING =====
  Config.FPS_LOG_INTERVAL_S = 5.0; // Log FPS every 10 seconds

  // ===== CAMERA & SCENE CONSTANTS =====
  Config.SHOOTER_HEIGHT = btk.Conversions.yardsToMeters(3);
  Config.CAMERA_FOV = 35; // degrees (Three.js uses degrees)
  Config.CAMERA_FAR_PLANE = btk.Conversions.yardsToMeters(2500); // 2500 yards
  Config.SCOPE_MAX_PAN_DEG = 10; // Limit scope movement to ±10°

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
    groundWidth: btk.Conversions.yardsToMeters(70), // 70 yards
    groundLength: btk.Conversions.yardsToMeters(1800), // 2000 yards
    brownGroundWidth: btk.Conversions.yardsToMeters(1000), // 1000 yards
    brownGroundLength: btk.Conversions.yardsToMeters(2500) // 2500 yards
  };

  // ===== WIND GENERATOR CONFIGURATION =====
  Config.WIND_CONFIG = {
    boxPadding: btk.Conversions.yardsToMeters(50), // 50 yards
    boxHeight: btk.Conversions.yardsToMeters(100) // 100 yards
  };

  // ===== WIND FLAG CONFIGURATION =====
  Config.WIND_FLAG_CONFIG = {
    // Default flag dimensions (large flags)
    poleHeight: btk.Conversions.yardsToMeters(3.0), // 3 yards - pole height
    poleThickness: btk.Conversions.inchesToMeters(2.0), // 2 inch - pole thickness
    flagBaseWidth: btk.Conversions.inchesToMeters(18), // 18 inches
    flagTipWidth: btk.Conversions.inchesToMeters(6), // 6 inches
    flagLength: btk.Conversions.yardsToMeters(2.0), // 2 yards
    flagThickness: btk.Conversions.yardsToMeters(0.02), // 0.02 yards
    flagSegments: 32,
    flagMinAngle: 1.0, // degrees
    flagMaxAngle: 90.0, // degrees
    flagAngleResponseK: 0.0205,
    flagAngleInterpolationSpeed: 30.0, // deg/s
    flagDirectionInterpolationSpeed: 1.0, // rad/s
    flagFlapFrequencyBase: 0.5, // Hz
    flagFlapFrequencyScale: 0.25, // Hz/mph
    flagFlapAmplitude: btk.Conversions.yardsToMeters(0.15), // 0.15 yards
    flagWaveLength: 1.5
  };

  // ===== WIND FLAG PLACEMENTS =====
  // Individual flags placed at specific positions (all in meters)
  // Varied X positions like a real PRS range
  Config.WIND_FLAGS = [
    {
      x: btk.Conversions.yardsToMeters(10),
      z: btk.Conversions.yardsToMeters(-25),
      config:
      {}
    },
    {
      x: btk.Conversions.yardsToMeters(-15),
      z: btk.Conversions.yardsToMeters(-50),
      config:
      {}
    },
    {
      x: btk.Conversions.yardsToMeters(-30),
      z: btk.Conversions.yardsToMeters(-100),
      config:
      {}
    },
    {
      x: btk.Conversions.yardsToMeters(-12),
      z: btk.Conversions.yardsToMeters(-150),
      config:
      {}
    },
    {
      x: btk.Conversions.yardsToMeters(10),
      z: btk.Conversions.yardsToMeters(-200),
      config:
      {}
    },
    // 300 yards
    {
      x: btk.Conversions.yardsToMeters(-5),
      z: btk.Conversions.yardsToMeters(-300),
      config:
      {}
    },
    {
      x: btk.Conversions.yardsToMeters(8),
      z: btk.Conversions.yardsToMeters(-600),
      config:
      {}
    },
    {
      x: btk.Conversions.yardsToMeters(22),
      z: btk.Conversions.yardsToMeters(-600),
      config:
      {}
    },
    // 900 yards
    {
      x: btk.Conversions.yardsToMeters(-17),
      z: btk.Conversions.yardsToMeters(-900),
      config:
      {}
    },
    {
      x: btk.Conversions.yardsToMeters(3),
      z: btk.Conversions.yardsToMeters(-900),
      config:
      {}
    },
    {
      x: btk.Conversions.yardsToMeters(15),
      z: btk.Conversions.yardsToMeters(-1200),
      config:
      {}
    },
    // 1500 yards
    {
      x: btk.Conversions.yardsToMeters(-15),
      z: btk.Conversions.yardsToMeters(-1500),
      config:
      {}
    },
    // 1760 yards (1 mile)
    {
      x: btk.Conversions.yardsToMeters(-7),
      z: btk.Conversions.yardsToMeters(-1760),
      config:
      {}
    }
  ];

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
    behindTargetWidth: btk.Conversions.yardsToMeters(200), // 200 yards
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

  // ===== RANGE SIGN CONFIGURATION =====
  Config.RANGE_SIGN_CONFIG = {
    postHeight: btk.Conversions.yardsToMeters(1.0), // 1 yard
    postWidth: btk.Conversions.inchesToMeters(4), // 4 inches
    signWidth: btk.Conversions.inchesToMeters(24), // 24 inches
    signHeight: btk.Conversions.inchesToMeters(12), // 12 inches
    signThickness: btk.Conversions.inchesToMeters(1), // 1 inch
    textFontSize: 120, // pixels on canvas
    textFont: 'bold 120px Arial',
    canvasWidth: 512,
    canvasHeight: 256
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
        width: btk.Conversions.inchesToMeters(6),
        height: btk.Conversions.inchesToMeters(6),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
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
      x: -5,
      z: btk.Conversions.yardsToMeters(-200), // -200 yards
      rackWidth: btk.Conversions.yardsToMeters(1.5), // 1.5 yards
      rackHeight: btk.Conversions.yardsToMeters(1), // 1 yard
      targets: [
      {
        width: btk.Conversions.inchesToMeters(6),
        height: btk.Conversions.inchesToMeters(6),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
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
      x: btk.Conversions.yardsToMeters(7),
      z: btk.Conversions.yardsToMeters(-250),
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
      x: btk.Conversions.yardsToMeters(-2),
      z: btk.Conversions.yardsToMeters(-300),
      rackWidth: btk.Conversions.yardsToMeters(1.5),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(6),
        height: btk.Conversions.inchesToMeters(6),
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
      x: btk.Conversions.yardsToMeters(15),
      z: btk.Conversions.yardsToMeters(-400),
      rackWidth: btk.Conversions.yardsToMeters(2),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(8),
        height: btk.Conversions.inchesToMeters(8),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(6),
        height: btk.Conversions.inchesToMeters(6),
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
      rackWidth: btk.Conversions.yardsToMeters(3),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(12),
        height: btk.Conversions.inchesToMeters(12),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(10),
        height: btk.Conversions.inchesToMeters(10),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(8),
        height: btk.Conversions.inchesToMeters(8),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(6),
        height: btk.Conversions.inchesToMeters(6),
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
        width: btk.Conversions.inchesToMeters(2),
        height: btk.Conversions.inchesToMeters(2),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
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
    // 600 yards - 2 MOA (~12"), 1.5 MOA (~9"), 1 MOA (~6"), 0.5 MOA (~3")
    {
      x: btk.Conversions.yardsToMeters(-20),
      z: btk.Conversions.yardsToMeters(-600),
      rackWidth: btk.Conversions.yardsToMeters(2.5),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(12),
        height: btk.Conversions.inchesToMeters(12),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(9),
        height: btk.Conversions.inchesToMeters(9),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(6),
        height: btk.Conversions.inchesToMeters(6),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(3),
        height: btk.Conversions.inchesToMeters(3),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      }]
    },
    // 700 yards - 2 MOA (~15"), 1.5 MOA (~11"), 1 MOA (~7"), 0.5 MOA (~4")
    {
      x: btk.Conversions.yardsToMeters(20),
      z: btk.Conversions.yardsToMeters(-700),
      rackWidth: btk.Conversions.yardsToMeters(2.5),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(15),
        height: btk.Conversions.inchesToMeters(15),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(11),
        height: btk.Conversions.inchesToMeters(11),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(7),
        height: btk.Conversions.inchesToMeters(7),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(4),
        height: btk.Conversions.inchesToMeters(4),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      }]
    },
    // 750 yards - 2 MOA (~15"), 1.5 MOA (~12"), 1 MOA (~8"), 0.5 MOA (~4")
    {
      x: btk.Conversions.yardsToMeters(-17),
      z: btk.Conversions.yardsToMeters(-750),
      rackWidth: btk.Conversions.yardsToMeters(2.5),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(15),
        height: btk.Conversions.inchesToMeters(15),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(12),
        height: btk.Conversions.inchesToMeters(12),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(8),
        height: btk.Conversions.inchesToMeters(8),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(4),
        height: btk.Conversions.inchesToMeters(4),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      }]
    },
    // 800 yards - 2 MOA (~17"), 1.5 MOA (~13"), 1 MOA (~8"), 0.5 MOA (~4")
    {
      x: btk.Conversions.yardsToMeters(15),
      z: btk.Conversions.yardsToMeters(-800),
      rackWidth: btk.Conversions.yardsToMeters(2.5),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(17),
        height: btk.Conversions.inchesToMeters(17),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(13),
        height: btk.Conversions.inchesToMeters(13),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(8),
        height: btk.Conversions.inchesToMeters(8),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(4),
        height: btk.Conversions.inchesToMeters(4),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      }]
    },
    // 900 yards - 2 MOA (~19"), 1.5 MOA (~14"), 1 MOA (~9"), 0.5 MOA (~5")
    {
      x: btk.Conversions.yardsToMeters(-25),
      z: btk.Conversions.yardsToMeters(-900),
      rackWidth: btk.Conversions.yardsToMeters(3),
      rackHeight: btk.Conversions.yardsToMeters(1),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(19),
        height: btk.Conversions.inchesToMeters(19),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(14),
        height: btk.Conversions.inchesToMeters(14),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(9),
        height: btk.Conversions.inchesToMeters(9),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      },
      {
        width: btk.Conversions.inchesToMeters(5),
        height: btk.Conversions.inchesToMeters(5),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: false
      }]
    },
    // 1200 yards - 2 MOA (~25"), 1.5 MOA (~19"), 1 MOA (~12"), 0.5 MOA (~6")
    {
      x: btk.Conversions.yardsToMeters(0),
      z: btk.Conversions.yardsToMeters(-1200),
      rackWidth: btk.Conversions.yardsToMeters(3.5),
      rackHeight: btk.Conversions.yardsToMeters(1.5),
      targets: [
      {
        width: btk.Conversions.inchesToMeters(25),
        height: btk.Conversions.inchesToMeters(25),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(19),
        height: btk.Conversions.inchesToMeters(19),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(12),
        height: btk.Conversions.inchesToMeters(12),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
      },
      {
        width: btk.Conversions.inchesToMeters(6),
        height: btk.Conversions.inchesToMeters(6),
        thickness: btk.Conversions.inchesToMeters(0.5),
        isOval: true
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