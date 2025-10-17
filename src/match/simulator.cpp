#include "match/simulator.h"
#include "ballistics/simulator.h"
#include "physics/atmosphere.h"
#include "physics/conversions.h"
#include <algorithm>
#include <cmath>
#include <random>

static double clipToThreeSigma(double value, double mean, double sd) { return std::max(mean - 3 * sd, std::min(mean + 3 * sd, value)); }

namespace btk::match
{

  SimulatedShot::SimulatedShot(double impact_x, double impact_y, int score, bool is_x, double actual_mv, double actual_bc, double wind_downrange, double wind_crossrange, double wind_vertical,
                               double release_angle_h, double release_angle_v, double impact_velocity)
    : impact_x(impact_x), impact_y(impact_y), score(score), is_x(is_x), actual_mv(actual_mv), actual_bc(actual_bc), wind_downrange(wind_downrange), wind_crossrange(wind_crossrange),
      wind_vertical(wind_vertical), release_angle_h(release_angle_h), release_angle_v(release_angle_v), impact_velocity(impact_velocity)
  {
  }

  Simulator::Simulator(const btk::ballistics::Bullet& bullet, double nominal_mv, const btk::match::Target& target, double target_range, const btk::physics::Atmosphere& atmosphere, double mv_sd,
                       double wind_speed_sd, double headwind_sd, double updraft_sd, double rifle_accuracy, double timestep)
    : bullet_(bullet), nominal_mv_(nominal_mv), target_(target), target_range_(target_range), atmosphere_(atmosphere), mv_sd_(mv_sd), wind_speed_sd_(wind_speed_sd), headwind_sd_(headwind_sd),
      updraft_sd_(updraft_sd), rifle_accuracy_(rifle_accuracy), timestep_(timestep), zeroed_bullet_(bullet), rng_(std::random_device{}())
  {
    // Set up the simulator with bullet and atmosphere
    simulator_.setInitialBullet(bullet);
    simulator_.setAtmosphere(atmosphere);

    // Zero the rifle once at initialization
    // Zero with nominal BC and MV, no wind, scope at bore height
    double scope_height = 0.0;
    btk::physics::Vector3D calm_wind(0.0, 0.0, 0.0);
    simulator_.setWind(calm_wind);
    zeroed_bullet_ = simulator_.computeZero(nominal_mv, scope_height, target_range, timestep, 1000, 1e-6);
  }

  SimulatedShot Simulator::fireShot()
  {
    // Use the cached zeroed bullet (original zeroed state)
    btk::ballistics::Bullet initial_bullet = zeroed_bullet_;

    // Apply muzzle velocity variation (clipped to 3-sigma)
    double mv_sd_mps = mv_sd_;
    std::normal_distribution<double> mv_dist(nominal_mv_, mv_sd_mps);
    double mv_mps = clipToThreeSigma(mv_dist(rng_), nominal_mv_, mv_sd_mps);

    // Tweak the MV by scaling the velocity components
    btk::physics::Vector3D zeroed_velocity = initial_bullet.getVelocity();
    btk::physics::Vector3D scaled_velocity = btk::physics::Vector3D(mv_mps * (zeroed_velocity.x / nominal_mv_), zeroed_velocity.y, mv_mps * (zeroed_velocity.z / nominal_mv_));

    // Apply rifle accuracy (uniform distribution within circle of given diameter)
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
    btk::physics::Vector3D modified_velocity = btk::physics::Vector3D(scaled_velocity.x, scaled_velocity.y + scaled_velocity.x * h_angle_rad, scaled_velocity.z + scaled_velocity.x * v_angle_rad);

    // Create modified bullet with new velocity
    btk::ballistics::Bullet modified_bullet = btk::ballistics::Bullet(initial_bullet, initial_bullet.getPosition(), modified_velocity, initial_bullet.getSpinRate());

    // Generate 3D wind components
    double crosswind_sd_mps = wind_speed_sd_;
    std::normal_distribution<double> crosswind_dist(0.0, crosswind_sd_mps);
    double crosswind_mps = clipToThreeSigma(crosswind_dist(rng_), 0.0, crosswind_sd_mps);

    double headwind_sd_mps = headwind_sd_;
    std::normal_distribution<double> headwind_dist(0.0, headwind_sd_mps);
    double headwind_mps = clipToThreeSigma(headwind_dist(rng_), 0.0, headwind_sd_mps);

    double updraft_sd_mps = updraft_sd_;
    std::normal_distribution<double> updraft_dist(0.0, updraft_sd_mps);
    double updraft_mps = clipToThreeSigma(updraft_dist(rng_), 0.0, updraft_sd_mps);

    // Create 3D wind vector (Cartesian coordinates)
    btk::physics::Vector3D varied_wind(headwind_mps, crosswind_mps, updraft_mps);

    // Set the modified bullet as initial and wind, then fire
    simulator_.setInitialBullet(modified_bullet);
    simulator_.setWind(varied_wind);
    btk::ballistics::Trajectory trajectory = simulator_.simulate(target_range_, timestep_);

    // Get impact at target range
    btk::ballistics::TrajectoryPoint impact_point = trajectory.atDistance(target_range_);

    // Check if we got a valid impact (not NaN time)
    if(std::isnan(impact_point.getTime()))
    {
      // Shouldn't happen, but handle gracefully
      SimulatedShot simulatedShot(btk::physics::Conversions::inchesToMeters(999.0), btk::physics::Conversions::inchesToMeters(999.0), 0, false, mv_mps, bullet_.getBc(), headwind_mps, crosswind_mps,
                                  updraft_mps, release_angle_h, release_angle_v, 0.0);
      shots_.push_back(simulatedShot);
      return simulatedShot;
    }

    // Get impact position and velocity
    double impact_x = impact_point.getState().getPosition().y;        // Y is crosswind
    double impact_y = impact_point.getState().getPosition().z;        // Z is vertical
    double impact_velocity = impact_point.getState().getVelocity().x; // Forward velocity at impact

    // Score the shot and add to match
    const Hit& hit = match_.addHit(impact_x, impact_y, target_, bullet_.getDiameter());

    SimulatedShot simulatedShot(impact_x, impact_y, hit.getScore(), hit.isX(), mv_mps, bullet_.getBc(), headwind_mps, crosswind_mps, updraft_mps, release_angle_h, release_angle_v, impact_velocity);

    // Store shot result for diagnostics
    shots_.push_back(simulatedShot);

    return simulatedShot;
  }

  void Simulator::clearShots()
  {
    match_.clear();
    shots_.clear();
  }

} // namespace btk::match
