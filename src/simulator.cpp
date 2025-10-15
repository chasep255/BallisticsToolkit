#include "simulator.h"
#include "constants.h"
#include "conversions.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <tuple>

namespace btk::ballistics
{

  // G7 drag function data: (velocity_fps, acceleration, mass)
  constexpr std::array<std::tuple<double, double, double>, 9> G7_DRAG_DATA = {
    {{4200.0, 1.29081656775919e-09, 3.24121295355962},
     {3000.0, 0.0171422231434847, 1.27907168025204},
     {1470.0, 2.33355948302505e-03, 1.52693913274526},
     {1260.0, 7.97592111627665e-04, 1.67688974440324},
     {1110.0, 5.71086414289273e-12, 4.3212826264889},
     {960.0, 3.02865108244904e-17, 5.99074203776707},
     {670.0, 7.52285155782565e-06, 2.1738019851075},
     {540.0, 1.31766281225189e-05, 2.08774690257991},
     {0.0, 1.34504843776525e-05, 2.08702306738884}}};

  // G1 drag function data: (velocity_fps, acceleration, mass)
  constexpr std::array<std::tuple<double, double, double>, 25> G1_DRAG_DATA = {
    {{4230.0, 1.477404177730177e-04, 1.9565}, {3680.0, 1.920339268755614e-04, 1.925},
     {3450.0, 2.894751026819746e-04, 1.875},  {3295.0, 4.349905111115636e-04, 1.825},
     {3130.0, 6.520421871892662e-04, 1.775},  {2960.0, 9.748073694078696e-04, 1.725},
     {2830.0, 1.453721560187286e-03, 1.675},  {2680.0, 2.162887202930376e-03, 1.625},
     {2460.0, 3.209559783129881e-03, 1.575},  {2225.0, 3.904368218691249e-03, 1.55},
     {2015.0, 3.222942271262336e-03, 1.575},  {1890.0, 2.203329542297809e-03, 1.625},
     {1810.0, 1.511001028891904e-03, 1.675},  {1730.0, 8.609957592468259e-04, 1.75},
     {1595.0, 4.086146797305117e-04, 1.85},   {1520.0, 1.954473210037398e-04, 1.95},
     {1420.0, 5.431896266462351e-05, 2.125},  {1360.0, 8.847742581674416e-06, 2.375},
     {1315.0, 1.456922328720298e-06, 2.625},  {1280.0, 2.419485191895565e-07, 2.875},
     {1220.0, 1.657956321067612e-08, 3.25},   {1185.0, 4.745469537157371e-10, 3.75},
     {1150.0, 1.379746590025088e-11, 4.25},   {1100.0, 4.070157961147882e-13, 4.75},
     {1060.0, 2.938236954847331e-14, 5.125}}};

  // Helper function to find drag coefficients via binary search
  constexpr std::tuple<double, double> findDragCoefficients(double vp_fps, DragFunction drag_type)
  {
    const auto* data = (drag_type == DragFunction::G7) ? G7_DRAG_DATA.data() : G1_DRAG_DATA.data();
    size_t data_size = (drag_type == DragFunction::G7) ? G7_DRAG_DATA.size() : G1_DRAG_DATA.size();

    // Handle edge cases
    if(vp_fps <= 0.0)
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
      double mid_velocity = std::get<0>(data[mid]);

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
  double Simulator::calculateDragRetardationFor(const Bullet& s) const
  {
    Vector3D v_rel = s.getVelocity() - wind_;
    double v_rel_mag = v_rel.magnitude();
    double v_fps = Conversions::mpsToFps(v_rel_mag); // use AIR-RELATIVE speed

    auto [a, m] = findDragCoefficients(v_fps, s.getDragFunction());
    if (a <= 0.0 || m <= 0.0) return 0.0;

    double density_ratio = atmosphere_.getAirDensity() / Constants::AIR_DENSITY_STANDARD;
    double ret_fps_s = a * std::pow(v_fps, m) * density_ratio / s.getBc();
    return Conversions::fpsToMps(ret_fps_s);
  }


  // Calculate acceleration for a specific bullet state
  Vector3D Simulator::calculateAccelerationFor(const Bullet& s) const
  {
    Vector3D v_rel = s.getVelocity() - wind_;
    double v_rel_mag = v_rel.magnitude();

    Vector3D gravity(0.0, 0.0, -Constants::GRAVITY);
    if (v_rel_mag <= 0.0) return gravity;

    double drag_ret = calculateDragRetardationFor(s);
    Vector3D drag_accel = -drag_ret * (v_rel / v_rel_mag);
    return drag_accel + gravity;
  }

  // Setters
  void Simulator::setInitialBullet(const Bullet& bullet)
  {
    initial_bullet_ = bullet;
    resetToInitial();
  }


  void Simulator::setAtmosphere(const Atmosphere& atmosphere)
  {
    atmosphere_ = atmosphere;
  }

  void Simulator::setWind(const Vector3D& wind)
  {
    wind_ = wind;
  }

  // Getters
  const Bullet& Simulator::getInitialBullet() const
  {
    return initial_bullet_;
  }

  const Bullet& Simulator::getCurrentBullet() const
  {
    return current_bullet_;
  }

  const Atmosphere& Simulator::getAtmosphere() const
  {
    return atmosphere_;
  }

  const Vector3D& Simulator::getWind() const
  {
    return wind_;
  }

  // State management
  void Simulator::resetToInitial()
  {
    current_bullet_ = initial_bullet_;
    current_time_ = 0.0;
    trajectory_.clear(); // Clear trajectory when resetting
  }

  // Compute zeroed initial state (instance method)
  const Bullet& Simulator::computeZero(double muzzle_velocity, double scope_height, double zero_range,
                                       double dt, int max_iterations, double tolerance, double spin_rate)
  {

    double best_angle = 0.0; // radians

    for(int i = 0; i < max_iterations; ++i)
    {
      // Create initial velocity vector with elevation angle
      Vector3D velocity_init(muzzle_velocity * std::cos(best_angle), 0.0,
                               muzzle_velocity * std::sin(best_angle));

      // Start at bore height (z=0)
      Vector3D position_init(0.0, 0.0, 0.0);
      Bullet test_state(initial_bullet_, position_init, velocity_init, spin_rate);

      // Simulate slightly past zero range to ensure we can interpolate
      double target_dist = zero_range * 1.1;
      setInitialBullet(test_state);
      current_time_ = 0.0; // Reset clock for each trial
      Trajectory trajectory = simulate(target_dist, dt, 5.0);

      // Get state at zero range using interpolation
      TrajectoryPoint point_at_zero = trajectory.atDistance(zero_range);

      // Check if the point is valid (not NaN time)
      if(std::isnan(point_at_zero.getTime()))
      {
        break;
      }

      // Want: bullet height at zero_range equals scope height (line of sight)
      double height_error = point_at_zero.getState().getPositionZ() - scope_height;

      // Check if we're close enough
      if(std::abs(height_error) < tolerance)
      {
        break;
      }

      // Simple gradient step on angle
      double angle_correction = -(height_error / zero_range);
      best_angle = best_angle + angle_correction * 0.5;
    }

    // Create final initial state at bore height (z=0)
    Vector3D velocity_final(muzzle_velocity * std::cos(best_angle), 0.0,
                              muzzle_velocity * std::sin(best_angle));
    Vector3D position_final(0.0, 0.0, 0.0);
    Bullet initial_state(initial_bullet_, position_final, velocity_final, spin_rate);

    // Update initial bullet with zeroed state
    initial_bullet_ = initial_state;
    resetToInitial();
    
    // Return reference to the zeroed initial bullet
    return initial_bullet_;
  }

  // Simulate trajectory using stored state
  const Trajectory& Simulator::simulate(double max_distance, double dt, double max_time)
  { 
    // Add initial point
    trajectory_.addPoint(current_time_, current_bullet_);

    double start_time = current_time_;
    double max_sim_time = start_time + max_time;

    while(current_time_ < max_sim_time)
    {
      timeStep(dt);
      if(current_bullet_.getPositionX() > max_distance)
        break;
    }

    return trajectory_;
  }

  // Time step using stored state
  const Bullet& Simulator::timeStep(double dt)
  {
    const Bullet s0 = current_bullet_;

    Vector3D a0    = calculateAccelerationFor(s0);
    Vector3D vHalf = s0.getVelocity() + a0 * (0.5 * dt);
    Vector3D xHalf = s0.getPosition() + vHalf * (0.5 * dt);

    Bullet sHalf(s0, xHalf, vHalf, s0.getSpinRate());
    Vector3D aHalf = calculateAccelerationFor(sHalf);

    Vector3D v1 = s0.getVelocity() + aHalf * dt;
    Vector3D x1 = s0.getPosition() + vHalf * dt; // RK2 uses midpoint velocity for position

    current_bullet_ = Bullet(s0, x1, v1, s0.getSpinRate());
    current_time_ += dt;
    
    // Add point to trajectory
    trajectory_.addPoint(current_time_, current_bullet_);
    
    // Return reference to the updated current bullet
    return current_bullet_;
  }

  // State queries
  double Simulator::getCurrentDistance() const
  {
    return current_bullet_.getPositionX();
  }

  double Simulator::getCurrentTime() const
  {
    return current_time_;
  }

  const Trajectory& Simulator::getTrajectory() const
  {
    return trajectory_;
  }




} // namespace btk::ballistics