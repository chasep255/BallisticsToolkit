#pragma once

#include <cmath>
#include <string>

namespace btk::ballistics
{

  /**
   * @brief 2D vector with double components
   */
  struct Vector2D
  {
    double x;
    double y;

    constexpr Vector2D() : x(0.0), y(0.0) {}
    constexpr Vector2D(double x_val, double y_val) : x(x_val), y(y_val) {}

    // Basic operators
    constexpr Vector2D operator+(const Vector2D& other) const
    {
      return Vector2D(x + other.x, y + other.y);
    }

    constexpr Vector2D operator-(const Vector2D& other) const
    {
      return Vector2D(x - other.x, y - other.y);
    }

    constexpr Vector2D operator*(double scalar) const
    {
      return Vector2D(x * scalar, y * scalar);
    }

    constexpr Vector2D operator*(const Vector2D& other)
    {
      return Vector2D(x * other.x, y * other.y);
    }

    constexpr Vector2D operator/(double scalar) const
    {
      return Vector2D(x / scalar, y / scalar);
    }

    constexpr Vector2D operator/(const Vector2D& other) const
    {
      return Vector2D(x / other.x, y / other.y);
    }

    // Scalar addition and subtraction
    constexpr Vector2D operator+(double scalar) const
    {
      return Vector2D(x + scalar, y + scalar);
    }

    constexpr Vector2D operator-(double scalar) const
    {
      return Vector2D(x - scalar, y - scalar);
    }

    constexpr Vector2D operator-() const
    {
      return Vector2D(-x, -y);
    }

    // Compound assignment
    Vector2D& operator+=(const Vector2D& other)
    {
      x += other.x;
      y += other.y;
      return *this;
    }

    Vector2D& operator-=(const Vector2D& other)
    {
      x -= other.x;
      y -= other.y;
      return *this;
    }

    Vector2D& operator*=(double scalar)
    {
      x *= scalar;
      y *= scalar;
      return *this;
    }

    Vector2D& operator/=(double scalar)
    {
      x /= scalar;
      y /= scalar;
      return *this;
    }
    

    // Vector operations
    constexpr double magnitude() const
    {
      return std::sqrt(x * x + y * y);
    }

    constexpr Vector2D normalized() const
    {
      double mag = magnitude();
      if(mag > 0.0)
        return *this / mag;
      return Vector2D();
    }

    constexpr double dot(const Vector2D& other) const
    {
      return x * other.x + y * other.y;
    }

    constexpr Vector2D lerp(const Vector2D& other, double t) const
    {
      return Vector2D(x + t * (other.x - x), y + t * (other.y - y));
    }

  };

  // Friend operators for scalar operations from left
  constexpr Vector2D operator*(double scalar, const Vector2D& vec)
  {
    return vec * scalar;
  }

  constexpr Vector2D operator+(double scalar, const Vector2D& vec)
  {
    return vec + scalar;
  }

  constexpr Vector2D operator-(double scalar, const Vector2D& vec)
  {
    return Vector2D(scalar - vec.x, scalar - vec.y);
  }

  /**
   * @brief 3D vector with double components
   */
  struct Vector3D
  {
    double x;
    double y;
    double z;

    constexpr Vector3D() : x(0.0), y(0.0), z(0.0) {}
    constexpr Vector3D(double x_val, double y_val, double z_val) : x(x_val), y(y_val), z(z_val) {}

    // Basic operators
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

    constexpr Vector3D operator*(const Vector3D& other)
    {
      return Vector3D(x * other.x, y * other.y, z * other.z);
    }

    constexpr Vector3D operator/(const Vector3D& other)
    {
      return Vector3D(x / other.x, y / other.y, z / other.z);
    }

    constexpr Vector3D operator/(double scalar) const
    {
      return Vector3D(x / scalar, y / scalar, z / scalar);
    }

    // Scalar addition and subtraction
    constexpr Vector3D operator+(double scalar) const
    {
      return Vector3D(x + scalar, y + scalar, z + scalar);
    }

    constexpr Vector3D operator-(double scalar) const
    {
      return Vector3D(x - scalar, y - scalar, z - scalar);
    }

    constexpr Vector3D operator-() const
    {
      return Vector3D(-x, -y, -z);
    }

    // Compound assignment
    Vector3D& operator+=(const Vector3D& other)
    {
      x += other.x;
      y += other.y;
      z += other.z;
      return *this;
    }

    Vector3D& operator-=(const Vector3D& other)
    {
      x -= other.x;
      y -= other.y;
      z -= other.z;
      return *this;
    }

    Vector3D& operator*=(double scalar)
    {
      x *= scalar;
      y *= scalar;
      z *= scalar;
      return *this;
    }

    Vector3D& operator/=(double scalar)
    {
      x /= scalar;
      y /= scalar;
      z /= scalar;
      return *this;
    }

    // Vector operations
    constexpr double magnitude() const
    {
      return std::sqrt(x * x + y * y + z * z);
    }

    constexpr Vector3D normalized() const
    {
      double mag = magnitude();
      if(mag > 0.0)
        return *this / mag;
      return Vector3D();
    }

    constexpr double dot(const Vector3D& other) const
    {
      return x * other.x + y * other.y + z * other.z;
    }

    constexpr Vector3D cross(const Vector3D& other) const
    {
      return Vector3D(
        y * other.z - z * other.y,
        z * other.x - x * other.z,
        x * other.y - y * other.x
      );
    }

    constexpr Vector3D lerp(const Vector3D& other, double t) const
    {
      return Vector3D(
        x + t * (other.x - x),
        y + t * (other.y - y),
        z + t * (other.z - z)
      );
    }

  };

  // Friend operators for scalar operations from left
  constexpr Vector3D operator*(double scalar, const Vector3D& vec)
  {
    return vec * scalar;
  }

  constexpr Vector3D operator+(double scalar, const Vector3D& vec)
  {
    return vec + scalar;
  }

  constexpr Vector3D operator-(double scalar, const Vector3D& vec)
  {
    return Vector3D(scalar - vec.x, scalar - vec.y, scalar - vec.z);
  }

  // Free function lerp for alternative syntax
  constexpr Vector3D lerp(const Vector3D& a, const Vector3D& b, double t)
  {
    return a.lerp(b, t);
  }

  // Type aliases for common vector types
  using Position3D = Vector3D;
  using Velocity3D = Vector3D;
  using Acceleration3D = Vector3D;

} // namespace btk::ballistics
