#include "ballistics/simulator.h"
#include "math/conversions.h"
#include "physics/constants.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <stdexcept>
#include <utility>

namespace btk::ballistics
{

  // Standard drag functions as drag coefficient (Cd) vs Mach number, from the
  // McCoy / JBM "Modern Exterior Ballistics" tables
  // (https://www.jbmballistics.com/ballistics/downloads). Drag is indexed by
  // Mach using the local speed of sound, then Cd is linearly interpolated.
  // Entries are {mach, cd}, ascending in Mach.
  constexpr std::array<std::pair<float, float>, 84> G7_CD_DATA = {{
    {0.0f, 0.1198f}, {0.05f, 0.1197f}, {0.1f, 0.1196f}, {0.15f, 0.1194f}, {0.2f, 0.1193f},
    {0.25f, 0.1194f}, {0.3f, 0.1194f}, {0.35f, 0.1194f}, {0.4f, 0.1193f}, {0.45f, 0.1193f},
    {0.5f, 0.1194f}, {0.55f, 0.1193f}, {0.6f, 0.1194f}, {0.65f, 0.1197f}, {0.7f, 0.1202f},
    {0.725f, 0.1207f}, {0.75f, 0.1215f}, {0.775f, 0.1226f}, {0.8f, 0.1242f}, {0.825f, 0.1266f},
    {0.85f, 0.1306f}, {0.875f, 0.1368f}, {0.9f, 0.1464f}, {0.925f, 0.1660f}, {0.95f, 0.2054f},
    {0.975f, 0.2993f}, {1.0f, 0.3803f}, {1.025f, 0.4015f}, {1.05f, 0.4043f}, {1.075f, 0.4034f},
    {1.1f, 0.4014f}, {1.125f, 0.3987f}, {1.15f, 0.3955f}, {1.2f, 0.3884f}, {1.25f, 0.3810f},
    {1.3f, 0.3732f}, {1.35f, 0.3657f}, {1.4f, 0.3580f}, {1.5f, 0.3440f}, {1.55f, 0.3376f},
    {1.6f, 0.3315f}, {1.65f, 0.3260f}, {1.7f, 0.3209f}, {1.75f, 0.3160f}, {1.8f, 0.3117f},
    {1.85f, 0.3078f}, {1.9f, 0.3042f}, {1.95f, 0.3010f}, {2.0f, 0.2980f}, {2.05f, 0.2951f},
    {2.1f, 0.2922f}, {2.15f, 0.2892f}, {2.2f, 0.2864f}, {2.25f, 0.2835f}, {2.3f, 0.2807f},
    {2.35f, 0.2779f}, {2.4f, 0.2752f}, {2.45f, 0.2725f}, {2.5f, 0.2697f}, {2.55f, 0.2670f},
    {2.6f, 0.2643f}, {2.65f, 0.2615f}, {2.7f, 0.2588f}, {2.75f, 0.2561f}, {2.8f, 0.2533f},
    {2.85f, 0.2506f}, {2.9f, 0.2479f}, {2.95f, 0.2451f}, {3.0f, 0.2424f}, {3.1f, 0.2368f},
    {3.2f, 0.2313f}, {3.3f, 0.2258f}, {3.4f, 0.2205f}, {3.5f, 0.2154f}, {3.6f, 0.2106f},
    {3.7f, 0.2060f}, {3.8f, 0.2017f}, {3.9f, 0.1975f}, {4.0f, 0.1935f}, {4.2f, 0.1861f},
    {4.4f, 0.1793f}, {4.6f, 0.1730f}, {4.8f, 0.1672f}, {5.0f, 0.1618f}
  }};

  constexpr std::array<std::pair<float, float>, 79> G1_CD_DATA = {{
    {0.0f, 0.2629f}, {0.05f, 0.2558f}, {0.1f, 0.2487f}, {0.15f, 0.2413f}, {0.2f, 0.2344f},
    {0.25f, 0.2278f}, {0.3f, 0.2214f}, {0.35f, 0.2155f}, {0.4f, 0.2104f}, {0.45f, 0.2061f},
    {0.5f, 0.2032f}, {0.55f, 0.2020f}, {0.6f, 0.2034f}, {0.7f, 0.2165f}, {0.725f, 0.2230f},
    {0.75f, 0.2313f}, {0.775f, 0.2417f}, {0.8f, 0.2546f}, {0.825f, 0.2706f}, {0.85f, 0.2901f},
    {0.875f, 0.3136f}, {0.9f, 0.3415f}, {0.925f, 0.3734f}, {0.95f, 0.4084f}, {0.975f, 0.4448f},
    {1.0f, 0.4805f}, {1.025f, 0.5136f}, {1.05f, 0.5427f}, {1.075f, 0.5677f}, {1.1f, 0.5883f},
    {1.125f, 0.6053f}, {1.15f, 0.6191f}, {1.2f, 0.6393f}, {1.25f, 0.6518f}, {1.3f, 0.6589f},
    {1.35f, 0.6621f}, {1.4f, 0.6625f}, {1.45f, 0.6607f}, {1.5f, 0.6573f}, {1.55f, 0.6528f},
    {1.6f, 0.6474f}, {1.65f, 0.6413f}, {1.7f, 0.6347f}, {1.75f, 0.6280f}, {1.8f, 0.6210f},
    {1.85f, 0.6141f}, {1.9f, 0.6072f}, {1.95f, 0.6003f}, {2.0f, 0.5934f}, {2.05f, 0.5867f},
    {2.1f, 0.5804f}, {2.15f, 0.5743f}, {2.2f, 0.5685f}, {2.25f, 0.5630f}, {2.3f, 0.5577f},
    {2.35f, 0.5527f}, {2.4f, 0.5481f}, {2.45f, 0.5438f}, {2.5f, 0.5397f}, {2.6f, 0.5325f},
    {2.7f, 0.5264f}, {2.8f, 0.5211f}, {2.9f, 0.5168f}, {3.0f, 0.5133f}, {3.1f, 0.5105f},
    {3.2f, 0.5084f}, {3.3f, 0.5067f}, {3.4f, 0.5054f}, {3.5f, 0.5040f}, {3.6f, 0.5030f},
    {3.7f, 0.5022f}, {3.8f, 0.5016f}, {3.9f, 0.5010f}, {4.0f, 0.5006f}, {4.2f, 0.4998f},
    {4.4f, 0.4995f}, {4.6f, 0.4992f}, {4.8f, 0.4990f}, {5.0f, 0.4988f}
  }};

  // Linearly interpolate the standard Cd at a Mach number (clamped at the ends).
  static float interpolateCd(float mach, DragFunction drag_type)
  {
    const auto* t = (drag_type == DragFunction::G7) ? G7_CD_DATA.data() : G1_CD_DATA.data();
    const size_t n = (drag_type == DragFunction::G7) ? G7_CD_DATA.size() : G1_CD_DATA.size();
    if(mach <= t[0].first)
      return t[0].second;
    if(mach >= t[n - 1].first)
      return t[n - 1].second;

    size_t lo = 0, hi = n - 1;
    while(hi - lo > 1)
    {
      const size_t mid = (lo + hi) / 2;
      if(t[mid].first <= mach)
        lo = mid;
      else
        hi = mid;
    }
    const float frac = (mach - t[lo].first) / (t[hi].first - t[lo].first);
    return t[lo].second + frac * (t[hi].second - t[lo].second);
  }

  // Standard retardation r(v) = Cd(v) * v^2 / k for a BC = 1 reference projectile
  // at standard density (Cd = k * r / v^2, inverted). k is the BC-system constant
  // for the 1 lb, 1 inch standard projectile at rho0 = 1.225 kg/m^3
  // (k = 2*m_std/(rho0*A_std), slug/ft/s units), giving r in fps^2 for v in fps.
  constexpr float RETARDATION_K = 4795.4f;

  // Standard sea-level speed of sound (15 C) in fps, for the BC = 1 reference curve.
  constexpr float STD_SOUND_FPS = 1116.45f;

  // Compute deceleration (drag retardation) for a specific bullet state
  float Simulator::computeDeceleration(const Bullet& s) const
  {
    btk::math::Vector3D v_rel = s.getVelocity() - wind_; // AIR-RELATIVE velocity
    float v_rel_mag = v_rel.magnitude();
    if(v_rel_mag <= 0.0f || s.getBc() <= 0.0f)
      return 0.0f;

    // Index the standard drag curve by Mach (using the LOCAL speed of sound, so
    // the transonic drag rise tracks temperature/altitude), then look up Cd.
    float mach = v_rel_mag / atmosphere_.getSpeedOfSound();
    float cd = interpolateCd(mach, s.getDragFunction());

    float v_fps = btk::math::Conversions::mpsToFps(v_rel_mag);
    float density_ratio = atmosphere_.getAirDensity() / btk::physics::Constants::AIR_DENSITY_STANDARD;
    float ret_fps_s = cd * v_fps * v_fps * density_ratio / (RETARDATION_K * s.getBc());
    return btk::math::Conversions::fps2ToMps2(ret_fps_s);
  }

  // Standard drag retardation r(v) = Cd(v) * v^2 / k for a BC = 1 reference
  // projectile at standard density: the bare G1/G7 curve, with Mach referenced
  // to the standard sea-level speed of sound. Returns fps^2 (no unit conversion).
  float Simulator::standardRetardation(DragFunction drag_function, float velocity_fps)
  {
    if(velocity_fps <= 0.0f)
      return 0.0f;

    float mach = velocity_fps / STD_SOUND_FPS;
    float cd = interpolateCd(mach, drag_function);
    return cd * velocity_fps * velocity_fps / RETARDATION_K;
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
  // LINEAR in Δw, do not refactor it into a rate × dt; that would reintroduce a
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