#pragma once

#include "units.h"
#include <cmath>
#include <map>
#include <string>

namespace btk::match
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
     * @param ring_10 10-ring diameter in inches
     * @param ring_9 9-ring diameter in inches
     * @param ring_8 8-ring diameter in inches
     * @param ring_7 7-ring diameter in inches
     * @param ring_6 6-ring diameter in inches
     * @param ring_5 5-ring diameter in inches
     * @param x_ring X-ring diameter (defaults to ring_10)
     * @param description Human-readable description
     */
    Target(const std::string& name, double ring_10, double ring_9, double ring_8, double ring_7, double ring_6,
           double ring_5, double x_ring = -1.0, const std::string& description = "");

    /**
     * @brief Get diameter of specified ring in inches
     */
    double ringDiameter(int ring) const;

    /**
     * @brief Calculate score for a hit at (x, y) coordinates
     *
     * @param x_inches X coordinate in inches (positive = right)
     * @param y_inches Y coordinate in inches (positive = up)
     * @param bullet_diameter_inches Bullet diameter in inches (for line breaking)
     * @return Score (0-10, where 0 = miss)
     */
    int scoreHit(double x_inches, double y_inches, double bullet_diameter_inches = 0.0) const;

    /**
     * @brief Check if hit is in X ring
     *
     * @param x_inches X coordinate in inches
     * @param y_inches Y coordinate in inches
     * @param bullet_diameter_inches Bullet diameter in inches (for line breaking)
     */
    bool isXRing(double x_inches, double y_inches, double bullet_diameter_inches = 0.0) const;

    /**
     * @brief Get diameter and radius for a ring
     *
     * @return Pair of (diameter_inches, radius_inches)
     */
    std::pair<double, double> getRingInfo(int ring) const;

    // Getters
    const std::string& getName() const
    {
      return name_;
    }
    const std::string& getDescription() const
    {
      return description_;
    }
    double getXRingDiameter() const
    {
      return x_ring_diameter_;
    }

    std::string toString() const;

    private:
    std::string name_;
    double x_ring_diameter_;
    std::string description_;
    std::map<int, double> rings_; // ring number -> diameter in inches
  };

} // namespace btk::match
