#pragma once

#include "target.h"
#include <string>
#include <vector>

namespace btk::ballistics
{

    /**
     * @brief Hit coordinate with units
     */
    struct Hit
    {
        Distance x; // X coordinate (positive = right)
        Distance y; // Y coordinate (positive = up)

        Hit() : x(Distance::zero()), y(Distance::zero())
        {
        }
        Hit(const Distance& x_position, const Distance& y_position) : x(x_position), y(y_position)
        {
        }
    };

    /**
     * @brief Accuracy metrics for a group of hits
     */
    struct AccuracyMetrics
    {
        int count = 0;
        Distance group_size = Distance::zero();     // Extreme spread
        Distance center_x = Distance::zero();       // Center of group
        Distance center_y = Distance::zero();       // Center of group
        Distance mean_radius = Distance::zero();    // Average distance from center
        Distance radial_std_dev = Distance::zero(); // Radial standard deviation
    };

    /**
     * @brief Calculate group size (extreme spread)
     *
     * @param hits Vector of hit coordinates
     * @return Group size (zero if less than 2 hits)
     */
    Distance calculateGroupSize(const std::vector<Hit>& hits);

    /**
     * @brief Calculate center of group (mean point)
     *
     * @param hits Vector of hit coordinates
     * @return Pair of (center_x, center_y)
     */
    std::pair<Distance, Distance> calculateCenterOfGroup(const std::vector<Hit>& hits);

    /**
     * @brief Calculate radial standard deviation (RDS)
     *
     * @param hits Vector of hit coordinates
     * @return RDS
     */
    Distance calculateRadialStandardDeviation(const std::vector<Hit>& hits);

    /**
     * @brief Calculate mean radius (average distance from center)
     *
     * @param hits Vector of hit coordinates
     * @return Mean radius
     */
    Distance calculateMeanRadius(const std::vector<Hit>& hits);

    /**
     * @brief Calculate comprehensive accuracy metrics
     *
     * @param hits Vector of hit coordinates
     * @return Accuracy metrics structure
     */
    AccuracyMetrics calculateAccuracyMetrics(const std::vector<Hit>& hits);

    /**
     * @brief Convert hit coordinates to score string
     *
     * @param hits Vector of hit coordinates
     * @param target Target object for scoring
     * @param bullet_diameter Bullet diameter (for line breaking)
     * @return Score string like "10X, 10, 9, 8, 7"
     */
    std::string hitsToScoreString(const std::vector<Hit>& hits, const Target& target,
                                  const Distance& bullet_diameter = Distance::zero());

} // namespace btk::ballistics
