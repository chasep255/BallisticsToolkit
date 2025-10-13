#pragma once

#include <cstdint>

namespace psim::ballistics
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
     * @brief Physical constants for ballistics calculations
     */
    namespace constants
    {

        // Gravity
        inline constexpr double GRAVITY = 9.80665; // m/s² - standard gravitational acceleration at sea level

        // Atmospheric constants
        inline constexpr double AIR_DENSITY_STANDARD = 1.225;     // kg/m³ - standard air density at sea level, 15°C
        inline constexpr double SPEED_OF_SOUND_STANDARD = 340.29; // m/s - speed of sound at 15°C, sea level
        inline constexpr double SPEED_OF_SOUND_STANDARD_FPS = 1116.4; // fps - speed of sound at 59°F, sea level

        // Temperature constants
        inline constexpr double TEMPERATURE_STANDARD_CELSIUS = 15.0;    // °C - ICAO standard temperature at sea level
        inline constexpr double TEMPERATURE_STANDARD_KELVIN = 288.15;   // K - ICAO standard temperature at sea level
        inline constexpr double TEMPERATURE_STANDARD_FAHRENHEIT = 59.0; // °F - standard temperature at sea level

        // Pressure constants
        inline constexpr double PRESSURE_STANDARD_PASCALS = 101325.0; // Pa - standard atmospheric pressure at sea level
        inline constexpr double PRESSURE_STANDARD_INHG = 29.92;       // inHg - standard pressure at sea level

        // Atmospheric lapse rates
        inline constexpr double TEMPERATURE_LAPSE_RATE = -0.0065; // K/m - temperature lapse rate (troposphere)
        inline constexpr double PRESSURE_SCALE_HEIGHT = 8400.0;   // m - atmospheric scale height for pressure

        // Unit conversions
        inline constexpr double FT_TO_M = 0.3048;     // feet to meters
        inline constexpr double M_TO_FT = 3.28084;    // meters to feet
        inline constexpr double MPH_TO_MPS = 0.44704; // miles per hour to meters per second
        inline constexpr double FPS_TO_MPS = 0.3048;  // feet per second to meters per second

        // Gas constants
        inline constexpr double GAS_CONSTANT_UNIVERSAL = 8.314; // J/(mol·K) - universal gas constant
        inline constexpr double MOLAR_MASS_DRY_AIR = 0.02897;   // kg/mol - molar mass of dry air
        inline constexpr double HEAT_CAPACITY_RATIO_AIR = 1.4;  // dimensionless - heat capacity ratio for air

        // Mathematical constants
        inline constexpr double PI = 3.14159265358979323846; // pi

    } // namespace constants
} // namespace psim::ballistics
