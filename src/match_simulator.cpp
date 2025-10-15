#include "match_simulator.h"
#include "atmosphere.h"
#include "simulator.h"
#include <algorithm>
#include <cmath>

static double clipToThreeSigma(double value, double mean, double sd)
{
  return std::max(mean - 3 * sd, std::min(mean + 3 * sd, value));
}

namespace btk::ballistics
{

  SimulatedShot::SimulatedShot(const Distance& impact_x, const Distance& impact_y, int score, bool is_x,
                         const Velocity& actual_mv, double actual_bc, const Velocity& wind_downrange,
                         const Velocity& wind_crossrange, const Velocity& wind_vertical, const Angle& release_angle_h,
                         const Angle& release_angle_v, const Velocity& impact_velocity)
    : impact_x(impact_x), impact_y(impact_y), score(score), is_x(is_x), actual_mv(actual_mv), actual_bc(actual_bc),
      wind_downrange(wind_downrange), wind_crossrange(wind_crossrange), wind_vertical(wind_vertical),
      release_angle_h(release_angle_h), release_angle_v(release_angle_v), impact_velocity(impact_velocity)
  {
  }


  MatchSimulator::MatchSimulator(const Bullet& bullet, const Velocity& nominal_mv, const Target& target,
                                 const Distance& target_range, const Atmosphere& atmosphere, const Velocity& mv_sd,
                                 const Velocity& wind_speed_sd, const Velocity& headwind_sd, const Velocity& updraft_sd,
                                 const Angle& rifle_accuracy, double timestep)
    : bullet_(bullet), nominal_mv_(nominal_mv), target_(target), target_range_(target_range), atmosphere_(atmosphere),
      mv_sd_(mv_sd), wind_speed_sd_(wind_speed_sd), headwind_sd_(headwind_sd), updraft_sd_(updraft_sd),
      rifle_accuracy_(rifle_accuracy), timestep_(timestep),
      zeroed_state_(Weight::zero(), Distance::zero(), Distance::zero(), 0.0),
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

  SimulatedShot MatchSimulator::fireShot()
  {
    // Apply muzzle velocity variation (clipped to 3-sigma)
    double mv_sd_fps = mv_sd_.fps();
    std::normal_distribution<double> mv_dist(nominal_mv_.fps(), mv_sd_fps);
    double mv_fps = clipToThreeSigma(mv_dist(rng_), nominal_mv_.fps(), mv_sd_fps);
    Velocity mv = Velocity::fps(mv_fps);

    // Use original bullet (no BC variation for now)
    Bullet varied_bullet = bullet_;

    // Generate 3D wind components
    // Crosswind (left/right)
    double crosswind_sd_mph = wind_speed_sd_.mph();
    std::normal_distribution<double> crosswind_dist(0.0, crosswind_sd_mph);
    double crosswind_mph = clipToThreeSigma(crosswind_dist(rng_), 0.0, crosswind_sd_mph);

    // Head/tail wind (downrange)
    double headwind_sd_mph = headwind_sd_.mph();
    std::normal_distribution<double> headwind_dist(0.0, headwind_sd_mph);
    double headwind_mph = clipToThreeSigma(headwind_dist(rng_), 0.0, headwind_sd_mph);

    // Up/down draft (vertical)
    double updraft_sd_mph = updraft_sd_.mph();
    std::normal_distribution<double> updraft_dist(0.0, updraft_sd_mph);
    double updraft_mph = clipToThreeSigma(updraft_dist(rng_), 0.0, updraft_sd_mph);

    // Create 3D wind vector
    Wind varied_wind = Wind(
      Velocity::mph(std::sqrt(crosswind_mph * crosswind_mph + headwind_mph * headwind_mph)),
      Angle::degrees(std::atan2(crosswind_mph, headwind_mph) * 180.0 / M_PI),
      Velocity::mph(updraft_mph)
    );

    // Create initial state with varied MV
    // Start from zeroed angle and position
    Bullet initial_state =
      Bullet(varied_bullet, zeroed_state_.getPosition(),
             Velocity3D(mv * (zeroed_state_.getVelocity().x / nominal_mv_),
                        zeroed_state_.getVelocity().y,
                        mv * (zeroed_state_.getVelocity().z / nominal_mv_)),
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
      initial_state.getVelocity().y + initial_state.getVelocity().x * h_angle_rad,
      initial_state.getVelocity().z + initial_state.getVelocity().x * v_angle_rad);

    Bullet final_initial_state =
      Bullet(initial_state, initial_state.getPosition(), modified_velocity, initial_state.getSpinRate());

    // Simulate trajectory with actual wind
    Trajectory trajectory = Simulator::simulateToDistance(final_initial_state, target_range_, varied_wind, atmosphere_,
                                                          Time::seconds(timestep_));

    // Get impact at target range
    TrajectoryPoint impact_point = trajectory.atDistance(target_range_);

    // Check if we got a valid impact (not NaN time)
    if(std::isnan(impact_point.getTime().seconds()))
    {
      // Shouldn't happen, but handle gracefully
      SimulatedShot simulatedShot(Distance::inches(999.0), Distance::inches(999.0), 0, false, mv, bullet_.getBc(),
                      Velocity::mph(headwind_mph), Velocity::mph(crosswind_mph), Velocity::mph(updraft_mph),
                      release_angle_h, release_angle_v, Velocity::zero());
      shots_.push_back(simulatedShot);
      return simulatedShot;
    }

    // Get impact position and velocity
    Distance impact_x = impact_point.getState().getPosition().y;        // Y is crosswind
    Distance impact_y = impact_point.getState().getPosition().z;        // Z is vertical
    Velocity impact_velocity = impact_point.getState().getVelocity().x; // Forward velocity at impact

    // Score the shot and add to match
    auto [score, is_x] = match_.addHit(impact_x, impact_y, target_, bullet_.getDiameter());

    SimulatedShot simulatedShot(impact_x, impact_y, score, is_x, mv, bullet_.getBc(), Velocity::mph(headwind_mph),
                    Velocity::mph(crosswind_mph), Velocity::mph(updraft_mph), release_angle_h, release_angle_v,
                    impact_velocity);

    // Store shot result for diagnostics
    shots_.push_back(simulatedShot);

    return simulatedShot;
  }


  void MatchSimulator::clearShots()
  {
    match_.clear();
    shots_.clear();
  }

} // namespace btk::ballistics
