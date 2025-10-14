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
    : name_(name), description_(description), ring_diameters_{ring_5, ring_6, ring_7, ring_8, ring_9, ring_10, x_ring}
  {
  }

  Distance Target::ringDiameter(int ring) const
  {
    if(ring >= 5 && ring <= 11)
      return ring_diameters_[ring - 5];

    return Distance::nan();
  }

  int Target::scoreHit(const Distance& x_position, const Distance& y_position, const Distance& bullet_diameter) const
  {
    // Calculate distance from center
    Distance distance = Distance::fromBaseValue(
      std::sqrt(x_position.baseValue() * x_position.baseValue() + y_position.baseValue() * y_position.baseValue()));
    Distance bullet_radius = bullet_diameter / 2.0;

    // Check scoring rings in descending order (10, 9, 8, 7, 6, 5)
    // to find the highest score
    for(int ring : {10, 9, 8, 7, 6, 5})
    {
      Distance diameter = ring_diameters_[ring - 5];
      Distance ring_radius = diameter / 2.0;
      if(distance <= ring_radius + bullet_radius)
        return ring;
    }

    return 0; // Miss
  }

  bool Target::isXRing(const Distance& x_position, const Distance& y_position, const Distance& bullet_diameter) const
  {
    Distance distance = Distance::fromBaseValue(
      std::sqrt(x_position.baseValue() * x_position.baseValue() + y_position.baseValue() * y_position.baseValue()));
    Distance bullet_radius = bullet_diameter / 2.0;
    Distance x_ring_radius = ring_diameters_[6] / 2.0;
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

    // Display rings in order: 5, 6, 7, 8, 9, 10, X
    const char* ring_names[] = {"5", "6", "7", "8", "9", "10", "X"};

    bool first = true;
    for(int i = 0; i < 7; ++i)
    {
      if(!first)
        oss << ", ";
      oss << ring_names[i] << ": " << std::fixed << std::setprecision(2) << ring_diameters_[i].baseValue() << "\"";
      first = false;
    }

    return oss.str();
  }

} // namespace btk::ballistics
