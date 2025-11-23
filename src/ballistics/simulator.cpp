#include "ballistics/simulator.h"
#include "math/conversions.h"
#include "physics/constants.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <tuple>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

namespace btk::ballistics
{

  // G7 drag function data: (velocity_fps, acceleration, mass)
  constexpr std::array<std::tuple<float, float, float>, 9> G7_DRAG_DATA = {{{4200.0f, 1.29081656775919e-09f, 3.24121295355962f},
                                                                            {3000.0f, 0.0171422231434847f, 1.27907168025204f},
                                                                            {1470.0f, 2.33355948302505e-03f, 1.52693913274526f},
                                                                            {1260.0f, 7.97592111627665e-04f, 1.67688974440324f},
                                                                            {1110.0f, 5.71086414289273e-12f, 4.3212826264889f},
                                                                            {960.0f, 3.02865108244904e-17f, 5.99074203776707f},
                                                                            {670.0f, 7.52285155782565e-06f, 2.1738019851075f},
                                                                            {540.0f, 1.31766281225189e-05f, 2.08774690257991f},
                                                                            {0.0f, 1.34504843776525e-05f, 2.08702306738884f}}};

  // G1 drag function data: (velocity_fps, acceleration, mass)
  constexpr std::array<std::tuple<float, float, float>, 25> G1_DRAG_DATA = {
    {{4230.0f, 1.477404177730177e-04f, 1.9565f}, {3680.0f, 1.920339268755614e-04f, 1.925f}, {3450.0f, 2.894751026819746e-04f, 1.875f}, {3295.0f, 4.349905111115636e-04f, 1.825f},
     {3130.0f, 6.520421871892662e-04f, 1.775f},  {2960.0f, 9.748073694078696e-04f, 1.725f}, {2830.0f, 1.453721560187286e-03f, 1.675f}, {2680.0f, 2.162887202930376e-03f, 1.625f},
     {2460.0f, 3.209559783129881e-03f, 1.575f},  {2225.0f, 3.904368218691249e-03f, 1.55f},  {2015.0f, 3.222942271262336e-03f, 1.575f}, {1890.0f, 2.203329542297809e-03f, 1.625f},
     {1810.0f, 1.511001028891904e-03f, 1.675f},  {1730.0f, 8.609957592468259e-04f, 1.75f},  {1595.0f, 4.086146797305117e-04f, 1.85f},  {1520.0f, 1.954473210037398e-04f, 1.95f},
     {1420.0f, 5.431896266462351e-05f, 2.125f},  {1360.0f, 8.847742581674416e-06f, 2.375f}, {1315.0f, 1.456922328720298e-06f, 2.625f}, {1280.0f, 2.419485191895565e-07f, 2.875f},
     {1220.0f, 1.657956321067612e-08f, 3.25f},   {1185.0f, 4.745469537157371e-10f, 3.75f},  {1150.0f, 1.379746590025088e-11f, 4.25f},  {1100.0f, 4.070157961147882e-13f, 4.75f},
     {1060.0f, 2.938236954847331e-14f, 5.125f}}};

  // Helper function to find drag coefficients via binary search
  constexpr std::tuple<float, float> findDragCoefficients(float vp_fps, DragFunction drag_type)
  {
    const auto* data = (drag_type == DragFunction::G7) ? G7_DRAG_DATA.data() : G1_DRAG_DATA.data();
    size_t data_size = (drag_type == DragFunction::G7) ? G7_DRAG_DATA.size() : G1_DRAG_DATA.size();

    // Handle edge cases
    if(vp_fps <= 0.0f)
    {
      return {std::get<1>(data[data_size - 1]), std::get<2>(data[data_size - 1])};
    }
    if(vp_fps >= std::get<0>(data[0]))
    {
      return {std::get<1>(data[0]), std::get<2>(data[0])};
    }

    // Binary search
    size_t left = 0, right = data_size - 1;
    while(left <= right)
    {
      size_t mid = (left + right) / 2;
      float mid_velocity = std::get<0>(data[mid]);

      if(vp_fps > mid_velocity)
      {
        if(mid == 0 || vp_fps <= std::get<0>(data[mid - 1]))
        {
          return {std::get<1>(data[mid]), std::get<2>(data[mid])};
        }
        right = mid - 1;
      }
      else
      {
        left = mid + 1;
      }
    }

    // Fallback
    return {std::get<1>(data[data_size - 1]), std::get<2>(data[data_size - 1])};
  }

  // Calculate drag retardation for a specific bullet state
  float Simulator::calculateDragRetardationFor(const Bullet& s) const
  {
    btk::math::Vector3D v_rel = s.getVelocity() - wind_;
    float v_rel_mag = v_rel.magnitude();
    float v_fps = btk::math::Conversions::mpsToFps(v_rel_mag); // use AIR-RELATIVE speed

    auto [a, m] = findDragCoefficients(v_fps, s.getDragFunction());
    if(a <= 0.0f || m <= 0.0f)
      return 0.0f;

    float density_ratio = atmosphere_.getAirDensity() / btk::physics::Constants::AIR_DENSITY_STANDARD;
    float ret_fps_s = a * std::pow(v_fps, m) * density_ratio / s.getBc();
    return btk::math::Conversions::fpsToMps(ret_fps_s);
  }

  // Helper function for safe normalization
  static inline btk::math::Vector3D safe_norm(const btk::math::Vector3D& v, const btk::math::Vector3D& fb)
  {
    float n = v.magnitude();
    return (n > 1e-9f) ? (v / n) : fb;
  }

  // Compute spin drift (steady) + Crosswind jump (transient)
  btk::math::Vector3D Simulator::computeSpinWindAccel(Bullet& s, const btk::math::Vector3D& gravity, const btk::math::Vector3D& wind, float dt)
  {
    // Air-relative velocity and trajectory direction
    btk::math::Vector3D v = s.getVelocity();
    btk::math::Vector3D u = v - wind;
    float V = u.magnitude();
    if(V < 1e-3f)
      return btk::math::Vector3D(0.0f, 0.0f, 0.0f);
    btk::math::Vector3D tHat = v.magnitude() > 1e-6f ? (v / v.magnitude()) : (u / V);

    // Normal-plane basis (ensure right ≈ +X for tHat ≈ -Z, upInPl ≈ +Y)
    btk::math::Vector3D worldUp = btk::math::Vector3D(0.0f, 1.0f, 0.0f);
    btk::math::Vector3D right = safe_norm(tHat.cross(worldUp), btk::math::Vector3D(1.0f, 0.0f, 0.0f));
    btk::math::Vector3D upInPl = safe_norm(tHat.cross(right), btk::math::Vector3D(0.0f, 1.0f, 0.0f));

    // Aero scalars
    float rho = atmosphere_.getAirDensity();
    float qDyn = 0.5f * rho * V * V;
    float Sref = 0.25f * M_PI_F * s.getDiameter() * s.getDiameter();

    // Alignment rate Ω_p (how fast nose trims to flow)
    // Use a representative aerodynamic moment arm: max(diameter, length)
    float refLen = std::max(s.getDiameter(), s.getLength());
    float denom = s.estimateSpinMomentOfInertia() * std::fabs(s.getSpinRate()) + 1e-12f;
    float alignRate = (qDyn * Sref * refLen * std::fabs(restoring_moment_slope_per_rad_)) / denom;
    // Stable low-pass factor for the lag state (use slower β_eq dynamics)
    float betaAlignRate = beta_lag_scale_ * alignRate;
    float aLP = 1.0f - std::exp(-betaAlignRate * dt);

    // --- Spin drift (yaw-of-repose from gravity)
    btk::math::Vector3D gPerp = gravity - tHat * gravity.dot(tHat);
    btk::math::Vector3D tXg = gPerp.cross(tHat); // direction in plane (reversed for new coordinate system)
    float yor = (alignRate > 1e-6f) ? yaw_of_repose_scale_ * (tXg.magnitude() / (V * alignRate)) : 0.0f;
    // use the component along "right", signed by twist hand
    int hand = (s.getSpinRate() >= 0.0f) ? +1 : -1;
    float yorRight = hand * safe_norm(tXg, right).dot(right) * yor;
    // Remove MAX_YAW_OF_REPOSE_RAD clamp as requested

    // --- Crosswind jump via high-pass of lateral sideslip β = u_perp / V
    btk::math::Vector3D u_perp = u - tHat * u.dot(tHat);
    float betaR = u_perp.dot(right) / (V + 1e-12f);
    float betaU = u_perp.dot(upInPl) / (V + 1e-12f);

    float betaEqRight = s.getBetaEqRight();
    float betaEqUp = s.getBetaEqUp();

    betaEqRight += aLP * (betaR - betaEqRight);
    betaEqUp += aLP * (betaU - betaEqUp);

    s.setBetaEqRight(betaEqRight);
    s.setBetaEqUp(betaEqUp);

    float hpR = betaR - betaEqRight;
    float hpU = betaU - betaEqUp;

    // 90° rotation around tHat; sign by twist hand
    float jumpR = yaw_of_repose_scale_ * (hand * (-hpU));
    float jumpU = yaw_of_repose_scale_ * (hand * (-hpR));

    // Convert tiny angles -> acceleration with lift slope
    float gain = (qDyn * Sref * lift_slope_per_rad_) / s.getWeight();

    btk::math::Vector3D extra = right * (gain * (yorRight + jumpR)) + upInPl * (gain * jumpU);

    return extra;
  }

  // Calculate acceleration for a specific bullet state
  btk::math::Vector3D Simulator::calculateAccelerationFor(Bullet& s, float dt)
  {
    btk::math::Vector3D v_rel = s.getVelocity() - wind_;
    float v_rel_mag = v_rel.magnitude();

    btk::math::Vector3D gravity(0.0f, -btk::physics::Constants::GRAVITY, 0.0f);
    if(v_rel_mag <= 0.0f)
      return gravity;

    float drag_ret = calculateDragRetardationFor(s);
    btk::math::Vector3D drag_accel = -drag_ret * (v_rel / v_rel_mag);

    // Add spin-aerodynamic effects
    btk::math::Vector3D extra = computeSpinWindAccel(s, gravity, wind_, dt);

    return drag_accel + gravity + extra;
  }

  // Setters
  void Simulator::setInitialBullet(const Bullet& bullet)
  {
    initial_bullet_ = bullet;
    resetToInitial();
  }

  void Simulator::setAtmosphere(const btk::physics::Atmosphere& atmosphere) { atmosphere_ = atmosphere; }

  void Simulator::setWind(const btk::math::Vector3D& wind) { wind_ = wind; }

  // Getters
  const Bullet& Simulator::getInitialBullet() const { return initial_bullet_; }

  const Bullet& Simulator::getCurrentBullet() const { return current_bullet_; }

  const btk::physics::Atmosphere& Simulator::getAtmosphere() const { return atmosphere_; }

  const btk::math::Vector3D& Simulator::getWind() const { return wind_; }

  // State management
  void Simulator::resetToInitial()
  {
    current_bullet_ = initial_bullet_;
    current_time_ = 0.0f;
    trajectory_.clear(); // Clear trajectory when resetting
  }

  // Compute zeroed initial state (instance method)
  const Bullet& Simulator::computeZero(float muzzle_velocity, const btk::math::Vector3D& target_position, float dt, int max_iterations, float tolerance, float spin_rate)
  {
    float best_pitch = 0.01f; // Start with reasonable elevation guess (about 0.57 degrees)
    float best_yaw = 0.0f;    // azimuth/windage (rad)

    for(int i = 0; i < max_iterations; ++i)
    {
      // Create initial velocity vector with elevation and azimuth angles
      float cosPitch = std::cos(best_pitch);
      float sinPitch = std::sin(best_pitch);
      float cosYaw = std::cos(best_yaw);
      float sinYaw = std::sin(best_yaw);
      btk::math::Vector3D velocity_init(muzzle_velocity * cosPitch * sinYaw,   // x (crossrange)
                                        muzzle_velocity * sinPitch,            // y (vertical)
                                        -muzzle_velocity * cosPitch * cosYaw); // z (-downrange)

      // Start at bore height (z=0)
      btk::math::Vector3D position_init(0.0f, 0.0f, 0.0f);
      Bullet test_state(initial_bullet_, position_init, velocity_init, spin_rate);

      // Simulate slightly past target distance to ensure we can interpolate
      float sim_dist = -target_position.z * 1.1f;
      setInitialBullet(test_state);
      current_time_ = 0.0f; // Reset clock for each trial
      simulate(sim_dist, dt, 5.0f);
      Trajectory& trajectory = getTrajectory();

      // Get state at target distance using interpolation
      std::optional<TrajectoryPoint> point_at_target = trajectory.atDistance(-target_position.z);

      // Check if the point is valid
      if(!point_at_target)
      {
        break;
      }

      // Calculate error at target plane; ignore downrange (z) interpolation residue
      btk::math::Vector3D error = point_at_target->getState().getPosition() - target_position;
      float lateral_error = error.x;  // crossrange
      float vertical_error = error.y; // vertical
      float xy_error_magnitude = std::sqrt(lateral_error * lateral_error + vertical_error * vertical_error);

      // Check if we're close enough
      if(xy_error_magnitude < tolerance)
      {
        break;
      }

      // Vertical (pitch) correction from y error; Horizontal (yaw) from x error
      float pitch_correction = -std::atan2(vertical_error, -target_position.z);
      float yaw_correction = -std::atan2(lateral_error, -target_position.z);

      // Damped updates for stability (matches JS damping = 0.5)
      best_pitch += 0.5f * pitch_correction;
      best_yaw += 0.5f * yaw_correction;
    }

    // Create final initial state at bore height (z=0)
    float cosPitchF = std::cos(best_pitch);
    float sinPitchF = std::sin(best_pitch);
    float cosYawF = std::cos(best_yaw);
    float sinYawF = std::sin(best_yaw);
    btk::math::Vector3D velocity_final(muzzle_velocity * cosPitchF * sinYawF, muzzle_velocity * sinPitchF, -muzzle_velocity * cosPitchF * cosYawF);
    btk::math::Vector3D position_final(0.0f, 0.0f, 0.0f);
    Bullet initial_state(initial_bullet_, position_final, velocity_final, spin_rate);

    // Update initial bullet with zeroed state
    initial_bullet_ = initial_state;
    resetToInitial();

    // Return reference to the zeroed initial bullet
    return initial_bullet_;
  }

  // Simulate trajectory using stored state
  void Simulator::simulate(float max_distance, float dt, float max_time)
  {
    // Add initial point with current wind
    trajectory_.addPoint(current_time_, current_bullet_, wind_);

    float start_time = current_time_;
    float max_sim_time = start_time + max_time;

    while(current_time_ < max_sim_time)
    {
      timeStep(dt);
      if(-current_bullet_.getPositionZ() > max_distance)
        break;
    }
  }

  // Simulate trajectory with wind generator sampling
  void Simulator::simulate(float max_distance, float dt, float max_time, const btk::physics::WindGenerator& wind_gen)
  {
    // Sample wind at initial position (wind_gen expects: crossrange, vertical, -downrange)
    float x = current_bullet_.getPositionX();
    float y = current_bullet_.getPositionY();
    float z = current_bullet_.getPositionZ();
    wind_ = wind_gen(x, y, z);

    // Add initial point with wind
    trajectory_.addPoint(current_time_, current_bullet_, wind_);

    float start_time = current_time_;
    float max_sim_time = start_time + max_time;

    while(current_time_ < max_sim_time)
    {
      // Sample wind at current position (before stepping) (wind_gen expects: crossrange, vertical, -downrange)
      float x = current_bullet_.getPositionX();
      float y = current_bullet_.getPositionY();
      float z = current_bullet_.getPositionZ();
      wind_ = wind_gen(x, y, z);

      // Step forward (uses wind_ for acceleration calculation)
      timeStep(dt);

      if(-current_bullet_.getPositionZ() > max_distance)
        break;
    }
  }

  // Time step using stored state
  void Simulator::timeStep(float dt)
  {
    Bullet s0 = current_bullet_;

    btk::math::Vector3D a0 = calculateAccelerationFor(s0, dt);
    btk::math::Vector3D vHalf = s0.getVelocity() + a0 * (0.5f * dt);
    btk::math::Vector3D xHalf = s0.getPosition() + vHalf * (0.5f * dt);

    Bullet sHalf(s0, xHalf, vHalf, s0.getSpinRate());
    btk::math::Vector3D aHalf = calculateAccelerationFor(sHalf, dt);

    btk::math::Vector3D v1 = s0.getVelocity() + aHalf * dt;
    btk::math::Vector3D x1 = s0.getPosition() + vHalf * dt; // RK2 uses midpoint velocity for position

    // Create final state using sHalf (which has updated lag state from midpoint acceleration)
    current_bullet_ = Bullet(sHalf, x1, v1, s0.getSpinRate());
    current_time_ += dt;

    // Add point to trajectory with current wind
    trajectory_.addPoint(current_time_, current_bullet_, wind_);
  }

  // State queries
  float Simulator::getCurrentDistance() const { return -current_bullet_.getPositionZ(); }

  float Simulator::getCurrentTime() const { return current_time_; }

} // namespace btk::ballistics