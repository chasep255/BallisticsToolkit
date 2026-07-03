#pragma once

#include "ballistics/bullet.h"
#include "ballistics/trajectory.h"
#include "math/vector.h"
#include "physics/atmosphere.h"
#include "physics/wind_generator.h"

namespace btk::ballistics
{

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
      : initial_bullet_(0.0f, 0.0f, 0.0f, 0.0f), current_bullet_(0.0f, 0.0f, 0.0f, 0.0f), atmosphere_(), wind_(0.0f, 0.0f, 0.0f), current_time_(0.0f), trajectory_(), sg_(0.0f), twist_hand_(1),
        prev_wcross_(0.0f)
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
     * @param wind Wind vector in Cartesian coordinates (x=crossrange m/s, y=vertical m/s, z=-downrange m/s)
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
     * @param tolerance Convergence tolerance for zeroing in m (default: 1e-6f). 1mm subtends
     *                  ~0.038 MOA at 100yd, so a looser tolerance leaves a visible zero residual.
     * @param spin_rate Bullet spin rate in rad/s (default: 0.0f)
     * @return Const reference to the zeroed initial bullet
     */
    const Bullet& computeZero(float muzzle_velocity, const btk::math::Vector3D& target_position, float dt = 0.001f, int max_iterations = 20, float tolerance = 1e-6f, float spin_rate = 0.0f);

    /**
     * @brief Simulate trajectory from current state to maximum distance
     *
     * @param max_distance Maximum distance to simulate in m
     * @param dt Time step for simulation in s (default: 0.001f)
     * @param max_time Maximum simulation time in s (default: 60.0f)
     */
    void simulate(float max_distance, float dt = 0.001f, float max_time = 60.0f);

    /**
     * @brief Simulate trajectory with wind generator sampling
     *
     * @param max_distance Maximum distance to simulate in m
     * @param dt Time step for simulation in s
     * @param max_time Maximum simulation time in s
     * @param wind_gen Wind generator for position/time-dependent wind
     */
    void simulate(float max_distance, float dt, float max_time, const btk::physics::WindGenerator& wind_gen);

    /**
     * @brief Advance simulation by one time step
     *
     * @param dt Time step in s
     */
    void timeStep(float dt);

    // State queries
    /**
     * @brief Get current bullet downrange distance
     *
     * @return Current downrange distance along -Z axis in m
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
    Trajectory& getTrajectory() { return trajectory_; };
    const Trajectory& getTrajectory() const { return trajectory_; };

    /**
     * @brief Get deceleration (drag retardation) for a bullet state
     *
     * @param bullet Bullet state to calculate deceleration for
     * @return Deceleration magnitude in m/s²
     */
    float getDeceleration(const Bullet& bullet) const;

    /**
     * @brief Standard drag retardation r(v) = a·v^m for a BC = 1 reference
     *        projectile at standard air density: the bare shape of the G1 or G7
     *        drag curve, independent of any specific bullet or atmosphere.
     *
     * @param drag_function G1 or G7
     * @param velocity_fps Air-relative speed in feet per second
     * @return Retardation (deceleration) in feet per second squared (fps²)
     */
    static float standardRetardation(DragFunction drag_function, float velocity_fps);

    private:
    // Physics helpers
    float computeDeceleration(const Bullet& s) const;
    btk::math::Vector3D calculateAccelerationFor(const Bullet& s, float t) const;

    // Litz spin-drift acceleration: SD(t) = 1.25·(SG+1.2)·t^1.83, injected as
    // its second time-derivative so the integrator reproduces the drift curve.
    btk::math::Vector3D computeSpinDriftAccel(const Bullet& s, float t) const;

    // Litz crosswind aerodynamic jump: a vertical velocity impulse applied
    // whenever the crosswind the bullet sees changes (muzzle entry + downrange).
    void applyCrosswindJump();

    // Compute the corrected muzzle SG + twist handedness from the launch state.
    void computeLaunchStability();

    // Internal state
    Bullet initial_bullet_;
    Bullet current_bullet_;
    btk::physics::Atmosphere atmosphere_;
    btk::math::Vector3D wind_;
    float current_time_;
    Trajectory trajectory_;

    // Litz spin model (computed at launch)
    float sg_;          // corrected muzzle gyroscopic stability factor
    int twist_hand_;    // +1 = right-hand twist, -1 = left-hand
    float prev_wcross_; // crosswind (m/s) seen on the previous step, for the jump impulse
  };

} // namespace btk::ballistics