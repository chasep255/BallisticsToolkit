#pragma once

#include <cstdint>

namespace btk::ballistics
{

  /**
   * @brief Physical constants for ballistics calculations using SI base units
   */
  class Constants
  {
  public:
    // Gravity
    static constexpr double GRAVITY = 9.80665; // m/s² - standard gravitational acceleration at sea level

    // Atmospheric constants
    static constexpr double AIR_DENSITY_STANDARD = 1.225; // kg/m³ - standard air density at sea level, 15°C

    // Temperature constants
    static constexpr double TEMPERATURE_STANDARD_FAHRENHEIT = 288.15; // K - standard temperature at sea level (59°F)
    static constexpr double TEMPERATURE_STANDARD_KELVIN = 288.15; // K - ICAO standard temperature at sea level

    // Pressure constants
    static constexpr double PRESSURE_STANDARD_PASCALS = 101325.0; // Pa - standard atmospheric pressure at sea level

    // Atmospheric lapse rates (dimensionless ratios)
    static constexpr double TEMPERATURE_LAPSE_RATE = -0.0065; // K/m - temperature lapse rate (troposphere)
    static constexpr double PRESSURE_SCALE_HEIGHT = 8400.0; // m - atmospheric scale height for pressure

    // Gas constants (dimensionless ratios)
    static constexpr double GAS_CONSTANT_UNIVERSAL = 8.314; // J/(mol·K) - universal gas constant
    static constexpr double MOLAR_MASS_DRY_AIR = 0.02897;   // kg/mol - molar mass of dry air
    static constexpr double HEAT_CAPACITY_RATIO_AIR = 1.4;  // dimensionless - heat capacity ratio for air
  };

} // namespace btk::ballistics
