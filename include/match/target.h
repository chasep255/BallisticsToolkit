#pragma once

#include "math/conversions.h"
#include "math/vector.h"
#include <cmath>
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
     * @param ring_10 10-ring diameter in m
     * @param ring_9 9-ring diameter in m
     * @param ring_8 8-ring diameter in m
     * @param ring_7 7-ring diameter in m
     * @param ring_6 6-ring diameter in m
     * @param ring_5 5-ring diameter in m
     * @param x_ring X-ring diameter in m (defaults to ring_10)
     * @param description Human-readable description
     * @param aiming_black_ring Outermost ring inside the aiming black (5-10, 0 = no black)
     * @param face_size Target paper (face) edge length in m; faces are square
     */
    Target(const std::string& name, float ring_10, float ring_9, float ring_8, float ring_7, float ring_6, float ring_5, float x_ring = 0.0f, const std::string& description = "",
           int aiming_black_ring = 7, float face_size = btk::math::Conversions::inchesToMeters(72.0f));

    /**
     * @brief Get diameter of specified ring (0-6, where 6=X, 5=10, etc.)
     */
    float ringDiameter(int ring) const; // returns m

    /**
     * @brief Calculate score for a hit at (x, y) coordinates
     *
     * @param x_position X coordinate in m (positive = right)
     * @param y_position Y coordinate in m (positive = up)
     * @param bullet_diameter Bullet diameter in m (for line breaking)
     * @return Score (0-10, where 0 = miss)
     */
    int scoreHit(float x_position, float y_position, float bullet_diameter = 0.0f) const;

    /**
     * @brief Check if hit is in X ring
     *
     * @param x_position X coordinate in m
     * @param y_position Y coordinate in m
     * @param bullet_diameter Bullet diameter in m (for line breaking)
     */
    bool isXRing(float x_position, float y_position, float bullet_diameter = 0.0f) const;

    /**
     * @brief Get inner diameter for a ring
     *
     * @return Inner diameter in m
     */
    float getRingInnerDiameter(int ring) const;

    /**
     * @brief Get outer diameter for a ring
     *
     * @return Outer diameter in m
     */
    float getRingOuterDiameter(int ring) const;

    // Getters
    const std::string& getName() const { return name_; }
    const std::string& getDescription() const { return description_; }
    float getXRingDiameter() const { return ring_diameters_[6]; } // m

    /**
     * @brief Outermost ring inside the aiming black (5-10, 0 = no aiming black)
     */
    int getAimingBlackRing() const { return aiming_black_ring_; }

    /**
     * @brief Diameter of the aiming black in m (0 if the target has no black)
     */
    float getAimingBlackDiameter() const { return aiming_black_ring_ >= 5 ? ring_diameters_[aiming_black_ring_ - 5] : 0.0f; }

    /**
     * @brief Target paper (face) edge length in m; faces are square
     */
    float getFaceSize() const { return face_size_; }

    private:
    std::string name_;
    std::string description_;
    float ring_diameters_[7]; // m
    int aiming_black_ring_;   // outermost ring in the aiming black (0 = none)
    float face_size_;         // m
  };

} // namespace btk::match
