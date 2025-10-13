#include "trajectory.h"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace btk
{
    namespace ballistics
    {

        // TrajectoryPoint implementation
        TrajectoryPoint::TrajectoryPoint(const Time& time, const Bullet& state) : time_(time), state_(state)
        {
        }

        Distance TrajectoryPoint::getDistance() const
        {
            return state_.getPositionX();
        }

        Velocity TrajectoryPoint::getVelocity() const
        {
            return state_.getTotalVelocity();
        }

        Energy TrajectoryPoint::getKineticEnergy() const
        {
            // KE = 0.5 * m * v^2
            double mass_kg = state_.getWeight().kilograms();
            double velocity_mps = state_.getTotalVelocity().mps();
            double energy_joules = 0.5 * mass_kg * velocity_mps * velocity_mps;
            return Energy::joules(energy_joules);
        }

        std::string TrajectoryPoint::toString() const
        {
            std::ostringstream oss;
            oss << "TrajectoryPoint(t=" << std::fixed << std::setprecision(3) << time_.seconds()
                << "s, d=" << std::setprecision(1) << getDistance().yards() << "yd, " << "v=" << getVelocity().fps()
                << "fps)";
            return oss.str();
        }

        // Trajectory implementation
        Trajectory::Trajectory()
        {
        }

        void Trajectory::addPoint(const Time& time, const Bullet& state)
        {
            points_.emplace_back(time, state);
        }

        const TrajectoryPoint& Trajectory::getPoint(size_t index) const
        {
            if(index >= points_.size())
            {
                throw std::out_of_range("Trajectory point index out of range");
            }
            return points_[index];
        }

        TrajectoryPoint Trajectory::atDistance(const Distance& distance) const
        {
            if(points_.empty())
            {
                return TrajectoryPoint(Time::nan(), Bullet(Weight::zero(), Distance::zero(), Distance::zero(), 0.0));
            }

            double target_distance_m = distance.meters();

            // Find the two points that bracket the target distance
            for(size_t i = 0; i < points_.size() - 1; ++i)
            {
                double dist1 = points_[i].getDistance().meters();
                double dist2 = points_[i + 1].getDistance().meters();

                if(target_distance_m >= dist1 && target_distance_m <= dist2)
                {
                    // Interpolate between the two points
                    double t = (target_distance_m - dist1) / (dist2 - dist1);

                    // Interpolate time
                    Time interp_time =
                        Time::seconds(points_[i].getTime().seconds() +
                                      t * (points_[i + 1].getTime().seconds() - points_[i].getTime().seconds()));

                    // Interpolate state
                    Bullet interp_state = interpolate(points_[i], points_[i + 1], distance);

                    return TrajectoryPoint(interp_time, interp_state);
                }
            }

            // Check if target distance is beyond the last point
            if(target_distance_m >= points_.back().getDistance().meters())
            {
                return points_.back();
            }

            // Return TrajectoryPoint with NaN time to signal invalid
            Bullet dummyBullet(Weight::zero(), Distance::zero(), Distance::zero(), 0.0);
            return TrajectoryPoint(Time::nan(), dummyBullet);
        }

        std::optional<TrajectoryPoint> Trajectory::atTime(const Time& time) const
        {
            if(points_.empty())
            {
                return std::nullopt;
            }

            double target_time_s = time.seconds();

            // Find the two points that bracket the target time
            for(size_t i = 0; i < points_.size() - 1; ++i)
            {
                double time1 = points_[i].getTime().seconds();
                double time2 = points_[i + 1].getTime().seconds();

                if(target_time_s >= time1 && target_time_s <= time2)
                {
                    // Linear interpolation between the two points
                    double t = (target_time_s - time1) / (time2 - time1);

                    const Bullet& state1 = points_[i].getState();
                    const Bullet& state2 = points_[i + 1].getState();

                    // Interpolate position
                    Distance x =
                        Distance::meters(state1.getPositionX().meters() +
                                         t * (state2.getPositionX().meters() - state1.getPositionX().meters()));
                    Distance y =
                        Distance::meters(state1.getPositionY().meters() +
                                         t * (state2.getPositionY().meters() - state1.getPositionY().meters()));
                    Distance z =
                        Distance::meters(state1.getPositionZ().meters() +
                                         t * (state2.getPositionZ().meters() - state1.getPositionZ().meters()));

                    // Interpolate velocity
                    Velocity vx = Velocity::mps(state1.getVelocityX().mps() +
                                                t * (state2.getVelocityX().mps() - state1.getVelocityX().mps()));
                    Velocity vy = Velocity::mps(state1.getVelocityY().mps() +
                                                t * (state2.getVelocityY().mps() - state1.getVelocityY().mps()));
                    Velocity vz = Velocity::mps(state1.getVelocityZ().mps() +
                                                t * (state2.getVelocityZ().mps() - state1.getVelocityZ().mps()));

                    // Interpolate spin rate
                    AngularVelocity spin = AngularVelocity::radians_per_second(
                        state1.getSpinRate().radians_per_second() +
                        t * (state2.getSpinRate().radians_per_second() - state1.getSpinRate().radians_per_second()));

                    Bullet interp_state(state1, x, y, z, vx, vy, vz, spin);

                    return TrajectoryPoint(time, interp_state);
                }
            }

            // Check if target time is beyond the last point
            if(target_time_s >= points_.back().getTime().seconds())
            {
                return points_.back();
            }

            return std::nullopt;
        }

        Distance Trajectory::getTotalDistance() const
        {
            if(points_.empty())
            {
                return Distance::meters(0.0);
            }
            return points_.back().getDistance();
        }

        Time Trajectory::getTotalTime() const
        {
            if(points_.empty())
            {
                return Time::seconds(0.0);
            }
            return points_.back().getTime();
        }

        Distance Trajectory::getMaximumHeight() const
        {
            if(points_.empty())
            {
                return Distance::meters(0.0);
            }

            double max_height = 0.0;
            for(const auto& point : points_)
            {
                double height = point.getState().getPositionZ().meters();
                if(height > max_height)
                {
                    max_height = height;
                }
            }

            return Distance::meters(max_height);
        }

        Velocity Trajectory::getImpactVelocity() const
        {
            if(points_.empty())
            {
                return Velocity::mps(0.0);
            }
            return points_.back().getVelocity();
        }

        Angle Trajectory::getImpactAngle() const
        {
            if(points_.empty())
            {
                return Angle::radians(0.0);
            }

            const Bullet& impact_state = points_.back().getState();
            double vx = impact_state.getVelocityX().mps();
            double vz = impact_state.getVelocityZ().mps();

            // Impact angle is the angle below horizontal
            double angle_rad = std::atan2(-vz, vx); // Negative vz because it's downward
            return Angle::radians(angle_rad);
        }

        void Trajectory::clear()
        {
            points_.clear();
        }

        std::string Trajectory::toString() const
        {
            std::ostringstream oss;
            oss << "Trajectory(" << points_.size() << " points, " << std::fixed << std::setprecision(1)
                << getTotalDistance().yards() << "yd, " << std::setprecision(3) << getTotalTime().seconds() << "s)";
            return oss.str();
        }

        Bullet Trajectory::interpolate(const TrajectoryPoint& point1, const TrajectoryPoint& point2,
                                       const Distance& distance) const
        {
            double dist1 = point1.getDistance().meters();
            double dist2 = point2.getDistance().meters();
            double target_dist = distance.meters();

            if(std::abs(dist2 - dist1) < 1e-9)
            {
                // Points are at the same distance, return the first one
                return point1.getState();
            }

            double t = (target_dist - dist1) / (dist2 - dist1);

            const Bullet& state1 = point1.getState();
            const Bullet& state2 = point2.getState();

            // Interpolate position
            Distance x = Distance::meters(state1.getPositionX().meters() +
                                          t * (state2.getPositionX().meters() - state1.getPositionX().meters()));
            Distance y = Distance::meters(state1.getPositionY().meters() +
                                          t * (state2.getPositionY().meters() - state1.getPositionY().meters()));
            Distance z = Distance::meters(state1.getPositionZ().meters() +
                                          t * (state2.getPositionZ().meters() - state1.getPositionZ().meters()));

            // Interpolate velocity
            Velocity vx = Velocity::mps(state1.getVelocityX().mps() +
                                        t * (state2.getVelocityX().mps() - state1.getVelocityX().mps()));
            Velocity vy = Velocity::mps(state1.getVelocityY().mps() +
                                        t * (state2.getVelocityY().mps() - state1.getVelocityY().mps()));
            Velocity vz = Velocity::mps(state1.getVelocityZ().mps() +
                                        t * (state2.getVelocityZ().mps() - state1.getVelocityZ().mps()));

            // Interpolate spin rate
            AngularVelocity spin = AngularVelocity::radians_per_second(
                state1.getSpinRate().radians_per_second() +
                t * (state2.getSpinRate().radians_per_second() - state1.getSpinRate().radians_per_second()));

            return Bullet(state1, x, y, z, vx, vy, vz, spin);
        }

    } // namespace ballistics
} // namespace btk
