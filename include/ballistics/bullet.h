#pragma once

#include "math/conversions.h"
#include "math/vector.h"
#include "physics/constants.h"
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
    constexpr Bullet(float weight, float diameter, float length, float bc, DragFunction drag_function = DragFunction::G7)
      : weight_(weight), diameter_(diameter), length_(length), bc_(bc), drag_function_(drag_function), position_(0.0f, 0.0f, 0.0f), velocity_(0.0f, 0.0f, 0.0f), spin_rate_(0.0f),
        beta_eq_right_(0.0f), beta_eq_up_(0.0f), has_flight_state_(false)
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
    constexpr Bullet(const Bullet& bullet, const btk::math::Vector3D& position, const btk::math::Vector3D& velocity, float spin_rate)
      : weight_(bullet.weight_), diameter_(bullet.diameter_), length_(bullet.length_), bc_(bullet.bc_), drag_function_(bullet.drag_function_), position_(position), velocity_(velocity),
        spin_rate_(spin_rate), beta_eq_right_(bullet.beta_eq_right_), beta_eq_up_(bullet.beta_eq_up_), has_flight_state_(true)
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
    constexpr Bullet(const Bullet& bullet, float position_x, float position_y, float position_z, float velocity_x, float velocity_y, float velocity_z, float spin_rate)
      : weight_(bullet.weight_), diameter_(bullet.diameter_), length_(bullet.length_), bc_(bullet.bc_), drag_function_(bullet.drag_function_), position_(position_x, position_y, position_z),
        velocity_(velocity_x, velocity_y, velocity_z), spin_rate_(spin_rate), beta_eq_right_(bullet.beta_eq_right_), beta_eq_up_(bullet.beta_eq_up_), has_flight_state_(true)
    {
    }

    // Getters (all return SI base units)
    constexpr float getWeight() const { return weight_; }     // kg
    constexpr float getDiameter() const { return diameter_; } // m
    constexpr float getLength() const { return length_; }     // m
    constexpr float getBc() const { return bc_; }
    constexpr DragFunction getDragFunction() const { return drag_function_; }

    /**
     * @brief Calculate sectional density (weight/diameter²)
     *
     * @return Sectional density in kg/m² (SI units)
     */
    constexpr float getSectionalDensity() const { return weight_ / (diameter_ * diameter_); }

    // Flight state methods (only valid if has_flight_state_ is true)
    constexpr bool hasFlightState() const { return has_flight_state_; }

    constexpr const btk::math::Vector3D& getPosition() const { return position_; } // m
    constexpr const btk::math::Vector3D& getVelocity() const { return velocity_; } // m/s

    // Individual component getters (for compatibility)
    constexpr float getPositionX() const { return position_.x; } // m
    constexpr float getPositionY() const { return position_.y; } // m
    constexpr float getPositionZ() const { return position_.z; } // m
    constexpr float getVelocityX() const { return velocity_.x; } // m/s
    constexpr float getVelocityY() const { return velocity_.y; } // m/s
    constexpr float getVelocityZ() const { return velocity_.z; } // m/s
    constexpr float getSpinRate() const { return spin_rate_; }   // rad/s

    // Crosswind lag state getters and setters (equilibrium lateral angles)
    constexpr float getBetaEqRight() const { return beta_eq_right_; } // rad
    constexpr float getBetaEqUp() const { return beta_eq_up_; }     // rad
    void setBetaEqRight(float beta) { beta_eq_right_ = beta; }
    void setBetaEqUp(float beta) { beta_eq_up_ = beta; }

    // Compute spin rate from signed twist pitch (meters/turn). RH>0, LH<0
    static constexpr float computeSpinRateFromTwist(float speed_mps, float twist_pitch_m_signed)
    {
      if(twist_pitch_m_signed == 0.0f)
        return 0.0f;
      float omega_mag = 2.0f * M_PI_F * (speed_mps / std::abs(twist_pitch_m_signed));
      return (twist_pitch_m_signed > 0.0f ? omega_mag : -omega_mag);
    }

    /**
     * @brief Calculate total velocity magnitude from components
     */
    constexpr float getTotalVelocity() const
    {
      return velocity_.magnitude(); // m/s
    }

    /**
     * @brief Calculate elevation angle (pitch) from velocity vector
     *
     * @return Angle above horizontal plane in radians
     */
    constexpr float getElevationAngle() const
    {
      return std::atan2(velocity_.z, velocity_.x); // rad
    }

    /**
     * @brief Calculate azimuth angle (bearing/yaw) from velocity vector
     *
     * @return Horizontal angle from X-axis in radians (downrange direction)
     */
    constexpr float getAzimuthAngle() const
    {
      return std::atan2(velocity_.y, velocity_.x); // rad
    }

    constexpr float estimateSpinMomentOfInertia() const
    {
      constexpr float K_RG = 0.30f;               // radius-of-gyration factor (×diameter)
      float r_eff = K_RG * diameter_;
      return weight_ * r_eff * r_eff;             // m * (k_rg * d)^2
    }
    

    private:
    float weight_;   // kg
    float diameter_; // m
    float length_;   // m
    float bc_;
    DragFunction drag_function_;

    // Flight state (only valid if has_flight_state_ is true)
    btk::math::Vector3D position_; // m
    btk::math::Vector3D velocity_; // m/s
    float spin_rate_;              // rad/s
    float beta_eq_right_;          // rad - equilibrium lateral angle (right component)
    float beta_eq_up_;             // rad - equilibrium lateral angle (up-in-plane component)
    bool has_flight_state_;
  };

} // namespace btk::ballistics
