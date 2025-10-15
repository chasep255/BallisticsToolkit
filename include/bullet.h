#pragma once

#include "constants.h"
#include "vector.h"
#include "conversions.h"
#include <cmath>
#include <string>
#include <tuple>

namespace btk::ballistics
{

  /**
   * @brief Drag function types for ballistics calculations
   */
  enum DragFunction : uint8_t
  {
    G1 = 0,
    G7 = 1
  };

  /**
   * @brief Represents a bullet with physical properties and ballistic coefficient
   *
   * A bullet can have either a G1 or G7 BC, but not both. The drag_function
   * attribute indicates which one is being used.
   *
   * The bullet can also represent a flying bullet with position, velocity, and spin state.
   */
  class Bullet
  {
    public:
    /**
     * @brief Initialize a bullet (static properties only)
     *
     * @param weight Bullet weight in kg
     * @param diameter Bullet diameter in m
     * @param length Bullet length in m
     * @param bc Ballistic coefficient (G1 or G7 depending on drag_function)
     * @param drag_function Drag function type (default: G7)
     */
    constexpr Bullet(double weight, double diameter, double length, double bc,
                     DragFunction drag_function = DragFunction::G7)
      : weight_(weight), diameter_(diameter), length_(length), bc_(bc), drag_function_(drag_function),
        position_(0.0, 0.0, 0.0), velocity_(0.0, 0.0, 0.0), spin_rate_(0.0), has_flight_state_(false)
    {
    }

    /**
     * @brief Initialize a flying bullet with 4DOF state
     *
     * @param bullet The bullet object with physical properties and BC
     * @param position 3D position vector in m
     * @param velocity 3D velocity vector in m/s
     * @param spin_rate Spin rate around the velocity vector in rad/s (for Magnus effects)
     */
    constexpr Bullet(const Bullet& bullet, const Vector3D& position, const Vector3D& velocity, double spin_rate)
      : weight_(bullet.weight_), diameter_(bullet.diameter_), length_(bullet.length_), bc_(bullet.bc_),
        drag_function_(bullet.drag_function_), position_(position), velocity_(velocity), spin_rate_(spin_rate),
        has_flight_state_(true)
    {
    }

    /**
     * @brief Initialize a flying bullet with 4DOF state (legacy constructor)
     *
     * @param bullet The bullet object with physical properties and BC
     * @param position_x Position along X axis in m (downrange/horizontal)
     * @param position_y Position along Y axis in m (crossrange/windage)
     * @param position_z Position along Z axis in m (vertical/elevation)
     * @param velocity_x Velocity component along X axis in m/s
     * @param velocity_y Velocity component along Y axis in m/s
     * @param velocity_z Velocity component along Z axis in m/s
     * @param spin_rate Spin rate around the velocity vector in rad/s (for Magnus effects)
     */
    constexpr Bullet(const Bullet& bullet, double position_x, double position_y, double position_z,
                     double velocity_x, double velocity_y, double velocity_z, double spin_rate)
      : weight_(bullet.weight_), diameter_(bullet.diameter_), length_(bullet.length_), bc_(bullet.bc_),
        drag_function_(bullet.drag_function_), position_(position_x, position_y, position_z),
        velocity_(velocity_x, velocity_y, velocity_z), spin_rate_(spin_rate), has_flight_state_(true)
    {
    }

    // Getters (all return SI base units)
    constexpr double getWeight() const { return weight_; } // kg
    constexpr double getDiameter() const { return diameter_; } // m
    constexpr double getLength() const { return length_; } // m
    constexpr double getBc() const { return bc_; }
    constexpr DragFunction getDragFunction() const { return drag_function_; }

    /**
     * @brief Calculate sectional density (weight/diameter²)
     *
     * @return Sectional density in kg/m² (SI units)
     */
    constexpr double getSectionalDensity() const
    {
      return weight_ / (diameter_ * diameter_);
    }



    // Flight state methods (only valid if has_flight_state_ is true)
    constexpr bool hasFlightState() const { return has_flight_state_; }

    constexpr const Vector3D& getPosition() const { return position_; } // m
    constexpr const Vector3D& getVelocity() const { return velocity_; } // m/s

    // Individual component getters (for compatibility)
    constexpr double getPositionX() const { return position_.x; } // m
    constexpr double getPositionY() const { return position_.y; } // m
    constexpr double getPositionZ() const { return position_.z; } // m
    constexpr double getVelocityX() const { return velocity_.x; } // m/s
    constexpr double getVelocityY() const { return velocity_.y; } // m/s
    constexpr double getVelocityZ() const { return velocity_.z; } // m/s
    constexpr double getSpinRate() const { return spin_rate_; } // rad/s

    // Compute spin rate from signed twist pitch (meters/turn). RH>0, LH<0
    static constexpr double computeSpinRateFromTwist(double speed_mps, double twist_pitch_m_signed)
    {
      if(twist_pitch_m_signed == 0.0)
        return 0.0;
      double omega_mag = 2.0 * M_PI * (speed_mps / std::abs(twist_pitch_m_signed));
      return (twist_pitch_m_signed > 0.0 ? omega_mag : -omega_mag);
    }

    /**
     * @brief Calculate total velocity magnitude from components
     */
    constexpr double getTotalVelocity() const
    {
      return velocity_.magnitude(); // m/s
    }

    /**
     * @brief Calculate elevation angle (pitch) from velocity vector
     *
     * @return Angle above horizontal plane in radians
     */
    constexpr double getElevationAngle() const
    {
      return std::atan2(velocity_.z, velocity_.x); // rad
    }

    /**
     * @brief Calculate azimuth angle (bearing/yaw) from velocity vector
     *
     * @return Horizontal angle from X-axis in radians (downrange direction)
     */
    constexpr double getAzimuthAngle() const
    {
      return std::atan2(velocity_.y, velocity_.x); // rad
    }

    private:
    double weight_; // kg
    double diameter_; // m
    double length_; // m
    double bc_;
    DragFunction drag_function_;

    // Flight state (only valid if has_flight_state_ is true)
    Vector3D position_; // m
    Vector3D velocity_; // m/s
    double spin_rate_; // rad/s
    bool has_flight_state_;
  };

} // namespace btk::ballistics
