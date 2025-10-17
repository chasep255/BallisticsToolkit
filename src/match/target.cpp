#include "match/target.h"
#include "physics/conversions.h"
#include <iomanip>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace btk::match
{

  Target::Target(const std::string& name, double ring_10, double ring_9, double ring_8, double ring_7, double ring_6, double ring_5, double x_ring, const std::string& description)
    : name_(name), description_(description), ring_diameters_{ring_5, ring_6, ring_7, ring_8, ring_9, ring_10, x_ring}
  {
  }

  double Target::ringDiameter(int ring) const
  {
    if(ring >= 5 && ring <= 11)
      return ring_diameters_[ring - 5];

    return std::numeric_limits<double>::quiet_NaN();
  }

  int Target::scoreHit(double x_position, double y_position, double bullet_diameter) const
  {
    // Calculate distance from center
    double distance = std::sqrt(x_position * x_position + y_position * y_position);
    double bullet_radius = bullet_diameter / 2.0;

    // Check scoring rings in descending order (10, 9, 8, 7, 6, 5)
    // to find the highest score
    for(int ring : {10, 9, 8, 7, 6, 5})
    {
      double diameter = ring_diameters_[ring - 5];
      double ring_radius = diameter / 2.0;
      if(distance <= ring_radius + bullet_radius)
        return ring;
    }

    return 0; // Miss
  }

  bool Target::isXRing(double x_position, double y_position, double bullet_diameter) const
  {
    double distance = std::sqrt(x_position * x_position + y_position * y_position);
    double bullet_radius = bullet_diameter / 2.0;
    double x_ring_radius = ring_diameters_[6] / 2.0;
    return distance <= x_ring_radius + bullet_radius;
  }

  double Target::getRingInnerDiameter(int ring) const { return ringDiameter(ring); }

  double Target::getRingOuterDiameter(int ring) const { return ringDiameter(ring); }

} // namespace btk::match
