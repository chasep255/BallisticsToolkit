#include "match/match.h"
#include <algorithm>
#include <cmath>

namespace btk::match
{

  // Match implementation

  const Hit& Match::addHit(float x, float y, const btk::match::Target& target, float bullet_diameter)
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
    sumX_ = 0.0f;
    sumY_ = 0.0f;
    totalScore_ = 0;
    xCount_ = 0;
  }

  void Match::updateAccumulatedMetrics(const Hit& hit)
  {
    // Update sums for the group center
    sumX_ += hit.getX();
    sumY_ += hit.getY();

    // Calculate and accumulate score
    totalScore_ += hit.getScore();

    // Check for X ring
    if(hit.isX())
      xCount_++;
  }

  float Match::getGroupSize() const
  {
    if(hits_.size() < 2)
    {
      return 0.0f;
    }

    // Extreme spread: the largest center-to-center distance between any two hits
    float max_dist2 = 0.0f;
    for(size_t i = 0; i < hits_.size(); ++i)
    {
      for(size_t j = i + 1; j < hits_.size(); ++j)
      {
        float dx = hits_[j].getX() - hits_[i].getX();
        float dy = hits_[j].getY() - hits_[i].getY();
        max_dist2 = std::max(max_dist2, dx * dx + dy * dy);
      }
    }

    return std::sqrt(max_dist2);
  }

  std::pair<float, float> Match::getCenter() const
  {
    if(hits_.empty())
      return {0.0f, 0.0f};

    return {sumX_ / hits_.size(), sumY_ / hits_.size()};
  }

  float Match::getMeanRadius() const
  {
    if(hits_.empty())
      return 0.0f;

    auto [cx, cy] = getCenter();
    float sum_r = 0.0f;
    for(const Hit& hit : hits_)
    {
      float dx = hit.getX() - cx;
      float dy = hit.getY() - cy;
      sum_r += std::sqrt(dx * dx + dy * dy);
    }

    return sum_r / hits_.size();
  }

  float Match::getRadialStandardDeviation() const
  {
    if(hits_.size() < 2)
      return 0.0f;

    // Sample standard deviation (n - 1) of the hit radii about the group center
    auto [cx, cy] = getCenter();
    float mean_r = getMeanRadius();
    float sum_sq_dev = 0.0f;
    for(const Hit& hit : hits_)
    {
      float dx = hit.getX() - cx;
      float dy = hit.getY() - cy;
      float dev = std::sqrt(dx * dx + dy * dy) - mean_r;
      sum_sq_dev += dev * dev;
    }

    return std::sqrt(sum_sq_dev / (hits_.size() - 1));
  }

  int Match::getHitCount() const { return hits_.size(); }

} // namespace btk::match