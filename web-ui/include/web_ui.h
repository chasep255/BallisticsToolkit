#pragma once

#include "ballistics.h"
#include <memory>
#include <vector>

namespace psim::web_ui
{

    /**
     * @brief WebAssembly-compatible ballistic calculator
     * 
     * This class provides a C++ interface that can be easily bound to JavaScript
     * for web-based ballistic calculations.
     */
    class TargetSimulator
    {
        public:
        /**
         * @brief Initialize the simulator with bullet parameters
         * 
         * @param weight_grains Bullet weight in grains
         * @param diameter_inches Bullet diameter in inches
         * @param length_inches Bullet length in inches
         * @param bc Ballistic coefficient
         * @param drag_function Drag function type (0=G1, 1=G7)
         */
        void initializeBullet(double weight_grains, double diameter_inches, double length_inches,
                             double bc, int drag_function);

        /**
         * @brief Set atmospheric conditions
         * 
         * @param temperature_f Temperature in Fahrenheit
         * @param pressure_inhg Pressure in inches of mercury
         * @param humidity_percent Humidity as percentage (0-100)
         * @param altitude_feet Altitude in feet
         */
        void setAtmosphere(double temperature_f, double pressure_inhg, double humidity_percent, double altitude_feet);

        /**
         * @brief Set wind conditions
         * 
         * @param wind_speed_mph Wind speed in mph
         * @param wind_direction_deg Wind direction in degrees (0=from left, 90=from front, 180=from right, 270=from rear)
         */
        void setWind(double wind_speed_mph, double wind_direction_deg);

        /**
         * @brief Calculate trajectory for a given shot
         * 
         * @param muzzle_velocity_fps Muzzle velocity in fps
         * @param zero_range_yards Zero range in yards
         * @param scope_height_inches Scope height in inches
         * @param max_range_yards Maximum range to calculate
         * @param step_yards Step size in yards
         * @return Pointer to trajectory data (caller must free with freeTrajectory)
         */
        void* calculateTrajectory(double muzzle_velocity_fps, double zero_range_yards, double scope_height_inches,
                                 double max_range_yards, double step_yards);

        /**
         * @brief Free trajectory data allocated by calculateTrajectory
         * 
         * @param trajectory_data Pointer returned by calculateTrajectory
         */
        void freeTrajectory(void* trajectory_data);

        /**
         * @brief Get trajectory point at specific range
         * 
         * @param trajectory_data Pointer from calculateTrajectory
         * @param range_yards Range in yards
         * @param drop_mrad Output: Drop in milliradians
         * @param drift_mrad Output: Drift in milliradians
         * @param velocity_fps Output: Velocity in fps
         * @param energy_ftlbf Output: Energy in ft-lbf
         * @param time_sec Output: Time of flight in seconds
         * @return 1 if successful, 0 if range not found
         */
        int getTrajectoryPoint(void* trajectory_data, double range_yards, double* drop_mrad, double* drift_mrad,
                              double* velocity_fps, double* energy_ftlbf, double* time_sec);

        /**
         * @brief Get number of trajectory points
         * 
         * @param trajectory_data Pointer from calculateTrajectory
         * @return Number of points
         */
        int getTrajectoryPointCount(void* trajectory_data);

        private:
        std::unique_ptr<psim::ballistics::Bullet> bullet_;
        std::unique_ptr<psim::ballistics::Atmosphere> atmosphere_;
        std::unique_ptr<psim::ballistics::Wind> wind_;
    };

    /**
     * @brief C-style interface for JavaScript binding
     */
    extern "C"
    {
        // Create and destroy simulator
        void* createSimulator();
        void destroySimulator(void* simulator);

        // Bullet setup
        void setBullet(void* simulator, double weight_grains, double diameter_inches, double length_inches,
                      double bc, int drag_function);

        // Atmospheric setup
        void setAtmosphere(void* simulator, double temperature_f, double pressure_inhg, 
                          double humidity_percent, double altitude_feet);

        // Wind setup
        void setWind(void* simulator, double wind_speed_mph, double wind_direction_deg);

        // Trajectory calculation
        void* calculateTrajectory(void* simulator, double muzzle_velocity_fps, double zero_range_yards,
                                 double scope_height_inches, double max_range_yards, double step_yards);

        // Trajectory data access
        void freeTrajectory(void* trajectory_data);
        int getTrajectoryPoint(void* trajectory_data, double range_yards, double* drop_mrad, double* drift_mrad,
                              double* velocity_fps, double* energy_ftlbf, double* time_sec);
        int getTrajectoryPointCount(void* trajectory_data);
    }

} // namespace psim::target_sim
