#pragma once

#include "physics/conversions.h"
#include "physics/vector.h"
#include <memory>

namespace btk::physics
{

  /**
   * @brief Represents atmospheric conditions for ballistics calculations
   */
  class Atmosphere
  {
    public:
    /**
     * @brief Initialize atmosphere with standard conditions
     */
    Atmosphere();

    /**
     * @brief Initialize atmosphere with custom conditions
     *
     * @param temperature Temperature in K
     * @param altitude Altitude in m
     * @param humidity Relative humidity (0.0 to 1.0)
     * @param pressure Barometric pressure in Pa (0 for standard pressure at altitude)
     */
    Atmosphere(double temperature, double altitude, double humidity, double pressure = 0.0);

    // Getters (all return SI base units)
    double getTemperature() const { return temperature_; } // K
    double getAltitude() const { return altitude_; }       // m
    double getHumidity() const { return humidity_; }       // 0.0 to 1.0
    double getPressure() const;                            // Pa

    /**
     * @brief Calculate air density at current conditions
     *
     * @return Air density in kg/m³
     */
    double getAirDensity() const;

    /**
     * @brief Calculate speed of sound at current conditions
     *
     * @return Speed of sound in m/s
     */
    double getSpeedOfSound() const;

    /**
     * @brief Create standard atmosphere at sea level
     */
    static Atmosphere standard();

    /**
     * @brief Create atmosphere for given altitude with standard lapse rates
     */
    static Atmosphere atAltitude(double altitude); // altitude in m

    private:
    double temperature_; // K
    double altitude_;    // m
    double humidity_;    // 0.0 to 1.0
    double pressure_;    // Pa

    /**
     * @brief Calculate standard pressure for given altitude
     */
    double calculateStandardPressure(double altitude) const; // altitude in m, returns Pa
  };

} // namespace btk::physics
