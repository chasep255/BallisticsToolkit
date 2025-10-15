#include "match_simulator.h"
#include "atmosphere.h"
#include "simulator.h"
#include "conversions.h"
#include <algorithm>
#include <cmath>
#include <random>

static double clipToThreeSigma(double value, double mean, double sd)
{
  return std::max(mean - 3 * sd, std::min(mean + 3 * sd, value));
}

namespace btk::ballistics
{

  SimulatedShot::SimulatedShot(double impact_x, double impact_y, int score, bool is_x,
                         double actual_mv, double actual_bc, double wind_downrange,
                         double wind_crossrange, double wind_vertical, double release_angle_h,
                         double release_angle_v, double impact_velocity)
    : impact_x(impact_x), impact_y(impact_y), score(score), is_x(is_x), actual_mv(actual_mv), actual_bc(actual_bc),
      wind_downrange(wind_downrange), wind_crossrange(wind_crossrange), wind_vertical(wind_vertical),
      release_angle_h(release_angle_h), release_angle_v(release_angle_v), impact_velocity(impact_velocity)
  {
  }


  MatchSimulator::MatchSimulator(const Bullet& bullet, double nominal_mv, const Target& target,
                                 double target_range, const Atmosphere& atmosphere, double mv_sd,
                                 double wind_speed_sd, double headwind_sd, double updraft_sd,
                                 double rifle_accuracy, double timestep)
    : bullet_(bullet), nominal_mv_(nominal_mv), target_(target), target_range_(target_range), atmosphere_(atmosphere),
      mv_sd_(mv_sd), wind_speed_sd_(wind_speed_sd), headwind_sd_(headwind_sd), updraft_sd_(updraft_sd),
      rifle_accuracy_(rifle_accuracy), timestep_(timestep),
      zeroed_state_(0.0, 0.0, 0.0, 0.0),
      rng_(std::random_device{}())
  {
    // Zero the rifle once at initialization
    // Zero with nominal BC and MV, no wind, scope at bore height
    double scope_height = 0.0;
    Vector3D calm_wind(0.0, 0.0, 0.0);

    zeroed_state_ = Simulator::computeZeroedInitialState(bullet, nominal_mv, scope_height, target_range, atmosphere,
                                                         calm_wind, timestep, 1000, 1e-6);
  }

  SimulatedShot MatchSimulator::fireShot()
  {
    // Apply muzzle velocity variation (clipped to 3-sigma)
    double mv_sd_mps = mv_sd_;
    std::normal_distribution<double> mv_dist(nominal_mv_, mv_sd_mps);
    double mv_mps = clipToThreeSigma(mv_dist(rng_), nominal_mv_, mv_sd_mps);

    // Use original bullet (no BC variation for now)
    Bullet varied_bullet = bullet_;

    // Generate 3D wind components
    // Crosswind (left/right)
    double crosswind_sd_mps = wind_speed_sd_;
    std::normal_distribution<double> crosswind_dist(0.0, crosswind_sd_mps);
    double crosswind_mps = clipToThreeSigma(crosswind_dist(rng_), 0.0, crosswind_sd_mps);

    // Head/tail wind (downrange)
    double headwind_sd_mps = headwind_sd_;
    std::normal_distribution<double> headwind_dist(0.0, headwind_sd_mps);
    double headwind_mps = clipToThreeSigma(headwind_dist(rng_), 0.0, headwind_sd_mps);

    // Up/down draft (vertical)
    double updraft_sd_mps = updraft_sd_;
    std::normal_distribution<double> updraft_dist(0.0, updraft_sd_mps);
    double updraft_mps = clipToThreeSigma(updraft_dist(rng_), 0.0, updraft_sd_mps);

    // Create 3D wind vector (Cartesian coordinates)
    Vector3D varied_wind(headwind_mps, crosswind_mps, updraft_mps);

    // Create initial state with varied MV
    // Start from zeroed angle and position
    Vector3D zeroed_velocity = zeroed_state_.getVelocity();
    Vector3D scaled_velocity = Vector3D(
      mv_mps * (zeroed_velocity.x / nominal_mv_),
      zeroed_velocity.y,
      mv_mps * (zeroed_velocity.z / nominal_mv_)
    );
    Bullet initial_state = Bullet(varied_bullet, zeroed_state_.getPosition(), scaled_velocity, zeroed_state_.getSpinRate());

    // Apply rifle accuracy (uniform distribution within circle of given diameter)
    // Generate random angle and radius for uniform distribution in circle
    std::uniform_real_distribution<double> angle_dist(0.0, 2.0 * M_PI);
    std::uniform_real_distribution<double> radius_dist(0.0, 1.0);

    double angle = angle_dist(rng_);
    double radius_rad = (rifle_accuracy_ / 2.0) * std::sqrt(radius_dist(rng_));

    // Convert to horizontal and vertical components
    double h_angle_rad = radius_rad * std::cos(angle);
    double v_angle_rad = radius_rad * std::sin(angle);

    // Store release angles for tracking
    double release_angle_h = h_angle_rad;
    double release_angle_v = v_angle_rad;

    // Modify velocity components for angular dispersion
    Vector3D modified_velocity = Vector3D(
      initial_state.getVelocity().x,
      initial_state.getVelocity().y + initial_state.getVelocity().x * h_angle_rad,
      initial_state.getVelocity().z + initial_state.getVelocity().x * v_angle_rad);

    Bullet final_initial_state =
      Bullet(initial_state, initial_state.getPosition(), modified_velocity, initial_state.getSpinRate());

    // Simulate trajectory with actual wind
    Trajectory trajectory = Simulator::simulateToDistance(final_initial_state, target_range_, varied_wind, atmosphere_,
                                                          timestep_);

    // Get impact at target range
    TrajectoryPoint impact_point = trajectory.atDistance(target_range_);

    // Check if we got a valid impact (not NaN time)
    if(std::isnan(impact_point.getTime()))
    {
      // Shouldn't happen, but handle gracefully
      SimulatedShot simulatedShot(Conversions::inchesToMeters(999.0), Conversions::inchesToMeters(999.0), 0, false, mv_mps, bullet_.getBc(),
                      headwind_mps, crosswind_mps, updraft_mps,
                      release_angle_h, release_angle_v, 0.0);
      shots_.push_back(simulatedShot);
      return simulatedShot;
    }

    // Get impact position and velocity
    double impact_x = impact_point.getState().getPosition().y;        // Y is crosswind
    double impact_y = impact_point.getState().getPosition().z;        // Z is vertical
    double impact_velocity = impact_point.getState().getVelocity().x; // Forward velocity at impact

    // Score the shot and add to match
    auto [score, is_x] = match_.addHit(impact_x, impact_y, target_, bullet_.getDiameter());

    SimulatedShot simulatedShot(impact_x, impact_y, score, is_x, mv_mps, bullet_.getBc(), headwind_mps,
                    crosswind_mps, updraft_mps, release_angle_h, release_angle_v,
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
