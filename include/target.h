#pragma once

#include "vector.h"
#include "conversions.h"
#include <cmath>
#include <map>
#include <string>

namespace btk::ballistics
{

  /**
   * @brief Base class for shooting targets with scoring rings
   *
   * Targets are defined by their ring diameters in inches, where:
   * - Ring 10 is the center (smallest)
   * - Ring 5 is the outermost scoring ring
   * - X ring is the innermost ring (smallest diameter)
   */
  class Target
  {
    public:
    /**
     * @brief Initialize a target
     *
     * @param name Target name/identifier
     * @param ring_10 10-ring diameter in m
     * @param ring_9 9-ring diameter in m
     * @param ring_8 8-ring diameter in m
     * @param ring_7 7-ring diameter in m
     * @param ring_6 6-ring diameter in m
     * @param ring_5 5-ring diameter in m
     * @param x_ring X-ring diameter in m (defaults to ring_10)
     * @param description Human-readable description
     */
    Target(const std::string& name, double ring_10, double ring_9, double ring_8,
           double ring_7, double ring_6, double ring_5,
           double x_ring = 0.0, const std::string& description = "");

    /**
     * @brief Get diameter of specified ring (0-6, where 6=X, 5=10, etc.)
     */
    double ringDiameter(int ring) const; // returns m

    /**
     * @brief Calculate score for a hit at (x, y) coordinates
     *
     * @param x_position X coordinate in m (positive = right)
     * @param y_position Y coordinate in m (positive = up)
     * @param bullet_diameter Bullet diameter in m (for line breaking)
     * @return Score (0-10, where 0 = miss)
     */
    int scoreHit(double x_position, double y_position, double bullet_diameter = 0.0) const;

    /**
     * @brief Check if hit is in X ring
     *
     * @param x_position X coordinate in m
     * @param y_position Y coordinate in m
     * @param bullet_diameter Bullet diameter in m (for line breaking)
     */
    bool isXRing(double x_position, double y_position, double bullet_diameter = 0.0) const;

    /**
     * @brief Get inner diameter for a ring
     *
     * @return Inner diameter in m
     */
    double getRingInnerDiameter(int ring) const;

    /**
     * @brief Get outer diameter for a ring
     *
     * @return Outer diameter in m
     */
    double getRingOuterDiameter(int ring) const;

    // Getters
    const std::string& getName() const
    {
      return name_;
    }
    const std::string& getDescription() const
    {
      return description_;
    }
    double getXRingDiameter() const { return ring_diameters_[6]; } // m


    private:
    std::string name_;
    std::string description_;
    double ring_diameters_[7]; // m
  };

} // namespace btk::ballistics
