#include "match/simulator.h"
#include "ballistics/simulator.h"
#include "physics/atmosphere.h"
#include "math/conversions.h"
#include <algorithm>
#include <cmath>
#include <random>

static float clipToThreeSigma(float value, float mean, float sd) { return std::max(mean - 3 * sd, std::min(mean + 3 * sd, value)); }

namespace btk::match
{

  SimulatedShot::SimulatedShot(float impact_x, float impact_y, int score, bool is_x, float actual_mv, float actual_bc, float wind_downrange, float wind_crossrange, float wind_vertical,
                               float release_angle_h, float release_angle_v, float impact_velocity)
    : impact_x(impact_x), impact_y(impact_y), score(score), is_x(is_x), actual_mv(actual_mv), actual_bc(actual_bc), wind_downrange(wind_downrange), wind_crossrange(wind_crossrange),
      wind_vertical(wind_vertical), release_angle_h(release_angle_h), release_angle_v(release_angle_v), impact_velocity(impact_velocity)
  {
  }

  Simulator::Simulator(const btk::ballistics::Bullet& bullet, float nominal_mv, const btk::match::Target& target, float target_range, const btk::physics::Atmosphere& atmosphere, float mv_sd,
                       float wind_speed_sd, float headwind_sd, float updraft_sd, float rifle_accuracy, float timestep)
    : bullet_(bullet), nominal_mv_(nominal_mv), target_(target), target_range_(target_range), atmosphere_(atmosphere), mv_sd_(mv_sd), wind_speed_sd_(wind_speed_sd), headwind_sd_(headwind_sd),
      updraft_sd_(updraft_sd), rifle_accuracy_(rifle_accuracy), timestep_(timestep), zeroed_bullet_(bullet), rng_(std::random_device{}())
  {
    // Set up the simulator with bullet and atmosphere
    simulator_.setInitialBullet(bullet);
    simulator_.setAtmosphere(atmosphere);

    // Zero the rifle once at initialization
    // Zero with nominal BC and MV, no wind, scope at bore height
    float scope_height = 0.0f;
    btk::math::Vector3D calm_wind(0.0f, 0.0f, 0.0f);
    simulator_.setWind(calm_wind);
    zeroed_bullet_ = simulator_.computeZero(nominal_mv, scope_height, target_range, timestep, 1000, 1e-6);
  }

  SimulatedShot Simulator::fireShot()
  {
    // Use the cached zeroed bullet (original zeroed state)
    btk::ballistics::Bullet initial_bullet = zeroed_bullet_;

    // Apply muzzle velocity variation (clipped to 3-sigma)
    float mv_sd_mps = mv_sd_;
    std::normal_distribution<float> mv_dist(nominal_mv_, mv_sd_mps);
    float mv_mps = clipToThreeSigma(mv_dist(rng_), nominal_mv_, mv_sd_mps);

    // Tweak the MV by scaling the velocity components
    btk::math::Vector3D zeroed_velocity = initial_bullet.getVelocity();
    btk::math::Vector3D scaled_velocity = btk::math::Vector3D(mv_mps * (zeroed_velocity.x / nominal_mv_), zeroed_velocity.y, mv_mps * (zeroed_velocity.z / nominal_mv_));

    // Apply rifle accuracy (uniform distribution within circle of given diameter)
    std::uniform_real_distribution<float> angle_dist(0.0f, 2.0f * M_PI_F);
    std::uniform_real_distribution<float> radius_dist(0.0f, 1.0f);

    float angle = angle_dist(rng_);
    float radius_rad = (rifle_accuracy_ / 2.0f) * std::sqrt(radius_dist(rng_));

    // Convert to horizontal and vertical components
    float h_angle_rad = radius_rad * std::cos(angle);
    float v_angle_rad = radius_rad * std::sin(angle);

    // Store release angles for tracking
    float release_angle_h = h_angle_rad;
    float release_angle_v = v_angle_rad;

    // Modify velocity components for angular dispersion
    btk::math::Vector3D modified_velocity = btk::math::Vector3D(scaled_velocity.x, scaled_velocity.y + scaled_velocity.x * h_angle_rad, scaled_velocity.z + scaled_velocity.x * v_angle_rad);

    // Create modified bullet with new velocity
    btk::ballistics::Bullet modified_bullet = btk::ballistics::Bullet(initial_bullet, initial_bullet.getPosition(), modified_velocity, initial_bullet.getSpinRate());

    // Generate 3D wind components
    float crosswind_sd_mps = wind_speed_sd_;
    std::normal_distribution<float> crosswind_dist(0.0f, crosswind_sd_mps);
    float crosswind_mps = clipToThreeSigma(crosswind_dist(rng_), 0.0f, crosswind_sd_mps);

    float headwind_sd_mps = headwind_sd_;
    std::normal_distribution<float> headwind_dist(0.0f, headwind_sd_mps);
    float headwind_mps = clipToThreeSigma(headwind_dist(rng_), 0.0f, headwind_sd_mps);

    float updraft_sd_mps = updraft_sd_;
    std::normal_distribution<float> updraft_dist(0.0f, updraft_sd_mps);
    float updraft_mps = clipToThreeSigma(updraft_dist(rng_), 0.0f, updraft_sd_mps);

    // Create 3D wind vector (Cartesian coordinates)
    btk::math::Vector3D varied_wind(headwind_mps, crosswind_mps, updraft_mps);

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
      SimulatedShot simulatedShot(btk::math::Conversions::inchesToMeters(999.0f), btk::math::Conversions::inchesToMeters(999.0f), 0, false, mv_mps, bullet_.getBc(), headwind_mps, crosswind_mps,
                                  updraft_mps, release_angle_h, release_angle_v, 0.0f);
      shots_.push_back(simulatedShot);
      return simulatedShot;
    }

    // Get impact position and velocity
    float impact_x = impact_point.getState().getPosition().y;        // Y is crosswind
    float impact_y = impact_point.getState().getPosition().z;        // Z is vertical
    float impact_velocity = impact_point.getState().getVelocity().x; // Forward velocity at impact

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
