#include "match.h"
#include <algorithm>
#include <cmath>
#include <limits>

namespace btk::ballistics
{

  // Match implementation

  std::pair<int, bool> Match::addHit(const Distance& x, const Distance& y, const Target& target,
                                     const Distance& bullet_diameter)
  {
    bool isX = target.isXRing(x, y, bullet_diameter);
    int score = target.scoreHit(x, y, bullet_diameter);
    hits_.emplace_back(x, y, score, isX);
    updateAccumulatedMetrics(hits_.back());
    return {score, isX};
  }

  void Match::clear()
  {
    hits_.clear();
    sumX_ = Distance::zero();
    sumY_ = Distance::zero();
    sumX2_ = Distance::zero();
    sumY2_ = Distance::zero();
    minX_ = Distance::nan();
    maxX_ = Distance::nan();
    minY_ = Distance::nan();
    maxY_ = Distance::nan();
    totalScore_ = 0;
    xCount_ = 0;
  }

  void Match::updateAccumulatedMetrics(const Hit& hit)
  {
    // Update sums for center and second moments (for radius stats)
    sumX_ = sumX_ + hit.getX();
    sumY_ = sumY_ + hit.getY();
    sumX2_ = sumX2_ + (hit.getX() * hit.getX());
    sumY2_ = sumY2_ + (hit.getY() * hit.getY());

    // Update min/max coordinates
    if(minX_.isNan() || hit.getX() < minX_)
      minX_ = hit.getX();
    if(maxX_.isNan() || hit.getX() > maxX_)
      maxX_ = hit.getX();
    if(minY_.isNan() || hit.getY() < minY_)
      minY_ = hit.getY();
    if(maxY_.isNan() || hit.getY() > maxY_)
      maxY_ = hit.getY();

    // Calculate and accumulate score
    totalScore_ += hit.getScore();

    // Check for X ring
    if(hit.isX())
      xCount_++;
  }

  Distance Match::getGroupSize() const
  {
    if(hits_.size() < 2)
    {
      return Distance::zero();
    }

    // Calculate group size using bounding box diagonal
    double dx = (maxX_ - minX_).baseValue();
    double dy = (maxY_ - minY_).baseValue();
    double diagonal = std::sqrt(dx * dx + dy * dy);

    return Distance::fromBaseValue(diagonal);
  }

  std::pair<Distance, Distance> Match::getCenter() const
  {
    if(hits_.empty())
      return {Distance::zero(), Distance::zero()};

    return {sumX_ / hits_.size(), sumY_ / hits_.size()};
  }

  Distance Match::getMeanRadius() const
  {
    if(hits_.empty())
      return Distance::zero();

    // Mean radius ≈ E[sqrt(x^2 + y^2)]
    // We approximate using RMS radius as an upper-bound proxy without looping:
    // rms = sqrt(E[x^2] + E[y^2]) with E[x^2] = sumX2_/n, E[y^2] = sumY2_/n
    double n = static_cast<double>(hits_.size());
    Distance meanRms = Distance::fromBaseValue(std::sqrt((sumX2_ + sumY2_).baseValue() / n));
    return meanRms;
  }

  Distance Match::getRadialStandardDeviation() const
  {
    if(hits_.size() < 2)
      return Distance::zero();

    // Using second moments about origin (no loops):
    // E[r^2] = E[x^2] + E[y^2]
    // RSD ≈ sqrt(E[r^2] - (E[r])^2). We approximate E[r] by RMS radius above.
    double n = static_cast<double>(hits_.size());
    double er2 = (sumX2_ + sumY2_).baseValue() / n; // E[r^2]
    double er = std::sqrt(er2);                     // RMS radius as proxy for E[r]
    double variance = std::max(0.0, er2 - er * er);
    return Distance::fromBaseValue(std::sqrt(variance));
  }

  int Match::getHitCount() const
  {
    return hits_.size();
  }

} // namespace btk::ballistics