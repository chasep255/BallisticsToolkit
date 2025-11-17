#include <emscripten/bind.h>
#include <emscripten/val.h>

// Include all our C++ headers
#include "ballistics/bullet.h"
#include "ballistics/simulator.h"
#include "ballistics/trajectory.h"
#include "match/match.h"
#include "match/steel_target.h"
#include "match/targets.h"
#include "match/simulator.h"
#include "match/target.h"
#include "math/conversions.h"
#include "math/quaternion.h"
#include "math/vector.h"
#include "physics/atmosphere.h"
#include "physics/wind_generator.h"

using namespace emscripten;
using namespace btk::ballistics;
using namespace btk::match;
using namespace btk::math;
using namespace btk::physics;

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
    .class_function("inchesToYards", &Conversions::inchesToYards)
    .class_function("yardsToInches", &Conversions::yardsToInches)
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
    .class_function("mradToMoa", &Conversions::mradToMoa)
    .class_function("moaToMrad", &Conversions::moaToMrad)
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
  class_<btk::math::Vector3D>("Vector3D")
    .constructor<float, float, float>()
    .property("x", &Vector3D::x)
    .property("y", &Vector3D::y)
    .property("z", &Vector3D::z)
    .function("magnitude", &Vector3D::magnitude)
    .function("normalized", &Vector3D::normalized)
    .function("dot", &Vector3D::dot)
    .function("cross", &Vector3D::cross)
    .function("lerp", &Vector3D::lerp)
    .function("toThreeJs", &Vector3D::toThreeJs)
    .class_function("fromThreeJs", &Vector3D::fromThreeJs);

  class_<btk::math::Vector2D>("Vector2D")
    .constructor<float, float>()
    .property("x", &Vector2D::x)
    .property("y", &Vector2D::y)
    .function("magnitude", &Vector2D::magnitude)
    .function("normalized", &Vector2D::normalized)
    .function("dot", &Vector2D::dot)
    .function("lerp", &Vector2D::lerp);

  // Quaternion class
  class_<btk::math::Quaternion>("Quaternion")
    .constructor<>()
    .constructor<float, float, float, float>()
    .property("w", &btk::math::Quaternion::w)
    .property("x", &btk::math::Quaternion::x)
    .property("y", &btk::math::Quaternion::y)
    .property("z", &btk::math::Quaternion::z)
    .function("magnitude", &btk::math::Quaternion::magnitude)
    .function("normalize", &btk::math::Quaternion::normalize)
    .function("normalized", &btk::math::Quaternion::normalized)
    .function("conjugate", &btk::math::Quaternion::conjugate)
    .function("rotate", &btk::math::Quaternion::rotate)
    .function("slerp", &btk::math::Quaternion::slerp)
    .class_function("fromAxisAngle", &btk::math::Quaternion::fromAxisAngle)
    .class_function("identity", &btk::math::Quaternion::identity);

  // Bullet class
  enum_<DragFunction>("DragFunction").value("G1", DragFunction::G1).value("G7", DragFunction::G7);

  class_<btk::ballistics::Bullet>("Bullet")
    .constructor<float, float, float, float, DragFunction>()
    .constructor<const Bullet&, const Vector3D&, const Vector3D&, float>()
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
  class_<btk::physics::Atmosphere>("Atmosphere")
    .constructor<>()
    .constructor<float, float, float, float>()
    .function("getTemperature", &Atmosphere::getTemperature)
    .function("getAltitude", &Atmosphere::getAltitude)
    .function("getHumidity", &Atmosphere::getHumidity)
    .function("getPressure", &Atmosphere::getPressure)
    .function("getAirDensity", &Atmosphere::getAirDensity)
    .function("getSpeedOfSound", &Atmosphere::getSpeedOfSound)
    .class_function("standard", &Atmosphere::standard)
    .class_function("atAltitude", &Atmosphere::atAltitude);

  // TrajectoryPoint class
  class_<btk::ballistics::TrajectoryPoint>("TrajectoryPoint")
    .constructor<float, Bullet>()
    .function("getTime", &TrajectoryPoint::getTime)
    .function("getState", &TrajectoryPoint::getState)
    .function("getDistance", &TrajectoryPoint::getDistance)
    .function("getVelocity", &TrajectoryPoint::getVelocity)
    .function("getKineticEnergy", &TrajectoryPoint::getKineticEnergy);

  // Trajectory class
  class_<btk::ballistics::Trajectory>("Trajectory")
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

  // Register optional<TrajectoryPoint> binding
  register_optional<btk::ballistics::TrajectoryPoint>();

  // Ballistics Simulator class
  class_<btk::ballistics::Simulator>("BallisticsSimulator")
    .constructor<>()
    .function("setInitialBullet", &btk::ballistics::Simulator::setInitialBullet)
    .function("setAtmosphere", &btk::ballistics::Simulator::setAtmosphere)
    .function("setWind", &btk::ballistics::Simulator::setWind)
    .function("getInitialBullet", &btk::ballistics::Simulator::getInitialBullet)
    .function("getCurrentBullet", &btk::ballistics::Simulator::getCurrentBullet)
    .function("getAtmosphere", &btk::ballistics::Simulator::getAtmosphere)
    .function("getWind", &btk::ballistics::Simulator::getWind)
    .function("resetToInitial", &btk::ballistics::Simulator::resetToInitial)
    .function("computeZero", &btk::ballistics::Simulator::computeZero)
    .function("simulate", select_overload<const Trajectory&(float, float, float)>(&btk::ballistics::Simulator::simulate))
    .function("simulateWithWind", select_overload<const Trajectory&(float, float, float, const WindGenerator&)>(&btk::ballistics::Simulator::simulate))
    .function("timeStep", &btk::ballistics::Simulator::timeStep);

  // Target class
  class_<btk::match::Target>("Target")
    .constructor<const std::string&, float, float, float, float, float, float, float, const std::string&>()
    .function("getName", &Target::getName)
    .function("getDescription", &Target::getDescription)
    .function("getXRingDiameter", &Target::getXRingDiameter)
    .function("ringDiameter", &Target::ringDiameter)
    .function("scoreHit", &Target::scoreHit)
    .function("isXRing", &Target::isXRing)
    .function("getRingInnerDiameter", &Target::getRingInnerDiameter)
    .function("getRingOuterDiameter", &Target::getRingOuterDiameter);

  // Removed legacy Hit value_object and AccuracyMetrics/legacy scoring bindings

  // Targets
  class_<btk::match::Targets>("Targets")
    .class_function("getTarget", &Targets::getTarget)
    .class_function("listTargets", &Targets::listTargets)
    .class_function("hasTarget", &Targets::hasTarget);

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

  // Hit class - must use class_ because it has private members with getters
  class_<btk::match::Hit>("Hit")
    .constructor<>()
    .constructor<float, float, int, bool>()
    .function("getX", &Hit::getX)
    .function("getY", &Hit::getY)
    .function("getScore", &Hit::getScore)
    .function("isX", &Hit::isX);

  // Match class
  class_<btk::match::Match>("Match")
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

  // Match Simulator class (in match namespace)
  class_<btk::match::Simulator>("MatchSimulator")
    .constructor<const btk::ballistics::Bullet&, float, const btk::match::Target&, float, const btk::physics::Atmosphere&, float, float, float, float, float, float, float>()
    .function("fireShot", &btk::match::Simulator::fireShot)
    .function("getMatch", &btk::match::Simulator::getMatch)
    .function("clearShots", &btk::match::Simulator::clearShots)
    .function("getShotCount", &btk::match::Simulator::getShotCount)
    .function("getTarget", &btk::match::Simulator::getTarget)
    .function("getBullet", &btk::match::Simulator::getBullet)
    .function("getBulletDiameter", &btk::match::Simulator::getBulletDiameter)
    .function("getShots", &btk::match::Simulator::getShots)
    .function("getShot", &btk::match::Simulator::getShot);

  // Register value arrays for easier JavaScript usage
  register_vector<TrajectoryPoint>("TrajectoryPointVector");
  register_vector<Hit>("HitVector");
  register_vector<SimulatedShot>("SimulatedShotVector");
  register_vector<std::string>("StringVector");
  register_vector<Vector3D>("Vector3DVector");

  // No RingInfo struct needed - direct methods are cleaner

  // Wind generator class
  class_<btk::physics::WindGenerator>("WindGenerator")
    .constructor<>()
    .function("advanceTime", &WindGenerator::advanceTime)
    .function("sample", select_overload<Vector3D(float, float, float) const>(&WindGenerator::operator()))
    .function("setAdvectionGain", &WindGenerator::setAdvectionGain)
    .function("getAdvectionGain", &WindGenerator::getAdvectionGain)
    .function("setAdvectionAlpha", &WindGenerator::setAdvectionAlpha)
    .function("sampleComponent", select_overload<Vector3D(int, const Vector3D&) const>(&WindGenerator::sampleComponent))
    .function("getNumActiveComponents", &WindGenerator::getNumActiveComponents)
    .function("getComponentStrength", &WindGenerator::getComponentStrength)
    .function("getComponentDownrangeScale", &WindGenerator::getComponentDownrangeScale)
    .function("getComponentCrossrangeScale", &WindGenerator::getComponentCrossrangeScale)
    .function("getComponentTemporalScale", &WindGenerator::getComponentTemporalScale)
    .function("getComponentExponent", &WindGenerator::getComponentExponent)
    .function("getComponentSigmoidThreshold", &WindGenerator::getComponentSigmoidThreshold)
    .function("getComponentRMS", &WindGenerator::getComponentRMS)
    .function("getGlobalAdvectionOffset", &WindGenerator::getGlobalAdvectionOffset)
    .function("getGlobalAdvectionVelocity", &WindGenerator::getGlobalAdvectionVelocity)
    .function("getCurrentTime", &WindGenerator::getCurrentTime);

  // Wind presets factory
  class_<btk::physics::WindPresets>("WindPresets")
    .class_function("getPreset", &WindPresets::getPreset)
    .class_function("listPresets", &WindPresets::listPresets)
    .class_function("hasPreset", &WindPresets::hasPreset);

  // Steel Target - Chain Anchor
  value_object<btk::match::SteelTarget::ChainAnchor>("ChainAnchor")
    .field("fixed", &btk::match::SteelTarget::ChainAnchor::fixed_)
    .field("attachment", &btk::match::SteelTarget::ChainAnchor::attachment_)
    .field("restLength", &btk::match::SteelTarget::ChainAnchor::rest_length_)
    .field("springConstant", &btk::match::SteelTarget::ChainAnchor::spring_constant_);

  // Steel Target - Impact
  value_object<btk::match::SteelTarget::Impact>("SteelTargetImpact")
    .field("positionLocal", &btk::match::SteelTarget::Impact::position_local_)
    .field("bulletDiameter", &btk::match::SteelTarget::Impact::bullet_diameter_)
    .field("timestamp", &btk::match::SteelTarget::Impact::timestamp_s_);

  // Steel Target - Intersection Result
  value_object<btk::match::SteelTarget::IntersectionResult>("IntersectionResult")
    .field("hit", &btk::match::SteelTarget::IntersectionResult::hit)
    .field("impactPoint", &btk::match::SteelTarget::IntersectionResult::impact_point_)
    .field("impactVelocity", &btk::match::SteelTarget::IntersectionResult::impact_velocity_)
    .field("surfaceNormal", &btk::match::SteelTarget::IntersectionResult::surface_normal_)
    .field("impactTime", &btk::match::SteelTarget::IntersectionResult::impact_time_s_)
    .field("bulletMass", &btk::match::SteelTarget::IntersectionResult::bullet_mass_kg_)
    .field("bulletDiameter", &btk::match::SteelTarget::IntersectionResult::bullet_diameter_);

  // Register optional<IntersectionResult>
  register_optional<btk::match::SteelTarget::IntersectionResult>();

  // Register vectors for SteelTarget
  register_vector<btk::match::SteelTarget::ChainAnchor>("ChainAnchorVector");
  register_vector<btk::match::SteelTarget::Impact>("ImpactVector");

  // Steel Target class
  class_<btk::match::SteelTarget>("SteelTarget")
    .constructor<float, float, float, bool>()
    .function("addChainAnchor", &btk::match::SteelTarget::addChainAnchor)
    .function("setDamping", &btk::match::SteelTarget::setDamping)
    .function("hit", select_overload<bool(const btk::ballistics::Trajectory&)>(&btk::match::SteelTarget::hit))
    .function("hitBullet", select_overload<void(const btk::ballistics::Bullet&)>(&btk::match::SteelTarget::hit))
    .function("timeStep", &btk::match::SteelTarget::timeStep)
    .function("getImpacts", &btk::match::SteelTarget::getImpacts)
    .function("getAnchors", &btk::match::SteelTarget::getAnchors)
    .function("getCenterOfMass", &btk::match::SteelTarget::getCenterOfMass)
    .function("getNormal", &btk::match::SteelTarget::getNormal)
    .function("getVelocity", &btk::match::SteelTarget::getVelocity)
    .function("getAngularVelocity", &btk::match::SteelTarget::getAngularVelocity)
    .function("getMass", &btk::match::SteelTarget::getMass)
    .function("translate", &btk::match::SteelTarget::translate)
    .function("rotate", &btk::match::SteelTarget::rotate)
    .function("clearImpacts", &btk::match::SteelTarget::clearImpacts)
    .function("updateDisplay", &btk::match::SteelTarget::updateDisplay)
    .function("getVertices", &btk::match::SteelTarget::getVertices)
    .function("getUVs", &btk::match::SteelTarget::getUVs)
    .function("initializeTexture", &btk::match::SteelTarget::initializeTexture)
    .function("getTexture", &btk::match::SteelTarget::getTexture)
    .function("getTextureWidth", &btk::match::SteelTarget::getTextureWidth)
    .function("getTextureHeight", &btk::match::SteelTarget::getTextureHeight)
    .function("setColors", &btk::match::SteelTarget::setColors);
}