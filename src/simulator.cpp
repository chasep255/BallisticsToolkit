#include "simulator.h"
#include "constants.h"
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
    Acceleration Simulator::calculateDragRetardation(const Bullet& bullet, const Velocity& velocity,
                                                     const Atmosphere& atmosphere)
    {
        // Convert velocity to fps for drag function
        double v_fps = velocity.fps();

        // Get drag coefficients
        auto [acceleration, mass] = findDragCoefficients(v_fps, bullet.getDragFunction());

        if(acceleration <= 0.0 || mass <= 0.0)
        {
            return Acceleration::mps2(0.0);
        }

        double density_ratio = atmosphere.getAirDensity() / constants::AIR_DENSITY_STANDARD;
        double retardation_fps_per_sec = acceleration * std::pow(v_fps, mass) * density_ratio / bullet.getBc();

        // Convert from fps/s to m/s² using unit conversion
        return Acceleration::fps2(retardation_fps_per_sec);
    }

    // Calculate total acceleration components
    Acceleration3D Simulator::calculateAcceleration(const Bullet& state, const Atmosphere& atmosphere, const Wind& wind)
    {
        // Get velocity vector
        Velocity3D velocity = state.getVelocity();

        // Calculate total velocity magnitude
        Velocity total_velocity = Velocity::mps(velocity.magnitude());

        // Calculate drag retardation
        Acceleration drag_retardation = calculateDragRetardation(state, total_velocity, atmosphere);

        // Get wind components
        auto [wind_x_mps, wind_y_mps, wind_z_mps] = wind.getComponents();

        // Calculate relative velocity (bullet velocity - wind velocity)
        Velocity3D wind_velocity(Velocity::mps(wind_x_mps), Velocity::mps(wind_y_mps), Velocity::mps(wind_z_mps));
        Velocity3D relative_velocity = velocity - wind_velocity;
        Velocity v_rel_total = Velocity::mps(relative_velocity.magnitude());

        if(v_rel_total.mps() > 0.0)
        {
            // Apply drag retardation in direction of relative velocity
            double mag = relative_velocity.magnitude();
            Acceleration ax = -drag_retardation * (relative_velocity.x.mps() / mag);
            Acceleration ay = -drag_retardation * (relative_velocity.y.mps() / mag);
            Acceleration az =
                -drag_retardation * (relative_velocity.z.mps() / mag) + Acceleration::mps2(-constants::GRAVITY);

            return {ax, ay, az};
        }
        else
        {
            // No relative velocity, only gravity
            return {Acceleration::mps2(0.0), Acceleration::mps2(0.0), Acceleration::mps2(-constants::GRAVITY)};
        }
    }

    // RK2 time step implementation
    Bullet Simulator::timeStep(const Bullet& state, const Time& dt, const Wind& wind, const Atmosphere& atmosphere)
    {
        // Get current state vectors
        Position3D position = state.getPosition();
        Velocity3D velocity = state.getVelocity();

        // Calculate initial acceleration
        Acceleration3D accel = calculateAcceleration(state, atmosphere, wind);

        // True RK2 (midpoint method):
        // 1. Compute midpoint velocities (convert to scalars for physics)
        double dt_s = dt.seconds();
        double vx_half = velocity.x.mps() + accel.x.mps2() * (dt_s * 0.5);
        double vy_half = velocity.y.mps() + accel.y.mps2() * (dt_s * 0.5);
        double vz_half = velocity.z.mps() + accel.z.mps2() * (dt_s * 0.5);

        // 2. Compute midpoint positions (convert to scalars for physics)
        double x_half = position.x.meters() + vx_half * (dt_s * 0.5);
        double y_half = position.y.meters() + vy_half * (dt_s * 0.5);
        double z_half = position.z.meters() + vz_half * (dt_s * 0.5);

        // 3. Create midpoint state and recompute acceleration
        Bullet midpoint_state(state, Distance::meters(x_half), Distance::meters(y_half), Distance::meters(z_half),
                              Velocity::mps(vx_half), Velocity::mps(vy_half), Velocity::mps(vz_half),
                              state.getSpinRate());

        // 4. Recompute acceleration at midpoint
        Acceleration3D accel_mid = calculateAcceleration(midpoint_state, atmosphere, wind);

        // 5. Use midpoint acceleration for final step (convert to scalars for physics)
        double x_new = position.x.meters() + vx_half * dt_s;
        double y_new = position.y.meters() + vy_half * dt_s;
        double z_new = position.z.meters() + vz_half * dt_s;

        double vx_new = velocity.x.mps() + accel_mid.x.mps2() * dt_s;
        double vy_new = velocity.y.mps() + accel_mid.y.mps2() * dt_s;
        double vz_new = velocity.z.mps() + accel_mid.z.mps2() * dt_s;

        // No spin decay (constant spin rate)
        AngularVelocity spin_new = state.getSpinRate();

        // Create new state using Vector3D constructor
        Position3D position_new(Distance::meters(x_new), Distance::meters(y_new), Distance::meters(z_new));
        Velocity3D velocity_new(Velocity::mps(vx_new), Velocity::mps(vy_new), Velocity::mps(vz_new));
        return Bullet(state, position_new, velocity_new, spin_new);
    }

    // Compute zeroed initial state
    Bullet Simulator::computeZeroedInitialState(const Bullet& bullet, const Velocity& muzzle_velocity,
                                                const Distance& scope_height, const Distance& zero_range,
                                                const Atmosphere& atmosphere, const Wind& wind, const Time& dt,
                                                int max_iterations, const Distance& tolerance)
    {
        Angle best_angle = Angle::mrad(0.0);

        for(int i = 0; i < max_iterations; ++i)
        {
            // Create initial velocity vector with elevation angle
            Velocity3D velocity_init(muzzle_velocity * std::cos(best_angle.radians()), Velocity::mps(0.0),
                                     muzzle_velocity * std::sin(best_angle.radians()));

            // Start at bore height (z=0)
            Position3D position_init(Distance::meters(0.0), Distance::meters(0.0), Distance::meters(0.0));
            Bullet test_state(bullet, position_init, velocity_init, AngularVelocity::rpm(0.0));

            // Simulate slightly past zero range to ensure we can interpolate
            Distance target_dist = zero_range * 1.1;
            Trajectory trajectory =
                simulateToDistance(test_state, target_dist, wind, atmosphere, dt, Time::seconds(5.0));

            // Get state at zero range using interpolation
            TrajectoryPoint point_at_zero = trajectory.atDistance(zero_range);

            // Check if the point is valid (not NaN time)
            if(std::isnan(point_at_zero.getTime().seconds()))
            {
                break;
            }

            // Want: bullet height at zero_range equals scope height (line of sight)
            Distance height_error = point_at_zero.getState().getPositionZ() - scope_height;

            // Check if we're close enough
            if(std::abs(height_error.meters()) < tolerance.meters())
            {
                break;
            }

            // Simple gradient step on angle
            Angle angle_correction = Angle::mrad(-(height_error.meters() / zero_range.meters()) * 1000.0);
            best_angle = best_angle + angle_correction * 0.5;
        }

        // Create final initial state at bore height (z=0)
        Velocity3D velocity_final(muzzle_velocity * std::cos(best_angle.radians()), Velocity::mps(0.0),
                                  muzzle_velocity * std::sin(best_angle.radians()));
        Position3D position_final(Distance::meters(0.0), Distance::meters(0.0), Distance::meters(0.0));
        Bullet initial_state(bullet, position_final, velocity_final, AngularVelocity::rpm(0.0));

        return initial_state;
    }

    // Simulate trajectory to target distance
    Trajectory Simulator::simulateToDistance(const Bullet& initial_state, const Distance& target_distance,
                                             const Wind& wind, const Atmosphere& atmosphere, const Time& dt,
                                             const Time& max_time)
    {
        Trajectory trajectory;

        // Add initial point
        trajectory.addPoint(Time::seconds(0.0), initial_state);

        Bullet current_state = initial_state;
        Time current_time = Time::seconds(0.0);

        while(current_time < max_time)
        {
            // Advance one time step
            current_state = timeStep(current_state, dt, wind, atmosphere);
            current_time = current_time + dt;

            // Add point to trajectory
            trajectory.addPoint(current_time, current_state);

            // Check if we've reached the target distance (continue 1% past for interpolation)
            if(current_state.getPositionX() >= target_distance * 1.01)
            {
                break;
            }
        }

        return trajectory;
    }

} // namespace btk::ballistics