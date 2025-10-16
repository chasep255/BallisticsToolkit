#include <emscripten/bind.h>
#include <emscripten/val.h>

// Include all our C++ headers
#include "atmosphere.h"
#include "bullet.h"
#include "conversions.h"
#include "match.h"
#include "match_simulator.h"
#include "nra_targets.h"
#include "simulator.h"
#include "target.h"
#include "trajectory.h"
#include "vector.h"
#include "wind_generator.h"

using namespace emscripten;
using namespace btk::ballistics;

// No wrapper needed - direct methods are JavaScript-friendly

EMSCRIPTEN_BINDINGS(ballistics_toolkit)
{
  // Conversions class - provides all unit conversion functions
  class_<Conversions>("Conversions")
    // Distance conversions
    .class_function("feetToMeters", &Conversions::feetToMeters)
    .class_function("metersToFeet", &Conversions::metersToFeet)
    .class_function("inchesToMeters", &Conversions::inchesToMeters)
    .class_function("metersToInches", &Conversions::metersToInches)
    .class_function("yardsToMeters", &Conversions::yardsToMeters)
    .class_function("metersToYards", &Conversions::metersToYards)
    // Weight conversions
    .class_function("grainsToKg", &Conversions::grainsToKg)
    .class_function("kgToGrains", &Conversions::kgToGrains)
    .class_function("poundsToKg", &Conversions::poundsToKg)
    .class_function("kgToPounds", &Conversions::kgToPounds)
    // Velocity conversions
    .class_function("fpsToMps", &Conversions::fpsToMps)
    .class_function("mpsToFps", &Conversions::mpsToFps)
    .class_function("mphToMps", &Conversions::mphToMps)
    .class_function("mpsToMph", &Conversions::mpsToMph)
    // Temperature conversions
    .class_function("fahrenheitToKelvin", &Conversions::fahrenheitToKelvin)
    .class_function("kelvinToFahrenheit", &Conversions::kelvinToFahrenheit)
    .class_function("celsiusToKelvin", &Conversions::celsiusToKelvin)
    .class_function("kelvinToCelsius", &Conversions::kelvinToCelsius)
    // Angle conversions
    .class_function("degreesToRadians", &Conversions::degreesToRadians)
    .class_function("radiansToDegrees", &Conversions::radiansToDegrees)
    .class_function("moaToRadians", &Conversions::moaToRadians)
    .class_function("radiansToMoa", &Conversions::radiansToMoa)
    .class_function("mradToRadians", &Conversions::mradToRadians)
    .class_function("radiansToMrad", &Conversions::radiansToMrad)
    .class_function("oclockToRadians", &Conversions::oclockToRadians)
    .class_function("radiansToOclock", &Conversions::radiansToOclock)
    // Pressure conversions
    .class_function("psiToPascals", &Conversions::psiToPascals)
    .class_function("pascalsToPsi", &Conversions::pascalsToPsi)
    .class_function("inHgToPascals", &Conversions::inHgToPascals)
    .class_function("pascalsToInHg", &Conversions::pascalsToInHg)
    // Energy conversions
    .class_function("footPoundsToJoules", &Conversions::footPoundsToJoules)
    .class_function("joulesToFootPounds", &Conversions::joulesToFootPounds)
    .class_function("kilowattHoursToJoules", &Conversions::kilowattHoursToJoules)
    .class_function("joulesToKilowattHours", &Conversions::joulesToKilowattHours)
    .class_function("caloriesToJoules", &Conversions::caloriesToJoules)
    .class_function("joulesToCalories", &Conversions::joulesToCalories)
    .class_function("kilocaloriesToJoules", &Conversions::kilocaloriesToJoules)
    .class_function("joulesToKilocalories", &Conversions::joulesToKilocalories)
    .class_function("btuToJoules", &Conversions::btuToJoules)
    .class_function("joulesToBtu", &Conversions::joulesToBtu);

  // 3D Vector types
  class_<Vector3D>("Vector3D")
    .constructor<double, double, double>()
    .property("x", &Vector3D::x)
    .property("y", &Vector3D::y)
    .property("z", &Vector3D::z)
    .function("magnitude", &Vector3D::magnitude)
    .function("normalized", &Vector3D::normalized)
    .function("dot", &Vector3D::dot)
    .function("cross", &Vector3D::cross)
    .function("lerp", &Vector3D::lerp);

  class_<Vector2D>("Vector2D")
    .constructor<double, double>()
    .property("x", &Vector2D::x)
    .property("y", &Vector2D::y)
    .function("magnitude", &Vector2D::magnitude)
    .function("normalized", &Vector2D::normalized)
    .function("dot", &Vector2D::dot)
    .function("lerp", &Vector2D::lerp);

  // Bullet class
  enum_<DragFunction>("DragFunction").value("G1", DragFunction::G1).value("G7", DragFunction::G7);

  class_<Bullet>("Bullet")
    .constructor<double, double, double, double, DragFunction>()
    .constructor<const Bullet&, const Vector3D&, const Vector3D&, double>()
    .function("getWeight", &Bullet::getWeight)
    .function("getDiameter", &Bullet::getDiameter)
    .function("getLength", &Bullet::getLength)
    .function("getBallisticCoefficient", &Bullet::getBc)
    .function("getDragFunction", &Bullet::getDragFunction)
    .function("getSectionalDensity", &Bullet::getSectionalDensity)
    .function("hasFlightState", &Bullet::hasFlightState)
    .function("getPosition", &Bullet::getPosition)
    .function("getVelocity", &Bullet::getVelocity)
    .function("getSpinRate", &Bullet::getSpinRate)
    .function("getTotalVelocity", &Bullet::getTotalVelocity)
    .function("getElevationAngle", &Bullet::getElevationAngle)
    .function("getAzimuthAngle", &Bullet::getAzimuthAngle)
    .class_function("computeSpinRateFromTwist", &Bullet::computeSpinRateFromTwist);

  // Atmosphere class
  class_<Atmosphere>("Atmosphere")
    .constructor<>()
    .constructor<double, double, double, double>()
    .function("getTemperature", &Atmosphere::getTemperature)
    .function("getAltitude", &Atmosphere::getAltitude)
    .function("getHumidity", &Atmosphere::getHumidity)
    .function("getPressure", &Atmosphere::getPressure)
    .function("getAirDensity", &Atmosphere::getAirDensity)
    .function("getSpeedOfSound", &Atmosphere::getSpeedOfSound)
    .class_function("standard", &Atmosphere::standard)
    .class_function("atAltitude", &Atmosphere::atAltitude);

  // TrajectoryPoint class
  class_<TrajectoryPoint>("TrajectoryPoint")
    .constructor<double, Bullet>()
    .function("getTime", &TrajectoryPoint::getTime)
    .function("getState", &TrajectoryPoint::getState)
    .function("getDistance", &TrajectoryPoint::getDistance)
    .function("getVelocity", &TrajectoryPoint::getVelocity)
    .function("getKineticEnergy", &TrajectoryPoint::getKineticEnergy);

  // Trajectory class
  class_<Trajectory>("Trajectory")
    .constructor<>()
    .function("addPoint", &Trajectory::addPoint)
    .function("getPoint", &Trajectory::getPoint)
    .function("getPointCount", &Trajectory::getPointCount)
    .function("atDistance", &Trajectory::atDistance)
    .function("atTime", &Trajectory::atTime)
    .function("getTotalDistance", &Trajectory::getTotalDistance)
    .function("getTotalTime", &Trajectory::getTotalTime)
    .function("getMaximumHeight", &Trajectory::getMaximumHeight)
    .function("getImpactVelocity", &Trajectory::getImpactVelocity)
    .function("getImpactAngle", &Trajectory::getImpactAngle)
    .function("clear", &Trajectory::clear);

  // Simulator class
  class_<Simulator>("Simulator")
    .constructor<>()
    .function("setInitialBullet", &Simulator::setInitialBullet)
    .function("setAtmosphere", &Simulator::setAtmosphere)
    .function("setWind", &Simulator::setWind)
    .function("getInitialBullet", &Simulator::getInitialBullet)
    .function("getCurrentBullet", &Simulator::getCurrentBullet)
    .function("getAtmosphere", &Simulator::getAtmosphere)
    .function("getWind", &Simulator::getWind)
    .function("resetToInitial", &Simulator::resetToInitial)
    .function("computeZero", &Simulator::computeZero)
    .function("simulate", &Simulator::simulate)
    .function("timeStep", &Simulator::timeStep);

  // Target class
  class_<Target>("Target")
    .constructor<const std::string&, double, double, double, double, double, double, double, const std::string&>()
    .function("getName", &Target::getName)
    .function("getDescription", &Target::getDescription)
    .function("getXRingDiameter", &Target::getXRingDiameter)
    .function("ringDiameter", &Target::ringDiameter)
    .function("scoreHit", &Target::scoreHit)
    .function("isXRing", &Target::isXRing)
    .function("getRingInnerDiameter", &Target::getRingInnerDiameter)
    .function("getRingOuterDiameter", &Target::getRingOuterDiameter);

  // Removed legacy Hit value_object and AccuracyMetrics/legacy scoring bindings

  // NRA Targets
  class_<NRATargets>("NRATargets").class_function("getTarget", &NRATargets::getTarget).class_function("listTargets", &NRATargets::listTargets).class_function("hasTarget", &NRATargets::hasTarget);

  // SimulatedShot struct
  value_object<SimulatedShot>("SimulatedShot")
    .field("impactX", &SimulatedShot::impact_x)
    .field("impactY", &SimulatedShot::impact_y)
    .field("score", &SimulatedShot::score)
    .field("isX", &SimulatedShot::is_x)
    .field("actualMv", &SimulatedShot::actual_mv)
    .field("actualBc", &SimulatedShot::actual_bc)
    .field("windDownrange", &SimulatedShot::wind_downrange)
    .field("windCrossrange", &SimulatedShot::wind_crossrange)
    .field("windVertical", &SimulatedShot::wind_vertical)
    .field("releaseAngleH", &SimulatedShot::release_angle_h)
    .field("releaseAngleV", &SimulatedShot::release_angle_v)
    .field("impactVelocity", &SimulatedShot::impact_velocity);

  // Hit class
  class_<Hit>("Hit").constructor<>().constructor<double, double, int, bool>().function("getX", &Hit::getX).function("getY", &Hit::getY).function("getScore", &Hit::getScore).function("isX", &Hit::isX);

  // Match class
  class_<Match>("Match")
    .constructor<>()
    .function("addHit", &Match::addHit)
    .function("getHits", &Match::getHits)
    .function("size", &Match::size)
    .function("clear", &Match::clear)
    .function("getGroupSize", &Match::getGroupSize)
    .function("getCenter", &Match::getCenter)
    .function("getMeanRadius", &Match::getMeanRadius)
    .function("getRadialStandardDeviation", &Match::getRadialStandardDeviation)
    .function("getTotalScore", &Match::getTotalScore)
    .function("getXCount", &Match::getXCount)
    .function("getHitCount", &Match::getHitCount);

  // MatchSimulator class
  class_<MatchSimulator>("MatchSimulator")
    .constructor<const Bullet&, double, const Target&, double, const Atmosphere&, double, double, double, double, double, double>()
    .function("fireShot", &MatchSimulator::fireShot)
    .function("getMatch", &MatchSimulator::getMatch)
    .function("clearShots", &MatchSimulator::clearShots)
    .function("getShotCount", &MatchSimulator::getShotCount)
    .function("getTarget", &MatchSimulator::getTarget)
    .function("getBullet", &MatchSimulator::getBullet)
    .function("getBulletDiameter", &MatchSimulator::getBulletDiameter)
    .function("getShots", &MatchSimulator::getShots)
    .function("getShot", &MatchSimulator::getShot);

  // Register value arrays for easier JavaScript usage
  register_vector<TrajectoryPoint>("TrajectoryPointVector");
  register_vector<Hit>("HitVector");
  register_vector<SimulatedShot>("SimulatedShotVector");
  register_vector<std::string>("StringVector");

  // No RingInfo struct needed - direct methods are cleaner

  // Wind generator class
  class_<WindGenerator>("WindGenerator")
    .constructor<uint32_t>()
    .function("sample", select_overload<Vector3D(double, double) const>(&WindGenerator::operator()))
    .function("addWindComponent", &WindGenerator::addWindComponent)
    .function("setSeed", &WindGenerator::setSeed);

  // Wind presets factory
  class_<WindPresets>("WindPresets")
    .class_function("getPreset", &WindPresets::getPreset)
    .class_function("listPresets", &WindPresets::listPresets)
    .class_function("hasPreset", &WindPresets::hasPreset);
}