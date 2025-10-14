#pragma once

#include "target.h"
#include <string>
#include <vector>


namespace btk::ballistics
{

    /**
     * @brief Hit coordinates
     */
    class Hit
    {
        public:
        Hit() : x_(Distance::zero()), y_(Distance::zero()), score_(0) {}
        Hit(const Distance& x_position, const Distance& y_position, int hit_score, bool is_x)
            : x_(x_position), y_(y_position), score_(is_x ? 11 : hit_score) {}

        Distance getX() const { return x_; }
        Distance getY() const { return y_; }
        int getScore() const { return score_ > 10 ? 10 : score_; }
        bool isX() const { return score_ == 11; }

        private:
        Distance x_; // X coordinate (positive = right)
        Distance y_; // Y coordinate (positive = up)
        int score_;   // Score for this hit (11 = X)
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
        std::pair<int, bool> addHit(const Distance& x, const Distance& y, const Target& target, const Distance& bullet_diameter = Distance::zero());
        
        /**
         * @brief Get all hits
         */
        const std::vector<Hit>& getHits() const { return hits_; }
        
        /**
         * @brief Get number of hits
         */
        size_t size() const { return hits_.size(); }
        
        /**
         * @brief Clear all hits
         */
        void clear();
        
        /**
         * @brief Get group size (extreme spread)
         */
        Distance getGroupSize() const;
        
        /**
         * @brief Get center of group
         */
        std::pair<Distance, Distance> getCenter() const;
        
        /**
         * @brief Get mean radius
         */
        Distance getMeanRadius() const;
        
        /**
         * @brief Get radial standard deviation
         */
        Distance getRadialStandardDeviation() const;
        
        /**
         * @brief Get total score
         */
        int getTotalScore() const { return totalScore_; }
        
        /**
         * @brief Get X count
         */
        int getXCount() const { return xCount_; }
        
        /**
         * @brief Get hit count
         */
        int getHitCount() const;
        
        private:
        std::vector<Hit> hits_;
        
        // Accumulated metrics
        Distance sumX_ = Distance::zero();
        Distance sumY_ = Distance::zero();
        Distance sumX2_ = Distance::zero(); // sum of x^2 (stored as Distance per units API)
        Distance sumY2_ = Distance::zero(); // sum of y^2 (stored as Distance per units API)
        Distance minX_ = Distance::nan();
        Distance maxX_ = Distance::nan();
        Distance minY_ = Distance::nan();
        Distance maxY_ = Distance::nan();
        int totalScore_ = 0;
        int xCount_ = 0;
        
        void updateAccumulatedMetrics(const Hit& hit);
    };


} // namespace btk::ballistics
