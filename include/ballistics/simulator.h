#pragma once

#include "ballistics/bullet.h"
#include "ballistics/trajectory.h"
#include "math/conversions.h"
#include "math/vector.h"
#include "physics/atmosphere.h"
#include "physics/wind_generator.h"

namespace btk::ballistics
{


  constexpr float DEFAULT_LIFT_SLOPE_PER_RAD = 1.27169f;
  constexpr float DEFAULT_RESTORING_MOMENT_SLOPE_PER_RAD = -0.124862f;
  constexpr float DEFAULT_YAW_OF_REPOSE_SCALE = 0.426516f;
  constexpr float DEFAULT_BETA_LAG_SCALE = 0.670554f;


  /**
   * @brief Result of zeroing calculation
   */
  struct ZeroingResult
  {
    Bullet initial_state;
    float elevation_angle; // rad
    float azimuth_angle;   // rad (windage)
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
    Simulator()
      : initial_bullet_(0.0f, 0.0f, 0.0f, 0.0f), current_bullet_(0.0f, 0.0f, 0.0f, 0.0f), atmosphere_(), wind_(0.0f, 0.0f, 0.0f), current_time_(0.0f), trajectory_(),
        lift_slope_per_rad_(DEFAULT_LIFT_SLOPE_PER_RAD), restoring_moment_slope_per_rad_(DEFAULT_RESTORING_MOMENT_SLOPE_PER_RAD), 
        yaw_of_repose_scale_(DEFAULT_YAW_OF_REPOSE_SCALE), beta_lag_scale_(DEFAULT_BETA_LAG_SCALE)
    {
    }

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
     * @brief Compute zeroed initial state for given muzzle velocity and target position
     *
     * @param muzzle_velocity Muzzle velocity in m/s
     * @param target_position Target position as 3D vector (x=crossrange, y=vertical, z=downrange) in m
     * @param dt Time step for zeroing calculation in s (default: 0.001f)
     * @param max_iterations Maximum iterations for zeroing (default: 50)
     * @param tolerance Convergence tolerance for zeroing in m (default: 0.001f)
     * @param spin_rate Bullet spin rate in rad/s (default: 0.0f)
     * @return Const reference to the zeroed initial bullet
     */
    const Bullet& computeZero(float muzzle_velocity, const btk::math::Vector3D& target_position, float dt = 0.001f, int max_iterations = 20, float tolerance = 0.001f, float spin_rate = 0.0f);

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

    // Aerodynamic parameter setters
    void setLiftSlopePerRad(float value) { lift_slope_per_rad_ = value; }
    void setRestoringMomentSlopePerRad(float value) { restoring_moment_slope_per_rad_ = value; }
    void setYawOfReposeScale(float value) { yaw_of_repose_scale_ = value; }
    void setBetaLagScale(float value) { beta_lag_scale_ = value; }

    // Aerodynamic parameter getters
    float getLiftSlopePerRad() const { return lift_slope_per_rad_; }
    float getRestoringMomentSlopePerRad() const { return restoring_moment_slope_per_rad_; }
    float getYawOfReposeScale() const { return yaw_of_repose_scale_; }
    float getBetaLagScale() const { return beta_lag_scale_; }

    private:
    // Physics helpers
    float calculateDragRetardationFor(const Bullet& s) const;
    btk::math::Vector3D calculateAccelerationFor(Bullet& s, float dt);
    btk::math::Vector3D computeSpinWindAccel(Bullet& s, const btk::math::Vector3D& gravity, const btk::math::Vector3D& wind, float dt);

    // Internal state
    Bullet initial_bullet_;
    Bullet current_bullet_;
    btk::physics::Atmosphere atmosphere_;
    btk::math::Vector3D wind_;
    float current_time_;
    Trajectory trajectory_;

    // Tunable aerodynamic parameters
    float lift_slope_per_rad_;
    float restoring_moment_slope_per_rad_;
    float yaw_of_repose_scale_;
    float beta_lag_scale_;
  };

} // namespace btk::ballistics