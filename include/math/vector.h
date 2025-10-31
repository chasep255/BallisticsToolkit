#pragma once

#include <cmath>
#include <string>

namespace btk::math
{

  /**
   * @brief 2D vector with float components
   *
   * Provides basic 2D vector operations for ballistics calculations.
   * All operations are constexpr for compile-time evaluation.
   */
  struct Vector2D
  {
    float x; ///< X component
    float y; ///< Y component

    /**
     * @brief Default constructor (zero vector)
     */
    constexpr Vector2D() : x(0.0f), y(0.0f) {}

    /**
     * @brief Construct vector with specified components
     *
     * @param x_val X component
     * @param y_val Y component
     */
    constexpr Vector2D(float x_val, float y_val) : x(x_val), y(y_val) {}

    // Basic operators
    /**
     * @brief Vector addition
     *
     * @param other Vector to add
     * @return Sum of vectors
     */
    constexpr Vector2D operator+(const Vector2D& other) const { return Vector2D(x + other.x, y + other.y); }

    /**
     * @brief Vector subtraction
     *
     * @param other Vector to subtract
     * @return Difference of vectors
     */
    constexpr Vector2D operator-(const Vector2D& other) const { return Vector2D(x - other.x, y - other.y); }

    /**
     * @brief Scalar multiplication
     *
     * @param scalar Scalar to multiply by
     * @return Scaled vector
     */
    constexpr Vector2D operator*(float scalar) const { return Vector2D(x * scalar, y * scalar); }

    /**
     * @brief Element-wise multiplication
     *
     * @param other Vector to multiply with
     * @return Element-wise product
     */
    constexpr Vector2D operator*(const Vector2D& other) { return Vector2D(x * other.x, y * other.y); }

    /**
     * @brief Scalar division
     *
     * @param scalar Scalar to divide by
     * @return Scaled vector
     */
    constexpr Vector2D operator/(float scalar) const { return Vector2D(x / scalar, y / scalar); }

    /**
     * @brief Element-wise division
     *
     * @param other Vector to divide by
     * @return Element-wise quotient
     */
    constexpr Vector2D operator/(const Vector2D& other) const { return Vector2D(x / other.x, y / other.y); }

    // Scalar addition and subtraction
    /**
     * @brief Add scalar to each component
     *
     * @param scalar Scalar to add
     * @return Vector with scalar added to each component
     */
    constexpr Vector2D operator+(float scalar) const { return Vector2D(x + scalar, y + scalar); }

    /**
     * @brief Subtract scalar from each component
     *
     * @param scalar Scalar to subtract
     * @return Vector with scalar subtracted from each component
     */
    constexpr Vector2D operator-(float scalar) const { return Vector2D(x - scalar, y - scalar); }

    /**
     * @brief Unary minus (negation)
     *
     * @return Negated vector
     */
    constexpr Vector2D operator-() const { return Vector2D(-x, -y); }

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

    Vector2D& operator*=(float scalar)
    {
      x *= scalar;
      y *= scalar;
      return *this;
    }

    Vector2D& operator/=(float scalar)
    {
      x /= scalar;
      y /= scalar;
      return *this;
    }

    // Vector operations
    /**
     * @brief Calculate vector magnitude (length)
     *
     * @return Vector magnitude
     */
    constexpr float magnitude() const { return std::sqrt(x * x + y * y); }

    /**
     * @brief Get normalized (unit) vector
     *
     * @return Unit vector in same direction, or zero vector if magnitude is zero
     */
    constexpr Vector2D normalized() const
    {
      float mag = magnitude();
      if(mag > 0.0f)
        return *this / mag;
      return Vector2D();
    }

    /**
     * @brief Calculate dot product
     *
     * @param other Vector to dot with
     * @return Dot product result
     */
    constexpr float dot(const Vector2D& other) const { return x * other.x + y * other.y; }

    /**
     * @brief Linear interpolation between vectors
     *
     * @param other Target vector
     * @param t Interpolation parameter (0.0f = this vector, 1.0f = other vector)
     * @return Interpolated vector
     */
    constexpr Vector2D lerp(const Vector2D& other, float t) const { return Vector2D(x + t * (other.x - x), y + t * (other.y - y)); }
  };

  // Friend operators for scalar operations from left
  constexpr Vector2D operator*(float scalar, const Vector2D& vec) { return vec * scalar; }

  constexpr Vector2D operator+(float scalar, const Vector2D& vec) { return vec + scalar; }

  constexpr Vector2D operator-(float scalar, const Vector2D& vec) { return Vector2D(scalar - vec.x, scalar - vec.y); }

  /**
   * @brief 3D vector with float components
   *
   * Provides 3D vector operations for ballistics calculations including position,
   * velocity, and acceleration vectors. All operations are constexpr for compile-time evaluation.
   */
  struct Vector3D
  {
    float x; ///< X component
    float y; ///< Y component
    float z; ///< Z component

    /**
     * @brief Default constructor (zero vector)
     */
    constexpr Vector3D() : x(0.0f), y(0.0f), z(0.0f) {}

    /**
     * @brief Construct vector with specified components
     *
     * @param x_val X component
     * @param y_val Y component
     * @param z_val Z component
     */
    constexpr Vector3D(float x_val, float y_val, float z_val) : x(x_val), y(y_val), z(z_val) {}

    // Basic operators
    /**
     * @brief Vector addition
     *
     * @param other Vector to add
     * @return Sum of vectors
     */
    constexpr Vector3D operator+(const Vector3D& other) const { return Vector3D(x + other.x, y + other.y, z + other.z); }

    /**
     * @brief Vector subtraction
     *
     * @param other Vector to subtract
     * @return Difference of vectors
     */
    constexpr Vector3D operator-(const Vector3D& other) const { return Vector3D(x - other.x, y - other.y, z - other.z); }

    /**
     * @brief Scalar multiplication
     *
     * @param scalar Scalar to multiply by
     * @return Scaled vector
     */
    constexpr Vector3D operator*(float scalar) const { return Vector3D(x * scalar, y * scalar, z * scalar); }

    /**
     * @brief Element-wise multiplication
     *
     * @param other Vector to multiply with
     * @return Element-wise product
     */
    constexpr Vector3D operator*(const Vector3D& other) { return Vector3D(x * other.x, y * other.y, z * other.z); }

    /**
     * @brief Element-wise division
     *
     * @param other Vector to divide by
     * @return Element-wise quotient
     */
    constexpr Vector3D operator/(const Vector3D& other) { return Vector3D(x / other.x, y / other.y, z / other.z); }

    /**
     * @brief Scalar division
     *
     * @param scalar Scalar to divide by
     * @return Scaled vector
     */
    constexpr Vector3D operator/(float scalar) const { return Vector3D(x / scalar, y / scalar, z / scalar); }

    // Scalar addition and subtraction
    /**
     * @brief Add scalar to each component
     *
     * @param scalar Scalar to add
     * @return Vector with scalar added to each component
     */
    constexpr Vector3D operator+(float scalar) const { return Vector3D(x + scalar, y + scalar, z + scalar); }

    /**
     * @brief Subtract scalar from each component
     *
     * @param scalar Scalar to subtract
     * @return Vector with scalar subtracted from each component
     */
    constexpr Vector3D operator-(float scalar) const { return Vector3D(x - scalar, y - scalar, z - scalar); }

    /**
     * @brief Unary minus (negation)
     *
     * @return Negated vector
     */
    constexpr Vector3D operator-() const { return Vector3D(-x, -y, -z); }

    // Compound assignment
    /**
     * @brief Compound assignment addition
     *
     * @param other Vector to add
     * @return Reference to this vector
     */
    Vector3D& operator+=(const Vector3D& other)
    {
      x += other.x;
      y += other.y;
      z += other.z;
      return *this;
    }

    /**
     * @brief Compound assignment subtraction
     *
     * @param other Vector to subtract
     * @return Reference to this vector
     */
    Vector3D& operator-=(const Vector3D& other)
    {
      x -= other.x;
      y -= other.y;
      z -= other.z;
      return *this;
    }

    /**
     * @brief Compound assignment scalar multiplication
     *
     * @param scalar Scalar to multiply by
     * @return Reference to this vector
     */
    Vector3D& operator*=(float scalar)
    {
      x *= scalar;
      y *= scalar;
      z *= scalar;
      return *this;
    }

    /**
     * @brief Compound assignment scalar division
     *
     * @param scalar Scalar to divide by
     * @return Reference to this vector
     */
    Vector3D& operator/=(float scalar)
    {
      x /= scalar;
      y /= scalar;
      z /= scalar;
      return *this;
    }

    // Vector operations
    /**
     * @brief Calculate vector magnitude (length)
     *
     * @return Vector magnitude
     */
    constexpr float magnitude() const { return std::sqrt(x * x + y * y + z * z); }

    /**
     * @brief Get normalized (unit) vector
     *
     * @return Unit vector in same direction, or zero vector if magnitude is zero
     */
    constexpr Vector3D normalized() const
    {
      float mag = magnitude();
      if(mag > 0.0f)
        return *this / mag;
      return Vector3D();
    }

    /**
     * @brief Calculate dot product
     *
     * @param other Vector to dot with
     * @return Dot product result
     */
    constexpr float dot(const Vector3D& other) const { return x * other.x + y * other.y + z * other.z; }

    /**
     * @brief Calculate cross product
     *
     * @param other Vector to cross with
     * @return Cross product result (perpendicular to both vectors)
     */
    constexpr Vector3D cross(const Vector3D& other) const { return Vector3D(y * other.z - z * other.y, z * other.x - x * other.z, x * other.y - y * other.x); }

    /**
     * @brief Linear interpolation between vectors
     *
     * @param other Target vector
     * @param t Interpolation parameter (0.0f = this vector, 1.0f = other vector)
     * @return Interpolated vector
     */
    constexpr Vector3D lerp(const Vector3D& other, float t) const { return Vector3D(x + t * (other.x - x), y + t * (other.y - y), z + t * (other.z - z)); }
  };

  // Friend operators for scalar operations from left
  /**
   * @brief Scalar multiplication from left
   *
   * @param scalar Scalar to multiply by
   * @param vec Vector to multiply
   * @return Scaled vector
   */
  constexpr Vector3D operator*(float scalar, const Vector3D& vec) { return vec * scalar; }

  /**
   * @brief Scalar addition from left
   *
   * @param scalar Scalar to add
   * @param vec Vector to add to
   * @return Vector with scalar added to each component
   */
  constexpr Vector3D operator+(float scalar, const Vector3D& vec) { return vec + scalar; }

  /**
   * @brief Scalar subtraction from left
   *
   * @param scalar Scalar to subtract from
   * @param vec Vector to subtract
   * @return Vector with scalar minus each component
   */
  constexpr Vector3D operator-(float scalar, const Vector3D& vec) { return Vector3D(scalar - vec.x, scalar - vec.y, scalar - vec.z); }

  /**
   * @brief Free function for linear interpolation (alternative syntax)
   *
   * @param a First vector
   * @param b Second vector
   * @param t Interpolation parameter (0.0f = a, 1.0f = b)
   * @return Interpolated vector
   */
  constexpr Vector3D lerp(const Vector3D& a, const Vector3D& b, float t) { return a.lerp(b, t); }
} // namespace btk::math
