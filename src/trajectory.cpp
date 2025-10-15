#include "trajectory.h"
#include "conversions.h"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace btk
{
  namespace ballistics
  {

    // TrajectoryPoint implementation
    TrajectoryPoint::TrajectoryPoint(double time, const Bullet& state) : time_(time), state_(state)
    {
    }

    double TrajectoryPoint::getDistance() const
    {
      return state_.getPositionX();
    }

    double TrajectoryPoint::getVelocity() const
    {
      return state_.getTotalVelocity();
    }

    double TrajectoryPoint::getKineticEnergy() const
    {
      // KE = 0.5 * m * v^2
      double mass_kg = state_.getWeight();
      double velocity_mps = state_.getTotalVelocity();
      double energy_joules = 0.5 * mass_kg * velocity_mps * velocity_mps;
      return energy_joules;
    }


    // Trajectory implementation
    Trajectory::Trajectory()
    {
    }

    void Trajectory::addPoint(double time, const Bullet& state)
    {
      points_.emplace_back(time, state);
    }

    const TrajectoryPoint& Trajectory::getPoint(size_t index) const
    {
      if(index >= points_.size())
        throw std::out_of_range("Trajectory point index out of range");

      return points_[index];
    }

    TrajectoryPoint Trajectory::atDistance(double distance) const
    {
      if(points_.empty())
      {
        return TrajectoryPoint(std::numeric_limits<double>::quiet_NaN(), Bullet(0.0, 0.0, 0.0, 0.0));
      }

      // Check if target distance is beyond the last point
      if(distance >= points_.back().getDistance())
      {
        return points_.back();
      }

      // Check if target distance is before the first point
      if(distance <= points_.front().getDistance())
      {
        return points_.front();
      }

      // Binary search for the two points that bracket the target distance
      size_t left = 0;
      size_t right = points_.size() - 1;

      while(left < right - 1)
      {
        size_t mid = left + (right - left) / 2;
        double mid_distance = points_[mid].getDistance();

        if(distance < mid_distance)
        {
          right = mid;
        }
        else
        {
          left = mid;
        }
      }

      // Now left and right are the two points that bracket the target distance
      double dist1 = points_[left].getDistance();
      double dist2 = points_[right].getDistance();

      // Interpolate between the two points
      double t = (distance - dist1) / (dist2 - dist1);

      // Interpolate time
      double interp_time = points_[left].getTime() + t * (points_[right].getTime() - points_[left].getTime());

      // Interpolate state
      Bullet interp_state = interpolate(points_[left], points_[right], distance);

      return TrajectoryPoint(interp_time, interp_state);
    }

    std::optional<TrajectoryPoint> Trajectory::atTime(double time) const
    {
      if(points_.empty())
      {
        return std::nullopt;
      }

      // Boundary checks
      if(time <= points_.front().getTime())
      {
        return points_.front();
      }
      if(time >= points_.back().getTime())
      {
        return points_.back();
      }

      // Binary search to find bracketing indices [left, right]
      size_t left = 0;
      size_t right = points_.size() - 1;
      while(left < right - 1)
      {
        size_t mid = left + (right - left) / 2;
        double mid_time = points_[mid].getTime();
        if(time < mid_time)
        {
          right = mid;
        }
        else
        {
          left = mid;
        }
      }

      // Interpolate between points_[left] and points_[right] by time
      double time1 = points_[left].getTime();
      double time2 = points_[right].getTime();

      double t = (time - time1) / (time2 - time1);

      const Bullet& state1 = points_[left].getState();
      const Bullet& state2 = points_[right].getState();

      // Interpolate position and velocity using vector lerp
      Vector3D pos = state1.getPosition().lerp(state2.getPosition(), t);
      Vector3D vel = state1.getVelocity().lerp(state2.getVelocity(), t);

      // Interpolate spin rate
      double spin = state1.getSpinRate() + t * (state2.getSpinRate() - state1.getSpinRate());

      Bullet interp_state(state1, pos, vel, spin);

      return TrajectoryPoint(time, interp_state);
    }

    double Trajectory::getTotalDistance() const
    {
      if(points_.empty())
        return 0.0;

      return points_.back().getDistance();
    }

    double Trajectory::getTotalTime() const
    {
      if(points_.empty())
        return 0.0;

      return points_.back().getTime();
    }

    double Trajectory::getMaximumHeight() const
    {
      if(points_.empty())
        return 0.0;

      double max_height = 0.0;
      for(const auto& point : points_)
      {
        double height = point.getState().getPositionZ();
        if(height > max_height)
        {
          max_height = height;
        }
      }

      return max_height;
    }

    double Trajectory::getImpactVelocity() const
    {
      if(points_.empty())
        return 0.0;

      return points_.back().getVelocity();
    }

    double Trajectory::getImpactAngle() const
    {
      if(points_.empty())
        return 0.0;

      const Bullet& impact_state = points_.back().getState();
      double vx = impact_state.getVelocityX();
      double vz = impact_state.getVelocityZ();

      // Impact angle is the angle below horizontal
      double angle_rad = std::atan2(-vz, vx); // Negative vz because it's downward
      return angle_rad;
    }

    void Trajectory::clear()
    {
      points_.clear();
    }


    Bullet Trajectory::interpolate(const TrajectoryPoint& point1, const TrajectoryPoint& point2,
                                   double distance) const
    {
      double dist1 = point1.getDistance();
      double dist2 = point2.getDistance();

      double t = (distance - dist1) / (dist2 - dist1);

      const Bullet& state1 = point1.getState();
      const Bullet& state2 = point2.getState();

      // Interpolate position and velocity using vector lerp
      Vector3D pos = state1.getPosition().lerp(state2.getPosition(), t);
      Vector3D vel = state1.getVelocity().lerp(state2.getVelocity(), t);

      // Interpolate spin rate
      double spin = state1.getSpinRate() + t * (state2.getSpinRate() - state1.getSpinRate());

      return Bullet(state1, pos, vel, spin);
    }

  } // namespace ballistics
} // namespace btk
