#pragma once

#include "target.h"
#include "vector.h"
#include "conversions.h"
#include <string>
#include <vector>
#include <limits>

namespace btk::ballistics
{

  /**
   * @brief Hit coordinates
   */
  class Hit
  {
    public:
    Hit() : x_(0.0), y_(0.0), score_(0) {}
    Hit(double x_position, double y_position, int hit_score, bool is_x)
      : x_(x_position), y_(y_position), score_(is_x ? 11 : hit_score) {}

    double getX() const { return x_; } // m
    double getY() const { return y_; } // m
    int getScore() const { return score_ > 10 ? 10 : score_; }
    bool isX() const { return score_ == 11; }

    private:
    double x_; // X coordinate in m (positive = right)
    double y_; // Y coordinate in m (positive = up)
    int score_;  // Score for this hit (11 = X)
  };

  /**
   * @brief Class that accumulates hits and provides match analysis
   */
  class Match
  {
    public:
    Match() = default;

    /**
     * @brief Add a hit by coordinates
     */
    std::pair<int, bool> addHit(double x, double y, const Target& target, double bullet_diameter = 0.0);

    /**
     * @brief Get all hits
     */
    const std::vector<Hit>& getHits() const
    {
      return hits_;
    }

    /**
     * @brief Get number of hits
     */
    size_t size() const
    {
      return hits_.size();
    }

    /**
     * @brief Clear all hits
     */
    void clear();

    /**
     * @brief Get group size (extreme spread)
     */
    double getGroupSize() const; // m

    /**
     * @brief Get center of group
     */
    std::pair<double, double> getCenter() const; // m

    /**
     * @brief Get mean radius
     */
    double getMeanRadius() const; // m

    /**
     * @brief Get radial standard deviation
     */
    double getRadialStandardDeviation() const; // m

    /**
     * @brief Get total score
     */
    int getTotalScore() const
    {
      return totalScore_;
    }

    /**
     * @brief Get X count
     */
    int getXCount() const
    {
      return xCount_;
    }

    /**
     * @brief Get hit count
     */
    int getHitCount() const;

    private:
    std::vector<Hit> hits_;

    // Accumulated metrics
    double sumX_ = 0.0; // m
    double sumY_ = 0.0; // m
    double sumX2_ = 0.0;  // sum of (x/meter)^2 - dimensionless
    double sumY2_ = 0.0;  // sum of (y/meter)^2 - dimensionless
    double minX_ = std::numeric_limits<double>::quiet_NaN(); // m
    double maxX_ = std::numeric_limits<double>::quiet_NaN(); // m
    double minY_ = std::numeric_limits<double>::quiet_NaN(); // m
    double maxY_ = std::numeric_limits<double>::quiet_NaN(); // m
    int totalScore_ = 0;
    int xCount_ = 0;

    void updateAccumulatedMetrics(const Hit& hit);
  };

} // namespace btk::ballistics
