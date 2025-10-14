#include "trajectory.h"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace btk
{
  namespace ballistics
  {

    // TrajectoryPoint implementation
    TrajectoryPoint::TrajectoryPoint(const Time& time, const Bullet& state) : time_(time), state_(state)
    {
    }

    Distance TrajectoryPoint::getDistance() const
    {
      return state_.getPositionX();
    }

    Velocity TrajectoryPoint::getVelocity() const
    {
      return state_.getTotalVelocity();
    }

    Energy TrajectoryPoint::getKineticEnergy() const
    {
      // KE = 0.5 * m * v^2
      double mass_kg = state_.getWeight().kilograms();
      double velocity_mps = state_.getTotalVelocity().baseValue();
      double energy_joules = 0.5 * mass_kg * velocity_mps * velocity_mps;
      return Energy::joules(energy_joules);
    }

    std::string TrajectoryPoint::toString() const
    {
      std::ostringstream oss;
      oss << "TrajectoryPoint(t=" << std::fixed << std::setprecision(3) << time_.seconds()
          << "s, d=" << std::setprecision(1) << getDistance().yards() << "yd, " << "v=" << getVelocity().fps()
          << "fps)";
      return oss.str();
    }

    // Trajectory implementation
    Trajectory::Trajectory()
    {
    }

    void Trajectory::addPoint(const Time& time, const Bullet& state)
    {
      points_.emplace_back(time, state);
    }

    const TrajectoryPoint& Trajectory::getPoint(size_t index) const
    {
      if(index >= points_.size())
        throw std::out_of_range("Trajectory point index out of range");

      return points_[index];
    }

    TrajectoryPoint Trajectory::atDistance(const Distance& distance) const
    {
      if(points_.empty())
      {
        return TrajectoryPoint(Time::nan(), Bullet(Weight::zero(), Distance::zero(), Distance::zero(), 0.0));
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
        Distance mid_distance = points_[mid].getDistance();

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
      const auto& dist1 = points_[left].getDistance();
      const auto& dist2 = points_[right].getDistance();

      // Interpolate between the two points
      double t = (distance - dist1).baseValue() / (dist2 - dist1).baseValue();

      // Interpolate time
      Time interp_time = points_[left].getTime() + t * (points_[right].getTime() - points_[left].getTime());

      // Interpolate state
      Bullet interp_state = interpolate(points_[left], points_[right], distance);

      return TrajectoryPoint(interp_time, interp_state);
    }

    std::optional<TrajectoryPoint> Trajectory::atTime(const Time& time) const
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
        const auto& mid_time = points_[mid].getTime();
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
      const auto& time1 = points_[left].getTime();
      const auto& time2 = points_[right].getTime();

      double t = (time - time1).baseValue() / (time2 - time1).baseValue();

      const Bullet& state1 = points_[left].getState();
      const Bullet& state2 = points_[right].getState();

      // Interpolate position
      Distance x = state1.getPositionX() + t * (state2.getPositionX() - state1.getPositionX());
      Distance y = state1.getPositionY() + t * (state2.getPositionY() - state1.getPositionY());
      Distance z = state1.getPositionZ() + t * (state2.getPositionZ() - state1.getPositionZ());

      // Interpolate velocity
      Velocity vx = state1.getVelocityX() + t * (state2.getVelocityX() - state1.getVelocityX());
      Velocity vy = state1.getVelocityY() + t * (state2.getVelocityY() - state1.getVelocityY());
      Velocity vz = state1.getVelocityZ() + t * (state2.getVelocityZ() - state1.getVelocityZ());

      // Interpolate spin rate
      AngularVelocity spin = state1.getSpinRate() + t * (state2.getSpinRate() - state1.getSpinRate());

      Bullet interp_state(state1, x, y, z, vx, vy, vz, spin);

      return TrajectoryPoint(time, interp_state);
    }

    Distance Trajectory::getTotalDistance() const
    {
      if(points_.empty())
        return Distance::zero();

      return points_.back().getDistance();
    }

    Time Trajectory::getTotalTime() const
    {
      if(points_.empty())
        return Time::zero();

      return points_.back().getTime();
    }

    Distance Trajectory::getMaximumHeight() const
    {
      if(points_.empty())
        return Distance::zero();

      double max_height = 0.0;
      for(const auto& point : points_)
      {
        double height = point.getState().getPositionZ().baseValue();
        if(height > max_height)
        {
          max_height = height;
        }
      }

      return Distance::meters(max_height);
    }

    Velocity Trajectory::getImpactVelocity() const
    {
      if(points_.empty())
        return Velocity::zero();

      return points_.back().getVelocity();
    }

    Angle Trajectory::getImpactAngle() const
    {
      if(points_.empty())
        return Angle::zero();

      const Bullet& impact_state = points_.back().getState();
      double vx = impact_state.getVelocityX().baseValue();
      double vz = impact_state.getVelocityZ().baseValue();

      // Impact angle is the angle below horizontal
      double angle_rad = std::atan2(-vz, vx); // Negative vz because it's downward
      return Angle::radians(angle_rad);
    }

    void Trajectory::clear()
    {
      points_.clear();
    }

    std::string Trajectory::toString() const
    {
      std::ostringstream oss;
      oss << "Trajectory(" << points_.size() << " points, " << std::fixed << std::setprecision(1)
          << getTotalDistance().yards() << "yd, " << std::setprecision(3) << getTotalTime().seconds() << "s)";
      return oss.str();
    }

    Bullet Trajectory::interpolate(const TrajectoryPoint& point1, const TrajectoryPoint& point2,
                                   const Distance& distance) const
    {
      const auto& dist1 = point1.getDistance();
      const auto& dist2 = point2.getDistance();

      double t = (distance - dist1).baseValue() / (dist2 - dist1).baseValue();

      const Bullet& state1 = point1.getState();
      const Bullet& state2 = point2.getState();

      // Interpolate position
      Distance x = state1.getPositionX() + t * (state2.getPositionX() - state1.getPositionX());
      Distance y = state1.getPositionY() + t * (state2.getPositionY() - state1.getPositionY());
      Distance z = state1.getPositionZ() + t * (state2.getPositionZ() - state1.getPositionZ());

      // Interpolate velocity
      Velocity vx = state1.getVelocityX() + t * (state2.getVelocityX() - state1.getVelocityX());
      Velocity vy = state1.getVelocityY() + t * (state2.getVelocityY() - state1.getVelocityY());
      Velocity vz = state1.getVelocityZ() + t * (state2.getVelocityZ() - state1.getVelocityZ());

      // Interpolate spin rate
      AngularVelocity spin = state1.getSpinRate() + t * (state2.getSpinRate() - state1.getSpinRate());

      return Bullet(state1, x, y, z, vx, vy, vz, spin);
    }

  } // namespace ballistics
} // namespace btk
