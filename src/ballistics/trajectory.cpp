#include "ballistics/trajectory.h"
#include "math/conversions.h"
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

    // Trajectory implementation
    Trajectory::Trajectory() {}

    void Trajectory::addPoint(float time, const Bullet& state, const btk::math::Vector3D& wind) { points_.emplace_back(time, state, wind); }

    const TrajectoryPoint& Trajectory::getPoint(size_t index) const
    {
      if(index >= points_.size())
        throw std::out_of_range("Trajectory point index out of range");

      return points_[index];
    }

    std::optional<TrajectoryPoint> Trajectory::atDistance(float distance) const
    {
      if(points_.empty())
      {
        return std::nullopt;
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
        float mid_distance = points_[mid].getDistance();

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
      float dist1 = points_[left].getDistance();
      float dist2 = points_[right].getDistance();

      // Interpolate between the two points
      float t = (distance - dist1) / (dist2 - dist1);

      // Interpolate time
      float interp_time = points_[left].getTime() + t * (points_[right].getTime() - points_[left].getTime());

      // Interpolate state
      Bullet interp_state = interpolate(points_[left], points_[right], distance);

      // Interpolate wind
      btk::math::Vector3D wind = points_[left].getWind().lerp(points_[right].getWind(), t);

      return TrajectoryPoint(interp_time, interp_state, wind);
    }

    std::optional<TrajectoryPoint> Trajectory::atTime(float time) const
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
        float mid_time = points_[mid].getTime();
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
      float time1 = points_[left].getTime();
      float time2 = points_[right].getTime();

      float t = (time - time1) / (time2 - time1);

      const Bullet& state1 = points_[left].getState();
      const Bullet& state2 = points_[right].getState();

      // Interpolate position and velocity using vector lerp
      btk::math::Vector3D pos = state1.getPosition().lerp(state2.getPosition(), t);
      btk::math::Vector3D vel = state1.getVelocity().lerp(state2.getVelocity(), t);

      // Interpolate spin rate
      float spin = state1.getSpinRate() + t * (state2.getSpinRate() - state1.getSpinRate());

      // Interpolate wind
      btk::math::Vector3D wind = points_[left].getWind().lerp(points_[right].getWind(), t);

      Bullet interp_state(state1, pos, vel, spin);

      return TrajectoryPoint(time, interp_state, wind);
    }

    float Trajectory::getTotalDistance() const
    {
      if(points_.empty())
        return 0.0f;

      return points_.back().getDistance();
    }

    float Trajectory::getTotalTime() const
    {
      if(points_.empty())
        return 0.0f;

      return points_.back().getTime();
    }

    float Trajectory::getMaximumHeight() const
    {
      if(points_.empty())
        return 0.0f;

      float max_height = 0.0f;
      for(const auto& point : points_)
      {
        float height = point.getState().getPositionY();
        if(height > max_height)
        {
          max_height = height;
        }
      }

      return max_height;
    }

    float Trajectory::getImpactVelocity() const
    {
      if(points_.empty())
        return 0.0f;

      return points_.back().getVelocity();
    }

    float Trajectory::getImpactAngle() const
    {
      if(points_.empty())
        return 0.0f;

      const Bullet& impact_state = points_.back().getState();
      float vy = impact_state.getVelocityY();
      float vz = impact_state.getVelocityZ();

      // Impact angle is the angle below horizontal
      // vz is -downrange, vy is vertical (downward is negative)
      float angle_rad = std::atan2(-vy, -vz); // Negative vz because it's -downrange, negative vy because it's downward
      return angle_rad;
    }

    std::optional<btk::math::Vector3D> Trajectory::getPosition(float time) const
    {
      auto point = atTime(time);
      if(point.has_value())
      {
        return point->getPosition();
      }
      return std::nullopt;
    }

    std::optional<btk::math::Vector3D> Trajectory::getPositionAtDistance(float distance) const
    {
      auto point = atDistance(distance);
      if(point.has_value())
      {
        return point->getPosition();
      }
      return std::nullopt;
    }

    std::optional<btk::math::Vector3D> Trajectory::getWind(float time) const
    {
      auto point = atTime(time);
      if(point.has_value())
      {
        return point->getWind();
      }
      return std::nullopt;
    }

    std::optional<btk::math::Vector3D> Trajectory::getWindAtDistance(float distance) const
    {
      auto point = atDistance(distance);
      if(point.has_value())
      {
        return point->getWind();
      }
      return std::nullopt;
    }

    void Trajectory::clear() { points_.clear(); }

    Bullet Trajectory::interpolate(const TrajectoryPoint& point1, const TrajectoryPoint& point2, float distance) const
    {
      float dist1 = point1.getDistance();
      float dist2 = point2.getDistance();

      float t = (distance - dist1) / (dist2 - dist1);

      const Bullet& state1 = point1.getState();
      const Bullet& state2 = point2.getState();

      // Interpolate position and velocity using vector lerp
      btk::math::Vector3D pos = state1.getPosition().lerp(state2.getPosition(), t);
      btk::math::Vector3D vel = state1.getVelocity().lerp(state2.getVelocity(), t);

      // Interpolate spin rate
      float spin = state1.getSpinRate() + t * (state2.getSpinRate() - state1.getSpinRate());

      return Bullet(state1, pos, vel, spin);
    }

  } // namespace ballistics
} // namespace btk
