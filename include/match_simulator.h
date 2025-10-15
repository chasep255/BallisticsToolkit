#pragma once

#include "atmosphere.h"
#include "bullet.h"
#include "match.h"
#include "simulator.h"
#include "target.h"
#include "units.h"
#include <random>
#include <string>
#include <vector>

namespace btk::ballistics
{

  /**
   * @brief Result of a single simulated shot
   */
  struct SimulatedShot
  {
    Distance impact_x;        // Horizontal impact position (positive = right)
    Distance impact_y;        // Vertical impact position (positive = up)
    int score;                // Shot score (0-10)
    bool is_x;                // Whether shot is in X-ring
    Velocity actual_mv;       // Actual muzzle velocity for this shot
    double actual_bc;         // Actual ballistic coefficient for this shot
    Velocity wind_downrange;  // Head/tail wind component (positive = tailwind)
    Velocity wind_crossrange; // Crosswind component (positive = from left)
    Velocity wind_vertical;   // Up/down draft component (positive = updraft)
    Angle release_angle_h;    // Horizontal release angle
    Angle release_angle_v;    // Vertical release angle
    Velocity impact_velocity; // Velocity at target impact

    SimulatedShot()
      : impact_x(Distance::zero()), impact_y(Distance::zero()), score(0), is_x(false), actual_mv(Velocity::zero()),
        actual_bc(0.0), wind_downrange(Velocity::zero()), wind_crossrange(Velocity::zero()),
        wind_vertical(Velocity::zero()), release_angle_h(Angle::zero()), release_angle_v(Angle::zero()),
        impact_velocity(Velocity::zero())
    {
    }
    SimulatedShot(const Distance& impact_x, const Distance& impact_y, int score, bool is_x, const Velocity& actual_mv,
               double actual_bc, const Velocity& wind_downrange, const Velocity& wind_crossrange,
               const Velocity& wind_vertical, const Angle& release_angle_h, const Angle& release_angle_v,
               const Velocity& impact_velocity);
  };


  /**
   * @brief Match simulator that zeros once and fires multiple shots
   *
   * This class is more efficient than standalone functions because it:
   * - Computes the zero angle once during initialization
   * - Reuses the zeroed initial state for all shots
   * - Tracks all shots and can compute statistics on demand
   */
  class MatchSimulator
  {
    public:
    /**
     * @brief Initialize the match simulator
     *
     * @param bullet Bullet properties (including diameter)
     * @param nominal_mv Nominal muzzle velocity
     * @param target Target for scoring
     * @param target_range Distance to target
     * @param atmosphere Atmospheric conditions
     * @param mv_sd Muzzle velocity standard deviation
     * @param wind_speed_sd Crosswind speed standard deviation
     * @param headwind_sd Head/tail wind speed standard deviation
     * @param updraft_sd Up/down draft speed standard deviation
     * @param rifle_accuracy Rifle/shooter accuracy (angular dispersion, 1-sigma)
     * @param timestep Simulation timestep in seconds
     */
    MatchSimulator(const Bullet& bullet, const Velocity& nominal_mv, const Target& target, const Distance& target_range,
                   const Atmosphere& atmosphere, const Velocity& mv_sd, const Velocity& wind_speed_sd,
                   const Velocity& headwind_sd, const Velocity& updraft_sd, const Angle& rifle_accuracy,
                   double timestep = 0.001);

    /**
     * @brief Fire a single shot with variability
     *
     * @return SimulatedShot with impact location and score
     */
    SimulatedShot fireShot();

    /**
     * @brief Get the underlying Match object for statistics
     *
     * @return Reference to the Match object
     */
    const Match& getMatch() const
    {
      return match_;
    }

    /**
     * @brief Clear all fired shots
     */
    void clearShots();

    /**
     * @brief Get number of shots fired
     */
    size_t getShotCount() const
    {
      return match_.getHitCount();
    }

    /**
     * @brief Get the target for this match
     */
    const Target& getTarget() const
    {
      return target_;
    }

    /**
     * @brief Get the bullet for this match
     */
    const Bullet& getBullet() const
    {
      return bullet_;
    }

    /**
     * @brief Get the bullet diameter
     */
    Distance getBulletDiameter() const
    {
      return bullet_.getDiameter();
    }

    /**
     * @brief Get all shot results with diagnostics
     */
    const std::vector<SimulatedShot>& getShots() const
    {
      return shots_;
    }

    /**
     * @brief Get a specific shot by index
     */
    const SimulatedShot& getShot(size_t index) const
    {
      return shots_[index];
    }

    private:
    Bullet bullet_;
    Velocity nominal_mv_;
    Target target_;
    Distance target_range_;
    Atmosphere atmosphere_;
    Velocity mv_sd_;
    Velocity wind_speed_sd_;
    Velocity headwind_sd_;
    Velocity updraft_sd_;
    Angle rifle_accuracy_;
    double timestep_;

    // Zeroed state computed once at initialization
    Bullet zeroed_state_;

    // Track all shots using Match class
    Match match_;
    
    // Store detailed shot diagnostics
    std::vector<SimulatedShot> shots_;

    // Random number generator
    mutable std::mt19937 rng_;
  };

} // namespace btk::ballistics
