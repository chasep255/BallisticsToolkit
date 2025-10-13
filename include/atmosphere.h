#pragma once

#include "units.h"
#include <memory>

namespace psim::ballistics
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
         * @param temperature Temperature
         * @param altitude Altitude
         * @param humidity Relative humidity (0.0 to 1.0)
         * @param pressure Barometric pressure (nullptr for standard pressure at altitude)
         */
        Atmosphere(const Temperature& temperature, const Distance& altitude, double humidity,
                   std::shared_ptr<Pressure> pressure = nullptr);

        // Getters
        const Temperature& getTemperature() const
        {
            return temperature_;
        }
        const Distance& getAltitude() const
        {
            return altitude_;
        }
        double getHumidity() const
        {
            return humidity_;
        }
        const Pressure& getPressure() const;

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
        static Atmosphere atAltitude(const Distance& altitude);

        std::string toString() const;

        private:
        Temperature temperature_;
        Distance altitude_;
        double humidity_;                    // 0.0 to 1.0
        std::shared_ptr<Pressure> pressure_; // nullptr means use standard pressure for altitude

        /**
         * @brief Calculate standard pressure for given altitude
         */
        Pressure calculateStandardPressure(const Distance& altitude) const;
    };

    /**
     * @brief Represents wind conditions with 3D components
     */
    class Wind
    {
        public:
        /**
         * @brief Initialize wind with 3D components
         *
         * @param speed Wind speed
         * @param direction Wind direction (0° = headwind, 90° = right crosswind)
         * @param vertical Vertical wind component (positive = updraft, negative = downdraft)
         */
        Wind(const Velocity& speed, const Angle& direction, const Velocity& vertical);

        /**
         * @brief Initialize wind with only horizontal components
         *
         * @param speed Wind speed
         * @param direction Wind direction
         */
        Wind(const Velocity& speed, const Angle& direction);

        /**
         * @brief Create calm wind (no wind)
         */
        static Wind calm();

        // Getters
        const Velocity& getSpeed() const
        {
            return speed_;
        }
        const Angle& getDirection() const
        {
            return direction_;
        }
        const Velocity& getVertical() const
        {
            return vertical_;
        }

        /**
         * @brief Get wind components in 3D coordinate system
         *
         * @return Tuple of (downrange, crossrange, vertical) wind components in m/s
         */
        std::tuple<double, double, double> getComponents() const;

        /**
         * @brief Get wind components in 3D coordinate system as Velocity objects
         *
         * @return Tuple of (downrange, crossrange, vertical) wind components
         */
        std::tuple<Velocity, Velocity, Velocity> getComponentVelocities() const;

        std::string toString() const;

        private:
        Velocity speed_;
        Angle direction_;
        Velocity vertical_;
    };

} // namespace psim::ballistics
