#pragma once

#include "constants.h"
#include "units.h"
#include <cmath>
#include <string>
#include <tuple>

namespace btk::ballistics
{

    /**
     * @brief Represents a bullet with physical properties and ballistic coefficient
     *
     * A bullet can have either a G1 or G7 BC, but not both. The drag_function
     * attribute indicates which one is being used.
     */
    class Bullet
    {
        public:
        /**
         * @brief Initialize a bullet
         *
         * @param weight Bullet weight
         * @param diameter Bullet diameter
         * @param length Bullet length
         * @param bc Ballistic coefficient (G1 or G7 depending on drag_function)
         * @param drag_function Drag function type (default: G7)
         */
        constexpr Bullet(const Weight& weight, const Distance& diameter, const Distance& length, double bc,
                         DragFunction drag_function = DragFunction::G7)
            : weight_(weight), diameter_(diameter), length_(length), bc_(bc), drag_function_(drag_function)
        {
        }

        // Getters
        constexpr const Weight& getWeight() const
        {
            return weight_;
        }
        constexpr const Distance& getDiameter() const
        {
            return diameter_;
        }
        constexpr const Distance& getLength() const
        {
            return length_;
        }
        constexpr double getBc() const
        {
            return bc_;
        }
        constexpr DragFunction getDragFunction() const
        {
            return drag_function_;
        }

        /**
         * @brief Calculate sectional density (weight/diameter²)
         *
         * @return Sectional density in lb/in² for standard ballistics calculations
         */
        constexpr double getSectionalDensity() const
        {
            return weight_.pounds() / (diameter_.inches() * diameter_.inches());
        }

        std::string toString() const
        {
            return std::to_string(weight_.grains()) + "gr, BC=" + std::to_string(bc_) +
                   (drag_function_ == DragFunction::G1 ? " (G1)" : " (G7)");
        }

        std::string toDetailedString() const
        {
            return "Bullet(" + std::to_string(weight_.grains()) + "gr, " + std::to_string(diameter_.inches()) + "\", " +
                   std::to_string(length_.inches()) + "\", BC=" + std::to_string(bc_) +
                   (drag_function_ == DragFunction::G1 ? ", G1)" : ", G7)");
        }

        private:
        Weight weight_;
        Distance diameter_;
        Distance length_;
        double bc_;
        DragFunction drag_function_;
    };

    /**
     * @brief Represents a bullet in flight with 4DOF state (position, velocity, spin)
     *
     * This class represents the instantaneous state of a bullet in flight using
     * a 4 degree-of-freedom model:
     * - 3 DOF: Position (x, y, z) and velocity (vx, vy, vz)
     * - 1 DOF: Spin rate around the velocity vector (for Magnus/spin drift effects)
     *
     * The velocity vector itself defines the bullet's direction - no separate
     * orientation angles are needed.
     */
    class FlyingBullet : public Bullet
    {
        public:
        /**
         * @brief Initialize a flying bullet with 4DOF state
         *
         * @param bullet The bullet object with physical properties and BC
         * @param position 3D position vector
         * @param velocity 3D velocity vector
         * @param spin_rate Spin rate around the velocity vector (for Magnus effects)
         */
        constexpr FlyingBullet(const Bullet& bullet, const Position3D& position, const Velocity3D& velocity,
                               const AngularVelocity& spin_rate)
            : Bullet(bullet), position_(position), velocity_(velocity), spin_rate_(spin_rate)
        {
        }

        /**
         * @brief Initialize a flying bullet with 4DOF state (legacy constructor)
         *
         * @param bullet The bullet object with physical properties and BC
         * @param position_x Position along X axis (downrange/horizontal)
         * @param position_y Position along Y axis (crossrange/windage)
         * @param position_z Position along Z axis (vertical/elevation)
         * @param velocity_x Velocity component along X axis
         * @param velocity_y Velocity component along Y axis
         * @param velocity_z Velocity component along Z axis
         * @param spin_rate Spin rate around the velocity vector (for Magnus effects)
         */
        constexpr FlyingBullet(const Bullet& bullet, const Distance& position_x, const Distance& position_y,
                               const Distance& position_z, const Velocity& velocity_x, const Velocity& velocity_y,
                               const Velocity& velocity_z, const AngularVelocity& spin_rate)
            : Bullet(bullet), position_(position_x, position_y, position_z),
              velocity_(velocity_x, velocity_y, velocity_z), spin_rate_(spin_rate)
        {
        }

        // Getters
        constexpr const Position3D& getPosition() const
        {
            return position_;
        }
        constexpr const Velocity3D& getVelocity() const
        {
            return velocity_;
        }
        
        // Individual component getters (for compatibility)
        constexpr const Distance& getPositionX() const
        {
            return position_.x;
        }
        constexpr const Distance& getPositionY() const
        {
            return position_.y;
        }
        constexpr const Distance& getPositionZ() const
        {
            return position_.z;
        }
        constexpr const Velocity& getVelocityX() const
        {
            return velocity_.x;
        }
        constexpr const Velocity& getVelocityY() const
        {
            return velocity_.y;
        }
        constexpr const Velocity& getVelocityZ() const
        {
            return velocity_.z;
        }
        constexpr const AngularVelocity& getSpinRate() const
        {
            return spin_rate_;
        }

        /**
         * @brief Calculate total velocity magnitude from components
         */
        constexpr Velocity getTotalVelocity() const
        {
            return Velocity::mps(velocity_.magnitude());
        }

        /**
         * @brief Calculate elevation angle (pitch) from velocity vector
         *
         * @return Angle above horizontal plane
         */
        constexpr Angle getElevationAngle() const
        {
            return Angle::radians(std::atan2(velocity_.z.mps(), velocity_.x.mps()));
        }

        /**
         * @brief Calculate azimuth angle (bearing/yaw) from velocity vector
         *
         * @return Horizontal angle from X-axis (downrange direction)
         */
        constexpr Angle getAzimuthAngle() const
        {
            return Angle::radians(std::atan2(velocity_.y.mps(), velocity_.x.mps()));
        }

        std::string toString() const
        {
            return Bullet::toString() + " at " + position_.toString() + " m";
        }

        std::string toDetailedString() const
        {
            return "FlyingBullet(" + Bullet::toDetailedString() + ", pos=" + position_.toString() + " m, " +
                   "vel=" + velocity_.toString() + " m/s, " +
                   "spin=" + std::to_string(spin_rate_.radians_per_second()) + " rad/s)";
        }

        private:
        // Position and velocity as 3D vectors
        Position3D position_;
        Velocity3D velocity_;

        // Spin rate (4th DOF - enables spin drift/Magnus force)
        AngularVelocity spin_rate_;
    };

} // namespace btk::ballistics
