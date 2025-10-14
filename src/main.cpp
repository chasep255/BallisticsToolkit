#include <emscripten/bind.h>
#include <emscripten/val.h>

// Include all our C++ headers
#include "atmosphere.h"
#include "bullet.h"
#include "simulator.h"
#include "trajectory.h"
#include "units.h"

using namespace emscripten;
using namespace btk::ballistics;

EMSCRIPTEN_BINDINGS(ballistics_toolkit)
{
  // Unit types - only static factory methods
  class_<Distance>("Distance")
    .class_function("meters", &Distance::meters)
    .class_function("yards", &Distance::yards)
    .class_function("feet", &Distance::feet)
    .class_function("inches", &Distance::inches)
    .class_function("miles", &Distance::miles)
    .class_function("kilometers", &Distance::kilometers)
    // Instance getters
    .function("getMeters", select_overload<double() const>(&Distance::meters))
    .function("getYards", select_overload<double() const>(&Distance::yards))
    .function("getFeet", select_overload<double() const>(&Distance::feet))
    .function("getInches", select_overload<double() const>(&Distance::inches));

  class_<Weight>("Weight")
    .class_function("grains", &Weight::grains)
    .class_function("pounds", &Weight::pounds)
    .class_function("kilograms", &Weight::kilograms)
    // Instance getters
    .function("getGrains", select_overload<double() const>(&Weight::grains))
    .function("getPounds", select_overload<double() const>(&Weight::pounds))
    .function("getKilograms", select_overload<double() const>(&Weight::kilograms));

  class_<Velocity>("Velocity")
    .class_function("fps", &Velocity::fps)
    .class_function("mph", &Velocity::mph)
    .class_function("mps", &Velocity::mps)
    // Instance getters
    .function("getFps", select_overload<double() const>(&Velocity::fps))
    .function("getMph", select_overload<double() const>(&Velocity::mph))
    .function("getMps", select_overload<double() const>(&Velocity::mps));

  class_<Temperature>("Temperature")
    .class_function("fahrenheit", &Temperature::fahrenheit)
    .class_function("celsius", &Temperature::celsius)
    .class_function("kelvin", &Temperature::kelvin)
    // Instance getters
    .function("getFahrenheit", select_overload<double() const>(&Temperature::fahrenheit))
    .function("getCelsius", select_overload<double() const>(&Temperature::celsius))
    .function("getKelvin", select_overload<double() const>(&Temperature::kelvin));

  class_<Pressure>("Pressure")
    .class_function("pascals", &Pressure::pascals)
    .class_function("psi", &Pressure::psi)
    // Instance getters
    .function("getPascals", select_overload<double() const>(&Pressure::pascals))
    .function("getPsi", select_overload<double() const>(&Pressure::psi));

  class_<Angle>("Angle")
    .class_function("degrees", &Angle::degrees)
    .class_function("radians", &Angle::radians)
    .class_function("mrad", &Angle::mrad)
    // Instance getters
    .function("getDegrees", select_overload<double() const>(&Angle::degrees))
    .function("getRadians", select_overload<double() const>(&Angle::radians))
    .function("getMrad", select_overload<double() const>(&Angle::mrad));

  class_<Time>("Time")
    .class_function("seconds", &Time::seconds)
    .class_function("milliseconds", &Time::milliseconds)
    // Instance getters
    .function("getSeconds", select_overload<double() const>(&Time::seconds))
    .function("getMilliseconds", select_overload<double() const>(&Time::milliseconds));

  class_<Energy>("Energy")
    .class_function("joules", &Energy::joules)
    .class_function("foot_pounds", &Energy::foot_pounds)
    // Instance getters
    .function("getJoules", select_overload<double() const>(&Energy::joules))
    .function("getFootPounds", select_overload<double() const>(&Energy::foot_pounds));

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
    .function("getWeight", &Bullet::getWeight)
    .function("getDiameter", &Bullet::getDiameter)
    .function("getLength", &Bullet::getLength)
    .function("getBallisticCoefficient", &Bullet::getBc)
    .function("getDragFunction", &Bullet::getDragFunction);

  // Atmosphere class
  class_<Atmosphere>("Atmosphere")
    .constructor<>()
    .constructor<Temperature, Distance, double, Pressure>()
    .function("getTemperature", &Atmosphere::getTemperature)
    .function("getAltitude", &Atmosphere::getAltitude)
    .function("getHumidity", &Atmosphere::getHumidity)
    .function("getPressure", &Atmosphere::getPressure);

  // TrajectoryPoint class
  class_<TrajectoryPoint>("TrajectoryPoint")
    .constructor<Time, FlyingBullet>()
    .function("getTime", &TrajectoryPoint::getTime)
    .function("getState", &TrajectoryPoint::getState);

  // Trajectory class
  class_<Trajectory>("Trajectory")
    .constructor<>()
    .function("addPoint", &Trajectory::addPoint)
    .function("getPoint", &Trajectory::getPoint)
    .function("getPointCount", &Trajectory::getPointCount)
    .function("clear", &Trajectory::clear);

  // Simulator class
  class_<Simulator>("Simulator")
    .class_function("timeStep", &Simulator::timeStep)
    .class_function("simulateToDistance", &Simulator::simulateToDistance)
    .class_function("computeZeroedInitialState", &Simulator::computeZeroedInitialState);

  // Register value arrays for easier JavaScript usage
  register_vector<TrajectoryPoint>("TrajectoryPointVector");
}