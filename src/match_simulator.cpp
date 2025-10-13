#include "match_simulator.h"
#include "atmosphere.h"
#include "simulator.h"
#include <algorithm>
#include <cmath>

namespace btk::ballistics
{

    ShotResult::ShotResult(const Distance& impact_x, const Distance& impact_y, int score, bool is_x,
                           const Velocity& actual_mv, double actual_bc, const Velocity& wind_downrange,
                           const Velocity& wind_crossrange, const Velocity& wind_vertical, const Angle& release_angle_h,
                           const Angle& release_angle_v, const Velocity& impact_velocity)
        : impact_x(impact_x), impact_y(impact_y), score(score), is_x(is_x), actual_mv(actual_mv), actual_bc(actual_bc),
          wind_downrange(wind_downrange), wind_crossrange(wind_crossrange), wind_vertical(wind_vertical),
          release_angle_h(release_angle_h), release_angle_v(release_angle_v), impact_velocity(impact_velocity)
    {
    }

    MatchResult::MatchResult(const std::vector<ShotResult>& shots, int total_score, int x_count,
                             const Distance& group_size)
        : shots(shots), total_score(total_score), x_count(x_count), group_size(group_size)
    {
    }

    MatchSimulator::MatchSimulator(const Bullet& bullet, const Velocity& nominal_mv, const Target& target,
                                   const Distance& target_range, const Atmosphere& atmosphere, const Velocity& mv_sd,
                                   const Velocity& wind_speed_sd, const Velocity& headwind_sd,
                                   const Velocity& updraft_sd, const Angle& rifle_accuracy, double timestep)
        : bullet_(bullet), nominal_mv_(nominal_mv), target_(target), target_range_(target_range),
          atmosphere_(atmosphere), mv_sd_(mv_sd), wind_speed_sd_(wind_speed_sd), headwind_sd_(headwind_sd),
          updraft_sd_(updraft_sd), rifle_accuracy_(rifle_accuracy), timestep_(timestep),
          bullet_diameter_(bullet.getDiameter()),
          zeroed_state_(Weight::zero(), Distance::zero(), Distance::zero(), 0.0), zero_angle_(Angle::zero()),
          rng_(std::random_device{}())
    {
        // Zero the rifle once at initialization
        // Zero with nominal BC and MV, no wind, scope at bore height
        Distance scope_height = Distance::zero();
        Wind calm_wind = Wind::calm();
        Time dt = Time::seconds(timestep);

        zeroed_state_ = Simulator::computeZeroedInitialState(bullet, nominal_mv, scope_height, target_range, atmosphere,
                                                             calm_wind, dt, 1000, Distance::meters(1e-6));
    }

    ShotResult MatchSimulator::fireShot()
    {
        // Apply muzzle velocity variation (clipped to 3-sigma)
        double mv_sd_fps = mv_sd_.fps();
        std::normal_distribution<double> mv_dist(nominal_mv_.fps(), mv_sd_fps);
        double mv_fps = mv_dist(rng_);
        // Clip to 3-sigma range
        mv_fps = std::max(nominal_mv_.fps() - 3 * mv_sd_fps, std::min(nominal_mv_.fps() + 3 * mv_sd_fps, mv_fps));
        Velocity mv = Velocity::fps(mv_fps);

        // Use original bullet (no BC variation for now)
        Bullet varied_bullet = bullet_;

        // Generate 3D wind components
        // Crosswind (left/right)
        double crosswind_sd_mph = wind_speed_sd_.mph();
        std::normal_distribution<double> crosswind_dist(0.0, crosswind_sd_mph);
        double crosswind_mph = crosswind_dist(rng_);
        crosswind_mph = std::max(-3 * crosswind_sd_mph, std::min(3 * crosswind_sd_mph, crosswind_mph));

        // Head/tail wind (downrange)
        double headwind_sd_mph = headwind_sd_.mph();
        std::normal_distribution<double> headwind_dist(0.0, headwind_sd_mph);
        double headwind_mph = headwind_dist(rng_);
        headwind_mph = std::max(-3 * headwind_sd_mph, std::min(3 * headwind_sd_mph, headwind_mph));

        // Up/down draft (vertical)
        double updraft_sd_mph = updraft_sd_.mph();
        std::normal_distribution<double> updraft_dist(0.0, updraft_sd_mph);
        double updraft_mph = updraft_dist(rng_);
        updraft_mph = std::max(-3 * updraft_sd_mph, std::min(3 * updraft_sd_mph, updraft_mph));

        // Create 3D wind vector
        // For now, use horizontal wind only (crosswind + headwind combined)
        double total_horizontal_mph = std::sqrt(crosswind_mph * crosswind_mph + headwind_mph * headwind_mph);
        double wind_direction_deg = std::atan2(crosswind_mph, headwind_mph) * 180.0 / M_PI;
        Wind varied_wind =
            Wind(Velocity::mph(total_horizontal_mph), Angle::degrees(wind_direction_deg), Velocity::mph(updraft_mph));

        // Create initial state with varied MV
        // Start from zeroed angle and position
        Bullet initial_state =
            Bullet(varied_bullet, zeroed_state_.getPosition(),
                   Velocity3D(Velocity::mps(mv.mps() * zeroed_state_.getVelocity().x.mps() / nominal_mv_.mps()),
                              zeroed_state_.getVelocity().y,
                              Velocity::mps(mv.mps() * zeroed_state_.getVelocity().z.mps() / nominal_mv_.mps())),
                   zeroed_state_.getSpinRate());

        // Apply rifle accuracy (uniform distribution within max diameter)
        // Generate random angle and radius for uniform distribution in circle
        std::uniform_real_distribution<double> angle_dist(0.0, 2.0 * M_PI);
        std::uniform_real_distribution<double> radius_dist(0.0, 1.0);

        double angle = angle_dist(rng_);
        double radius_rad = rifle_accuracy_.radians() * std::sqrt(radius_dist(rng_));

        // Convert to horizontal and vertical components
        double h_angle_rad = radius_rad * std::cos(angle);
        double v_angle_rad = radius_rad * std::sin(angle);

        // Store release angles for tracking
        Angle release_angle_h = Angle::radians(h_angle_rad);
        Angle release_angle_v = Angle::radians(v_angle_rad);

        // Modify velocity components for angular dispersion
        Velocity3D modified_velocity = Velocity3D(
            initial_state.getVelocity().x,
            Velocity::mps(initial_state.getVelocity().y.mps() + initial_state.getVelocity().x.mps() * h_angle_rad),
            Velocity::mps(initial_state.getVelocity().z.mps() + initial_state.getVelocity().x.mps() * v_angle_rad));

        Bullet final_initial_state =
            Bullet(initial_state, initial_state.getPosition(), modified_velocity, initial_state.getSpinRate());

        // Simulate trajectory with actual wind
        Trajectory trajectory = Simulator::simulateToDistance(final_initial_state, target_range_, varied_wind,
                                                              atmosphere_, Time::seconds(timestep_));

        // Get impact at target range
        TrajectoryPoint impact_point = trajectory.atDistance(target_range_);

        // Check if we got a valid impact (not NaN time)
        if(std::isnan(impact_point.getTime().seconds()))
        {
            // Shouldn't happen, but handle gracefully
            ShotResult shot(Distance::inches(999.0), Distance::inches(999.0), 0, false, mv, bullet_.getBc(),
                            Velocity::mph(headwind_mph), Velocity::mph(crosswind_mph), Velocity::mph(updraft_mph),
                            release_angle_h, release_angle_v, Velocity::zero());
            shots_.push_back(shot);
            return shot;
        }

        // Get impact position and velocity
        Distance impact_x = impact_point.getState().getPosition().y;        // Y is crosswind
        Distance impact_y = impact_point.getState().getPosition().z;        // Z is vertical
        Velocity impact_velocity = impact_point.getState().getVelocity().x; // Forward velocity at impact

        // Score the shot
        int score = target_.scoreHit(impact_x, impact_y, bullet_diameter_);
        bool is_x = target_.isXRing(impact_x, impact_y, bullet_diameter_);

        ShotResult shot(impact_x, impact_y, score, is_x, mv, bullet_.getBc(), Velocity::mph(headwind_mph),
                        Velocity::mph(crosswind_mph), Velocity::mph(updraft_mph), release_angle_h, release_angle_v,
                        impact_velocity);

        shots_.push_back(shot);
        return shot;
    }

    MatchResult MatchSimulator::getMatchResult() const
    {
        if(shots_.empty())
        {
            return MatchResult();
        }

        int total_score = 0;
        int x_count = 0;
        for(const auto& shot : shots_)
        {
            total_score += shot.score;
            if(shot.is_x)
                x_count++;
        }

        // Calculate group size (extreme spread)
        Distance group_size = Distance::zero();
        if(shots_.size() >= 2)
        {
            double max_distance = 0.0;
            for(size_t i = 0; i < shots_.size(); ++i)
            {
                for(size_t j = i + 1; j < shots_.size(); ++j)
                {
                    double x1 = shots_[i].impact_x.inches();
                    double y1 = shots_[i].impact_y.inches();
                    double x2 = shots_[j].impact_x.inches();
                    double y2 = shots_[j].impact_y.inches();
                    double distance = std::sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
                    max_distance = std::max(max_distance, distance);
                }
            }
            group_size = Distance::inches(max_distance);
        }

        return MatchResult(shots_, total_score, x_count, group_size);
    }

    void MatchSimulator::clearShots()
    {
        shots_.clear();
    }

} // namespace btk::ballistics
