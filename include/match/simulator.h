#pragma once

#include "ballistics/bullet.h"
#include "ballistics/simulator.h"
#include "match/match.h"
#include "match/target.h"
#include "math/conversions.h"
#include "math/vector.h"
#include "physics/atmosphere.h"
#include <random>
#include <string>
#include <vector>

namespace btk::match
{

  /**
   * @brief Result of a single simulated shot
   */
  struct SimulatedShot
  {
    float impact_x;        // Horizontal impact position in m (positive = right, X=crossrange)
    float impact_y;        // Vertical impact position in m (positive = up, Y=vertical)
    int score;             // Shot score (0-10)
    bool is_x;             // Whether shot is in X-ring
    float actual_mv;       // Actual muzzle velocity in m/s for this shot
    float actual_bc;       // Actual ballistic coefficient for this shot
    float wind_downrange;  // Head/tail wind component in m/s (positive = tailwind, wind in -Z direction)
    float wind_crossrange; // Crosswind component in m/s (positive = from right, wind in +X direction)
    float wind_vertical;   // Up/down draft component in m/s (positive = updraft, wind in +Y direction)
    float release_angle_h; // Horizontal release angle in rad
    float release_angle_v; // Vertical release angle in rad
    float impact_velocity; // Velocity at target impact in m/s

    SimulatedShot()
      : impact_x(0.0f), impact_y(0.0f), score(0), is_x(false), actual_mv(0.0f), actual_bc(0.0f), wind_downrange(0.0f), wind_crossrange(0.0f), wind_vertical(0.0f), release_angle_h(0.0f),
        release_angle_v(0.0f), impact_velocity(0.0f)
    {
    }
    SimulatedShot(float impact_x, float impact_y, int score, bool is_x, float actual_mv, float actual_bc, float wind_downrange, float wind_crossrange, float wind_vertical, float release_angle_h,
                  float release_angle_v, float impact_velocity);
  };

  /**
   * @brief Match simulator that zeros once and fires multiple shots
   *
   * This class is more efficient than standalone functions because it:
   * - Computes the zero angle once during initialization
   * - Reuses the zeroed initial state for all shots
   * - Tracks all shots and can compute statistics on demand
   */
  class Simulator
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
     * @param twist_rate Twist rate in m/turn (positive for RH, negative for LH). Default 0 (no spin).
     */
    Simulator(const btk::ballistics::Bullet& bullet, float nominal_mv, const btk::match::Target& target, float target_range, const btk::physics::Atmosphere& atmosphere, float mv_sd,
              float wind_speed_sd, float headwind_sd, float updraft_sd, float rifle_accuracy, float timestep = 0.001f, float twist_rate = 0.0f);

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
    const btk::match::Target& getTarget() const { return target_; }

    /**
     * @brief Get the bullet for this match
     */
    const btk::ballistics::Bullet& getBullet() const { return bullet_; }

    /**
     * @brief Get the bullet diameter
     */
    float getBulletDiameter() const
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
    btk::ballistics::Bullet bullet_;
    float nominal_mv_; // m/s
    btk::match::Target target_;
    float target_range_; // m
    btk::physics::Atmosphere atmosphere_;
    float mv_sd_;          // m/s
    float wind_speed_sd_;  // m/s
    float headwind_sd_;    // m/s
    float updraft_sd_;     // m/s
    float rifle_accuracy_; // rad
    float timestep_;       // s

    // Simulator for trajectory calculations
    btk::ballistics::Simulator simulator_;

    // Cached zeroed bullet (original zeroed state)
    btk::ballistics::Bullet zeroed_bullet_;

    // Track all shots using Match class
    Match match_;

    // Store detailed shot diagnostics
    std::vector<SimulatedShot> shots_;
  };

} // namespace btk::match
