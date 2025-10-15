#include <emscripten/bind.h>
#include <emscripten/val.h>

// Include all our C++ headers
#include "atmosphere.h"
#include "bullet.h"
#include "match.h"
#include "match_simulator.h"
#include "nra_targets.h"
#include "simulator.h"
#include "target.h"
#include "trajectory.h"
#include "units.h"

using namespace emscripten;
using namespace btk::ballistics;

// Wrapper function to convert std::pair to RingInfo
struct RingInfo
{
  Distance inner;
  Distance outer;

  // Default constructor for embind
  RingInfo() : inner(Distance::zero()), outer(Distance::zero())
  {
  }

  // Constructor from pair
  RingInfo(const std::pair<Distance, Distance>& pair) : inner(pair.first), outer(pair.second)
  {
  }
};

RingInfo getRingInfoWrapper(const Target& target, int ring)
{
  auto pair = target.getRingInfo(ring);
  return RingInfo(pair);
}

EMSCRIPTEN_BINDINGS(ballistics_toolkit)
{
  // Unit types - only static factory methods
  class_<Distance>("Distance")
    .class_function("meters", &Distance::meters)
    .class_function("centimeters", &Distance::centimeters)
    .class_function("millimeters", &Distance::millimeters)
    .class_function("yards", &Distance::yards)
    .class_function("feet", &Distance::feet)
    .class_function("inches", &Distance::inches)
    .class_function("miles", &Distance::miles)
    .class_function("kilometers", &Distance::kilometers)
    .class_function("zero", &Distance::zero)
    .class_function("nan", &Distance::nan)
    // Instance getters
    .function("getMeters", select_overload<double() const>(&Distance::meters))
    .function("getCentimeters", select_overload<double() const>(&Distance::centimeters))
    .function("getMillimeters", select_overload<double() const>(&Distance::millimeters))
    .function("getYards", select_overload<double() const>(&Distance::yards))
    .function("getFeet", select_overload<double() const>(&Distance::feet))
    .function("getInches", select_overload<double() const>(&Distance::inches));

  class_<Weight>("Weight")
    .class_function("grains", &Weight::grains)
    .class_function("grams", &Weight::grams)
    .class_function("pounds", &Weight::pounds)
    .class_function("kilograms", &Weight::kilograms)
    .class_function("zero", &Weight::zero)
    .class_function("nan", &Weight::nan)
    // Instance getters
    .function("getGrains", select_overload<double() const>(&Weight::grains))
    .function("getGrams", select_overload<double() const>(&Weight::grams))
    .function("getPounds", select_overload<double() const>(&Weight::pounds))
    .function("getKilograms", select_overload<double() const>(&Weight::kilograms));

  class_<Velocity>("Velocity")
    .class_function("fps", &Velocity::fps)
    .class_function("mph", &Velocity::mph)
    .class_function("mps", &Velocity::mps)
    .class_function("zero", &Velocity::zero)
    .class_function("nan", &Velocity::nan)
    // Instance getters
    .function("getFps", select_overload<double() const>(&Velocity::fps))
    .function("getMph", select_overload<double() const>(&Velocity::mph))
    .function("getMps", select_overload<double() const>(&Velocity::mps));

  class_<Temperature>("Temperature")
    .class_function("fahrenheit", &Temperature::fahrenheit)
    .class_function("celsius", &Temperature::celsius)
    .class_function("kelvin", &Temperature::kelvin)
    .class_function("zero", &Temperature::zero)
    .class_function("nan", &Temperature::nan)
    // Instance getters
    .function("getFahrenheit", select_overload<double() const>(&Temperature::fahrenheit))
    .function("getCelsius", select_overload<double() const>(&Temperature::celsius))
    .function("getKelvin", select_overload<double() const>(&Temperature::kelvin));

  class_<Pressure>("Pressure")
    .class_function("pascals", &Pressure::pascals)
    .class_function("psi", &Pressure::psi)
    .class_function("zero", &Pressure::zero)
    .class_function("nan", &Pressure::nan)
    // Instance getters
    .function("getPascals", select_overload<double() const>(&Pressure::pascals))
    .function("getPsi", select_overload<double() const>(&Pressure::psi));

  class_<Angle>("Angle")
    .class_function("degrees", &Angle::degrees)
    .class_function("radians", &Angle::radians)
    .class_function("mrad", &Angle::mrad)
    .class_function("moa", &Angle::moa)
    .class_function("oclock", &Angle::oclock)
    .class_function("zero", &Angle::zero)
    .class_function("nan", &Angle::nan)
    // Instance getters
    .function("getDegrees", select_overload<double() const>(&Angle::degrees))
    .function("getRadians", select_overload<double() const>(&Angle::radians))
    .function("getMrad", select_overload<double() const>(&Angle::mrad))
    .function("getMoa", select_overload<double() const>(&Angle::moa))
    .function("getOclock", select_overload<double() const>(&Angle::oclock));

  class_<Time>("Time")
    .class_function("seconds", &Time::seconds)
    .class_function("milliseconds", &Time::milliseconds)
    .class_function("zero", &Time::zero)
    .class_function("nan", &Time::nan)
    // Instance getters
    .function("getSeconds", select_overload<double() const>(&Time::seconds))
    .function("getMilliseconds", select_overload<double() const>(&Time::milliseconds));

  class_<Energy>("Energy")
    .class_function("joules", &Energy::joules)
    .class_function("foot_pounds", &Energy::foot_pounds)
    .class_function("zero", &Energy::zero)
    .class_function("nan", &Energy::nan)
    // Instance getters
    .function("getJoules", select_overload<double() const>(&Energy::joules))
    .function("getFootPounds", select_overload<double() const>(&Energy::foot_pounds));

  class_<AngularVelocity>("AngularVelocity")
    .class_function("radians_per_second", &AngularVelocity::radians_per_second)
    .class_function("rpm", &AngularVelocity::rpm)
    .class_function("zero", &AngularVelocity::zero)
    .class_function("nan", &AngularVelocity::nan)
    // Instance getters
    .function("getRadiansPerSecond", select_overload<double() const>(&AngularVelocity::radians_per_second))
    .function("getRpm", select_overload<double() const>(&AngularVelocity::rpm));

  // 3D Vector types
  class_<Position3D>("Position3D")
    .constructor<Distance, Distance, Distance>()
    .property("x", &Position3D::x)
    .property("y", &Position3D::y)
    .property("z", &Position3D::z);

  class_<Velocity3D>("Velocity3D")
    .constructor<Velocity, Velocity, Velocity>()
    .property("x", &Velocity3D::x)
    .property("y", &Velocity3D::y)
    .property("z", &Velocity3D::z)
    .function("magnitude", &Velocity3D::magnitude);

  // Bullet class
  enum_<DragFunction>("DragFunction").value("G1", DragFunction::G1).value("G7", DragFunction::G7);

  class_<Bullet>("Bullet")
    .constructor<Weight, Distance, Distance, double, DragFunction>()
    .constructor<const Bullet&, const Position3D&, const Velocity3D&, const AngularVelocity&>()
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
    .function("toString", &Bullet::toString)
    .function("toDetailedString", &Bullet::toDetailedString);

  // Wind class
  class_<Wind>("Wind")
    .constructor<Velocity, Angle, Velocity>()
    .constructor<Velocity, Angle>()
    .class_function("calm", &Wind::calm)
    .function("getSpeed", &Wind::getSpeed)
    .function("getDirection", &Wind::getDirection)
    .function("getVertical", &Wind::getVertical)
    .function("getComponents", &Wind::getComponents)
    .function("getComponentVelocities", &Wind::getComponentVelocities)
    .function("toString", &Wind::toString);

  // Atmosphere class
  class_<Atmosphere>("Atmosphere")
    .constructor<>()
    .constructor<Temperature, Distance, double, Pressure>()
    .function("getTemperature", &Atmosphere::getTemperature)
    .function("getAltitude", &Atmosphere::getAltitude)
    .function("getHumidity", &Atmosphere::getHumidity)
    .function("getPressure", &Atmosphere::getPressure)
    .function("getAirDensity", &Atmosphere::getAirDensity)
    .function("getSpeedOfSound", &Atmosphere::getSpeedOfSound)
    .class_function("standard", &Atmosphere::standard)
    .class_function("atAltitude", &Atmosphere::atAltitude)
    .function("toString", &Atmosphere::toString);

  // TrajectoryPoint class
  class_<TrajectoryPoint>("TrajectoryPoint")
    .constructor<Time, Bullet>()
    .function("getTime", &TrajectoryPoint::getTime)
    .function("getState", &TrajectoryPoint::getState)
    .function("getDistance", &TrajectoryPoint::getDistance)
    .function("toString", &TrajectoryPoint::toString);

  // Trajectory class
  class_<Trajectory>("Trajectory")
    .constructor<>()
    .function("addPoint", &Trajectory::addPoint)
    .function("getPoint", &Trajectory::getPoint)
    .function("getPointCount", &Trajectory::getPointCount)
    .function("atDistance", &Trajectory::atDistance)
    .function("getTotalDistance", &Trajectory::getTotalDistance)
    .function("getTotalTime", &Trajectory::getTotalTime)
    .function("getImpactAngle", &Trajectory::getImpactAngle)
    .function("toString", &Trajectory::toString)
    .function("clear", &Trajectory::clear);

  // Simulator class
  class_<Simulator>("Simulator")
    .class_function("timeStep", &Simulator::timeStep)
    .class_function("simulateToDistance", &Simulator::simulateToDistance)
    .class_function("computeZeroedInitialState", &Simulator::computeZeroedInitialState);

  // Target class
  class_<Target>("Target")
    .constructor<const std::string&, const Distance&, const Distance&, const Distance&, const Distance&,
                 const Distance&, const Distance&, const Distance&, const std::string&>()
    .function("getName", &Target::getName)
    .function("getDescription", &Target::getDescription)
    .function("getXRingDiameter", &Target::getXRingDiameter)
    .function("ringDiameter", &Target::ringDiameter)
    .function("scoreHit", &Target::scoreHit)
    .function("isXRing", &Target::isXRing)
    .function("getRingInfo", &Target::getRingInfo)
    .function("toString", &Target::toString);

  // Removed legacy Hit value_object and AccuracyMetrics/legacy scoring bindings

  // NRA Targets
  class_<NRATargets>("NRATargets")
    .class_function("getTarget", &NRATargets::getTarget)
    .class_function("listTargets", &NRATargets::listTargets)
    .class_function("hasTarget", &NRATargets::hasTarget);

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
  class_<Hit>("Hit")
    .constructor<>()
    .constructor<const Distance&, const Distance&, int, bool>()
    .function("getX", &Hit::getX)
    .function("getY", &Hit::getY)
    .function("getScore", &Hit::getScore)
    .function("isX", &Hit::isX);

  // Match class
  class_<Match>("Match")
    .constructor<>()
    .function("addHit",
              select_overload<std::pair<int, bool>(const Distance&, const Distance&, const Target&, const Distance&)>(
                &Match::addHit))
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
    .constructor<const Bullet&, const Velocity&, const Target&, const Distance&, const Atmosphere&, const Velocity&,
                 const Velocity&, const Velocity&, const Velocity&, const Angle&, double>()
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

  // Register RingInfo struct
  value_object<RingInfo>("RingInfo").field("inner", &RingInfo::inner).field("outer", &RingInfo::outer);

  // Add wrapper function to convert std::pair to RingInfo
  function("getRingInfoWrapper", &getRingInfoWrapper);
}