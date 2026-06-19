#include "match/targets.h"
#include "math/conversions.h"
#include <stdexcept>

namespace btk::match
{

  std::map<std::string, btk::match::Target> Targets::targets_;

  btk::match::Target Targets::getTarget(const std::string& name)
  {
    if(targets_.empty())
    {
      initializeTargets();
    }

    auto it = targets_.find(name);
    if(it == targets_.end())
    {
      throw std::invalid_argument("Target '" + name + "' not found");
    }

    return it->second;
  }

  std::vector<std::string> Targets::listTargets()
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

  bool Targets::hasTarget(const std::string& name)
  {
    if(targets_.empty())
    {
      initializeTargets();
    }

    return targets_.find(name) != targets_.end();
  }

  void Targets::initializeTargets()
  {
    // Aiming black: outermost ring printed in the black per the NRA rulebooks
    // (varies by target; rings outside it are in white/buff). Face size is the
    // target paper edge length; mid/long-range frames are 72"x72".

    // Short Range (SR) Series - aiming black through the 9 ring (13" on SR)
    targets_.emplace("SR", btk::match::Target("SR", btk::math::Conversions::inchesToMeters(7.0f), btk::math::Conversions::inchesToMeters(13.0f), btk::math::Conversions::inchesToMeters(19.0f),
                                              btk::math::Conversions::inchesToMeters(25.0f), btk::math::Conversions::inchesToMeters(31.0f), btk::math::Conversions::inchesToMeters(37.0f),
                                              btk::math::Conversions::inchesToMeters(3.0f), "200 yd standing/rapid fire", 9));

    // SR-3 aiming black has one more ring than SR (19")
    targets_.emplace("SR-3", Target("SR-3", btk::math::Conversions::inchesToMeters(7.0f), btk::math::Conversions::inchesToMeters(13.0f), btk::math::Conversions::inchesToMeters(19.0f),
                                    btk::math::Conversions::inchesToMeters(25.0f), btk::math::Conversions::inchesToMeters(31.0f), btk::math::Conversions::inchesToMeters(37.0f),
                                    btk::math::Conversions::inchesToMeters(3.0f), "300 yd rapid fire", 8));

    targets_.emplace("SR-1", Target("SR-1", btk::math::Conversions::inchesToMeters(3.35f), btk::math::Conversions::inchesToMeters(6.35f), btk::math::Conversions::inchesToMeters(9.35f),
                                    btk::math::Conversions::inchesToMeters(12.35f), btk::math::Conversions::inchesToMeters(15.35f), btk::math::Conversions::inchesToMeters(18.35f),
                                    btk::math::Conversions::inchesToMeters(1.35f), "100 yd simulation of 200 yd", 9));

    targets_.emplace("SR-21", Target("SR-21", btk::math::Conversions::inchesToMeters(2.12f), btk::math::Conversions::inchesToMeters(4.12f), btk::math::Conversions::inchesToMeters(6.12f),
                                     btk::math::Conversions::inchesToMeters(8.12f), btk::math::Conversions::inchesToMeters(10.12f), btk::math::Conversions::inchesToMeters(12.12f),
                                     btk::math::Conversions::inchesToMeters(0.79f), "100 yd simulation of 300 yd rapid", 8));

    // Mid Range (MR) Series - aiming black through the 7 ring
    targets_.emplace("MR-63", Target("MR-63", btk::math::Conversions::inchesToMeters(5.85f), btk::math::Conversions::inchesToMeters(8.85f), btk::math::Conversions::inchesToMeters(11.85f),
                                     btk::math::Conversions::inchesToMeters(17.85f), btk::math::Conversions::inchesToMeters(23.85f), btk::math::Conversions::inchesToMeters(29.85f),
                                     btk::math::Conversions::inchesToMeters(2.85f), "300 yd slow fire (600 yd reduced)", 7, btk::math::Conversions::inchesToMeters(35.0f)));

    targets_.emplace("MR-65", Target("MR-65", btk::math::Conversions::inchesToMeters(10.0f), btk::math::Conversions::inchesToMeters(15.0f), btk::math::Conversions::inchesToMeters(20.0f),
                                     btk::math::Conversions::inchesToMeters(25.0f), btk::math::Conversions::inchesToMeters(30.0f), btk::math::Conversions::inchesToMeters(36.0f),
                                     btk::math::Conversions::inchesToMeters(5.0f), "500 yd slow fire", 7, btk::math::Conversions::inchesToMeters(37.0f)));

    targets_.emplace("MR-1", Target("MR-1", btk::math::Conversions::inchesToMeters(12.0f), btk::math::Conversions::inchesToMeters(18.0f), btk::math::Conversions::inchesToMeters(24.0f),
                                    btk::math::Conversions::inchesToMeters(36.0f), btk::math::Conversions::inchesToMeters(48.0f), btk::math::Conversions::inchesToMeters(60.0f),
                                    btk::math::Conversions::inchesToMeters(6.0f), "600 yd slow fire"));

    targets_.emplace("MR-31", Target("MR-31", btk::math::Conversions::inchesToMeters(1.75f), btk::math::Conversions::inchesToMeters(2.75f), btk::math::Conversions::inchesToMeters(3.75f),
                                     btk::math::Conversions::inchesToMeters(5.75f), btk::math::Conversions::inchesToMeters(7.75f), btk::math::Conversions::inchesToMeters(9.75f),
                                     btk::math::Conversions::inchesToMeters(0.75f), "100 yd simulation of 600 yd", 7, btk::math::Conversions::inchesToMeters(21.0f)));

    targets_.emplace("MR-52", Target("MR-52", btk::math::Conversions::inchesToMeters(3.79f), btk::math::Conversions::inchesToMeters(5.79f), btk::math::Conversions::inchesToMeters(7.79f),
                                     btk::math::Conversions::inchesToMeters(11.79f), btk::math::Conversions::inchesToMeters(15.79f), btk::math::Conversions::inchesToMeters(19.79f),
                                     btk::math::Conversions::inchesToMeters(1.79f), "200 yd simulation of 600 yd"));

    // Long Range (LR) Series
    targets_.emplace("LR", Target("LR", btk::math::Conversions::inchesToMeters(20.0f), btk::math::Conversions::inchesToMeters(30.0f), btk::math::Conversions::inchesToMeters(44.0f),
                                  btk::math::Conversions::inchesToMeters(60.0f), btk::math::Conversions::inchesToMeters(72.0f), btk::math::Conversions::inchesToMeters(72.0f),
                                  btk::math::Conversions::inchesToMeters(10.0f), "800/900/1000 yd slow fire"));

    // F-Class Target Centers (paste-over targets), 2024 NRA F-Class Rules 4.4-4.7.
    // Face size is the host target's paper, since the center is pasted over it.
    targets_.emplace("MR-63FCA", Target("MR-63FCA", btk::math::Conversions::inchesToMeters(2.85f), btk::math::Conversions::inchesToMeters(5.85f), btk::math::Conversions::inchesToMeters(8.85f),
                                        btk::math::Conversions::inchesToMeters(11.85f), btk::math::Conversions::inchesToMeters(17.85f), btk::math::Conversions::inchesToMeters(23.85f),
                                        btk::math::Conversions::inchesToMeters(1.42f), "300 yd F-Class repair center", 6, btk::math::Conversions::inchesToMeters(35.0f)));

    targets_.emplace("MR-65FCA", Target("MR-65FCA", btk::math::Conversions::inchesToMeters(5.00f), btk::math::Conversions::inchesToMeters(10.00f), btk::math::Conversions::inchesToMeters(15.00f),
                                        btk::math::Conversions::inchesToMeters(20.00f), btk::math::Conversions::inchesToMeters(25.00f), btk::math::Conversions::inchesToMeters(30.00f),
                                        btk::math::Conversions::inchesToMeters(2.50f), "500 yd F-Class repair center", 5, btk::math::Conversions::inchesToMeters(37.0f)));

    targets_.emplace("MR-1FCA", Target("MR-1FCA", btk::math::Conversions::inchesToMeters(6.00f), btk::math::Conversions::inchesToMeters(12.00f), btk::math::Conversions::inchesToMeters(18.00f),
                                       btk::math::Conversions::inchesToMeters(24.00f), btk::math::Conversions::inchesToMeters(36.00f), btk::math::Conversions::inchesToMeters(48.00f),
                                       btk::math::Conversions::inchesToMeters(3.00f), "600 yd F-Class repair center", 6));

    targets_.emplace("LR-FCA", Target("LR-FCA", btk::math::Conversions::inchesToMeters(10.00f), btk::math::Conversions::inchesToMeters(20.00f), btk::math::Conversions::inchesToMeters(30.00f),
                                      btk::math::Conversions::inchesToMeters(44.00f), btk::math::Conversions::inchesToMeters(60.00f), btk::math::Conversions::inchesToMeters(72.00f),
                                      btk::math::Conversions::inchesToMeters(5.00f), "800/900/1000 yd F-Class repair center", 7));

    // Fictional 1-mile (1760 yd) F-Class target. Not an NRA target: it is the LR-FCA
    // long-range F-Class face with every ring doubled, giving round inch sizes and a 20-inch
    // 10-ring (~1.08 MOA at a mile; X 10 inch ~0.54 MOA). Roughly the 1000 yd F-Class sight
    // picture, a mile out, with clean numbers.
    targets_.emplace("MILE-FCA", Target("MILE-FCA", btk::math::Conversions::inchesToMeters(20.00f), btk::math::Conversions::inchesToMeters(40.00f), btk::math::Conversions::inchesToMeters(60.00f),
                                        btk::math::Conversions::inchesToMeters(88.00f), btk::math::Conversions::inchesToMeters(120.00f), btk::math::Conversions::inchesToMeters(144.00f),
                                        btk::math::Conversions::inchesToMeters(10.00f), "1760 yd (1 mile) F-Class (fictional, LR-FCA doubled)", 7, btk::math::Conversions::inchesToMeters(144.00f)));

    // IBS Benchrest Hunter Rifle / Varmint For Score targets (no aiming black)
    targets_.emplace("IBS-100", Target("IBS-100", btk::math::Conversions::inchesToMeters(0.50f), btk::math::Conversions::inchesToMeters(1.00f), btk::math::Conversions::inchesToMeters(1.50f),
                                       btk::math::Conversions::inchesToMeters(2.00f), btk::math::Conversions::inchesToMeters(2.50f), btk::math::Conversions::inchesToMeters(3.00f),
                                       btk::math::Conversions::inchesToMeters(0.0625f), "100 yd benchrest score (IBS Hunter #1)", 0));

    targets_.emplace("IBS-200", Target("IBS-200", btk::math::Conversions::inchesToMeters(1.00f), btk::math::Conversions::inchesToMeters(2.00f), btk::math::Conversions::inchesToMeters(3.00f),
                                       btk::math::Conversions::inchesToMeters(4.00f), btk::math::Conversions::inchesToMeters(5.00f), btk::math::Conversions::inchesToMeters(6.00f),
                                       btk::math::Conversions::inchesToMeters(0.125f), "200 yd benchrest score (IBS Hunter #2)", 0));

    targets_.emplace("IBS-300", Target("IBS-300", btk::math::Conversions::inchesToMeters(1.50f), btk::math::Conversions::inchesToMeters(3.00f), btk::math::Conversions::inchesToMeters(4.50f),
                                       btk::math::Conversions::inchesToMeters(6.00f), btk::math::Conversions::inchesToMeters(7.50f), btk::math::Conversions::inchesToMeters(9.00f),
                                       btk::math::Conversions::inchesToMeters(0.25f), "300 yd benchrest score (IBS Hunter #3)", 0));
  }

} // namespace btk::match
