#include "scoring.h"
#include <algorithm>
#include <cmath>
#include <numeric>
#include <sstream>

namespace btk::ballistics
{

    Distance calculateGroupSize(const std::vector<Hit>& hits)
    {
        if(hits.size() < 2)
        {
            return Distance::zero();
        }

        Distance max_distance = Distance::zero();
        for(size_t i = 0; i < hits.size(); ++i)
        {
            for(size_t j = i + 1; j < hits.size(); ++j)
            {
                Distance dx = hits[j].x - hits[i].x;
                Distance dy = hits[j].y - hits[i].y;
                Distance distance = Distance::inches(std::sqrt(dx.inches() * dx.inches() + dy.inches() * dy.inches()));
                if(distance > max_distance)
                {
                    max_distance = distance;
                }
            }
        }

        return max_distance;
    }

    std::pair<Distance, Distance> calculateCenterOfGroup(const std::vector<Hit>& hits)
    {
        if(hits.empty())
        {
            return {Distance::zero(), Distance::zero()};
        }

        Distance sum_x = Distance::zero();
        Distance sum_y = Distance::zero();
        for(const auto& hit : hits)
        {
            sum_x = sum_x + hit.x;
            sum_y = sum_y + hit.y;
        }

        return {sum_x / hits.size(), sum_y / hits.size()};
    }

    Distance calculateRadialStandardDeviation(const std::vector<Hit>& hits)
    {
        if(hits.size() < 2)
        {
            return Distance::zero();
        }

        auto [center_x, center_y] = calculateCenterOfGroup(hits);

        // Calculate distances from center
        std::vector<Distance> distances;
        for(const auto& hit : hits)
        {
            Distance dx = hit.x - center_x;
            Distance dy = hit.y - center_y;
            Distance distance = Distance::inches(std::sqrt(dx.inches() * dx.inches() + dy.inches() * dy.inches()));
            distances.push_back(distance);
        }

        // Calculate standard deviation
        Distance mean_distance = Distance::zero();
        for(const Distance& distance : distances)
        {
            mean_distance = mean_distance + distance;
        }
        mean_distance = mean_distance / distances.size();

        double variance_sum = 0.0;
        for(const Distance& distance : distances)
        {
            Distance diff = distance - mean_distance;
            double diff_inches = diff.inches();
            variance_sum += diff_inches * diff_inches;
        }
        double variance_inches = variance_sum / (distances.size() - 1);

        return Distance::inches(std::sqrt(variance_inches));
    }

    Distance calculateMeanRadius(const std::vector<Hit>& hits)
    {
        if(hits.empty())
        {
            return Distance::zero();
        }

        auto [center_x, center_y] = calculateCenterOfGroup(hits);

        Distance total_distance = Distance::zero();
        for(const auto& hit : hits)
        {
            Distance dx = hit.x - center_x;
            Distance dy = hit.y - center_y;
            Distance distance = Distance::inches(std::sqrt(dx.inches() * dx.inches() + dy.inches() * dy.inches()));
            total_distance = total_distance + distance;
        }

        return total_distance / hits.size();
    }

    AccuracyMetrics calculateAccuracyMetrics(const std::vector<Hit>& hits)
    {
        AccuracyMetrics metrics;

        if(hits.empty())
        {
            return metrics;
        }

        metrics.count = hits.size();
        metrics.group_size = calculateGroupSize(hits);

        auto [center_x, center_y] = calculateCenterOfGroup(hits);
        metrics.center_x = center_x;
        metrics.center_y = center_y;

        metrics.mean_radius = calculateMeanRadius(hits);
        metrics.radial_std_dev = calculateRadialStandardDeviation(hits);

        return metrics;
    }

    std::string hitsToScoreString(const std::vector<Hit>& hits, const Target& target, const Distance& bullet_diameter)
    {
        if(hits.empty())
        {
            return "";
        }

        std::vector<std::string> scores;
        for(const auto& hit : hits)
        {
            int score = target.scoreHit(hit.x, hit.y, bullet_diameter);
            if(target.isXRing(hit.x, hit.y, bullet_diameter))
            {
                scores.push_back(std::to_string(score) + "X");
            }
            else
            {
                scores.push_back(std::to_string(score));
            }
        }

        std::ostringstream oss;
        for(size_t i = 0; i < scores.size(); ++i)
        {
            if(i > 0)
                oss << ", ";
            oss << scores[i];
        }

        return oss.str();
    }

} // namespace btk::ballistics
