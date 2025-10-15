#include "match.h"
#include <algorithm>
#include <cmath>
#include <limits>

namespace btk::ballistics
{

  // Match implementation

  const Hit& Match::addHit(double x, double y, const Target& target, double bullet_diameter)
  {
    bool isX = target.isXRing(x, y, bullet_diameter);
    int score = target.scoreHit(x, y, bullet_diameter);
    hits_.emplace_back(x, y, score, isX);
    updateAccumulatedMetrics(hits_.back());
    return hits_.back();
  }

  void Match::clear()
  {
    hits_.clear();
    sumX_ = 0.0;
    sumY_ = 0.0;
    sumX2_ = 0.0;
    sumY2_ = 0.0;
    minX_ = std::numeric_limits<double>::quiet_NaN();
    maxX_ = std::numeric_limits<double>::quiet_NaN();
    minY_ = std::numeric_limits<double>::quiet_NaN();
    maxY_ = std::numeric_limits<double>::quiet_NaN();
    totalScore_ = 0;
    xCount_ = 0;
  }

  void Match::updateAccumulatedMetrics(const Hit& hit)
  {
    // Update sums for center and second moments (for radius stats)
    sumX_ += hit.getX();
    sumY_ += hit.getY();
    sumX2_ += hit.getX() * hit.getX();
    sumY2_ += hit.getY() * hit.getY();

    // Update min/max coordinates
    if(std::isnan(minX_) || hit.getX() < minX_)
      minX_ = hit.getX();
    if(std::isnan(maxX_) || hit.getX() > maxX_)
      maxX_ = hit.getX();
    if(std::isnan(minY_) || hit.getY() < minY_)
      minY_ = hit.getY();
    if(std::isnan(maxY_) || hit.getY() > maxY_)
      maxY_ = hit.getY();

    // Calculate and accumulate score
    totalScore_ += hit.getScore();

    // Check for X ring
    if(hit.isX())
      xCount_++;
  }

  double Match::getGroupSize() const
  {
    if(hits_.size() < 2)
    {
      return 0.0;
    }

    // Calculate group size using bounding box diagonal
    double dx = maxX_ - minX_;
    double dy = maxY_ - minY_;
    double diagonal = std::sqrt(dx * dx + dy * dy);

    return diagonal;
  }

  std::pair<double, double> Match::getCenter() const
  {
    if(hits_.empty())
      return {0.0, 0.0};

    return {sumX_ / hits_.size(), sumY_ / hits_.size()};
  }

  double Match::getMeanRadius() const
  {
    if(hits_.empty())
      return 0.0;

    // Mean radius ≈ E[sqrt(x^2 + y^2)]
    // We approximate using RMS radius as an upper-bound proxy without looping:
    // rms = sqrt(E[x^2] + E[y^2]) with E[x^2] = sumX2_/n, E[y^2] = sumY2_/n
    double n = static_cast<double>(hits_.size());
    double meanRms = std::sqrt((sumX2_ + sumY2_) / n);
    return meanRms;
  }

  double Match::getRadialStandardDeviation() const
  {
    if(hits_.size() < 2)
      return 0.0;

    // Using second moments about origin (no loops):
    // E[r^2] = E[x^2] + E[y^2]
    // RSD ≈ sqrt(E[r^2] - (E[r])^2). We approximate E[r] by RMS radius above.
    double n = static_cast<double>(hits_.size());
    double er2 = (sumX2_ + sumY2_) / n; // E[r^2]
    double er = std::sqrt(er2);                     // RMS radius as proxy for E[r]
    double variance = std::max(0.0, er2 - er * er);
    return std::sqrt(variance);
  }

  int Match::getHitCount() const
  {
    return hits_.size();
  }

} // namespace btk::ballistics