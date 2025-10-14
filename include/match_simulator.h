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
     * @brief Result of a single shot
     */
    struct ShotResult
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

        ShotResult()
            : impact_x(Distance::zero()), impact_y(Distance::zero()), score(0), is_x(false),
              actual_mv(Velocity::zero()), actual_bc(0.0), wind_downrange(Velocity::zero()),
              wind_crossrange(Velocity::zero()), wind_vertical(Velocity::zero()), release_angle_h(Angle::zero()),
              release_angle_v(Angle::zero()), impact_velocity(Velocity::zero())
        {
        }
        ShotResult(const Distance& impact_x, const Distance& impact_y, int score, bool is_x, const Velocity& actual_mv,
                   double actual_bc, const Velocity& wind_downrange, const Velocity& wind_crossrange,
                   const Velocity& wind_vertical, const Angle& release_angle_h, const Angle& release_angle_v,
                   const Velocity& impact_velocity);
    };

    /**
     * @brief Result of a simulated match
     */
    struct MatchResult
    {
        std::vector<ShotResult> shots;
        int total_score = 0;
        int x_count = 0;
        Distance group_size = Distance::zero();

        MatchResult() = default;
        MatchResult(const std::vector<ShotResult>& shots, int total_score, int x_count, const Distance& group_size);
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
        MatchSimulator(const Bullet& bullet, const Velocity& nominal_mv, const Target& target,
                       const Distance& target_range, const Atmosphere& atmosphere, const Velocity& mv_sd,
                       const Velocity& wind_speed_sd, const Velocity& headwind_sd, const Velocity& updraft_sd,
                       const Angle& rifle_accuracy, double timestep = 0.001);

        /**
         * @brief Fire a single shot with variability
         *
         * @return ShotResult with impact location and score
         */
        ShotResult fireShot();

        /**
         * @brief Get current match result from fired shots
         *
         * @return MatchResult with statistics
         */
        MatchResult getMatchResult() const;

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
        const Distance& getBulletDiameter() const
        {
            return bullet_diameter_;
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
        Distance bullet_diameter_;

        // Zeroed state computed once at initialization
        Bullet zeroed_state_;
        Angle zero_angle_;

        // Track all shots using Match class
        Match match_;

        // Random number generator
        mutable std::mt19937 rng_;
    };

} // namespace btk::ballistics
