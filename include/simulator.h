#pragma once

#include "atmosphere.h"
#include "bullet.h"
#include "trajectory.h"
#include "vector.h"
#include "conversions.h"

namespace btk::ballistics
{

  /**
   * @brief Result of zeroing calculation
   */
  struct ZeroingResult
  {
    Bullet initial_state;
    double elevation_angle; // rad
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
     * @param dt Time step in s
     * @param wind Wind conditions
     * @param atmosphere Atmospheric conditions
     * @return New flying bullet state after time step
     */
    static Bullet timeStep(const Bullet& state, double dt, const Vector3D& wind, const Atmosphere& atmosphere);

    /**
     * @brief Integrate forward until target distance is reached and return a trajectory
     *
     * Records points periodically for later interpolation. Raises if the target
     * is not reached within max_time or the solution becomes invalid.
     *
     * @param initial_state Initial flying bullet state
     * @param target_distance Target distance to reach in m
     * @param wind Wind conditions
     * @param atmosphere Atmospheric conditions
     * @param dt Time step in s (default: 0.001)
     * @param max_time Maximum simulation time in s (default: 60.0)
     * @return Complete trajectory
     * @throws std::runtime_error if simulation fails
     */
    static Trajectory simulateToDistance(const Bullet& initial_state, double target_distance, const Vector3D& wind,
                                         const Atmosphere& atmosphere, double dt = 0.001, double max_time = 60.0);

    /**
     * @brief Iteratively solve launch angle so impact equals line of sight at zero range
     *
     * @param bullet Bullet properties
     * @param muzzle_velocity Muzzle velocity in m/s
     * @param scope_height Scope height above bore in m
     * @param zero_range Zero range in m
     * @param atmosphere Atmospheric conditions
     * @param wind Wind conditions (default: calm)
     * @param dt Time step in s (default: 0.001)
     * @param max_iterations Maximum iterations (default: 20)
     * @param tolerance Convergence tolerance in m (default: 0.001)
     * @return Bullet with zeroed initial state
     * @throws std::runtime_error if convergence fails
     */
    static Bullet computeZeroedInitialState(const Bullet& bullet, double muzzle_velocity,
                                            double scope_height, double zero_range,
                                            const Atmosphere& atmosphere, const Vector3D& wind = Vector3D(0, 0, 0),
                                            double dt = 0.001, int max_iterations = 20,
                                            double tolerance = 0.001);

    private:
    /**
     * @brief Calculate drag deceleration for a bullet at a given velocity
     *
     * Uses the bullet's configured drag model (G1/G7) with density scaling.
     *
     * @param bullet Bullet properties
     * @param velocity Bullet velocity in m/s
     * @param atmosphere Atmospheric conditions
     * @return Drag acceleration in m/s²
     */
    static double calculateDragRetardation(const Bullet& bullet, double velocity, const Atmosphere& atmosphere);

    /**
     * @brief Calculate total acceleration components (ax, ay, az)
     *
     * @param state Current flying bullet state
     * @param atmosphere Atmospheric conditions
     * @param wind Wind conditions
     * @return Vector3D with x, y, z components in m/s²
     */
    static Vector3D calculateAcceleration(const Bullet& state, const Atmosphere& atmosphere, const Vector3D& wind);

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
