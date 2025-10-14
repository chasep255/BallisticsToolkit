#pragma once

#include <cmath>
#include <string>

namespace btk::ballistics
{

    /**
     * @brief CRTP base class for all unit types
     * Provides common operators to avoid code duplication
     * Each derived class must provide a constructor taking a double value
     */
    template <typename Derived>
    class UnitBase
    {
        public:
        // Arithmetic operators
        constexpr Derived operator+(const Derived& other) const
        {
            return Derived(value_ + other.value_);
        }
        constexpr Derived operator-(const Derived& other) const
        {
            return Derived(value_ - other.value_);
        }
        constexpr Derived operator-() const
        {
            return Derived(-value_);
        }
        constexpr Derived operator*(double scalar) const
        {
            return Derived(value_ * scalar);
        }
        constexpr Derived operator/(double scalar) const
        {
            return Derived(value_ / scalar);
        }

        // Friend operators for scalar on left side
        friend constexpr Derived operator*(double scalar, const Derived& unit)
        {
            return Derived(scalar * unit.value_);
        }

        friend constexpr Derived operator/(double scalar, const Derived& unit)
        {
            return Derived(scalar / unit.value_);
        }

        // Distance * Distance operator for squaring
        friend constexpr Derived operator*(const Derived& unit1, const Derived& unit2)
        {
            return Derived(unit1.value_ * unit2.value_);
        }

        // Compound assignment operators
        constexpr Derived& operator+=(const Derived& other)
        {
            value_ += other.value_;
            return static_cast<Derived&>(*this);
        }
        constexpr Derived& operator-=(const Derived& other)
        {
            value_ -= other.value_;
            return static_cast<Derived&>(*this);
        }
        constexpr Derived& operator*=(double scalar)
        {
            value_ *= scalar;
            return static_cast<Derived&>(*this);
        }
        constexpr Derived& operator/=(double scalar)
        {
            value_ /= scalar;
            return static_cast<Derived&>(*this);
        }

        // Comparison operators
        constexpr bool operator==(const Derived& other) const
        {
            return std::abs(value_ - other.value_) < 1e-9;
        }
        constexpr bool operator!=(const Derived& other) const
        {
            return !(*this == other);
        }
        constexpr bool operator<(const Derived& other) const
        {
            return value_ < other.value_;
        }
        constexpr bool operator>(const Derived& other) const
        {
            return value_ > other.value_;
        }
        constexpr bool operator<=(const Derived& other) const
        {
            return value_ <= other.value_;
        }
        constexpr bool operator>=(const Derived& other) const
        {
            return value_ >= other.value_;
        }

        constexpr bool isZero() const
        {
            return *this == 0;
        }

        constexpr bool isNan() const
        {
            return std::isnan(value_);
        }

        constexpr bool isFinite() const
        {
            return std::isfinite(value_);
        }

        // Access to base unit value
        constexpr double baseValue() const
        {
            return value_;
        }

        // Create from base value (for Vector3D default constructor)
        static constexpr Derived fromBaseValue(double value)
        {
            return Derived(value);
        }

        // Static factory methods for common values
        static constexpr Derived zero()
        {
            return Derived(0.0);
        }

        static constexpr Derived nan()
        {
            return Derived(std::numeric_limits<double>::quiet_NaN());
        }


        protected:
        explicit constexpr UnitBase(double value) : value_(value)
        {
        }

        double value_;
    };

    /**
     * @brief Distance measurements with meters as base unit (SI)
     */
    class Distance : public UnitBase<Distance>
    {
        public:
        // Static factory methods - constexpr for compile-time evaluation
        static constexpr Distance meters(double value)
        {
            return Distance(value);
        }
        static constexpr Distance centimeters(double value)
        {
            return Distance(value * 0.01);
        }
        static constexpr Distance millimeters(double value)
        {
            return Distance(value * 0.001);
        }
        static constexpr Distance kilometers(double value)
        {
            return Distance(value * 1000.0);
        }
        static constexpr Distance yards(double value)
        {
            return Distance(value * 0.9144);
        }
        static constexpr Distance feet(double value)
        {
            return Distance(value * 0.3048);
        }
        static constexpr Distance inches(double value)
        {
            return Distance(value * 0.0254);
        }
        static constexpr Distance miles(double value)
        {
            return Distance(value * 1609.344);
        }

        // Getter methods - constexpr for compile-time evaluation
        constexpr double meters() const
        {
            return value_;
        }
        constexpr double centimeters() const
        {
            return value_ * 100.0;
        }
        constexpr double millimeters() const
        {
            return value_ * 1000.0;
        }
        constexpr double kilometers() const
        {
            return value_ * 0.001;
        }
        constexpr double yards() const
        {
            return value_ * 1.0936133;
        }
        constexpr double feet() const
        {
            return value_ * 3.2808399;
        }
        constexpr double inches() const
        {
            return value_ * 39.3700787;
        }
        constexpr double miles() const
        {
            return value_ * 0.000621371;
        }

        private:
        friend class UnitBase<Distance>;
        explicit constexpr Distance(double value) : UnitBase<Distance>(value)
        {
        }
    };

    /**
     * @brief Weight measurements with kilograms as base unit (SI)
     */
    class Weight : public UnitBase<Weight>
    {
        public:
        // Static factory methods
        static constexpr Weight kilograms(double value)
        {
            return Weight(value);
        }
        static constexpr Weight grams(double value)
        {
            return Weight(value * 0.001);
        }
        static constexpr Weight milligrams(double value)
        {
            return Weight(value * 0.000001);
        }
        static constexpr Weight pounds(double value)
        {
            return Weight(value * 0.453592);
        }
        static constexpr Weight ounces(double value)
        {
            return Weight(value * 0.0283495);
        }
        static constexpr Weight tons(double value)
        {
            return Weight(value * 907.185);
        }
        static constexpr Weight grains(double value)
        {
            return Weight(value * 0.0000647989);
        }

        // Getter methods
        constexpr double kilograms() const
        {
            return value_;
        }
        constexpr double grams() const
        {
            return value_ * 1000.0;
        }
        constexpr double milligrams() const
        {
            return value_ * 1000000.0;
        }
        constexpr double pounds() const
        {
            return value_ * 2.20462;
        }
        constexpr double ounces() const
        {
            return value_ * 35.274;
        }
        constexpr double tons() const
        {
            return value_ * 0.00110231;
        }
        constexpr double grains() const
        {
            return value_ * 15432.4;
        }

        private:
        friend class UnitBase<Weight>;
        explicit constexpr Weight(double value) : UnitBase<Weight>(value)
        {
        }
    };

    /**
     * @brief Time measurements with seconds as base unit
     */
    class Time : public UnitBase<Time>
    {
        public:
        // Static factory methods
        static constexpr Time seconds(double value)
        {
            return Time(value);
        }
        static constexpr Time minutes(double value)
        {
            return Time(value * 60.0);
        }
        static constexpr Time hours(double value)
        {
            return Time(value * 3600.0);
        }
        static constexpr Time days(double value)
        {
            return Time(value * 86400.0);
        }
        static constexpr Time weeks(double value)
        {
            return Time(value * 604800.0);
        }
        static constexpr Time milliseconds(double value)
        {
            return Time(value * 0.001);
        }
        static constexpr Time microseconds(double value)
        {
            return Time(value * 0.000001);
        }

        // Getter methods
        constexpr double seconds() const
        {
            return value_;
        }
        constexpr double minutes() const
        {
            return value_ * 0.0166667;
        }
        constexpr double hours() const
        {
            return value_ * 0.000277778;
        }
        constexpr double days() const
        {
            return value_ * 1.15741e-5;
        }
        constexpr double weeks() const
        {
            return value_ * 1.65344e-6;
        }
        constexpr double milliseconds() const
        {
            return value_ * 1000.0;
        }
        constexpr double microseconds() const
        {
            return value_ * 1000000.0;
        }

        private:
        friend class UnitBase<Time>;
        explicit constexpr Time(double value) : UnitBase<Time>(value)
        {
        }
    };

    /**
     * @brief Temperature measurements with Kelvin as base unit
     */
    class Temperature : public UnitBase<Temperature>
    {
        public:
        // Static factory methods
        static constexpr Temperature kelvin(double value)
        {
            return Temperature(value);
        }
        static constexpr Temperature celsius(double value)
        {
            return Temperature(value + 273.15);
        }
        static constexpr Temperature fahrenheit(double value)
        {
            return Temperature((value - 32.0) * 5.0 / 9.0 + 273.15);
        }
        static constexpr Temperature rankine(double value)
        {
            return Temperature(value * 5.0 / 9.0);
        }

        // Getter methods
        constexpr double kelvin() const
        {
            return value_;
        }
        constexpr double celsius() const
        {
            return value_ - 273.15;
        }
        constexpr double fahrenheit() const
        {
            return (value_ - 273.15) * 9.0 / 5.0 + 32.0;
        }
        constexpr double rankine() const
        {
            return value_ * 9.0 / 5.0;
        }

        private:
        friend class UnitBase<Temperature>;
        explicit constexpr Temperature(double value) : UnitBase<Temperature>(value)
        {
        }
    };

    /**
     * @brief Velocity measurements with meters per second as base unit (SI)
     */
    class Velocity : public UnitBase<Velocity>
    {
        public:
        // Static factory methods
        static constexpr Velocity mps(double value)
        {
            return Velocity(value);
        }
        static constexpr Velocity fps(double value)
        {
            return Velocity(value * 0.3048);
        }
        static constexpr Velocity mph(double value)
        {
            return Velocity(value * 0.44704);
        }
        static constexpr Velocity kph(double value)
        {
            return Velocity(value * 0.277778);
        }
        static constexpr Velocity knots(double value)
        {
            return Velocity(value * 0.514444);
        }

        // Getter methods
        constexpr double mps() const
        {
            return value_;
        }
        constexpr double fps() const
        {
            return value_ * 3.28084;
        }
        constexpr double mph() const
        {
            return value_ * 2.23694;
        }
        constexpr double kph() const
        {
            return value_ * 3.6;
        }
        constexpr double knots() const
        {
            return value_ * 1.94384;
        }

        private:
        friend class UnitBase<Velocity>;
        explicit constexpr Velocity(double value) : UnitBase<Velocity>(value)
        {
        }
    };

    /**
     * @brief Pressure measurements with Pascals as base unit (SI)
     */
    class Pressure : public UnitBase<Pressure>
    {
        public:
        // Static factory methods
        static constexpr Pressure pascals(double value)
        {
            return Pressure(value);
        }
        static constexpr Pressure psi(double value)
        {
            return Pressure(value * 6894.76);
        }
        static constexpr Pressure bar(double value)
        {
            return Pressure(value * 100000.0);
        }
        static constexpr Pressure millibar(double value)
        {
            return Pressure(value * 100.0);
        }
        static constexpr Pressure atmosphere(double value)
        {
            return Pressure(value * 101325.0);
        }
        static constexpr Pressure torr(double value)
        {
            return Pressure(value * 133.322);
        }
        static constexpr Pressure mmhg(double value)
        {
            return Pressure(value * 133.322);
        }
        static constexpr Pressure inhg(double value)
        {
            return Pressure(value * 3386.39);
        }
        static constexpr Pressure kpa(double value)
        {
            return Pressure(value * 1000.0);
        }
        static constexpr Pressure mpa(double value)
        {
            return Pressure(value * 1000000.0);
        }

        // Getter methods
        constexpr double pascals() const
        {
            return value_;
        }
        constexpr double psi() const
        {
            return value_ * 0.000145038;
        }
        constexpr double bar() const
        {
            return value_ * 1e-5;
        }
        constexpr double millibar() const
        {
            return value_ * 0.01;
        }
        constexpr double atmosphere() const
        {
            return value_ * 9.86923e-6;
        }
        constexpr double torr() const
        {
            return value_ * 0.00750062;
        }
        constexpr double mmhg() const
        {
            return value_ * 0.00750062;
        }
        constexpr double inhg() const
        {
            return value_ * 0.0002953;
        }
        constexpr double kpa() const
        {
            return value_ * 0.001;
        }
        constexpr double mpa() const
        {
            return value_ * 1e-6;
        }

        private:
        friend class UnitBase<Pressure>;
        explicit constexpr Pressure(double value) : UnitBase<Pressure>(value)
        {
        }
    };

    /**
     * @brief Acceleration measurements with meters per second squared as base unit (SI)
     */
    class Acceleration : public UnitBase<Acceleration>
    {
        public:
        // Static factory methods
        static constexpr Acceleration mps2(double value)
        {
            return Acceleration(value);
        }
        static constexpr Acceleration fps2(double value)
        {
            return Acceleration(value * 0.3048);
        }
        static constexpr Acceleration g(double value)
        {
            return Acceleration(value * 9.80665);
        }
        static constexpr Acceleration gal(double value)
        {
            return Acceleration(value * 0.01);
        }

        // Getter methods
        constexpr double mps2() const
        {
            return value_;
        }
        constexpr double fps2() const
        {
            return value_ * 3.28084;
        }
        constexpr double g() const
        {
            return value_ * 0.101972;
        }
        constexpr double gal() const
        {
            return value_ * 100.0;
        }

        private:
        friend class UnitBase<Acceleration>;
        explicit constexpr Acceleration(double value) : UnitBase<Acceleration>(value)
        {
        }
    };

    /**
     * @brief Force measurements with Newtons as base unit (SI)
     */
    class Force : public UnitBase<Force>
    {
        public:
        // Static factory methods
        static constexpr Force newtons(double value)
        {
            return Force(value);
        }
        static constexpr Force kilonewtons(double value)
        {
            return Force(value * 1000.0);
        }
        static constexpr Force pounds_force(double value)
        {
            return Force(value * 4.44822);
        }
        static constexpr Force kilopounds_force(double value)
        {
            return Force(value * 4448.22);
        }
        static constexpr Force dynes(double value)
        {
            return Force(value * 0.00001);
        }
        static constexpr Force kilogram_force(double value)
        {
            return Force(value * 9.80665);
        }

        // Getter methods
        constexpr double newtons() const
        {
            return value_;
        }
        constexpr double kilonewtons() const
        {
            return value_ * 0.001;
        }
        constexpr double pounds_force() const
        {
            return value_ * 0.224809;
        }
        constexpr double kilopounds_force() const
        {
            return value_ * 0.000224809;
        }
        constexpr double dynes() const
        {
            return value_ * 100000.0;
        }
        constexpr double kilogram_force() const
        {
            return value_ * 0.101972;
        }

        private:
        friend class UnitBase<Force>;
        explicit constexpr Force(double value) : UnitBase<Force>(value)
        {
        }
    };

    /**
     * @brief Angle measurements with radians as base unit (SI)
     */
    class Angle : public UnitBase<Angle>
    {
        public:
        // Static factory methods
        static constexpr Angle radians(double value)
        {
            return Angle(value);
        }
        static constexpr Angle degrees(double value)
        {
            return Angle(value * M_PI / 180.0);
        }
        static constexpr Angle mils(double value)
        {
            return Angle(value * M_PI / 3200.0);
        }
        static constexpr Angle milliradians(double value)
        {
            return Angle(value * 0.001);
        }
        static constexpr Angle mrad(double value)
        {
            return Angle(value * 0.001);
        }
        static constexpr Angle arcminutes(double value)
        {
            return Angle(value * M_PI / 10800.0);
        }
        static constexpr Angle moa(double value)
        {
            return Angle(value * M_PI / 10800.0);
        }
        static constexpr Angle arcseconds(double value)
        {
            return Angle(value * M_PI / 648000.0);
        }
        static constexpr Angle gradians(double value)
        {
            return Angle(value * M_PI / 200.0);
        }
        static constexpr Angle turns(double value)
        {
            return Angle(value * 2.0 * M_PI);
        }
        static constexpr Angle oclock(double value)
        {
            // Clock mode for wind EFFECT (where wind pushes bullet):
            // 12 o'clock = pushes forward (tailwind from rear) = 180°
            // 3 o'clock = pushes right (from left) = 270°
            // 6 o'clock = pushes backward (headwind from front) = 0° or 360°
            // 9 o'clock = pushes left (from right) = 90°
            // Formula: (18 - value) * 30° mod 360°
            double degrees = ((18.0 - value) * 30.0);
            if(degrees >= 360.0)
                degrees -= 360.0;
            return Angle(degrees * M_PI / 180.0);
        }

        // Getter methods
        constexpr double radians() const
        {
            return value_;
        }
        constexpr double degrees() const
        {
            return value_ * 180.0 / M_PI;
        }
        constexpr double mils() const
        {
            return value_ * 3200.0 / M_PI;
        }
        constexpr double milliradians() const
        {
            return value_ * 1000.0;
        }
        constexpr double mrad() const
        {
            return value_ * 1000.0;
        }
        constexpr double arcminutes() const
        {
            return value_ * 10800.0 / M_PI;
        }
        constexpr double moa() const
        {
            return value_ * 10800.0 / M_PI;
        }
        constexpr double arcseconds() const
        {
            return value_ * 648000.0 / M_PI;
        }
        constexpr double gradians() const
        {
            return value_ * 200.0 / M_PI;
        }
        constexpr double turns() const
        {
            return value_ / (2.0 * M_PI);
        }
        constexpr double oclock() const
        {
            // Convert radians to clock position: degrees / 30°
            return (value_ * 180.0 / M_PI) / 30.0;
        }

        private:
        friend class UnitBase<Angle>;
        explicit constexpr Angle(double value) : UnitBase<Angle>(value)
        {
        }
    };

    /**
     * @brief Angular velocity measurements with radians per second as base unit (SI)
     */
    class AngularVelocity : public UnitBase<AngularVelocity>
    {
        public:
        // Static factory methods
        static constexpr AngularVelocity radians_per_second(double value)
        {
            return AngularVelocity(value);
        }
        static constexpr AngularVelocity degrees_per_second(double value)
        {
            return AngularVelocity(value * M_PI / 180.0);
        }
        static constexpr AngularVelocity rpm(double value)
        {
            return AngularVelocity(value * 2.0 * M_PI / 60.0);
        }
        static constexpr AngularVelocity rps(double value)
        {
            return AngularVelocity(value * 2.0 * M_PI);
        }
        static constexpr AngularVelocity hertz(double value)
        {
            return AngularVelocity(value * 2.0 * M_PI);
        }

        // Getter methods
        constexpr double radians_per_second() const
        {
            return value_;
        }
        constexpr double degrees_per_second() const
        {
            return value_ * 180.0 / M_PI;
        }
        constexpr double rpm() const
        {
            return value_ * 60.0 / (2.0 * M_PI);
        }
        constexpr double rps() const
        {
            return value_ / (2.0 * M_PI);
        }
        constexpr double hertz() const
        {
            return value_ / (2.0 * M_PI);
        }

        private:
        friend class UnitBase<AngularVelocity>;
        explicit constexpr AngularVelocity(double value) : UnitBase<AngularVelocity>(value)
        {
        }
    };

    /**
     * @brief Energy measurements with Joules as base unit (SI)
     */
    class Energy : public UnitBase<Energy>
    {
        public:
        // Static factory methods
        static constexpr Energy joules(double value)
        {
            return Energy(value);
        }
        static constexpr Energy kilojoules(double value)
        {
            return Energy(value * 1000.0);
        }
        static constexpr Energy megajoules(double value)
        {
            return Energy(value * 1000000.0);
        }
        static constexpr Energy foot_pounds(double value)
        {
            return Energy(value * 1.35582);
        }
        static constexpr Energy calories(double value)
        {
            return Energy(value * 4.184);
        }
        static constexpr Energy kilocalories(double value)
        {
            return Energy(value * 4184.0);
        }
        static constexpr Energy btu(double value)
        {
            return Energy(value * 1055.06);
        }
        static constexpr Energy watt_hours(double value)
        {
            return Energy(value * 3600.0);
        }
        static constexpr Energy kilowatt_hours(double value)
        {
            return Energy(value * 3600000.0);
        }

        // Getter methods
        constexpr double joules() const
        {
            return value_;
        }
        constexpr double kilojoules() const
        {
            return value_ * 0.001;
        }
        constexpr double megajoules() const
        {
            return value_ * 1e-6;
        }
        constexpr double foot_pounds() const
        {
            return value_ * 0.737562;
        }
        constexpr double calories() const
        {
            return value_ * 0.239006;
        }
        constexpr double kilocalories() const
        {
            return value_ * 0.000239006;
        }
        constexpr double btu() const
        {
            return value_ * 0.000947817;
        }
        constexpr double watt_hours() const
        {
            return value_ * 0.000277778;
        }
        constexpr double kilowatt_hours() const
        {
            return value_ * 2.77778e-7;
        }

        private:
        friend class UnitBase<Energy>;
        explicit constexpr Energy(double value) : UnitBase<Energy>(value)
        {
        }
    };

    /**
     * @brief 3D vector template for unit types
     */
    template <typename UnitType>
    class Vector3D
    {
        public:
        UnitType x;
        UnitType y;
        UnitType z;

        constexpr Vector3D()
            : x(UnitType::fromBaseValue(0.0)), y(UnitType::fromBaseValue(0.0)), z(UnitType::fromBaseValue(0.0))
        {
        }

        constexpr Vector3D(const UnitType& x_val, const UnitType& y_val, const UnitType& z_val)
            : x(x_val), y(y_val), z(z_val)
        {
        }

        // Vector arithmetic
        constexpr Vector3D operator+(const Vector3D& other) const
        {
            return Vector3D(x + other.x, y + other.y, z + other.z);
        }

        constexpr Vector3D operator-(const Vector3D& other) const
        {
            return Vector3D(x - other.x, y - other.y, z - other.z);
        }

        constexpr Vector3D operator*(double scalar) const
        {
            return Vector3D(x * scalar, y * scalar, z * scalar);
        }

        constexpr Vector3D operator/(double scalar) const
        {
            return Vector3D(x / scalar, y / scalar, z / scalar);
        }

        constexpr Vector3D& operator+=(const Vector3D& other)
        {
            x += other.x;
            y += other.y;
            z += other.z;
            return *this;
        }

        constexpr Vector3D& operator-=(const Vector3D& other)
        {
            x -= other.x;
            y -= other.y;
            z -= other.z;
            return *this;
        }

        constexpr Vector3D& operator*=(double scalar)
        {
            x *= scalar;
            y *= scalar;
            z *= scalar;
            return *this;
        }

        constexpr Vector3D& operator/=(double scalar)
        {
            x /= scalar;
            y /= scalar;
            z /= scalar;
            return *this;
        }

        // Unary operators
        constexpr Vector3D operator-() const
        {
            return Vector3D(-x, -y, -z);
        }

        // Comparison operators
        constexpr bool operator==(const Vector3D& other) const
        {
            return x == other.x && y == other.y && z == other.z;
        }

        constexpr bool operator!=(const Vector3D& other) const
        {
            return !(*this == other);
        }

        // Vector operations
        constexpr double magnitude() const
        {
            return std::sqrt(x.baseValue() * x.baseValue() + y.baseValue() * y.baseValue() +
                             z.baseValue() * z.baseValue());
        }

        constexpr Vector3D normalized() const
        {
            double mag = magnitude();
            if(mag > 0.0)
            {
                return *this / mag;
            }
            return Vector3D();
        }

        constexpr double dot(const Vector3D& other) const
        {
            return x.baseValue() * other.x.baseValue() + y.baseValue() * other.y.baseValue() +
                   z.baseValue() * other.z.baseValue();
        }

        // For cross product, we need to return a vector of the same type
        // This is a bit tricky with units, so we'll make it work for now
        constexpr Vector3D cross(const Vector3D& other) const
        {
            // Cross product: (ay*bz - az*by, az*bx - ax*bz, ax*by - ay*bx)
            // For now, assume we're working with the same unit type
            double ax = x.baseValue();
            double ay = y.baseValue();
            double az = z.baseValue();
            double bx = other.x.baseValue();
            double by = other.y.baseValue();
            double bz = other.z.baseValue();

            return Vector3D(UnitType::meters(ay * bz - az * by), UnitType::meters(az * bx - ax * bz),
                            UnitType::meters(ax * by - ay * bx));
        }

        // String representation
        std::string toString() const
        {
            return "(" + std::to_string(x.baseValue()) + ", " + std::to_string(y.baseValue()) + ", " +
                   std::to_string(z.baseValue()) + ")";
        }
    };

    // Friend operators for scalar multiplication from the left
    template <typename UnitType>
    constexpr Vector3D<UnitType> operator*(double scalar, const Vector3D<UnitType>& vec)
    {
        return vec * scalar;
    }

    // Type aliases for common vector types
    using Position3D = Vector3D<Distance>;
    using Velocity3D = Vector3D<Velocity>;
    using Acceleration3D = Vector3D<Acceleration>;

} // namespace btk::ballistics