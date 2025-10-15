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
     {670.0, 7.52285155782535e-06, 2.1738019851075},
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

  // Calculate drag retardation
  double Simulator::calculateDragRetardation(const Bullet& bullet, double velocity, const Atmosphere& atmosphere)
  {
    // Convert velocity to fps for drag function
    double v_fps = Conversions::mpsToFps(velocity);

    // Get drag coefficients
    auto [acceleration, mass] = findDragCoefficients(v_fps, bullet.getDragFunction());

    if(acceleration <= 0.0 || mass <= 0.0)
    {
      return 0.0;
    }

    double density_ratio = atmosphere.getAirDensity() / Constants::AIR_DENSITY_STANDARD;
    double retardation_fps_per_sec = acceleration * std::pow(v_fps, mass) * density_ratio / bullet.getBc();

    // Convert from fps/s to m/s²
    return Conversions::fpsToMps(retardation_fps_per_sec);
  }

  // Calculate total acceleration components
  Vector3D Simulator::calculateAcceleration(const Bullet& state, const Atmosphere& atmosphere, const Vector3D& wind)
  {
    // Get velocity vector
    Vector3D velocity = state.getVelocity();

    // Calculate total velocity magnitude
    double total_velocity = velocity.magnitude();

    // Calculate drag retardation
    double drag_retardation = calculateDragRetardation(state, total_velocity, atmosphere);

    // Calculate relative velocity (bullet velocity - wind velocity)
    Vector3D relative_velocity = velocity - wind;
    double v_rel_total = relative_velocity.magnitude();

    if(v_rel_total > 0.0)
    {
      // Apply drag retardation in direction of relative velocity using vector operations
      Vector3D drag_dir = relative_velocity.normalized();
      Vector3D drag_accel = -drag_retardation * drag_dir;
      Vector3D gravity(0.0, 0.0, -Constants::GRAVITY);
      
      return drag_accel + gravity;
    }
    else
    {
      // No relative velocity, only gravity
      return Vector3D(0.0, 0.0, -Constants::GRAVITY);
    }
  }

  // RK2 time step implementation
  Bullet Simulator::timeStep(const Bullet& state, double dt, const Vector3D& wind, const Atmosphere& atmosphere)
  {
    // Get current state vectors
    Vector3D position = state.getPosition();
    Vector3D velocity = state.getVelocity();

    // Calculate initial acceleration
    Vector3D accel = calculateAcceleration(state, atmosphere, wind);

    // True RK2 (midpoint method):
    // 1. Compute midpoint velocities
    double half_dt = dt * 0.5;
    Vector3D v_half = velocity + accel * half_dt;

    // 2. Compute midpoint positions
    Vector3D pos_half = position + v_half * half_dt;

    // 3. Create midpoint state and recompute acceleration
    Bullet midpoint_state(state, pos_half, v_half, state.getSpinRate());

    // 4. Recompute acceleration at midpoint
    Vector3D accel_mid = calculateAcceleration(midpoint_state, atmosphere, wind);

    // 5. Use midpoint acceleration for final step
    Vector3D pos_new = position + v_half * dt;
    Vector3D vel_new = velocity + accel_mid * dt;

    // No spin decay (constant spin rate)
    double spin_new = state.getSpinRate();

    // Create new state using Vector3D constructor
    return Bullet(state, pos_new, vel_new, spin_new);
  }

  // Compute zeroed initial state
  Bullet Simulator::computeZeroedInitialState(const Bullet& bullet, double muzzle_velocity,
                                              double scope_height, double zero_range,
                                              const Atmosphere& atmosphere, const Vector3D& wind, double dt,
                                              int max_iterations, double tolerance)
  {
    double best_angle = 0.0; // radians

    for(int i = 0; i < max_iterations; ++i)
    {
      // Create initial velocity vector with elevation angle
      Vector3D velocity_init(muzzle_velocity * std::cos(best_angle), 0.0,
                               muzzle_velocity * std::sin(best_angle));

      // Start at bore height (z=0)
      Vector3D position_init(0.0, 0.0, 0.0);
      Bullet test_state(bullet, position_init, velocity_init, 0.0);

      // Simulate slightly past zero range to ensure we can interpolate
      double target_dist = zero_range * 1.1;
      Trajectory trajectory = simulateToDistance(test_state, target_dist, wind, atmosphere, dt, 5.0);

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
    Bullet initial_state(bullet, position_final, velocity_final, 0.0);

    return initial_state;
  }

  // Simulate trajectory to target distance
  Trajectory Simulator::simulateToDistance(const Bullet& initial_state, double target_distance,
                                           const Vector3D& wind, const Atmosphere& atmosphere, double dt,
                                           double max_time)
  {
    Trajectory trajectory;

    // Add initial point
    trajectory.addPoint(0.0, initial_state);

    Bullet current_state = initial_state;
    double current_time = 0.0;

    while(current_time < max_time)
    {
      // Advance one time step
      current_state = timeStep(current_state, dt, wind, atmosphere);
      current_time = current_time + dt;

      // Add point to trajectory
      trajectory.addPoint(current_time, current_state);

      // Check if we've reached the target distance (continue 1% past for interpolation)
      if(current_state.getPositionX() > target_distance)
        break;
    }

    return trajectory;
  }

} // namespace btk::ballistics