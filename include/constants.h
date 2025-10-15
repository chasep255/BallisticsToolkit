#pragma once

#include <cstdint>
#include "units.h"

namespace btk::ballistics
{

  /**
   * @brief Drag function types for ballistics calculations
   */
  enum DragFunction : uint8_t
  {
    G1 = 0,
    G7 = 1
  };

  /**
   * @brief Physical constants for ballistics calculations using proper unit types
   */
  namespace constants
  {

    // Gravity
    inline constexpr Acceleration GRAVITY = Acceleration::mps2(9.80665); // standard gravitational acceleration at sea level

    // Atmospheric constants
    inline constexpr Density AIR_DENSITY_STANDARD = Density::kgpm3(1.225); // standard air density at sea level, 15°C

    // Temperature constants
    inline constexpr Temperature TEMPERATURE_STANDARD_FAHRENHEIT = Temperature::fahrenheit(59.0); // standard temperature at sea level
    inline constexpr Temperature TEMPERATURE_STANDARD_KELVIN = Temperature::kelvin(288.15); // ICAO standard temperature at sea level

    // Pressure constants
    inline constexpr Pressure PRESSURE_STANDARD_PASCALS = Pressure::pascals(101325.0); // standard atmospheric pressure at sea level

    // Atmospheric lapse rates (dimensionless ratios)
    inline constexpr double TEMPERATURE_LAPSE_RATE = -0.0065; // K/m - temperature lapse rate (troposphere)
    inline constexpr Distance PRESSURE_SCALE_HEIGHT = Distance::meters(8400.0); // atmospheric scale height for pressure

    // Gas constants (dimensionless ratios)
    inline constexpr double GAS_CONSTANT_UNIVERSAL = 8.314; // J/(mol·K) - universal gas constant
    inline constexpr double MOLAR_MASS_DRY_AIR = 0.02897;   // kg/mol - molar mass of dry air
    inline constexpr double HEAT_CAPACITY_RATIO_AIR = 1.4;  // dimensionless - heat capacity ratio for air

  } // namespace constants
} // namespace btk::ballistics
