#pragma once

#include "conversions.h"
#include "target.h"
#include "vector.h"
#include <limits>
#include <string>
#include <vector>

namespace btk::ballistics
{

  /**
   * @brief Represents a single hit on a target
   *
   * Stores the position and score of a hit, with special handling for X-ring hits.
   */
  class Hit
  {
    public:
    /**
     * @brief Default constructor (zero hit)
     */
    Hit() : x_(0.0), y_(0.0), score_(0) {}

    /**
     * @brief Construct hit with position and score
     *
     * @param x_position X coordinate in m (positive = right)
     * @param y_position Y coordinate in m (positive = up)
     * @param hit_score Score (0-10)
     * @param is_x Whether this is an X-ring hit
     */
    Hit(double x_position, double y_position, int hit_score, bool is_x) : x_(x_position), y_(y_position), score_(is_x ? 11 : hit_score) {}

    /**
     * @brief Get X coordinate
     *
     * @return X coordinate in m
     */
    double getX() const { return x_; }

    /**
     * @brief Get Y coordinate
     *
     * @return Y coordinate in m
     */
    double getY() const { return y_; }

    /**
     * @brief Get score (0-10)
     *
     * @return Score value
     */
    int getScore() const { return score_ > 10 ? 10 : score_; }

    /**
     * @brief Check if hit is in X-ring
     *
     * @return True if X-ring hit
     */
    bool isX() const { return score_ == 11; }

    private:
    double x_;  // X coordinate in m (positive = right)
    double y_;  // Y coordinate in m (positive = up)
    int score_; // Score for this hit (11 = X)
  };

  /**
   * @brief Class that accumulates hits and provides match analysis
   *
   * Tracks all hits in a match and provides statistical analysis including
   * group size, center of impact, mean radius, and scoring statistics.
   */
  class Match
  {
    public:
    /**
     * @brief Default constructor
     */
    Match() = default;

    /**
     * @brief Add a hit by coordinates
     *
     * @param x X coordinate in m (positive = right)
     * @param y Y coordinate in m (positive = up)
     * @param target Target for scoring
     * @param bullet_diameter Bullet diameter in m (for line breaking, default: 0.0)
     * @return Reference to the created Hit object
     */
    const Hit& addHit(double x, double y, const Target& target, double bullet_diameter = 0.0);

    /**
     * @brief Get all hits
     *
     * @return Vector of all hits
     */
    const std::vector<Hit>& getHits() const { return hits_; }

    /**
     * @brief Get number of hits
     *
     * @return Number of hits
     */
    size_t size() const { return hits_.size(); }

    /**
     * @brief Clear all hits
     */
    void clear();

    /**
     * @brief Get group size (extreme spread)
     *
     * @return Group size in m (diagonal of bounding box)
     */
    double getGroupSize() const;

    /**
     * @brief Get center of group
     *
     * @return Pair of (x_center, y_center) in m
     */
    std::pair<double, double> getCenter() const;

    /**
     * @brief Get mean radius from center
     *
     * @return Mean radius in m
     */
    double getMeanRadius() const;

    /**
     * @brief Get radial standard deviation
     *
     * @return Radial standard deviation in m
     */
    double getRadialStandardDeviation() const;

    /**
     * @brief Get total score
     *
     * @return Total score of all hits
     */
    int getTotalScore() const { return totalScore_; }

    /**
     * @brief Get X-ring count
     *
     * @return Number of X-ring hits
     */
    int getXCount() const { return xCount_; }

    /**
     * @brief Get hit count
     *
     * @return Number of hits
     */
    int getHitCount() const;

    private:
    std::vector<Hit> hits_;

    // Accumulated metrics
    double sumX_ = 0.0;                                      // m
    double sumY_ = 0.0;                                      // m
    double sumX2_ = 0.0;                                     // sum of (x/meter)^2 - dimensionless
    double sumY2_ = 0.0;                                     // sum of (y/meter)^2 - dimensionless
    double minX_ = std::numeric_limits<double>::quiet_NaN(); // m
    double maxX_ = std::numeric_limits<double>::quiet_NaN(); // m
    double minY_ = std::numeric_limits<double>::quiet_NaN(); // m
    double maxY_ = std::numeric_limits<double>::quiet_NaN(); // m
    int totalScore_ = 0;
    int xCount_ = 0;

    void updateAccumulatedMetrics(const Hit& hit);
  };

} // namespace btk::ballistics
