#pragma once

#include "atmosphere.h"
#include "bullet.h"
#include "conversions.h"
#include "match.h"
#include "simulator.h"
#include "target.h"
#include "vector.h"
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
    double impact_x;        // Horizontal impact position in m (positive = right)
    double impact_y;        // Vertical impact position in m (positive = up)
    int score;              // Shot score (0-10)
    bool is_x;              // Whether shot is in X-ring
    double actual_mv;       // Actual muzzle velocity in m/s for this shot
    double actual_bc;       // Actual ballistic coefficient for this shot
    double wind_downrange;  // Head/tail wind component in m/s (positive = tailwind)
    double wind_crossrange; // Crosswind component in m/s (positive = from left)
    double wind_vertical;   // Up/down draft component in m/s (positive = updraft)
    double release_angle_h; // Horizontal release angle in rad
    double release_angle_v; // Vertical release angle in rad
    double impact_velocity; // Velocity at target impact in m/s

    SimulatedShot()
      : impact_x(0.0), impact_y(0.0), score(0), is_x(false), actual_mv(0.0), actual_bc(0.0), wind_downrange(0.0), wind_crossrange(0.0), wind_vertical(0.0), release_angle_h(0.0), release_angle_v(0.0),
        impact_velocity(0.0)
    {
    }
    SimulatedShot(double impact_x, double impact_y, int score, bool is_x, double actual_mv, double actual_bc, double wind_downrange, double wind_crossrange, double wind_vertical,
                  double release_angle_h, double release_angle_v, double impact_velocity);
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
     * @param nominal_mv Nominal muzzle velocity in m/s
     * @param target Target for scoring
     * @param target_range Distance to target in m
     * @param atmosphere Atmospheric conditions
     * @param mv_sd Muzzle velocity standard deviation in m/s
     * @param wind_speed_sd Crosswind speed standard deviation in m/s
     * @param headwind_sd Head/tail wind speed standard deviation in m/s
     * @param updraft_sd Up/down draft speed standard deviation in m/s
     * @param rifle_accuracy Rifle/shooter accuracy in rad (angular dispersion diameter)
     * @param timestep Simulation timestep in seconds
     */
    MatchSimulator(const Bullet& bullet, double nominal_mv, const Target& target, double target_range, const Atmosphere& atmosphere, double mv_sd, double wind_speed_sd, double headwind_sd,
                   double updraft_sd, double rifle_accuracy, double timestep = 0.001);

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
    const Match& getMatch() const { return match_; }

    /**
     * @brief Clear all fired shots
     */
    void clearShots();

    /**
     * @brief Get number of shots fired
     */
    size_t getShotCount() const { return match_.getHitCount(); }

    /**
     * @brief Get the target for this match
     */
    const Target& getTarget() const { return target_; }

    /**
     * @brief Get the bullet for this match
     */
    const Bullet& getBullet() const { return bullet_; }

    /**
     * @brief Get the bullet diameter
     */
    double getBulletDiameter() const
    {
      return bullet_.getDiameter(); // m
    }

    /**
     * @brief Get all shot results with diagnostics
     */
    const std::vector<SimulatedShot>& getShots() const { return shots_; }

    /**
     * @brief Get a specific shot by index
     */
    const SimulatedShot& getShot(size_t index) const { return shots_[index]; }

    private:
    Bullet bullet_;
    double nominal_mv_; // m/s
    Target target_;
    double target_range_; // m
    Atmosphere atmosphere_;
    double mv_sd_;          // m/s
    double wind_speed_sd_;  // m/s
    double headwind_sd_;    // m/s
    double updraft_sd_;     // m/s
    double rifle_accuracy_; // rad
    double timestep_;       // s

    // Simulator for trajectory calculations
    Simulator simulator_;

    // Cached zeroed bullet (original zeroed state)
    Bullet zeroed_bullet_;

    // Track all shots using Match class
    Match match_;

    // Store detailed shot diagnostics
    std::vector<SimulatedShot> shots_;

    // Random number generator
    mutable std::mt19937 rng_;
  };

} // namespace btk::ballistics
