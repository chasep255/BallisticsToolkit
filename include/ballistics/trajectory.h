#pragma once

#include "ballistics/bullet.h"
#include "math/conversions.h"
#include "math/vector.h"
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
     * @param time Time at this point in s
     * @param state Flying bullet state at this point
     */
    TrajectoryPoint(float time, const Bullet& state);

    // Getters (all return SI base units)
    float getTime() const { return time_; } // s
    const Bullet& getState() const { return state_; }

    /**
     * @brief Get distance traveled at this point
     */
    float getDistance() const; // m

    /**
     * @brief Get velocity at this point
     */
    float getVelocity() const; // m/s

    /**
     * @brief Get kinetic energy at this point
     */
    float getKineticEnergy() const; // J

    private:
    float time_; // s
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
     * @param time Time at this point in s
     * @param state Flying bullet state at this point
     */
    void addPoint(float time, const Bullet& state);

    /**
     * @brief Get the number of points in the trajectory
     */
    size_t getPointCount() const { return points_.size(); }

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
    const std::vector<TrajectoryPoint>& getPoints() const { return points_; }

    /**
     * @brief Get the trajectory point at a specific distance
     *
     * @param distance Distance along trajectory in m
     * @return Trajectory point at the given distance (interpolated), or std::nullopt if not found
     */
    std::optional<TrajectoryPoint> atDistance(float distance) const;

    /**
     * @brief Get the trajectory point at a specific time
     *
     * @param time Time along trajectory in s
     * @return Trajectory point at the given time (interpolated), or std::nullopt if not found
     */
    std::optional<TrajectoryPoint> atTime(float time) const;

    /**
     * @brief Get the total distance of the trajectory
     */
    float getTotalDistance() const; // m

    /**
     * @brief Get the total time of flight
     */
    float getTotalTime() const; // s

    /**
     * @brief Get the maximum height reached
     */
    float getMaximumHeight() const; // m

    /**
     * @brief Get the impact velocity
     */
    float getImpactVelocity() const; // m/s

    /**
     * @brief Get the impact angle (angle below horizontal)
     */
    float getImpactAngle() const; // rad

    /**
     * @brief Clear all points from the trajectory
     */
    void clear();

    /**
     * @brief Check if trajectory is empty
     */
    bool isEmpty() const { return points_.empty(); }

    private:
    std::vector<TrajectoryPoint> points_;

    /**
     * @brief Interpolate between two trajectory points
     *
     * @param point1 First point
     * @param point2 Second point
     * @param distance Target distance in m
     * @return Interpolated flying bullet state
     */
    Bullet interpolate(const TrajectoryPoint& point1, const TrajectoryPoint& point2, float distance) const;
  };

} // namespace btk::ballistics
