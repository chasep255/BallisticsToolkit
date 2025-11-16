#pragma once

#include "math/vector.h"
#include <cmath>

namespace btk::math
{

  /**
   * @brief Quaternion for 3D rotations
   *
   * Represents a quaternion q = w + xi + yj + zk
   * Used for efficient 3D orientation and rotation calculations
   */
  struct Quaternion
  {
    float w; ///< Real (scalar) component
    float x; ///< i component
    float y; ///< j component
    float z; ///< k component

    /**
     * @brief Default constructor (identity quaternion)
     */
    constexpr Quaternion() : w(1.0f), x(0.0f), y(0.0f), z(0.0f) {}

    /**
     * @brief Construct quaternion with specified components
     *
     * @param w_val Real component
     * @param x_val i component
     * @param y_val j component
     * @param z_val k component
     */
    constexpr Quaternion(float w_val, float x_val, float y_val, float z_val) : w(w_val), x(x_val), y(y_val), z(z_val) {}

    /**
     * @brief Create quaternion from axis-angle representation
     *
     * @param axis Rotation axis (should be normalized)
     * @param angle Rotation angle in radians
     * @return Quaternion representing the rotation
     */
    static Quaternion fromAxisAngle(const Vector3D& axis, float angle) {
      float half_angle = angle * 0.5f;
      float s = std::sin(half_angle);
      float c = std::cos(half_angle);
      return Quaternion(c, axis.x * s, axis.y * s, axis.z * s);
    }

    /**
     * @brief Create identity quaternion (no rotation)
     */
    static constexpr Quaternion identity() {
      return Quaternion(1.0f, 0.0f, 0.0f, 0.0f);
    }

    /**
     * @brief Quaternion multiplication
     *
     * @param other Quaternion to multiply with
     * @return Product quaternion
     */
    Quaternion operator*(const Quaternion& other) const {
      return Quaternion(
        w * other.w - x * other.x - y * other.y - z * other.z,
        w * other.x + x * other.w + y * other.z - z * other.y,
        w * other.y - x * other.z + y * other.w + z * other.x,
        w * other.z + x * other.y - y * other.x + z * other.w
      );
    }

    /**
     * @brief Compound multiplication
     */
    Quaternion& operator*=(const Quaternion& other) {
      *this = *this * other;
      return *this;
    }

    /**
     * @brief Calculate magnitude (norm)
     */
    float magnitude() const {
      return std::sqrt(w * w + x * x + y * y + z * z);
    }

    /**
     * @brief Calculate squared magnitude
     */
    constexpr float magnitudeSquared() const {
      return w * w + x * x + y * y + z * z;
    }

    /**
     * @brief Normalize quaternion to unit length
     */
    void normalize() {
      float mag = magnitude();
      if (mag > 1e-8f) {
        float inv_mag = 1.0f / mag;
        w *= inv_mag;
        x *= inv_mag;
        y *= inv_mag;
        z *= inv_mag;
      }
    }

    /**
     * @brief Return normalized copy
     */
    Quaternion normalized() const {
      Quaternion result = *this;
      result.normalize();
      return result;
    }

    /**
     * @brief Calculate conjugate (inverse rotation for unit quaternions)
     */
    constexpr Quaternion conjugate() const {
      return Quaternion(w, -x, -y, -z);
    }

    /**
     * @brief Rotate a vector by this quaternion
     *
     * @param v Vector to rotate
     * @return Rotated vector
     */
    Vector3D rotate(const Vector3D& v) const {
      // Using the formula: v' = q * v * q^-1
      // Optimized version without creating intermediate quaternions
      Vector3D qvec(x, y, z);
      Vector3D cross1 = qvec.cross(v);
      Vector3D cross2 = qvec.cross(cross1);
      return v + cross1 * (2.0f * w) + cross2 * 2.0f;
    }

    /**
     * @brief Convert quaternion to 3x3 rotation matrix (column-major)
     *
     * @param matrix Output 9-element array (column-major order)
     */
    void toRotationMatrix(float matrix[9]) const {
      float xx = x * x;
      float xy = x * y;
      float xz = x * z;
      float xw = x * w;
      float yy = y * y;
      float yz = y * z;
      float yw = y * w;
      float zz = z * z;
      float zw = z * w;

      // Column 0
      matrix[0] = 1.0f - 2.0f * (yy + zz);
      matrix[1] = 2.0f * (xy + zw);
      matrix[2] = 2.0f * (xz - yw);

      // Column 1
      matrix[3] = 2.0f * (xy - zw);
      matrix[4] = 1.0f - 2.0f * (xx + zz);
      matrix[5] = 2.0f * (yz + xw);

      // Column 2
      matrix[6] = 2.0f * (xz + yw);
      matrix[7] = 2.0f * (yz - xw);
      matrix[8] = 1.0f - 2.0f * (xx + yy);
    }

    /**
     * @brief Spherical linear interpolation between two quaternions
     *
     * @param other Target quaternion
     * @param t Interpolation parameter [0, 1]
     * @return Interpolated quaternion
     */
    Quaternion slerp(const Quaternion& other, float t) const {
      float dot = w * other.w + x * other.x + y * other.y + z * other.z;

      // Handle negative dot (shortest path)
      Quaternion target = other;
      if (dot < 0.0f) {
        target.w = -target.w;
        target.x = -target.x;
        target.y = -target.y;
        target.z = -target.z;
        dot = -dot;
      }

      // If quaternions are very close, use linear interpolation
      if (dot > 0.9995f) {
        return Quaternion(
          w + t * (target.w - w),
          x + t * (target.x - x),
          y + t * (target.y - y),
          z + t * (target.z - z)
        ).normalized();
      }

      // Calculate slerp
      float theta_0 = std::acos(dot);
      float theta = theta_0 * t;
      float sin_theta = std::sin(theta);
      float sin_theta_0 = std::sin(theta_0);

      float s0 = std::cos(theta) - dot * sin_theta / sin_theta_0;
      float s1 = sin_theta / sin_theta_0;

      return Quaternion(
        s0 * w + s1 * target.w,
        s0 * x + s1 * target.x,
        s0 * y + s1 * target.y,
        s0 * z + s1 * target.z
      );
    }

    /**
     * @brief Integrate angular velocity into quaternion orientation
     *
     * @param angular_velocity Angular velocity in rad/s
     * @param dt Time step in seconds
     */
    void integrateAngularVelocity(const Vector3D& angular_velocity, float dt) {
      // Create quaternion from angular velocity
      float angle = angular_velocity.magnitude() * dt;
      if (angle > 1e-8f) {
        Vector3D axis = angular_velocity / angular_velocity.magnitude();
        Quaternion delta = fromAxisAngle(axis, angle);
        *this = delta * (*this);
        normalize();
      }
    }
  };

} // namespace btk::math

