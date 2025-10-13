#include "target.h"
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace btk::ballistics
{

    Target::Target(const std::string& name, const Distance& ring_10, const Distance& ring_9, const Distance& ring_8,
                   const Distance& ring_7, const Distance& ring_6, const Distance& ring_5, const Distance& x_ring,
                   const std::string& description)
        : name_(name), x_ring_diameter_(x_ring.inches() > 0 ? x_ring : ring_10), description_(description)
    {
        // Store rings in normal order
        rings_.emplace(10, ring_10);
        rings_.emplace(9, ring_9);
        rings_.emplace(8, ring_8);
        rings_.emplace(7, ring_7);
        rings_.emplace(6, ring_6);
        rings_.emplace(5, ring_5);

        // Validate all ring diameters are positive
        std::vector<Distance> ring_values = {ring_10, ring_9, ring_8, ring_7, ring_6, ring_5};
        for(const Distance& diameter : ring_values)
        {
            if(diameter.inches() <= 0)
            {
                throw std::invalid_argument("All ring diameters must be positive for " + name);
            }
        }
    }

    Distance Target::ringDiameter(int ring) const
    {
        auto it = rings_.find(ring);
        return (it != rings_.end()) ? it->second : Distance::zero();
    }

    int Target::scoreHit(const Distance& x_position, const Distance& y_position, const Distance& bullet_diameter) const
    {
        // Calculate distance from center
        Distance distance = Distance::inches(
            std::sqrt(x_position.inches() * x_position.inches() + y_position.inches() * y_position.inches()));
        Distance bullet_radius = bullet_diameter / 2.0;

        // Check X ring first (if it exists and is different from 10 ring)
        if(x_ring_diameter_.inches() > 0)
        {
            Distance x_ring_radius = x_ring_diameter_ / 2.0;
            if(distance <= x_ring_radius + bullet_radius)
            {
                return 10; // X ring is worth 10 points
            }
        }

        // Check scoring rings in descending order (10, 9, 8, 7, 6, 5)
        // to find the highest score
        for(int ring : {10, 9, 8, 7, 6, 5})
        {
            auto it = rings_.find(ring);
            if(it != rings_.end())
            {
                Distance diameter = it->second;
                Distance ring_radius = diameter / 2.0;
                if(distance <= ring_radius + bullet_radius)
                {
                    return ring;
                }
            }
        }

        return 0; // Miss
    }

    bool Target::isXRing(const Distance& x_position, const Distance& y_position, const Distance& bullet_diameter) const
    {
        Distance distance = Distance::inches(
            std::sqrt(x_position.inches() * x_position.inches() + y_position.inches() * y_position.inches()));
        Distance bullet_radius = bullet_diameter / 2.0;
        Distance x_ring_radius = x_ring_diameter_ / 2.0;
        return distance <= x_ring_radius + bullet_radius;
    }

    std::pair<Distance, Distance> Target::getRingInfo(int ring) const
    {
        Distance diameter = ringDiameter(ring);
        return {diameter, diameter / 2.0};
    }

    std::string Target::toString() const
    {
        std::ostringstream oss;
        oss << name_ << ": ";

        bool first = true;
        for(const auto& [ring, diameter] : rings_)
        {
            if(!first)
                oss << ", ";
            oss << ring << ": " << std::fixed << std::setprecision(2) << diameter.inches() << "\"";
            first = false;
        }

        return oss.str();
    }

} // namespace btk::ballistics
