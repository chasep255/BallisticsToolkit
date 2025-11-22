#include "match/simulator.h"
#include "ballistics/simulator.h"
#include "math/conversions.h"
#include "math/random.h"
#include "physics/atmosphere.h"
#include <algorithm>
#include <cmath>

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
                       float wind_speed_sd, float headwind_sd, float updraft_sd, float rifle_accuracy, float timestep, float twist_rate)
    : bullet_(bullet), nominal_mv_(nominal_mv), target_(target), target_range_(target_range), atmosphere_(atmosphere), mv_sd_(mv_sd), wind_speed_sd_(wind_speed_sd), headwind_sd_(headwind_sd),
      updraft_sd_(updraft_sd), rifle_accuracy_(rifle_accuracy), timestep_(timestep), zeroed_bullet_(bullet)
  {
    // Set up the simulator with bullet and atmosphere
    simulator_.setInitialBullet(bullet);
    simulator_.setAtmosphere(atmosphere);

    // Calculate spin rate from twist rate
    float spin_rate = 0.0f;
    if(twist_rate != 0.0f)
    {
      spin_rate = btk::ballistics::Bullet::computeSpinRateFromTwist(nominal_mv, twist_rate);
    }

    // Zero the rifle once at initialization
    // Zero with nominal BC and MV, no wind
    // Target at (x=0, y=0, z=-target_range) - downrange on -Z axis
    btk::math::Vector3D target_position(0.0f, 0.0f, -target_range);
    btk::math::Vector3D calm_wind(0.0f, 0.0f, 0.0f);
    simulator_.setWind(calm_wind);
    zeroed_bullet_ = simulator_.computeZero(nominal_mv, target_position, timestep, 1000, 1e-6, spin_rate);
  }

  SimulatedShot Simulator::fireShot()
  {
    // Use the cached zeroed bullet (original zeroed state)
    btk::ballistics::Bullet initial_bullet = zeroed_bullet_;

    // Apply muzzle velocity variation (clipped to 3-sigma)
    float mv_sd_mps = mv_sd_;
    float mv_mps = clipToThreeSigma(btk::math::Random::normal(nominal_mv_, mv_sd_mps), nominal_mv_, mv_sd_mps);

    // Tweak the MV by scaling the velocity components (scale downrange and vertical, preserve crossrange)
    btk::math::Vector3D zeroed_velocity = initial_bullet.getVelocity();
    btk::math::Vector3D scaled_velocity = btk::math::Vector3D(zeroed_velocity.x, mv_mps * (zeroed_velocity.y / nominal_mv_), mv_mps * (zeroed_velocity.z / nominal_mv_));

    // Apply rifle accuracy (uniform distribution within circle of given diameter)
    float angle = btk::math::Random::uniform(0.0f, 2.0f * M_PI_F);
    float radius_rad = (rifle_accuracy_ / 2.0f) * std::sqrt(btk::math::Random::uniform(0.0f, 1.0f));

    // Convert to horizontal and vertical components
    float h_angle_rad = radius_rad * std::cos(angle);
    float v_angle_rad = radius_rad * std::sin(angle);

    // Store release angles for tracking
    float release_angle_h = h_angle_rad;
    float release_angle_v = v_angle_rad;

    // Modify velocity components for angular dispersion
    btk::math::Vector3D modified_velocity = btk::math::Vector3D(scaled_velocity.x + (-scaled_velocity.z) * h_angle_rad, scaled_velocity.y + (-scaled_velocity.z) * v_angle_rad, scaled_velocity.z);

    // Create modified bullet with new velocity
    btk::ballistics::Bullet modified_bullet = btk::ballistics::Bullet(initial_bullet, initial_bullet.getPosition(), modified_velocity, initial_bullet.getSpinRate());

    // Generate 3D wind components
    float crosswind_sd_mps = wind_speed_sd_;
    float crosswind_mps = clipToThreeSigma(btk::math::Random::normal(0.0f, crosswind_sd_mps), 0.0f, crosswind_sd_mps);

    float headwind_sd_mps = headwind_sd_;
    float headwind_mps = clipToThreeSigma(btk::math::Random::normal(0.0f, headwind_sd_mps), 0.0f, headwind_sd_mps);

    float updraft_sd_mps = updraft_sd_;
    float updraft_mps = clipToThreeSigma(btk::math::Random::normal(0.0f, updraft_sd_mps), 0.0f, updraft_sd_mps);

    // Create 3D wind vector (new coordinate system: X=crossrange, Y=up, Z=-downrange)
    btk::math::Vector3D varied_wind(crosswind_mps, updraft_mps, -headwind_mps);

    // Set the modified bullet as initial and wind, then fire
    simulator_.setInitialBullet(modified_bullet);
    simulator_.setWind(varied_wind);
    btk::ballistics::Trajectory trajectory = simulator_.simulate(target_range_, timestep_);

    // Get impact at target range
    std::optional<btk::ballistics::TrajectoryPoint> impact_point = trajectory.atDistance(target_range_);

    // Check if we got a valid impact
    if(!impact_point)
    {
      // Shouldn't happen, but handle gracefully
      SimulatedShot simulatedShot(btk::math::Conversions::inchesToMeters(999.0f), btk::math::Conversions::inchesToMeters(999.0f), 0, false, mv_mps, bullet_.getBc(), headwind_mps, crosswind_mps,
                                  updraft_mps, release_angle_h, release_angle_v, 0.0f);
      shots_.push_back(simulatedShot);
      return simulatedShot;
    }

    // Get impact position and velocity
    float impact_x = impact_point->getState().getPosition().x;        // X is crossrange
    float impact_y = impact_point->getState().getPosition().y;        // Y is vertical
    float impact_velocity = -impact_point->getState().getVelocity().z; // Forward velocity at impact (magnitude of -Z)

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
