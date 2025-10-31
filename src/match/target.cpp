#include "match/target.h"
#include "math/conversions.h"
#include <iomanip>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace btk::match
{

  Target::Target(const std::string& name, float ring_10, float ring_9, float ring_8, float ring_7, float ring_6, float ring_5, float x_ring, const std::string& description)
    : name_(name), description_(description), ring_diameters_{ring_5, ring_6, ring_7, ring_8, ring_9, ring_10, x_ring}
  {
  }

  float Target::ringDiameter(int ring) const
  {
    if(ring >= 5 && ring <= 11)
      return ring_diameters_[ring - 5];

    return std::numeric_limits<float>::quiet_NaN();
  }

  int Target::scoreHit(float x_position, float y_position, float bullet_diameter) const
  {
    // Calculate distance from center
    float distance = std::sqrt(x_position * x_position + y_position * y_position);
    float bullet_radius = bullet_diameter / 2.0f;

    // Check scoring rings in descending order (10, 9, 8, 7, 6, 5)
    // to find the highest score
    for(int ring : {10, 9, 8, 7, 6, 5})
    {
      float diameter = ring_diameters_[ring - 5];
      float ring_radius = diameter / 2.0f;
      if(distance <= ring_radius + bullet_radius)
        return ring;
    }

    return 0; // Miss
  }

  bool Target::isXRing(float x_position, float y_position, float bullet_diameter) const
  {
    float distance = std::sqrt(x_position * x_position + y_position * y_position);
    float bullet_radius = bullet_diameter / 2.0f;
    float x_ring_radius = ring_diameters_[6] / 2.0f;
    return distance <= x_ring_radius + bullet_radius;
  }

  float Target::getRingInnerDiameter(int ring) const { return ringDiameter(ring); }

  float Target::getRingOuterDiameter(int ring) const { return ringDiameter(ring); }

} // namespace btk::match
