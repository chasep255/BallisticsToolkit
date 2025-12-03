#pragma once

#include <cmath>

// Define float version of π for consistency with float precision
#ifndef M_PI_F
#define M_PI_F 3.14159265358979323846f
#endif

namespace btk::math
{

  /**
   * @brief Unit conversion utilities
   * All conversions to/from SI base units
   */
  class Conversions
  {
    public:
    // ============================================================================
    // DISTANCE CONVERSIONS
    // ============================================================================

    // To meters (SI base unit)
    static constexpr float feetToMeters(float feet) { return feet * 0.3048f; }
    static constexpr float inchesToMeters(float inches) { return inches * 0.0254f; }
    static constexpr float yardsToMeters(float yards) { return yards * 0.9144f; }
    static constexpr float milesToMeters(float miles) { return miles * 1609.344f; }
    static constexpr float centimetersToMeters(float cm) { return cm * 0.01f; }
    static constexpr float millimetersToMeters(float mm) { return mm * 0.001f; }
    static constexpr float kilometersToMeters(float km) { return km * 1000.0f; }

    // From meters (SI base unit)
    static constexpr float metersToFeet(float meters) { return meters * 3.28084f; }
    static constexpr float metersToInches(float meters) { return meters * 39.3701f; }
    static constexpr float metersToYards(float meters) { return meters * 1.09361f; }
    static constexpr float metersToMiles(float meters) { return meters * 0.000621371f; }

    // Direct conversions between imperial units
    static constexpr float inchesToYards(float inches) { return inches / 36.0f; }
    static constexpr float yardsToInches(float yards) { return yards * 36.0f; }
    static constexpr float metersToCentimeters(float meters) { return meters * 100.0f; }
    static constexpr float metersToMillimeters(float meters) { return meters * 1000.0f; }
    static constexpr float metersToKilometers(float meters) { return meters * 0.001f; }

    // ============================================================================
    // VELOCITY CONVERSIONS
    // ============================================================================

    // To m/s (SI base unit)
    static constexpr float fpsToMps(float fps) { return fps * 0.3048f; }
    static constexpr float mphToMps(float mph) { return mph * 0.44704f; }
    static constexpr float kphToMps(float kph) { return kph * 0.277778f; }
    static constexpr float knotsToMps(float knots) { return knots * 0.514444f; }

    // From m/s (SI base unit)
    static constexpr float mpsToFps(float mps) { return mps * 3.28084f; }
    static constexpr float mpsToMph(float mps) { return mps * 2.23694f; }
    static constexpr float mpsToKph(float mps) { return mps * 3.6f; }
    static constexpr float mpsToKnots(float mps) { return mps * 1.94384f; }

    // ============================================================================
    // WEIGHT CONVERSIONS
    // ============================================================================

    // To kg (SI base unit)
    static constexpr float poundsToKg(float pounds) { return pounds * 0.453592f; }
    static constexpr float ouncesToKg(float ounces) { return ounces * 0.0283495f; }
    static constexpr float grainsToKg(float grains) { return grains * 0.0000647989f; }
    static constexpr float gramsToKg(float grams) { return grams * 0.001f; }
    static constexpr float tonsToKg(float tons) { return tons * 907.185f; }

    // From kg (SI base unit)
    static constexpr float kgToPounds(float kg) { return kg * 2.20462f; }
    static constexpr float kgToOunces(float kg) { return kg * 35.274f; }
    static constexpr float kgToGrains(float kg) { return kg * 15432.4f; }
    static constexpr float kgToGrams(float kg) { return kg * 1000.0f; }
    static constexpr float kgToTons(float kg) { return kg * 0.00110231f; }

    // ============================================================================
    // TEMPERATURE CONVERSIONS
    // ============================================================================

    // To Kelvin (SI base unit)
    static constexpr float celsiusToKelvin(float celsius) { return celsius + 273.15f; }
    static constexpr float fahrenheitToKelvin(float fahrenheit) { return (fahrenheit - 32.0f) * 5.0f / 9.0f + 273.15f; }
    static constexpr float rankineToKelvin(float rankine) { return rankine * 5.0f / 9.0f; }

    // From Kelvin (SI base unit)
    static constexpr float kelvinToCelsius(float kelvin) { return kelvin - 273.15f; }
    static constexpr float kelvinToFahrenheit(float kelvin) { return (kelvin - 273.15f) * 9.0f / 5.0f + 32.0f; }
    static constexpr float kelvinToRankine(float kelvin) { return kelvin * 9.0f / 5.0f; }

    // ============================================================================
    // ANGLE CONVERSIONS
    // ============================================================================

    // To radians (SI base unit)
    static constexpr float degreesToRadians(float degrees) { return degrees * M_PI_F / 180.0f; }
    static constexpr float moaToRadians(float moa) { return moa * M_PI_F / 10800.0f; } // 1 MOA = 1/60 degree
    static constexpr float mradToRadians(float mrad) { return mrad * 0.001f; }
    static constexpr float milsToRadians(float mils) { return mils * M_PI_F / 3200.0f; }
    static constexpr float gradiansToRadians(float gradians) { return gradians * M_PI_F / 200.0f; }
    static constexpr float turnsToRadians(float turns) { return turns * 2.0f * M_PI_F; }

    // Clock position to radians (wind direction, o'clock convention)
    // Target is at 12 o'clock. Value describes where the wind is COMING FROM.
    // Mapping (clock → angle, measured clockwise from 12 o'clock):
    //  - 12 o'clock =   0° (from target, headwind)
    //  -  3 o'clock =  90° (from right, full-value crosswind)
    //  -  6 o'clock = 180° (from behind, tailwind)
    //  -  9 o'clock = 270° (from left, full-value crosswind)
    //
    // Intermediate values (e.g., 1.5) are supported and give fractional-value winds.
    static constexpr float oclockToRadians(float oclock)
    {
      // Normalize to [0, 360) degrees with 12 o'clock = 0°
      float degrees = (oclock - 12.0f) * 30.0f;
      while(degrees < 0.0f)
        degrees += 360.0f;
      while(degrees >= 360.0f)
        degrees -= 360.0f;
      return degrees * M_PI_F / 180.0f;
    }

    // From radians (SI base unit)
    static constexpr float radiansToDegrees(float radians) { return radians * 180.0f / M_PI_F; }
    static constexpr float radiansToMoa(float radians) { return radians * 10800.0f / M_PI_F; }
    static constexpr float radiansToMrad(float radians) { return radians * 1000.0f; }
    static constexpr float radiansToMils(float radians) { return radians * 3200.0f / M_PI_F; }
    static constexpr float radiansToGradians(float radians) { return radians * 200.0f / M_PI_F; }
    static constexpr float radiansToTurns(float radians) { return radians / (2.0f * M_PI_F); }

    // Inverse of oclockToRadians. Converts an angle (radians) in the o'clock
    // wind convention back to a clock value:
    //  - 12 o'clock = 0 rad
    //  -  3 o'clock = π/2 rad
    //  -  6 o'clock = π rad
    //  -  9 o'clock = 3π/2 rad
    //
    // Returns a continuous clock value in [1, 13), where:
    //  - 12 o'clock is exactly 12.0
    //  - Values between 12 and 1 o'clock are represented as 12.x
    //    (e.g., 12:30 ≈ 12.5).
    static constexpr float radiansToOclock(float radians)
    {
      // Normalize angle to [0, 2π)
      float angle = radians;
      while(angle < 0.0f)
        angle += 2.0f * M_PI_F;
      while(angle >= 2.0f * M_PI_F)
        angle -= 2.0f * M_PI_F;

      float degrees = angle * 180.0f / M_PI_F; // [0, 360)
      float raw = degrees / 30.0f;             // [0, 12)

      // raw in [0, 1) corresponds to 12..just-before-1
      // raw in [1, 12) corresponds directly to 1..just-before-12
      return (raw < 1.0f) ? (12.0f + raw) : raw;
    }

    // Direct conversions between angular units
    static constexpr float mradToMoa(float mrad) { return mrad * 3.43775f; } // 1 mrad = 3.43775 MOA
    static constexpr float moaToMrad(float moa) { return moa * 0.290888f; }  // 1 MOA = 0.290888 mrad

    // ============================================================================
    // PRESSURE CONVERSIONS
    // ============================================================================

    // To Pascals (SI base unit)
    static constexpr float psiToPascals(float psi) { return psi * 6894.76f; }
    static constexpr float inHgToPascals(float inHg) { return inHg * 3386.39f; }
    static constexpr float mmHgToPascals(float mmHg) { return mmHg * 133.322f; }
    static constexpr float barToPascals(float bar) { return bar * 100000.0f; }
    static constexpr float millibarToPascals(float millibar) { return millibar * 100.0f; }
    static constexpr float atmosphereToPascals(float atm) { return atm * 101325.0f; }
    static constexpr float torrToPascals(float torr) { return torr * 133.322f; }
    static constexpr float kpaToPascals(float kpa) { return kpa * 1000.0f; }
    static constexpr float mpaToPascals(float mpa) { return mpa * 1000000.0f; }

    // From Pascals (SI base unit)
    static constexpr float pascalsToPsi(float pascals) { return pascals * 0.000145038f; }
    static constexpr float pascalsToInHg(float pascals) { return pascals * 0.0002953f; }
    static constexpr float pascalsToMmHg(float pascals) { return pascals * 0.00750062f; }
    static constexpr float pascalsToBar(float pascals) { return pascals * 1e-5; }
    static constexpr float pascalsToMillibar(float pascals) { return pascals * 0.01f; }
    static constexpr float pascalsToAtmosphere(float pascals) { return pascals * 9.86923e-6f; }
    static constexpr float pascalsToTorr(float pascals) { return pascals * 0.00750062f; }
    static constexpr float pascalsToKpa(float pascals) { return pascals * 0.001f; }
    static constexpr float pascalsToMpa(float pascals) { return pascals * 1e-6; }

    // ============================================================================
    // ACCELERATION CONVERSIONS
    // ============================================================================

    // To m/s² (SI base unit)
    static constexpr float fps2ToMps2(float fps2) { return fps2 * 0.3048f; }
    static constexpr float gToMps2(float g) { return g * 9.80665f; }
    static constexpr float galToMps2(float gal) { return gal * 0.01f; }

    // From m/s² (SI base unit)
    static constexpr float mps2ToFps2(float mps2) { return mps2 * 3.28084f; }
    static constexpr float mps2ToG(float mps2) { return mps2 * 0.101972f; }
    static constexpr float mps2ToGal(float mps2) { return mps2 * 100.0f; }

    // ============================================================================
    // FORCE CONVERSIONS
    // ============================================================================

    // To Newtons (SI base unit)
    static constexpr float poundsForceToNewtons(float lbf) { return lbf * 4.44822f; }
    static constexpr float kilopoundsForceToNewtons(float klbf) { return klbf * 4448.22f; }
    static constexpr float dynesToNewtons(float dynes) { return dynes * 0.00001f; }
    static constexpr float kilogramForceToNewtons(float kgf) { return kgf * 9.80665f; }

    // From Newtons (SI base unit)
    static constexpr float newtonsToPoundsForce(float newtons) { return newtons * 0.224809f; }
    static constexpr float newtonsToKilopoundsForce(float newtons) { return newtons * 0.000224809f; }
    static constexpr float newtonsToDynes(float newtons) { return newtons * 100000.0f; }
    static constexpr float newtonsToKilogramForce(float newtons) { return newtons * 0.101972f; }

    // ============================================================================
    // ENERGY CONVERSIONS
    // ============================================================================

    // To Joules (SI base unit)
    static constexpr float footPoundsToJoules(float ft_lb) { return ft_lb * 1.35582f; }
    static constexpr float caloriesToJoules(float cal) { return cal * 4.184f; }
    static constexpr float kilocaloriesToJoules(float kcal) { return kcal * 4184.0f; }
    static constexpr float btuToJoules(float btu) { return btu * 1055.06f; }
    static constexpr float wattHoursToJoules(float wh) { return wh * 3600.0f; }
    static constexpr float kilowattHoursToJoules(float kwh) { return kwh * 3600000.0f; }

    // From Joules (SI base unit)
    static constexpr float joulesToFootPounds(float joules) { return joules * 0.737562f; }
    static constexpr float joulesToCalories(float joules) { return joules * 0.239006f; }
    static constexpr float joulesToKilocalories(float joules) { return joules * 0.000239006f; }
    static constexpr float joulesToBtu(float joules) { return joules * 0.000947817f; }
    static constexpr float joulesToWattHours(float joules) { return joules * 0.000277778f; }
    static constexpr float joulesToKilowattHours(float joules) { return joules * 2.77778e-7f; }

    // ============================================================================
    // DENSITY CONVERSIONS
    // ============================================================================

    // To kg/m³ (SI base unit)
    static constexpr float gpm3ToKgpm3(float gpm3) { return gpm3 * 0.001f; }
    static constexpr float lbpft3ToKgpm3(float lbpft3) { return lbpft3 * 16.0185f; }
    static constexpr float slugpft3ToKgpm3(float slugpft3) { return slugpft3 * 515.379f; }

    // From kg/m³ (SI base unit)
    static constexpr float kgpm3ToGpm3(float kgpm3) { return kgpm3 * 1000.0f; }
    static constexpr float kgpm3ToLbpft3(float kgpm3) { return kgpm3 * 0.062428f; }
    static constexpr float kgpm3ToSlugpft3(float kgpm3) { return kgpm3 * 0.00194032f; }

    // ============================================================================
    // AREA CONVERSIONS
    // ============================================================================

    // To m² (SI base unit)
    static constexpr float squareFeetToSquareMeters(float sqft) { return sqft * 0.092903f; }
    static constexpr float squareInchesToSquareMeters(float sqin) { return sqin * 0.00064516f; }
    static constexpr float squareYardsToSquareMeters(float sqyd) { return sqyd * 0.836127f; }
    static constexpr float squareMilesToSquareMeters(float sqmi) { return sqmi * 2589988.11f; }
    static constexpr float squareCentimetersToSquareMeters(float sqcm) { return sqcm * 0.0001f; }
    static constexpr float squareMillimetersToSquareMeters(float sqmm) { return sqmm * 0.000001f; }
    static constexpr float squareKilometersToSquareMeters(float sqkm) { return sqkm * 1000000.0f; }
    static constexpr float acresToSquareMeters(float acres) { return acres * 4046.86f; }
    static constexpr float hectaresToSquareMeters(float hectares) { return hectares * 10000.0f; }

    // From m² (SI base unit)
    static constexpr float squareMetersToSquareFeet(float sqm) { return sqm * 10.7639f; }
    static constexpr float squareMetersToSquareInches(float sqm) { return sqm * 1550.0f; }
    static constexpr float squareMetersToSquareYards(float sqm) { return sqm * 1.19599f; }
    static constexpr float squareMetersToSquareMiles(float sqm) { return sqm * 3.86102e-7f; }
    static constexpr float squareMetersToSquareCentimeters(float sqm) { return sqm * 10000.0f; }
    static constexpr float squareMetersToSquareMillimeters(float sqm) { return sqm * 1000000.0f; }
    static constexpr float squareMetersToSquareKilometers(float sqm) { return sqm * 0.000001f; }
    static constexpr float squareMetersToAcres(float sqm) { return sqm * 0.000247105f; }
    static constexpr float squareMetersToHectares(float sqm) { return sqm * 0.0001f; }

    // ============================================================================
    // ANGULAR VELOCITY CONVERSIONS
    // ============================================================================

    // To rad/s (SI base unit)
    static constexpr float degreesPerSecondToRadiansPerSecond(float dps) { return dps * M_PI_F / 180.0f; }
    static constexpr float rpmToRadiansPerSecond(float rpm) { return rpm * 2.0f * M_PI_F / 60.0f; }
    static constexpr float rpsToRadiansPerSecond(float rps) { return rps * 2.0f * M_PI_F; }
    static constexpr float hertzToRadiansPerSecond(float hz) { return hz * 2.0f * M_PI_F; }

    // From rad/s (SI base unit)
    static constexpr float radiansPerSecondToDegreesPerSecond(float radps) { return radps * 180.0f / M_PI_F; }
    static constexpr float radiansPerSecondToRpm(float radps) { return radps * 60.0f / (2.0f * M_PI_F); }
    static constexpr float radiansPerSecondToRps(float radps) { return radps / (2.0f * M_PI_F); }
    static constexpr float radiansPerSecondToHertz(float radps) { return radps / (2.0f * M_PI_F); }
  };

  // User-defined literals for convenient unit conversions
  namespace literals
  {
    /**
     * @brief Convert mph to m/s for wind speed literals
     * @param mph Wind speed in miles per hour
     * @return Wind speed in meters per second
     */
    constexpr float operator""_mph(long double mph) { return static_cast<float>(Conversions::mphToMps(static_cast<float>(mph))); }

    /**
     * @brief Convert mph to m/s for wind speed literals (integer version)
     * @param mph Wind speed in miles per hour
     * @return Wind speed in meters per second
     */
    constexpr float operator""_mph(unsigned long long mph) { return static_cast<float>(Conversions::mphToMps(static_cast<float>(mph))); }

    /**
     * @brief Convert yards to meters for distance literals
     * @param yards Distance in yards
     * @return Distance in meters
     */
    constexpr float operator""_yd(long double yards) { return static_cast<float>(Conversions::yardsToMeters(static_cast<float>(yards))); }

    /**
     * @brief Convert yards to meters for distance literals (integer version)
     * @param yards Distance in yards
     * @return Distance in meters
     */
    constexpr float operator""_yd(unsigned long long yards) { return static_cast<float>(Conversions::yardsToMeters(static_cast<float>(yards))); }

    /**
     * @brief Convert minutes to seconds for time literals
     * @param minutes Time in minutes
     * @return Time in seconds
     */
    constexpr float operator""_min(long double minutes)
    {
      return static_cast<float>(minutes * 60.0); // 1 minute = 60 seconds
    }

    /**
     * @brief Convert minutes to seconds for time literals (integer version)
     * @param minutes Time in minutes
     * @return Time in seconds
     */
    constexpr float operator""_min(unsigned long long minutes)
    {
      return static_cast<float>(minutes * 60.0); // 1 minute = 60 seconds
    }
  } // namespace literals

} // namespace btk::math
