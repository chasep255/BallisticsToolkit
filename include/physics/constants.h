#pragma once

#include <cstdint>

namespace btk::physics
{

  /**
   * @brief Physical constants for ballistics calculations using SI base units
   */
  class Constants
  {
    public:
    // Gravity
    static constexpr float GRAVITY = 9.80665f; // m/s² - standard gravitational acceleration at sea level

    // Atmospheric constants
    static constexpr float AIR_DENSITY_STANDARD = 1.225f; // kg/m³ - standard air density at sea level, 15°C

    // Temperature constants (all in kelvin)
    // Standard sea-level temperature (ISA): 288.15 K ≈ 15 °C ≈ 59 °F
    static constexpr float TEMPERATURE_STANDARD_KELVIN = 288.15f;

    // Pressure constants
    static constexpr float PRESSURE_STANDARD_PASCALS = 101325.0f; // Pa - standard atmospheric pressure at sea level

    // Atmospheric lapse rates (dimensionless ratios)
    static constexpr float TEMPERATURE_LAPSE_RATE = -0.0065f; // K/m - temperature lapse rate (troposphere)
    static constexpr float PRESSURE_SCALE_HEIGHT = 8400.0f;   // m - atmospheric scale height for pressure

    // Gas constants (dimensionless ratios)
    static constexpr float GAS_CONSTANT_UNIVERSAL = 8.314f; // J/(mol·K) - universal gas constant
    static constexpr float MOLAR_MASS_DRY_AIR = 0.02897f;   // kg/mol - molar mass of dry air
    static constexpr float HEAT_CAPACITY_RATIO_AIR = 1.4f;  // dimensionless - heat capacity ratio for air
  };

} // namespace btk::physics
