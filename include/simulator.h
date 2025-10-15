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
     * - Time: 0.0 seconds
     */
    Simulator() : initial_bullet_(0.0, 0.0, 0.0, 0.0), current_bullet_(0.0, 0.0, 0.0, 0.0), 
                  atmosphere_(), wind_(0.0, 0.0, 0.0), current_time_(0.0) {}

    // Setters (individual)
    /**
     * @brief Set bullet properties and update both initial and current bullet states
     * 
     * @param bullet Bullet object with physical properties (weight, diameter, length, BC, drag function)
     */
    void setBullet(const Bullet& bullet);

    /**
     * @brief Set initial bullet state (for advanced use)
     * 
     * @param bullet Bullet object representing the initial state
     */
    void setInitialBullet(const Bullet& bullet);

    /**
     * @brief Set current bullet state
     * 
     * @param bullet Bullet object representing the current in-flight state
     */
    void setCurrentBullet(const Bullet& bullet);

    /**
     * @brief Set atmospheric conditions
     * 
     * @param atmosphere Atmosphere object with temperature, altitude, humidity, and pressure
     */
    void setAtmosphere(const Atmosphere& atmosphere);

    /**
     * @brief Set wind conditions
     * 
     * @param wind Wind vector in Cartesian coordinates (x=downrange m/s, y=crossrange m/s, z=vertical m/s)
     */
    void setWind(const Vector3D& wind);

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
    const Atmosphere& getAtmosphere() const;

    /**
     * @brief Get wind conditions
     * 
     * @return Reference to the current wind vector
     */
    const Vector3D& getWind() const;

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
     * @param dt Time step for zeroing calculation in s (default: 0.001)
     * @param max_iterations Maximum iterations for zeroing (default: 20)
     * @param tolerance Convergence tolerance for zeroing in m (default: 0.001)
     * @param spin_rate Bullet spin rate in rad/s (default: 0.0)
     */
    void computeZero(double muzzle_velocity, double scope_height, double zero_range,
                     double dt = 0.001, int max_iterations = 20, double tolerance = 0.001, double spin_rate = 0.0);

    /**
     * @brief Simulate trajectory from current state to maximum distance
     * 
     * @param max_distance Maximum distance to simulate in m
     * @param dt Time step for simulation in s (default: 0.001)
     * @param max_time Maximum simulation time in s (default: 60.0)
     * @return Trajectory object containing all simulation points
     */
    Trajectory simulate(double max_distance, double dt = 0.001, double max_time = 60.0);

    /**
     * @brief Advance simulation by one time step
     * 
     * @param dt Time step in s
     */
    void timeStep(double dt);

    // State queries
    /**
     * @brief Get current bullet distance (X position)
     * 
     * @return Current bullet X position in m
     */
    double getCurrentDistance() const;

    /**
     * @brief Get current simulation time
     * 
     * @return Current simulation time in s
     */
    double getCurrentTime() const;


    private:
    // Physics helpers
    double calculateDragRetardation() const;
    Vector3D calculateAcceleration() const;

    // Internal state
    Bullet initial_bullet_;
    Bullet current_bullet_;
    Atmosphere atmosphere_;
    Vector3D wind_;
    double current_time_;

  };

} // namespace btk::ballistics