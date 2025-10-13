#pragma once

#include "atmosphere.h"
#include "bullet.h"
#include "trajectory.h"
#include "units.h"

namespace btk::ballistics
{

    /**
     * @brief Result of zeroing calculation
     */
    struct ZeroingResult
    {
        Bullet initial_state;
        Angle elevation_angle;
    };

    /**
     * @brief Ballistics flight simulation helpers
     *
     * This module provides a small set of functions to compute bullet flight through
     * the atmosphere with drag, gravity, and wind using a fixed time-step integrator.
     */
    class Simulator
    {
        public:
        /**
         * @brief Advance the state by one step using RK2 midpoint integration
         *
         * @param state Current flying bullet state
         * @param dt Time step
         * @param wind Wind conditions
         * @param atmosphere Atmospheric conditions
         * @return New flying bullet state after time step
         */
        static Bullet timeStep(const Bullet& state, const Time& dt, const Wind& wind,
                                     const Atmosphere& atmosphere);

        /**
         * @brief Integrate forward until target distance is reached and return a trajectory
         *
         * Records points periodically for later interpolation. Raises if the target
         * is not reached within max_time or the solution becomes invalid.
         *
         * @param initial_state Initial flying bullet state
         * @param target_distance Target distance to reach
         * @param wind Wind conditions
         * @param atmosphere Atmospheric conditions
         * @param dt Time step (default: 0.001 seconds)
         * @param max_time Maximum simulation time (default: 60 seconds)
         * @return Complete trajectory
         * @throws std::runtime_error if simulation fails
         */
        static Trajectory simulateToDistance(const Bullet& initial_state, const Distance& target_distance,
                                             const Wind& wind, const Atmosphere& atmosphere,
                                             const Time& dt = Time::seconds(0.001),
                                             const Time& max_time = Time::seconds(60.0));

        /**
         * @brief Iteratively solve launch angle so impact equals line of sight at zero range
         *
         * @param bullet Bullet properties
         * @param muzzle_velocity Muzzle velocity
         * @param scope_height Scope height above bore
         * @param zero_range Zero range
         * @param atmosphere Atmospheric conditions
         * @param wind Wind conditions (default: calm)
         * @param dt Time step (default: 0.001 seconds)
         * @param max_iterations Maximum iterations (default: 20)
         * @param tolerance Convergence tolerance (default: 0.001 meters)
         * @return Bullet with zeroed initial state
         * @throws std::runtime_error if convergence fails
         */
        static Bullet computeZeroedInitialState(
            const Bullet& bullet, const Velocity& muzzle_velocity, const Distance& scope_height,
            const Distance& zero_range, const Atmosphere& atmosphere, const Wind& wind = Wind::calm(),
            const Time& dt = Time::seconds(0.001), int max_iterations = 20,
            const Distance& tolerance = Distance::meters(0.001));

        private:
        /**
         * @brief Calculate drag deceleration for a bullet at a given velocity
         *
         * Uses the bullet's configured drag model (G1/G7) with density scaling.
         *
         * @param bullet Bullet properties
         * @param velocity Bullet velocity
         * @param atmosphere Atmospheric conditions
         * @return Drag acceleration in m/s²
         */
        static Acceleration calculateDragRetardation(const Bullet& bullet, const Velocity& velocity,
                                                     const Atmosphere& atmosphere);

        /**
         * @brief Calculate total acceleration components (ax, ay, az)
         *
         * @param state Current flying bullet state
         * @param atmosphere Atmospheric conditions
         * @param wind Wind conditions
         * @return Acceleration3D with x, y, z components
         */
        static Acceleration3D calculateAcceleration(const Bullet& state,
                                                   const Atmosphere& atmosphere,
                                                   const Wind& wind);

        /**
         * @brief Return (acceleration, mass) drag coefficients via binary search
         *
         * @param vp_fps Velocity in fps
         * @param drag_type Drag function type
         * @return Tuple of (acceleration, mass) coefficients
         */
        static constexpr std::tuple<double, double> dragFunction(double vp_fps, DragFunction drag_type);
    };

} // namespace btk::ballistics
