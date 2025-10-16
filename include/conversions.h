#pragma once

#include <cmath>

namespace btk::ballistics
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
    static constexpr double feetToMeters(double feet) { return feet * 0.3048; }
    static constexpr double inchesToMeters(double inches) { return inches * 0.0254; }
    static constexpr double yardsToMeters(double yards) { return yards * 0.9144; }
    static constexpr double milesToMeters(double miles) { return miles * 1609.344; }
    static constexpr double centimetersToMeters(double cm) { return cm * 0.01; }
    static constexpr double millimetersToMeters(double mm) { return mm * 0.001; }
    static constexpr double kilometersToMeters(double km) { return km * 1000.0; }

    // From meters (SI base unit)
    static constexpr double metersToFeet(double meters) { return meters * 3.28084; }
    static constexpr double metersToInches(double meters) { return meters * 39.3701; }
    static constexpr double metersToYards(double meters) { return meters * 1.09361; }
    static constexpr double metersToMiles(double meters) { return meters * 0.000621371; }
    static constexpr double metersToCentimeters(double meters) { return meters * 100.0; }
    static constexpr double metersToMillimeters(double meters) { return meters * 1000.0; }
    static constexpr double metersToKilometers(double meters) { return meters * 0.001; }

    // ============================================================================
    // VELOCITY CONVERSIONS
    // ============================================================================

    // To m/s (SI base unit)
    static constexpr double fpsToMps(double fps) { return fps * 0.3048; }
    static constexpr double mphToMps(double mph) { return mph * 0.44704; }
    static constexpr double kphToMps(double kph) { return kph * 0.277778; }
    static constexpr double knotsToMps(double knots) { return knots * 0.514444; }

    // From m/s (SI base unit)
    static constexpr double mpsToFps(double mps) { return mps * 3.28084; }
    static constexpr double mpsToMph(double mps) { return mps * 2.23694; }
    static constexpr double mpsToKph(double mps) { return mps * 3.6; }
    static constexpr double mpsToKnots(double mps) { return mps * 1.94384; }

    // ============================================================================
    // WEIGHT CONVERSIONS
    // ============================================================================

    // To kg (SI base unit)
    static constexpr double poundsToKg(double pounds) { return pounds * 0.453592; }
    static constexpr double ouncesToKg(double ounces) { return ounces * 0.0283495; }
    static constexpr double grainsToKg(double grains) { return grains * 0.0000647989; }
    static constexpr double gramsToKg(double grams) { return grams * 0.001; }
    static constexpr double tonsToKg(double tons) { return tons * 907.185; }

    // From kg (SI base unit)
    static constexpr double kgToPounds(double kg) { return kg * 2.20462; }
    static constexpr double kgToOunces(double kg) { return kg * 35.274; }
    static constexpr double kgToGrains(double kg) { return kg * 15432.4; }
    static constexpr double kgToGrams(double kg) { return kg * 1000.0; }
    static constexpr double kgToTons(double kg) { return kg * 0.00110231; }

    // ============================================================================
    // TEMPERATURE CONVERSIONS
    // ============================================================================

    // To Kelvin (SI base unit)
    static constexpr double celsiusToKelvin(double celsius) { return celsius + 273.15; }
    static constexpr double fahrenheitToKelvin(double fahrenheit) { return (fahrenheit - 32.0) * 5.0 / 9.0 + 273.15; }
    static constexpr double rankineToKelvin(double rankine) { return rankine * 5.0 / 9.0; }

    // From Kelvin (SI base unit)
    static constexpr double kelvinToCelsius(double kelvin) { return kelvin - 273.15; }
    static constexpr double kelvinToFahrenheit(double kelvin) { return (kelvin - 273.15) * 9.0 / 5.0 + 32.0; }
    static constexpr double kelvinToRankine(double kelvin) { return kelvin * 9.0 / 5.0; }

    // ============================================================================
    // ANGLE CONVERSIONS
    // ============================================================================

    // To radians (SI base unit)
    static constexpr double degreesToRadians(double degrees) { return degrees * M_PI / 180.0; }
    static constexpr double moaToRadians(double moa) { return moa * M_PI / 10800.0; } // 1 MOA = 1/60 degree
    static constexpr double mradToRadians(double mrad) { return mrad * 0.001; }
    static constexpr double milsToRadians(double mils) { return mils * M_PI / 3200.0; }
    static constexpr double gradiansToRadians(double gradians) { return gradians * M_PI / 200.0; }
    static constexpr double turnsToRadians(double turns) { return turns * 2.0 * M_PI; }

    // Clock position to radians (wind direction)
    // 12 o'clock = 0°, 3 o'clock = 90°, 6 o'clock = 180°, 9 o'clock = 270°
    static constexpr double oclockToRadians(double oclock)
    {
      double degrees = ((18.0 - oclock) * 30.0);
      if(degrees >= 360.0)
        degrees -= 360.0;
      return degrees * M_PI / 180.0;
    }

    // From radians (SI base unit)
    static constexpr double radiansToDegrees(double radians) { return radians * 180.0 / M_PI; }
    static constexpr double radiansToMoa(double radians) { return radians * 10800.0 / M_PI; }
    static constexpr double radiansToMrad(double radians) { return radians * 1000.0; }
    static constexpr double radiansToMils(double radians) { return radians * 3200.0 / M_PI; }
    static constexpr double radiansToGradians(double radians) { return radians * 200.0 / M_PI; }
    static constexpr double radiansToTurns(double radians) { return radians / (2.0 * M_PI); }
    static constexpr double radiansToOclock(double radians) { return (radians * 180.0 / M_PI) / 30.0; }

    // ============================================================================
    // PRESSURE CONVERSIONS
    // ============================================================================

    // To Pascals (SI base unit)
    static constexpr double psiToPascals(double psi) { return psi * 6894.76; }
    static constexpr double inHgToPascals(double inHg) { return inHg * 3386.39; }
    static constexpr double mmHgToPascals(double mmHg) { return mmHg * 133.322; }
    static constexpr double barToPascals(double bar) { return bar * 100000.0; }
    static constexpr double millibarToPascals(double millibar) { return millibar * 100.0; }
    static constexpr double atmosphereToPascals(double atm) { return atm * 101325.0; }
    static constexpr double torrToPascals(double torr) { return torr * 133.322; }
    static constexpr double kpaToPascals(double kpa) { return kpa * 1000.0; }
    static constexpr double mpaToPascals(double mpa) { return mpa * 1000000.0; }

    // From Pascals (SI base unit)
    static constexpr double pascalsToPsi(double pascals) { return pascals * 0.000145038; }
    static constexpr double pascalsToInHg(double pascals) { return pascals * 0.0002953; }
    static constexpr double pascalsToMmHg(double pascals) { return pascals * 0.00750062; }
    static constexpr double pascalsToBar(double pascals) { return pascals * 1e-5; }
    static constexpr double pascalsToMillibar(double pascals) { return pascals * 0.01; }
    static constexpr double pascalsToAtmosphere(double pascals) { return pascals * 9.86923e-6; }
    static constexpr double pascalsToTorr(double pascals) { return pascals * 0.00750062; }
    static constexpr double pascalsToKpa(double pascals) { return pascals * 0.001; }
    static constexpr double pascalsToMpa(double pascals) { return pascals * 1e-6; }

    // ============================================================================
    // ACCELERATION CONVERSIONS
    // ============================================================================

    // To m/s² (SI base unit)
    static constexpr double fps2ToMps2(double fps2) { return fps2 * 0.3048; }
    static constexpr double gToMps2(double g) { return g * 9.80665; }
    static constexpr double galToMps2(double gal) { return gal * 0.01; }

    // From m/s² (SI base unit)
    static constexpr double mps2ToFps2(double mps2) { return mps2 * 3.28084; }
    static constexpr double mps2ToG(double mps2) { return mps2 * 0.101972; }
    static constexpr double mps2ToGal(double mps2) { return mps2 * 100.0; }

    // ============================================================================
    // FORCE CONVERSIONS
    // ============================================================================

    // To Newtons (SI base unit)
    static constexpr double poundsForceToNewtons(double lbf) { return lbf * 4.44822; }
    static constexpr double kilopoundsForceToNewtons(double klbf) { return klbf * 4448.22; }
    static constexpr double dynesToNewtons(double dynes) { return dynes * 0.00001; }
    static constexpr double kilogramForceToNewtons(double kgf) { return kgf * 9.80665; }

    // From Newtons (SI base unit)
    static constexpr double newtonsToPoundsForce(double newtons) { return newtons * 0.224809; }
    static constexpr double newtonsToKilopoundsForce(double newtons) { return newtons * 0.000224809; }
    static constexpr double newtonsToDynes(double newtons) { return newtons * 100000.0; }
    static constexpr double newtonsToKilogramForce(double newtons) { return newtons * 0.101972; }

    // ============================================================================
    // ENERGY CONVERSIONS
    // ============================================================================

    // To Joules (SI base unit)
    static constexpr double footPoundsToJoules(double ft_lb) { return ft_lb * 1.35582; }
    static constexpr double caloriesToJoules(double cal) { return cal * 4.184; }
    static constexpr double kilocaloriesToJoules(double kcal) { return kcal * 4184.0; }
    static constexpr double btuToJoules(double btu) { return btu * 1055.06; }
    static constexpr double wattHoursToJoules(double wh) { return wh * 3600.0; }
    static constexpr double kilowattHoursToJoules(double kwh) { return kwh * 3600000.0; }

    // From Joules (SI base unit)
    static constexpr double joulesToFootPounds(double joules) { return joules * 0.737562; }
    static constexpr double joulesToCalories(double joules) { return joules * 0.239006; }
    static constexpr double joulesToKilocalories(double joules) { return joules * 0.000239006; }
    static constexpr double joulesToBtu(double joules) { return joules * 0.000947817; }
    static constexpr double joulesToWattHours(double joules) { return joules * 0.000277778; }
    static constexpr double joulesToKilowattHours(double joules) { return joules * 2.77778e-7; }

    // ============================================================================
    // DENSITY CONVERSIONS
    // ============================================================================

    // To kg/m³ (SI base unit)
    static constexpr double gpm3ToKgpm3(double gpm3) { return gpm3 * 0.001; }
    static constexpr double lbpft3ToKgpm3(double lbpft3) { return lbpft3 * 16.0185; }
    static constexpr double slugpft3ToKgpm3(double slugpft3) { return slugpft3 * 515.379; }

    // From kg/m³ (SI base unit)
    static constexpr double kgpm3ToGpm3(double kgpm3) { return kgpm3 * 1000.0; }
    static constexpr double kgpm3ToLbpft3(double kgpm3) { return kgpm3 * 0.062428; }
    static constexpr double kgpm3ToSlugpft3(double kgpm3) { return kgpm3 * 0.00194032; }

    // ============================================================================
    // AREA CONVERSIONS
    // ============================================================================

    // To m² (SI base unit)
    static constexpr double squareFeetToSquareMeters(double sqft) { return sqft * 0.092903; }
    static constexpr double squareInchesToSquareMeters(double sqin) { return sqin * 0.00064516; }
    static constexpr double squareYardsToSquareMeters(double sqyd) { return sqyd * 0.836127; }
    static constexpr double squareMilesToSquareMeters(double sqmi) { return sqmi * 2589988.11; }
    static constexpr double squareCentimetersToSquareMeters(double sqcm) { return sqcm * 0.0001; }
    static constexpr double squareMillimetersToSquareMeters(double sqmm) { return sqmm * 0.000001; }
    static constexpr double squareKilometersToSquareMeters(double sqkm) { return sqkm * 1000000.0; }
    static constexpr double acresToSquareMeters(double acres) { return acres * 4046.86; }
    static constexpr double hectaresToSquareMeters(double hectares) { return hectares * 10000.0; }

    // From m² (SI base unit)
    static constexpr double squareMetersToSquareFeet(double sqm) { return sqm * 10.7639; }
    static constexpr double squareMetersToSquareInches(double sqm) { return sqm * 1550.0; }
    static constexpr double squareMetersToSquareYards(double sqm) { return sqm * 1.19599; }
    static constexpr double squareMetersToSquareMiles(double sqm) { return sqm * 3.86102e-7; }
    static constexpr double squareMetersToSquareCentimeters(double sqm) { return sqm * 10000.0; }
    static constexpr double squareMetersToSquareMillimeters(double sqm) { return sqm * 1000000.0; }
    static constexpr double squareMetersToSquareKilometers(double sqm) { return sqm * 0.000001; }
    static constexpr double squareMetersToAcres(double sqm) { return sqm * 0.000247105; }
    static constexpr double squareMetersToHectares(double sqm) { return sqm * 0.0001; }

    // ============================================================================
    // ANGULAR VELOCITY CONVERSIONS
    // ============================================================================

    // To rad/s (SI base unit)
    static constexpr double degreesPerSecondToRadiansPerSecond(double dps) { return dps * M_PI / 180.0; }
    static constexpr double rpmToRadiansPerSecond(double rpm) { return rpm * 2.0 * M_PI / 60.0; }
    static constexpr double rpsToRadiansPerSecond(double rps) { return rps * 2.0 * M_PI; }
    static constexpr double hertzToRadiansPerSecond(double hz) { return hz * 2.0 * M_PI; }

    // From rad/s (SI base unit)
    static constexpr double radiansPerSecondToDegreesPerSecond(double radps) { return radps * 180.0 / M_PI; }
    static constexpr double radiansPerSecondToRpm(double radps) { return radps * 60.0 / (2.0 * M_PI); }
    static constexpr double radiansPerSecondToRps(double radps) { return radps / (2.0 * M_PI); }
    static constexpr double radiansPerSecondToHertz(double radps) { return radps / (2.0 * M_PI); }
  };

} // namespace btk::ballistics
