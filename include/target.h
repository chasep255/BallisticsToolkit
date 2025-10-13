#pragma once

#include "units.h"
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
         * @param ring_10 10-ring diameter
         * @param ring_9 9-ring diameter
         * @param ring_8 8-ring diameter
         * @param ring_7 7-ring diameter
         * @param ring_6 6-ring diameter
         * @param ring_5 5-ring diameter
         * @param x_ring X-ring diameter (defaults to ring_10)
         * @param description Human-readable description
         */
        Target(const std::string& name, const Distance& ring_10, const Distance& ring_9, const Distance& ring_8,
               const Distance& ring_7, const Distance& ring_6, const Distance& ring_5,
               const Distance& x_ring = Distance::zero(), const std::string& description = "");

        /**
         * @brief Get diameter of specified ring
         */
        Distance ringDiameter(int ring) const;

        /**
         * @brief Calculate score for a hit at (x, y) coordinates
         *
         * @param x_position X coordinate (positive = right)
         * @param y_position Y coordinate (positive = up)
         * @param bullet_diameter Bullet diameter (for line breaking)
         * @return Score (0-10, where 0 = miss)
         */
        int scoreHit(const Distance& x_position, const Distance& y_position,
                     const Distance& bullet_diameter = Distance::zero()) const;

        /**
         * @brief Check if hit is in X ring
         *
         * @param x_position X coordinate
         * @param y_position Y coordinate
         * @param bullet_diameter Bullet diameter (for line breaking)
         */
        bool isXRing(const Distance& x_position, const Distance& y_position,
                     const Distance& bullet_diameter = Distance::zero()) const;

        /**
         * @brief Get diameter and radius for a ring
         *
         * @return Pair of (diameter, radius)
         */
        std::pair<Distance, Distance> getRingInfo(int ring) const;

        // Getters
        const std::string& getName() const
        {
            return name_;
        }
        const std::string& getDescription() const
        {
            return description_;
        }
        Distance getXRingDiameter() const
        {
            return x_ring_diameter_;
        }

        std::string toString() const;

        private:
        std::string name_;
        Distance x_ring_diameter_;
        std::string description_;
        std::map<int, Distance> rings_; // ring number -> diameter
    };

} // namespace btk::ballistics
