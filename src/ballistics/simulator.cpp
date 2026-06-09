#include "ballistics/simulator.h"
#include "math/conversions.h"
#include "physics/constants.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <stdexcept>
#include <tuple>

namespace btk::ballistics
{

  // G7 drag function data: (velocity_fps, acceleration, mass)
  constexpr std::array<std::tuple<float, float, float>, 9> G7_DRAG_DATA = {{{4200.0f, 1.29081656775919e-09f, 3.24121295355962f},
                                                                            {3000.0f, 0.0171422231434847f, 1.27907168025204f},
                                                                            {1470.0f, 2.33355948302505e-03f, 1.52693913274526f},
                                                                            {1260.0f, 7.97592111627665e-04f, 1.67688974440324f},
                                                                            {1110.0f, 5.71086414289273e-12f, 4.3212826264889f},
                                                                            {960.0f, 3.02865108244904e-17f, 5.99074203776707f},
                                                                            {670.0f, 7.52285155782535e-06f, 2.1738019851075f},
                                                                            {540.0f, 1.31766281225189e-05f, 2.08774690257991f},
                                                                            {0.0f, 1.34504843776525e-05f, 2.08702306738884f}}};

  // G1 drag function data: (velocity_fps, acceleration, mass)
  constexpr std::array<std::tuple<float, float, float>, 41> G1_DRAG_DATA = {
    {{4230.0f, 1.477404177730177e-04f, 1.9565f},
     {3680.0f, 1.920339268755614e-04f, 1.925f},
     {3450.0f, 2.894751026819746e-04f, 1.875f},
     {3295.0f, 4.349905111115636e-04f, 1.825f},
     {3130.0f, 6.520421871892662e-04f, 1.775f},
     {2960.0f, 9.748073694078696e-04f, 1.725f},
     {2830.0f, 1.453721560187286e-03f, 1.675f},
     {2680.0f, 2.162887202930376e-03f, 1.625f},
     {2460.0f, 3.209559783129881e-03f, 1.575f},
     {2225.0f, 3.904368218691249e-03f, 1.55f},
     {2015.0f, 3.222942271262336e-03f, 1.575f},
     {1890.0f, 2.203329542297809e-03f, 1.625f},
     {1810.0f, 1.511001028891904e-03f, 1.675f},
     {1730.0f, 8.609957592468259e-04f, 1.75f},
     {1595.0f, 4.086146797305117e-04f, 1.85f},
     {1520.0f, 1.954473210037398e-04f, 1.95f},
     {1420.0f, 5.431896266462351e-05f, 2.125f},
     {1360.0f, 8.847742581674416e-06f, 2.375f},
     {1315.0f, 1.456922328720298e-06f, 2.625f},
     {1280.0f, 2.419485191895565e-07f, 2.875f},
     {1220.0f, 1.657956321067612e-08f, 3.25f},
     {1185.0f, 4.745469537157371e-10f, 3.75f},
     {1150.0f, 1.379746590025088e-11f, 4.25f},
     {1100.0f, 4.070157961147882e-13f, 4.75f},
     {1060.0f, 2.938236954847331e-14f, 5.125f},
     {1025.0f, 1.228597370774746e-14f, 5.25f},
     {980.0f, 2.916938264100495e-14f, 5.125f},
     {945.0f, 3.855099424807451e-13f, 4.75f},
     {905.0f, 1.185097045689854e-11f, 4.25f},
     {860.0f, 3.566129470974951e-10f, 3.75f},
     {810.0f, 1.045513263966272e-08f, 3.25f},
     {780.0f, 1.291159200846216e-07f, 2.875f},
     {750.0f, 6.824429329105383e-07f, 2.625f},
     {700.0f, 3.569169672385163e-06f, 2.375f},
     {640.0f, 1.839015095899579e-05f, 2.125f},
     {600.0f, 5.711174688734240e-05f, 1.95f},
     {550.0f, 9.226557091973427e-05f, 1.875f},
     {250.0f, 9.337991957131389e-05f, 1.875f},
     {100.0f, 7.225247327590413e-05f, 1.925f},
     {65.0f, 5.792684957074546e-05f, 1.975f},
     {0.0f, 5.206214107320588e-05f, 2.0f}}};

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

  // Compute deceleration (drag retardation) for a specific bullet state
  float Simulator::computeDeceleration(const Bullet& s) const
  {
    btk::math::Vector3D v_rel = s.getVelocity() - wind_;
    float v_rel_mag = v_rel.magnitude();
    float v_fps = btk::math::Conversions::mpsToFps(v_rel_mag); // use AIR-RELATIVE speed

    auto [a, m] = findDragCoefficients(v_fps, s.getDragFunction());
    if(a <= 0.0f || m <= 0.0f)
      return 0.0f;

    float density_ratio = atmosphere_.getAirDensity() / btk::physics::Constants::AIR_DENSITY_STANDARD;
    float ret_fps_s = a * std::pow(v_fps, m) * density_ratio / s.getBc();
    return btk::math::Conversions::fps2ToMps2(ret_fps_s);
  }

  // Helper function for safe normalization
  static inline btk::math::Vector3D safe_norm(const btk::math::Vector3D& v, const btk::math::Vector3D& fb)
  {
    float n = v.magnitude();
    return (n > 1e-9f) ? (v / n) : fb;
  }

  // Horizontal "right" axis (points +X for downrange -Z), perpendicular to the
  // bullet's horizontal heading. Used for both spin drift and crosswind sensing.
  static inline btk::math::Vector3D horizontalRight(const btk::math::Vector3D& v)
  {
    btk::math::Vector3D fHoriz = safe_norm(btk::math::Vector3D(v.x, 0.0f, v.z), btk::math::Vector3D(0.0f, 0.0f, -1.0f));
    return fHoriz.cross(btk::math::Vector3D(0.0f, 1.0f, 0.0f)); // = +X when heading is -Z
  }

  // Litz spin drift, injected as an acceleration.
  //
  // The empirical drift curve is SD(t) = C · t^1.83 with C = 1.25·(SG + 1.2)
  // (inches, t in seconds). To let the existing RK2 integrator reproduce that
  // displacement we supply its second time-derivative:
  //   a(t) = d²SD/dt² = 1.83·0.83·C · t^(-0.17)
  // directed along the horizontal "right" axis, signed by twist hand.
  btk::math::Vector3D Simulator::computeSpinDriftAccel(const Bullet& s, float t) const
  {
    if(sg_ <= 0.0f || t <= 0.0f)
      return btk::math::Vector3D(0.0f, 0.0f, 0.0f);

    // C in meters (1.25·(SG+1.2) is given in inches of drift)
    float C_m = btk::math::Conversions::inchesToMeters(1.25f * (sg_ + 1.2f));
    float a_mag = 1.83f * 0.83f * C_m * std::pow(t, -0.17f);

    return horizontalRight(s.getVelocity()) * (a_mag * static_cast<float>(twist_hand_));
  }

  // Litz crosswind aerodynamic jump.
  //
  // Jump is an impulsive vertical deflection set by the crosswind the bullet
  // first meets, with sensitivity (MOA per mph of crosswind):
  //   sens = 0.01·SG − 0.0024·L_cal + 0.032
  // We apply it as a vertical velocity impulse proportional to the *change* in
  // crosswind each step. A steady wind from the muzzle fires the full impulse on
  // the first step (0 → w); a wind that begins downrange fires its impulse there,
  // and the remaining-range lever arm falls out of the integration for free.
  //
  // Because the impulse scales with Δw (a change), not with a rate × dt, the
  // per-step pieces telescope: Σ V·(w_i − w_{i−1}) ≈ ∫ V dw over the transition.
  // So the result is time-step independent and indifferent to the gradient's
  // shape (a 1 mph/yd ramp and an abrupt step give the same total jump, up to the
  // small change in V across the gradient). This relies on the impulse being
  // LINEAR in Δw — do not refactor it into a rate × dt; that would reintroduce a
  // dt/profile dependence.
  void Simulator::applyCrosswindJump()
  {
    if(sg_ <= 0.0f)
      return;

    btk::math::Vector3D v = current_bullet_.getVelocity();
    float V = v.magnitude();
    if(V < 1e-3f)
      return;

    // Crosswind component (m/s): + = blowing toward the shooter's right (+X)
    btk::math::Vector3D right = horizontalRight(v);
    float wcross = wind_.dot(right);
    float dwc = wcross - prev_wcross_;
    prev_wcross_ = wcross;
    if(dwc == 0.0f)
      return;

    float L_cal = current_bullet_.getLength() / current_bullet_.getDiameter();
    float sens_moa_per_mph = 0.01f * sg_ - 0.0024f * L_cal + 0.032f;

    // Convert the crosswind change to a jump angle, then to a vertical velocity.
    float jump_moa = sens_moa_per_mph * btk::math::Conversions::mpsToMph(dwc);
    float dtheta = btk::math::Conversions::moaToRadians(jump_moa); // rad

    // Sign: right twist (hand +1) + wind from the right (dwc < 0) -> impact up.
    float dvy = -V * dtheta * static_cast<float>(twist_hand_);

    current_bullet_ = Bullet(current_bullet_, current_bullet_.getPosition(), btk::math::Vector3D(v.x, v.y + dvy, v.z), current_bullet_.getSpinRate());
  }

  // Compute the corrected muzzle SG and twist handedness from the launch state.
  // Twist is recovered from the spin rate (inverse of computeSpinRateFromTwist),
  // so no extra plumbing is needed.
  //
  // SG is deliberately a LAUNCH constant. Litz's formulas use SG as a single
  // parameter that indexes the bullet's stability class; the downrange evolution
  // of the trajectory is already absorbed into the empirical TOF^1.83 term (and
  // into the jump being a muzzle/wind-entry event). Re-evaluating SG with the
  // decaying downrange velocity would double-count that physics and corrupt the
  // fit, not improve it. (Miller SG is itself defined as a muzzle estimate.)
  void Simulator::computeLaunchStability()
  {
    float v = initial_bullet_.getVelocity().magnitude();
    float spin = initial_bullet_.getSpinRate();
    if(v < 1e-6f || std::fabs(spin) < 1e-9f)
    {
      sg_ = 0.0f;
      twist_hand_ = 1;
      return;
    }

    float twist_pitch_m = 2.0f * M_PI_F * v / std::fabs(spin);
    float twist_in = btk::math::Conversions::metersToInches(twist_pitch_m);
    sg_ = initial_bullet_.computeMillerStabilityFactorCorrected(twist_in, v, atmosphere_.getTemperature(), atmosphere_.getPressure());
    twist_hand_ = (spin >= 0.0f) ? +1 : -1;
  }

  // Calculate acceleration for a specific bullet state at flight time t
  btk::math::Vector3D Simulator::calculateAccelerationFor(const Bullet& s, float t) const
  {
    btk::math::Vector3D v_rel = s.getVelocity() - wind_;
    float v_rel_mag = v_rel.magnitude();

    btk::math::Vector3D gravity(0.0f, -btk::physics::Constants::GRAVITY, 0.0f);
    if(v_rel_mag <= 0.0f)
      return gravity;

    float drag_ret = computeDeceleration(s);
    btk::math::Vector3D drag_accel = -drag_ret * (v_rel / v_rel_mag);

    // Litz spin drift (steady, time-distributed). Crosswind jump is applied
    // separately as a velocity impulse in timeStep().
    btk::math::Vector3D drift = computeSpinDriftAccel(s, t);

    return drag_accel + gravity + drift;
  }

  // Setters
  void Simulator::setInitialBullet(const Bullet& bullet)
  {
    initial_bullet_ = bullet;
    computeLaunchStability();
    resetToInitial();
  }

  void Simulator::setAtmosphere(const btk::physics::Atmosphere& atmosphere)
  {
    atmosphere_ = atmosphere;
    computeLaunchStability(); // SG depends on air density
  }

  void Simulator::setWind(const btk::math::Vector3D& wind) { wind_ = wind; }

  // Getters
  const Bullet& Simulator::getInitialBullet() const { return initial_bullet_; }

  const Bullet& Simulator::getCurrentBullet() const { return current_bullet_; }

  const btk::physics::Atmosphere& Simulator::getAtmosphere() const { return atmosphere_; }

  const btk::math::Vector3D& Simulator::getWind() const { return wind_; }

  // Get deceleration for a bullet state
  float Simulator::getDeceleration(const Bullet& bullet) const
  {
    return computeDeceleration(bullet);
  }

  // State management
  void Simulator::resetToInitial()
  {
    current_bullet_ = initial_bullet_;
    current_time_ = 0.0f;
    prev_wcross_ = 0.0f; // so the muzzle crosswind fires its jump on the first step
    trajectory_.clear(); // Clear trajectory when resetting
  }

  // Compute zeroed initial state (instance method)
  const Bullet& Simulator::computeZero(float muzzle_velocity, const btk::math::Vector3D& target_position, float dt, int max_iterations, float tolerance, float spin_rate)
  {
    if(std::abs(target_position.z) < 1e-6f)
    {
      throw std::invalid_argument("computeZero: target distance (-z) must be > 0");
    }

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

      if(!point_at_target)
      {
        throw std::runtime_error("computeZero: bullet cannot reach target distance (MV too low or range too far)");
      }

      // Calculate error at target plane; ignore downrange (z) interpolation residue
      btk::math::Vector3D actual_pos = point_at_target->getState().getPosition();
      btk::math::Vector3D error = actual_pos - target_position;
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
    computeLaunchStability();
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
    // Crosswind aerodynamic jump: an impulse applied when the crosswind changes
    // (including the muzzle 0 -> w transition on the first step).
    applyCrosswindJump();

    Bullet s0 = current_bullet_;
    float t0 = current_time_;

    // Spin-drift acceleration ~ t^(-0.17) is singular at t = 0; floor the sampled
    // time at dt. The drift over [0, dt] is negligible, so the clamp is harmless.
    btk::math::Vector3D a0 = calculateAccelerationFor(s0, std::max(t0, dt));
    btk::math::Vector3D vHalf = s0.getVelocity() + a0 * (0.5f * dt);
    btk::math::Vector3D xHalf = s0.getPosition() + vHalf * (0.5f * dt);

    Bullet sHalf(s0, xHalf, vHalf, s0.getSpinRate());
    btk::math::Vector3D aHalf = calculateAccelerationFor(sHalf, std::max(t0 + 0.5f * dt, dt));

    btk::math::Vector3D v1 = s0.getVelocity() + aHalf * dt;
    btk::math::Vector3D x1 = s0.getPosition() + vHalf * dt; // RK2 uses midpoint velocity for position

    current_bullet_ = Bullet(sHalf, x1, v1, s0.getSpinRate());
    current_time_ += dt;

    // Add point to trajectory with current wind
    trajectory_.addPoint(current_time_, current_bullet_, wind_);
  }

  // State queries
  float Simulator::getCurrentDistance() const { return -current_bullet_.getPositionZ(); }

  float Simulator::getCurrentTime() const { return current_time_; }

} // namespace btk::ballistics