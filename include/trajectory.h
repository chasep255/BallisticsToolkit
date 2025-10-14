#pragma once

#include "bullet.h"
#include "units.h"
#include <optional>
#include <vector>

namespace btk::ballistics
{

  /**
   * @brief Represents a single point in a bullet trajectory
   */
  class TrajectoryPoint
  {
    public:
    /**
     * @brief Initialize trajectory point
     *
     * @param time Time at this point
     * @param state Flying bullet state at this point
     */
    TrajectoryPoint(const Time& time, const Bullet& state);

    // Getters
    const Time& getTime() const
    {
      return time_;
    }
    const Bullet& getState() const
    {
      return state_;
    }

    /**
     * @brief Get distance traveled at this point
     */
    Distance getDistance() const;

    /**
     * @brief Get velocity at this point
     */
    Velocity getVelocity() const;

    /**
     * @brief Get kinetic energy at this point
     */
    Energy getKineticEnergy() const;

    std::string toString() const;

    private:
    Time time_;
    Bullet state_;
  };

  /**
   * @brief Represents a complete bullet trajectory
   */
  class Trajectory
  {
    public:
    /**
     * @brief Initialize empty trajectory
     */
    Trajectory();

    /**
     * @brief Add a point to the trajectory
     *
     * @param time Time at this point
     * @param state Flying bullet state at this point
     */
    void addPoint(const Time& time, const Bullet& state);

    /**
     * @brief Get the number of points in the trajectory
     */
    size_t getPointCount() const
    {
      return points_.size();
    }

    /**
     * @brief Get a specific trajectory point by index
     *
     * @param index Index of the point (0-based)
     * @return Trajectory point at the given index
     * @throws std::out_of_range if index is invalid
     */
    const TrajectoryPoint& getPoint(size_t index) const;

    /**
     * @brief Get all trajectory points
     */
    const std::vector<TrajectoryPoint>& getPoints() const
    {
      return points_;
    }

    /**
     * @brief Get the trajectory point at a specific distance
     *
     * @param distance Distance along trajectory
     * @return Trajectory point at the given distance (interpolated), or TrajectoryPoint with NaN time if not found
     */
    TrajectoryPoint atDistance(const Distance& distance) const;

    /**
     * @brief Get the trajectory point at a specific time
     *
     * @param time Time along trajectory
     * @return Trajectory point at the given time (interpolated), or std::nullopt if not found
     */
    std::optional<TrajectoryPoint> atTime(const Time& time) const;

    /**
     * @brief Get the total distance of the trajectory
     */
    Distance getTotalDistance() const;

    /**
     * @brief Get the total time of flight
     */
    Time getTotalTime() const;

    /**
     * @brief Get the maximum height reached
     */
    Distance getMaximumHeight() const;

    /**
     * @brief Get the impact velocity
     */
    Velocity getImpactVelocity() const;

    /**
     * @brief Get the impact angle (angle below horizontal)
     */
    Angle getImpactAngle() const;

    /**
     * @brief Clear all points from the trajectory
     */
    void clear();

    /**
     * @brief Check if trajectory is empty
     */
    bool isEmpty() const
    {
      return points_.empty();
    }

    std::string toString() const;

    private:
    std::vector<TrajectoryPoint> points_;

    /**
     * @brief Interpolate between two trajectory points
     *
     * @param point1 First point
     * @param point2 Second point
     * @param distance Target distance
     * @return Interpolated flying bullet state
     */
    Bullet interpolate(const TrajectoryPoint& point1, const TrajectoryPoint& point2, const Distance& distance) const;
  };

} // namespace btk::ballistics
