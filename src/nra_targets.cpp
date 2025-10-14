#include "nra_targets.h"
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
    targets_.emplace("SR", Target("SR", Distance::inches(7.0), Distance::inches(13.0), Distance::inches(19.0),
                                  Distance::inches(25.0), Distance::inches(31.0), Distance::inches(37.0),
                                  Distance::inches(3.0), "200 yd standing/rapid fire"));

    targets_.emplace("SR-3", Target("SR-3", Distance::inches(7.0), Distance::inches(13.0), Distance::inches(19.0),
                                    Distance::inches(25.0), Distance::inches(31.0), Distance::inches(37.0),
                                    Distance::inches(3.0), "300 yd rapid fire"));

    targets_.emplace("SR-1", Target("SR-1", Distance::inches(3.35), Distance::inches(6.35), Distance::inches(9.35),
                                    Distance::inches(12.35), Distance::inches(15.35), Distance::inches(18.35),
                                    Distance::inches(1.35), "100 yd simulation of 200 yd"));

    targets_.emplace("SR-21", Target("SR-21", Distance::inches(2.12), Distance::inches(4.12), Distance::inches(6.12),
                                     Distance::inches(8.12), Distance::inches(10.12), Distance::inches(12.12),
                                     Distance::inches(0.79), "100 yd simulation of 300 yd rapid"));

    // Mid Range (MR) Series
    targets_.emplace("MR-63", Target("MR-63", Distance::inches(5.85), Distance::inches(8.85), Distance::inches(11.85),
                                     Distance::inches(17.85), Distance::inches(23.85), Distance::inches(29.85),
                                     Distance::inches(2.85), "300 yd slow fire (600 yd reduced)"));

    targets_.emplace("MR-65", Target("MR-65", Distance::inches(10.0), Distance::inches(15.0), Distance::inches(20.0),
                                     Distance::inches(25.0), Distance::inches(30.0), Distance::inches(36.0),
                                     Distance::inches(5.0), "500 yd slow fire"));

    targets_.emplace("MR-1", Target("MR-1", Distance::inches(12.0), Distance::inches(18.0), Distance::inches(24.0),
                                    Distance::inches(36.0), Distance::inches(48.0), Distance::inches(60.0),
                                    Distance::inches(6.0), "600 yd slow fire"));

    targets_.emplace("MR-31", Target("MR-31", Distance::inches(1.75), Distance::inches(2.75), Distance::inches(3.75),
                                     Distance::inches(5.75), Distance::inches(7.75), Distance::inches(9.75),
                                     Distance::inches(0.75), "100 yd simulation of 600 yd"));

    targets_.emplace("MR-52", Target("MR-52", Distance::inches(3.79), Distance::inches(5.79), Distance::inches(7.79),
                                     Distance::inches(11.79), Distance::inches(15.79), Distance::inches(19.79),
                                     Distance::inches(1.79), "200 yd simulation of 600 yd"));

    // Long Range (LR) Series
    targets_.emplace("LR", Target("LR", Distance::inches(20.0), Distance::inches(30.0), Distance::inches(44.0),
                                  Distance::inches(60.0), Distance::inches(72.0), Distance::inches(72.0),
                                  Distance::inches(10.0), "800/900/1000 yd slow fire"));

    // F-Class Target Centers (paste-over targets)
    targets_.emplace("MR-63FCA",
                     Target("MR-63FCA", Distance::inches(2.85), Distance::inches(5.85), Distance::inches(8.85),
                            Distance::inches(11.85), Distance::inches(17.85), Distance::inches(23.85),
                            Distance::inches(1.42), "300 yd F-Class repair center"));

    targets_.emplace("MR-65FCA",
                     Target("MR-65FCA", Distance::inches(5.00), Distance::inches(10.00), Distance::inches(15.00),
                            Distance::inches(20.00), Distance::inches(25.00), Distance::inches(30.00),
                            Distance::inches(2.50), "500 yd F-Class repair center"));

    targets_.emplace("MR-1FCA",
                     Target("MR-1FCA", Distance::inches(6.00), Distance::inches(12.00), Distance::inches(18.00),
                            Distance::inches(24.00), Distance::inches(30.00), Distance::inches(36.00),
                            Distance::inches(3.00), "600 yd F-Class repair center"));

    targets_.emplace("LR-FCA",
                     Target("LR-FCA", Distance::inches(10.00), Distance::inches(20.00), Distance::inches(30.00),
                            Distance::inches(44.00), Distance::inches(60.00), Distance::inches(72.00),
                            Distance::inches(5.00), "800/900/1000 yd F-Class repair center"));
  }

} // namespace btk::ballistics
