#include <emscripten/bind.h>
#include <emscripten/val.h>

// Include all our C++ headers
#include "ballistics/bullet.h"
#include "ballistics/simulator.h"
#include "ballistics/trajectory.h"
#include "match/match.h"
#include "match/simulator.h"
#include "match/target.h"
#include "match/targets.h"
#include "math/conversions.h"
#include "math/quaternion.h"
#include "math/vector.h"
#include "physics/atmosphere.h"
#include "physics/wind_generator.h"
#include "rendering/dust_cloud.h"
#include "rendering/impact_detector.h"
#include "rendering/steel_target.h"
#include "rendering/wind_flag.h"

using namespace emscripten;
using namespace btk::ballistics;
using namespace btk::match;
using namespace btk::rendering;
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
    .function("lerp", &Vector3D::lerp);

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

  // Register optional bindings used by trajectories and intersection helpers
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
    .function("simulate", select_overload<void(float, float, float)>(&btk::ballistics::Simulator::simulate))
    .function("simulateWithWind", select_overload<void(float, float, float, const WindGenerator&)>(&btk::ballistics::Simulator::simulate))
    .function("getTrajectory", select_overload<Trajectory&()>(&btk::ballistics::Simulator::getTrajectory), return_value_policy::reference())
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
  class_<btk::match::Targets>("Targets").class_function("getTarget", &Targets::getTarget).class_function("listTargets", &Targets::listTargets).class_function("hasTarget", &Targets::hasTarget);

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
  value_object<btk::rendering::SteelTarget::ChainAnchor>("ChainAnchor")
    .field("localAttachment", &btk::rendering::SteelTarget::ChainAnchor::local_attachment_)
    .field("worldFixed", &btk::rendering::SteelTarget::ChainAnchor::world_fixed_)
    .field("restLength", &btk::rendering::SteelTarget::ChainAnchor::rest_length_);

  // Steel Target - Impact
  value_object<btk::rendering::SteelTarget::Impact>("SteelTargetImpact")
    .field("positionLocal", &btk::rendering::SteelTarget::Impact::position_local_)
    .field("bulletDiameter", &btk::rendering::SteelTarget::Impact::bullet_diameter_)
    .field("timestamp", &btk::rendering::SteelTarget::Impact::timestamp_s_);

  // Steel Target - Raycast hit
  value_object<btk::rendering::SteelTarget::RaycastHit>("SteelTargetRaycastHit")
    .field("pointWorld", &btk::rendering::SteelTarget::RaycastHit::point_world_)
    .field("normalWorld", &btk::rendering::SteelTarget::RaycastHit::normal_world_)
    .field("distanceM", &btk::rendering::SteelTarget::RaycastHit::distance_m_);

  // Register optional<RaycastHit> and vectors for SteelTarget
  register_optional<btk::rendering::SteelTarget::RaycastHit>();
  register_vector<btk::rendering::SteelTarget::ChainAnchor>("ChainAnchorVector");
  register_vector<btk::rendering::SteelTarget::Impact>("ImpactVector");

  // Steel Target class
  class_<btk::rendering::SteelTarget>("SteelTarget")
    .constructor<float, float, float, bool>()
    .constructor<float, float, float, bool, const btk::math::Vector3D&, const btk::math::Vector3D&>()
    .function("addChainAnchor", &btk::rendering::SteelTarget::addChainAnchor)
    .function("hit", &btk::rendering::SteelTarget::hit)
    .function("intersectSegment", &btk::rendering::SteelTarget::intersectSegment)
    .function("intersectTrajectory", &btk::rendering::SteelTarget::intersectTrajectory)
    .function("timeStep", &btk::rendering::SteelTarget::timeStep)
    .function("getImpacts", &btk::rendering::SteelTarget::getImpacts)
    .function("getAnchors", &btk::rendering::SteelTarget::getAnchors)
    .function("getCenterOfMass", &btk::rendering::SteelTarget::getCenterOfMass)
    .function("getNormal", &btk::rendering::SteelTarget::getNormal)
    .function("getVelocity", &btk::rendering::SteelTarget::getVelocity)
    .function("getAngularVelocity", &btk::rendering::SteelTarget::getAngularVelocity)
    .function("getOrientation", &btk::rendering::SteelTarget::getOrientation)
    .function("isMoving", &btk::rendering::SteelTarget::isMoving)
    .function("getMass", &btk::rendering::SteelTarget::getMass)
    .function("setDebug", &btk::rendering::SteelTarget::setDebug)
    .function("clearImpacts", &btk::rendering::SteelTarget::clearImpacts)
    .function("updateDisplay", &btk::rendering::SteelTarget::updateDisplay)
    .function("getVertices", &btk::rendering::SteelTarget::getVertices)
    .function("getUVs", &btk::rendering::SteelTarget::getUVs)
    .function("initializeTexture", &btk::rendering::SteelTarget::initializeTexture)
    .function("getTextureWidth", &btk::rendering::SteelTarget::getTextureWidth)
    .function("getTextureHeight", &btk::rendering::SteelTarget::getTextureHeight)
    .function("getTexture", &btk::rendering::SteelTarget::getTexture)
    .function("setColors", &btk::rendering::SteelTarget::setColors)
    .function("localToWorld", &btk::rendering::SteelTarget::localToWorld);

  // Dust Cloud class
  class_<DustCloud>("DustCloud")
    .constructor<int, const btk::math::Vector3D&, float, float>()
    .function("timeStep", &DustCloud::timeStep)
    .function("getPositions", &DustCloud::getPositions)
    .function("getAlpha", &DustCloud::getAlpha)
    .function("isDone", &DustCloud::isDone)
    .function("getParticleCount", &DustCloud::getParticleCount)
    .function("getCenterPosition", &DustCloud::getCenterPosition);

  // Wind Flag class
  class_<btk::rendering::WindFlag>("WindFlag")
    .constructor<float, float, float, float, int, float, float, float, float, float, float, float, float, float>()
    .function("setPosition", &btk::rendering::WindFlag::setPosition)
    .function("getPosition", &btk::rendering::WindFlag::getPosition)
    .function("update", &btk::rendering::WindFlag::update)
    .function("updateDisplay", &btk::rendering::WindFlag::updateDisplay)
    .function("getVertices", &btk::rendering::WindFlag::getVertices)
    .function("getUVs", &btk::rendering::WindFlag::getUVs)
    .function("getIndices", &btk::rendering::WindFlag::getIndices);

  // Impact detection
  value_object<btk::rendering::ImpactResult>("ImpactResult")
    .field("position", &btk::rendering::ImpactResult::position_m)
    .field("normal", &btk::rendering::ImpactResult::normal)
    .field("time", &btk::rendering::ImpactResult::time_s)
    .field("objectId", &btk::rendering::ImpactResult::object_id);

  register_optional<btk::rendering::ImpactResult>();

  class_<btk::rendering::ImpactDetector>("ImpactDetector")
    .constructor<float, float, float, float, float>()
    .function("addMeshCollider", &btk::rendering::ImpactDetector::addMeshCollider)
    .function("addSteelCollider", &btk::rendering::ImpactDetector::addSteelCollider, allow_raw_pointer<arg<0>>())
    .function("findFirstImpact", &btk::rendering::ImpactDetector::findFirstImpact);
}