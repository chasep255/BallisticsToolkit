#include "ballistics_calc.h"
#include <cmath>
#include <vector>

namespace btk::ballistics_calc
{

  // Trajectory point structure for WebAssembly
  struct TrajectoryPoint
  {
    double range_yards;
    double drop_mrad;
    double drift_mrad;
    double velocity_fps;
    double energy_ftlbf;
    double time_sec;
  };

  // Trajectory data structure
  struct TrajectoryData
  {
    std::vector<TrajectoryPoint> points;
  };

  void BallisticsCalculator::initializeBullet(double weight_grains, double diameter_inches, double length_inches,
                                              double bc, int drag_function)
  {
    using namespace btk::ballistics;

    Weight weight = Weight::grains(weight_grains);
    Distance diameter = Distance::inches(diameter_inches);
    Distance length = Distance::inches(length_inches);
    DragFunction drag_func = (drag_function == 0) ? DragFunction::G1 : DragFunction::G7;

    bullet_ = std::make_unique<Bullet>(weight, diameter, length, bc, drag_func);
  }

  void BallisticsCalculator::setAtmosphere(double temperature_f, double pressure_inhg, double humidity_percent,
                                           double altitude_feet)
  {
    using namespace btk::ballistics;

    Temperature temp = Temperature::fahrenheit(temperature_f);
    Distance altitude = Distance::feet(altitude_feet);
    double humidity = humidity_percent / 100.0; // Convert percentage to decimal

    // Create pressure directly
    Pressure pressure = Pressure::pascals(pressure_inhg * 3386.39); // Convert inHg to Pa

    atmosphere_ = std::make_unique<Atmosphere>(temp, altitude, humidity, pressure);
  }

  void BallisticsCalculator::setWind(double wind_speed_mph, double wind_direction_deg)
  {
    using namespace btk::ballistics;

    Velocity speed = Velocity::mph(wind_speed_mph);
    Angle direction = Angle::degrees(wind_direction_deg);

    wind_ = std::make_unique<Wind>(speed, direction);
  }

  void* BallisticsCalculator::calculateTrajectory(double muzzle_velocity_fps, double zero_range_yards,
                                                  double scope_height_inches, double max_range_yards, double step_yards)
  {
    using namespace btk::ballistics;

    if(!bullet_ || !atmosphere_ || !wind_)
    {
      return nullptr;
    }

    // Create trajectory data
    auto trajectory_data = new TrajectoryData();

    // Set up simulation parameters
    Velocity mv = Velocity::fps(muzzle_velocity_fps);
    Distance zero_range = Distance::yards(zero_range_yards);
    Distance scope_height = Distance::inches(scope_height_inches);
    Distance max_range = Distance::yards(max_range_yards);
    Time timestep = Time::seconds(0.001);

    // Calculate zeroed initial state
    auto zeroing_result =
      Simulator::computeZeroedInitialState(*bullet_, mv, scope_height, zero_range, *atmosphere_, *wind_, timestep);

    // Simulate trajectory
    Trajectory trajectory =
      Simulator::simulateToDistance(zeroing_result.initial_state, max_range, *wind_, *atmosphere_, timestep);

    // Extract trajectory points
    for(double range = 0.0; range <= max_range_yards; range += step_yards)
    {
      Distance range_dist = Distance::yards(range);
      auto point = trajectory.atDistance(range_dist);

      if(point)
      {
        TrajectoryPoint tp;
        tp.range_yards = range;

        // Calculate drop and drift in mrad
        if(range > 0.0)
        {
          double drop_meters = point->getState().getPositionZ().meters() - scope_height.meters();
          double drift_meters = point->getState().getPositionY().meters();
          tp.drop_mrad = (drop_meters / range_dist.meters()) * 1000.0;
          tp.drift_mrad = (drift_meters / range_dist.meters()) * 1000.0;
        }
        else
        {
          tp.drop_mrad = 0.0;
          tp.drift_mrad = 0.0;
        }

        // Get velocity and energy
        Velocity velocity = point->getState().getTotalVelocity();
        tp.velocity_fps = velocity.fps();
        tp.energy_ftlbf =
          (bullet_->getWeight().grains() * velocity.fps() * velocity.fps()) / (450240.0 * bullet_->getBc());
        tp.time_sec = point->getTime().seconds();

        trajectory_data->points.push_back(tp);
      }
    }

    return trajectory_data;
  }

  void BallisticsCalculator::freeTrajectory(void* trajectory_data)
  {
    delete static_cast<TrajectoryData*>(trajectory_data);
  }

  int BallisticsCalculator::getTrajectoryPoint(void* trajectory_data, double range_yards, double* drop_mrad,
                                               double* drift_mrad, double* velocity_fps, double* energy_ftlbf,
                                               double* time_sec)
  {
    TrajectoryData* data = static_cast<TrajectoryData*>(trajectory_data);
    if(!data)
    {
      return 0;
    }

    // Find closest point
    for(const auto& point : data->points)
    {
      if(std::abs(point.range_yards - range_yards) < 0.1)
      {
        *drop_mrad = point.drop_mrad;
        *drift_mrad = point.drift_mrad;
        *velocity_fps = point.velocity_fps;
        *energy_ftlbf = point.energy_ftlbf;
        *time_sec = point.time_sec;
        return 1;
      }
    }

    return 0;
  }

  int BallisticsCalculator::getTrajectoryPointCount(void* trajectory_data)
  {
    TrajectoryData* data = static_cast<TrajectoryData*>(trajectory_data);
    return data ? data->points.size() : 0;
  }

  // C-style interface implementation
  extern "C"
  {
    void* ballistics_calc_create()
    {
      return new BallisticsCalculator();
    }

    void ballistics_calc_destroy(void* solver)
    {
      delete static_cast<BallisticsCalculator*>(solver);
    }

    void ballistics_calc_set_bullet(void* solver, double weight_grains, double diameter_inches, double length_inches,
                                    double bc, int drag_function)
    {
      static_cast<BallisticsCalculator*>(solver)->initializeBullet(weight_grains, diameter_inches, length_inches, bc,
                                                                   drag_function);
    }

    void ballistics_calc_set_atmosphere(void* solver, double temperature_f, double pressure_inhg,
                                        double humidity_percent, double altitude_feet)
    {
      static_cast<BallisticsCalculator*>(solver)->setAtmosphere(temperature_f, pressure_inhg, humidity_percent,
                                                                altitude_feet);
    }

    void ballistics_calc_set_wind(void* solver, double wind_speed_mph, double wind_direction_deg)
    {
      static_cast<BallisticsCalculator*>(solver)->setWind(wind_speed_mph, wind_direction_deg);
    }

    void* ballistics_calc_calculate_trajectory(void* solver, double muzzle_velocity_fps, double zero_range_yards,
                                               double scope_height_inches, double max_range_yards, double step_yards)
    {
      return static_cast<BallisticsCalculator*>(solver)->calculateTrajectory(
        muzzle_velocity_fps, zero_range_yards, scope_height_inches, max_range_yards, step_yards);
    }

    void ballistics_calc_free_trajectory(void* trajectory_data)
    {
      delete static_cast<TrajectoryData*>(trajectory_data);
    }

    int ballistics_calc_get_trajectory_point(void* trajectory_data, double range_yards, double* drop_mrad,
                                             double* drift_mrad, double* velocity_fps, double* energy_ftlbf,
                                             double* time_sec)
    {
      TrajectoryData* data = static_cast<TrajectoryData*>(trajectory_data);
      if(!data)
      {
        return 0;
      }

      // Find closest point
      for(const auto& point : data->points)
      {
        if(std::abs(point.range_yards - range_yards) < 0.1)
        {
          *drop_mrad = point.drop_mrad;
          *drift_mrad = point.drift_mrad;
          *velocity_fps = point.velocity_fps;
          *energy_ftlbf = point.energy_ftlbf;
          *time_sec = point.time_sec;
          return 1;
        }
      }

      return 0;
    }

    int ballistics_calc_get_trajectory_point_count(void* trajectory_data)
    {
      TrajectoryData* data = static_cast<TrajectoryData*>(trajectory_data);
      return data ? data->points.size() : 0;
    }
  }

} // namespace btk::ballistics_calc
