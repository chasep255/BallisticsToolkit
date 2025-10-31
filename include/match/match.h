#pragma once

#include "match/target.h"
#include "math/conversions.h"
#include "math/vector.h"
#include <limits>
#include <string>
#include <vector>

namespace btk::match
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
    Hit() : x_(0.0f), y_(0.0f), score_(0) {}

    /**
     * @brief Construct hit with position and score
     *
     * @param x_position X coordinate in m (positive = right)
     * @param y_position Y coordinate in m (positive = up)
     * @param hit_score Score (0-10)
     * @param is_x Whether this is an X-ring hit
     */
    Hit(float x_position, float y_position, int hit_score, bool is_x) : x_(x_position), y_(y_position), score_(is_x ? 11 : hit_score) {}

    /**
     * @brief Get X coordinate
     *
     * @return X coordinate in m
     */
    float getX() const { return x_; }

    /**
     * @brief Get Y coordinate
     *
     * @return Y coordinate in m
     */
    float getY() const { return y_; }

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
    float x_;   // X coordinate in m (positive = right)
    float y_;   // Y coordinate in m (positive = up)
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
     * @param bullet_diameter Bullet diameter in m (for line breaking, default: 0.0f)
     * @return Reference to the created Hit object
     */
    const Hit& addHit(float x, float y, const btk::match::Target& target, float bullet_diameter = 0.0f);

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
    float getGroupSize() const;

    /**
     * @brief Get center of group
     *
     * @return Pair of (x_center, y_center) in m
     */
    std::pair<float, float> getCenter() const;

    /**
     * @brief Get mean radius from center
     *
     * @return Mean radius in m
     */
    float getMeanRadius() const;

    /**
     * @brief Get radial standard deviation
     *
     * @return Radial standard deviation in m
     */
    float getRadialStandardDeviation() const;

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
    float sumX_ = 0.0f;                                    // m
    float sumY_ = 0.0f;                                    // m
    float sumX2_ = 0.0f;                                   // sum of (x/meter)^2 - dimensionless
    float sumY2_ = 0.0f;                                   // sum of (y/meter)^2 - dimensionless
    float minX_ = std::numeric_limits<float>::quiet_NaN(); // m
    float maxX_ = std::numeric_limits<float>::quiet_NaN(); // m
    float minY_ = std::numeric_limits<float>::quiet_NaN(); // m
    float maxY_ = std::numeric_limits<float>::quiet_NaN(); // m
    int totalScore_ = 0;
    int xCount_ = 0;

    void updateAccumulatedMetrics(const Hit& hit);
  };

} // namespace btk::match
