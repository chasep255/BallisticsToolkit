#pragma once

#include "math/conversions.h"
#include "math/vector.h"
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
     * @param humidity Relative humidity (0.0f to 1.0f)
     * @param pressure Barometric pressure in Pa (0 for standard pressure at altitude)
     */
    Atmosphere(float temperature, float altitude, float humidity, float pressure = 0.0f);

    // Getters (all return SI base units)
    float getTemperature() const { return temperature_; } // K
    float getAltitude() const { return altitude_; }       // m
    float getHumidity() const { return humidity_; }       // 0.0f to 1.0f
    float getPressure() const;                            // Pa

    /**
     * @brief Calculate air density at current conditions
     *
     * @return Air density in kg/m³
     */
    float getAirDensity() const;

    /**
     * @brief Calculate speed of sound at current conditions
     *
     * @return Speed of sound in m/s
     */
    float getSpeedOfSound() const;

    /**
     * @brief Create standard atmosphere at sea level
     */
    static Atmosphere standard();

    /**
     * @brief Create atmosphere for given altitude with standard lapse rates
     */
    static Atmosphere atAltitude(float altitude); // altitude in m

    private:
    float temperature_; // K
    float altitude_;    // m
    float humidity_;    // 0.0f to 1.0f
    float pressure_;    // Pa

    /**
     * @brief Calculate standard pressure for given altitude
     */
    float calculateStandardPressure(float altitude) const; // altitude in m, returns Pa
  };

} // namespace btk::physics
