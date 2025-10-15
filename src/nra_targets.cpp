#include "nra_targets.h"
#include "conversions.h"
#include <stdexcept>

namespace btk::ballistics
{

  std::map<std::string, Target> NRATargets::targets_;

  Target NRATargets::getTarget(const std::string& name)
  {
    if(targets_.empty())
    {
      initializeTargets();
    }

    auto it = targets_.find(name);
    if(it == targets_.end())
    {
      throw std::invalid_argument("NRA target '" + name + "' not found");
    }

    return it->second;
  }

  std::vector<std::string> NRATargets::listTargets()
  {
    if(targets_.empty())
    {
      initializeTargets();
    }

    std::vector<std::string> names;
    for(const auto& [name, target] : targets_)
    {
      names.push_back(name);
    }
    return names;
  }

  bool NRATargets::hasTarget(const std::string& name)
  {
    if(targets_.empty())
    {
      initializeTargets();
    }

    return targets_.find(name) != targets_.end();
  }

  void NRATargets::initializeTargets()
  {
    // Short Range (SR) Series
    targets_.emplace("SR", Target("SR", Conversions::inchesToMeters(7.0), Conversions::inchesToMeters(13.0), Conversions::inchesToMeters(19.0),
                                  Conversions::inchesToMeters(25.0), Conversions::inchesToMeters(31.0), Conversions::inchesToMeters(37.0),
                                  Conversions::inchesToMeters(3.0), "200 yd standing/rapid fire"));

    targets_.emplace("SR-3", Target("SR-3", Conversions::inchesToMeters(7.0), Conversions::inchesToMeters(13.0), Conversions::inchesToMeters(19.0),
                                    Conversions::inchesToMeters(25.0), Conversions::inchesToMeters(31.0), Conversions::inchesToMeters(37.0),
                                    Conversions::inchesToMeters(3.0), "300 yd rapid fire"));

    targets_.emplace("SR-1", Target("SR-1", Conversions::inchesToMeters(3.35), Conversions::inchesToMeters(6.35), Conversions::inchesToMeters(9.35),
                                    Conversions::inchesToMeters(12.35), Conversions::inchesToMeters(15.35), Conversions::inchesToMeters(18.35),
                                    Conversions::inchesToMeters(1.35), "100 yd simulation of 200 yd"));

    targets_.emplace("SR-21", Target("SR-21", Conversions::inchesToMeters(2.12), Conversions::inchesToMeters(4.12), Conversions::inchesToMeters(6.12),
                                     Conversions::inchesToMeters(8.12), Conversions::inchesToMeters(10.12), Conversions::inchesToMeters(12.12),
                                     Conversions::inchesToMeters(0.79), "100 yd simulation of 300 yd rapid"));

    // Mid Range (MR) Series
    targets_.emplace("MR-63", Target("MR-63", Conversions::inchesToMeters(5.85), Conversions::inchesToMeters(8.85), Conversions::inchesToMeters(11.85),
                                     Conversions::inchesToMeters(17.85), Conversions::inchesToMeters(23.85), Conversions::inchesToMeters(29.85),
                                     Conversions::inchesToMeters(2.85), "300 yd slow fire (600 yd reduced)"));

    targets_.emplace("MR-65", Target("MR-65", Conversions::inchesToMeters(10.0), Conversions::inchesToMeters(15.0), Conversions::inchesToMeters(20.0),
                                     Conversions::inchesToMeters(25.0), Conversions::inchesToMeters(30.0), Conversions::inchesToMeters(36.0),
                                     Conversions::inchesToMeters(5.0), "500 yd slow fire"));

    targets_.emplace("MR-1", Target("MR-1", Conversions::inchesToMeters(12.0), Conversions::inchesToMeters(18.0), Conversions::inchesToMeters(24.0),
                                    Conversions::inchesToMeters(36.0), Conversions::inchesToMeters(48.0), Conversions::inchesToMeters(60.0),
                                    Conversions::inchesToMeters(6.0), "600 yd slow fire"));

    targets_.emplace("MR-31", Target("MR-31", Conversions::inchesToMeters(1.75), Conversions::inchesToMeters(2.75), Conversions::inchesToMeters(3.75),
                                     Conversions::inchesToMeters(5.75), Conversions::inchesToMeters(7.75), Conversions::inchesToMeters(9.75),
                                     Conversions::inchesToMeters(0.75), "100 yd simulation of 600 yd"));

    targets_.emplace("MR-52", Target("MR-52", Conversions::inchesToMeters(3.79), Conversions::inchesToMeters(5.79), Conversions::inchesToMeters(7.79),
                                     Conversions::inchesToMeters(11.79), Conversions::inchesToMeters(15.79), Conversions::inchesToMeters(19.79),
                                     Conversions::inchesToMeters(1.79), "200 yd simulation of 600 yd"));

    // Long Range (LR) Series
    targets_.emplace("LR", Target("LR", Conversions::inchesToMeters(20.0), Conversions::inchesToMeters(30.0), Conversions::inchesToMeters(44.0),
                                  Conversions::inchesToMeters(60.0), Conversions::inchesToMeters(72.0), Conversions::inchesToMeters(72.0),
                                  Conversions::inchesToMeters(10.0), "800/900/1000 yd slow fire"));

    // F-Class Target Centers (paste-over targets)
    targets_.emplace("MR-63FCA",
                     Target("MR-63FCA", Conversions::inchesToMeters(2.85), Conversions::inchesToMeters(5.85), Conversions::inchesToMeters(8.85),
                            Conversions::inchesToMeters(11.85), Conversions::inchesToMeters(17.85), Conversions::inchesToMeters(23.85),
                            Conversions::inchesToMeters(1.42), "300 yd F-Class repair center"));

    targets_.emplace("MR-65FCA",
                     Target("MR-65FCA", Conversions::inchesToMeters(5.00), Conversions::inchesToMeters(10.00), Conversions::inchesToMeters(15.00),
                            Conversions::inchesToMeters(20.00), Conversions::inchesToMeters(25.00), Conversions::inchesToMeters(30.00),
                            Conversions::inchesToMeters(2.50), "500 yd F-Class repair center"));

    targets_.emplace("MR-1FCA",
                     Target("MR-1FCA", Conversions::inchesToMeters(6.00), Conversions::inchesToMeters(12.00), Conversions::inchesToMeters(18.00),
                            Conversions::inchesToMeters(24.00), Conversions::inchesToMeters(30.00), Conversions::inchesToMeters(36.00),
                            Conversions::inchesToMeters(3.00), "600 yd F-Class repair center"));

    targets_.emplace("LR-FCA",
                     Target("LR-FCA", Conversions::inchesToMeters(10.00), Conversions::inchesToMeters(20.00), Conversions::inchesToMeters(30.00),
                            Conversions::inchesToMeters(44.00), Conversions::inchesToMeters(60.00), Conversions::inchesToMeters(72.00),
                            Conversions::inchesToMeters(5.00), "800/900/1000 yd F-Class repair center"));
  }

} // namespace btk::ballistics
