#pragma once

#include "ballistics/bullet.h"
#include "ballistics/trajectory.h"
#include "math/conversions.h"
#include "math/vector.h"
#include "physics/atmosphere.h"
#include "physics/wind_generator.h"

namespace btk::ballistics
{

  /**
   * @brief Result of zeroing calculation
   */
  struct ZeroingResult
  {
    Bullet initial_state;
    float elevation_angle; // rad
  };

  /**
   * @brief Stateful ballistics flight simulator
   *
   * This class manages bullet, atmosphere, and wind conditions internally,
   * allowing for easy simulation with different conditions and bullet states.
   */
  class Simulator
  {
    public:
    /**
     * @brief Default constructor
     *
     * Initializes simulator with default values:
     * - Bullet: zero state (0 position, 0 velocity, 0 spin)
     * - Atmosphere: standard conditions (15°C, sea level, 50% humidity)
     * - Wind: zero (0, 0, 0) m/s
     * - Time: 0.0f seconds
     */
    Simulator() : initial_bullet_(0.0f, 0.0f, 0.0f, 0.0f), current_bullet_(0.0f, 0.0f, 0.0f, 0.0f), atmosphere_(), wind_(0.0f, 0.0f, 0.0f), current_time_(0.0f), trajectory_() {}

    // Setters (individual)
    /**
     * @brief Set initial bullet state
     *
     * @param bullet Bullet object representing the initial state
     */
    void setInitialBullet(const Bullet& bullet);

    /**
     * @brief Set atmospheric conditions
     *
     * @param atmosphere Atmosphere object with temperature, altitude, humidity, and pressure
     */
    void setAtmosphere(const btk::physics::Atmosphere& atmosphere);

    /**
     * @brief Set wind conditions
     *
     * @param wind Wind vector in Cartesian coordinates (x=downrange m/s, y=crossrange m/s, z=vertical m/s)
     */
    void setWind(const btk::math::Vector3D& wind);

    // Getters
    /**
     * @brief Get the initial bullet state
     *
     * @return Reference to the initial bullet state
     */
    const Bullet& getInitialBullet() const;

    /**
     * @brief Get the current bullet state
     *
     * @return Reference to the current in-flight bullet state
     */
    const Bullet& getCurrentBullet() const;

    /**
     * @brief Get atmospheric conditions
     *
     * @return Reference to the current atmosphere object
     */
    const btk::physics::Atmosphere& getAtmosphere() const;

    /**
     * @brief Get wind conditions
     *
     * @return Reference to the current wind vector
     */
    const btk::math::Vector3D& getWind() const;

    // State management
    /**
     * @brief Reset current bullet to initial bullet state and reset time to zero
     */
    void resetToInitial();

    // Simulation methods
    /**
     * @brief Compute zeroed initial state for given muzzle velocity and zero range
     *
     * @param muzzle_velocity Muzzle velocity in m/s
     * @param scope_height Scope height above bore in m
     * @param zero_range Zero range in m
     * @param dt Time step for zeroing calculation in s (default: 0.001f)
     * @param max_iterations Maximum iterations for zeroing (default: 50)
     * @param tolerance Convergence tolerance for zeroing in m (default: 0.001f)
     * @param spin_rate Bullet spin rate in rad/s (default: 0.0f)
     * @return Const reference to the zeroed initial bullet
     */
    const Bullet& computeZero(float muzzle_velocity, float scope_height, float zero_range, float dt = 0.001f, int max_iterations = 20, float tolerance = 0.001f, float spin_rate = 0.0f);

    /**
     * @brief Simulate trajectory from current state to maximum distance
     *
     * @param max_distance Maximum distance to simulate in m
     * @param dt Time step for simulation in s (default: 0.001f)
     * @param max_time Maximum simulation time in s (default: 60.0f)
     * @return Const reference to trajectory object containing all simulation points
     */
    const Trajectory& simulate(float max_distance, float dt = 0.001f, float max_time = 60.0f);

    /**
     * @brief Simulate trajectory with wind generator sampling
     *
     * @param max_distance Maximum distance to simulate in m
     * @param dt Time step for simulation in s
     * @param max_time Maximum simulation time in s
     * @param wind_gen Wind generator for position/time-dependent wind
     * @return Const reference to trajectory object containing all simulation points
     */
    const Trajectory& simulate(float max_distance, float dt, float max_time, const btk::physics::WindGenerator& wind_gen);

    /**
     * @brief Advance simulation by one time step
     *
     * @param dt Time step in s
     * @return Const reference to the updated current bullet state
     */
    const Bullet& timeStep(float dt);

    // State queries
    /**
     * @brief Get current bullet distance (X position)
     *
     * @return Current bullet X position in m
     */
    float getCurrentDistance() const;

    /**
     * @brief Get current simulation time
     *
     * @return Current simulation time in s
     */
    float getCurrentTime() const;

    /**
     * @brief Get the trajectory
     *
     * @return Reference to the trajectory object
     */
    const Trajectory& getTrajectory() const;

    private:
    // Physics helpers
    float calculateDragRetardationFor(const Bullet& s) const;
    btk::math::Vector3D calculateAccelerationFor(const Bullet& s) const;

    // Internal state
    Bullet initial_bullet_;
    Bullet current_bullet_;
    btk::physics::Atmosphere atmosphere_;
    btk::math::Vector3D wind_;
    float current_time_;
    Trajectory trajectory_;
  };

} // namespace btk::ballistics