#pragma once

#include "ballistics/trajectory.h"
#include "math/quaternion.h"
#include "math/vector.h"
#include <cmath>
#include <optional>
#include <variant>
#include <vector>

namespace btk::match
{

  /**
   * @brief 3D rigid body steel target with physics simulation
   *
   * Simulates a steel target with:
   * - Composite shape (rectangle, circle, oval components)
   * - Full 3D rigid body physics
   * - Chain anchor constraints
   * - Bullet impact momentum transfer
   * - Impact recording for paint removal visualization
   */
  class SteelTarget
  {
    private:
    /**
     * @brief Rectangle shape component
     */
    struct RectangleComponent
    {
      btk::math::Vector3D local_position_m_;
      float width_m_;
      float height_m_;

      RectangleComponent(const btk::math::Vector3D& pos, float width, float height)
        : local_position_m_(pos), width_m_(width), height_m_(height) {}

      float area() const { return width_m_ * height_m_; }

      btk::math::Vector3D inertiaLocal(float mass) const {
        float Ixx = mass * height_m_ * height_m_ / 12.0f;
        float Iyy = mass * width_m_ * width_m_ / 12.0f;
        float Izz = mass * (width_m_ * width_m_ + height_m_ * height_m_) / 12.0f;
        return btk::math::Vector3D(Ixx, Iyy, Izz);
      }

      bool contains(const btk::math::Vector3D& point) const {
        float dx = std::abs(point.x - local_position_m_.x);
        float dy = std::abs(point.y - local_position_m_.y);
        return dx <= width_m_ / 2.0f && dy <= height_m_ / 2.0f;
      }
    };

    /**
     * @brief Oval (ellipse) shape component
     */
    struct OvalComponent
    {
      btk::math::Vector3D local_position_m_;
      float width_m_;
      float height_m_;

      OvalComponent(const btk::math::Vector3D& pos, float width, float height)
        : local_position_m_(pos), width_m_(width), height_m_(height) {}

      float area() const {
        float a = width_m_ / 2.0f;
        float b = height_m_ / 2.0f;
        return 3.14159265359f * a * b;
      }

      btk::math::Vector3D inertiaLocal(float mass) const {
        float a = width_m_ / 2.0f;
        float b = height_m_ / 2.0f;
        float Ixx = 0.25f * mass * b * b;
        float Iyy = 0.25f * mass * a * a;
        float Izz = 0.25f * mass * (a * a + b * b);
        return btk::math::Vector3D(Ixx, Iyy, Izz);
      }

      bool contains(const btk::math::Vector3D& point) const {
        float dx = point.x - local_position_m_.x;
        float dy = point.y - local_position_m_.y;
        float a = width_m_ / 2.0f;
        float b = height_m_ / 2.0f;
        return (dx * dx) / (a * a) + (dy * dy) / (b * b) <= 1.0f;
      }
    };

    /**
     * @brief Triangle shape component
     */
    struct TriangleComponent
    {
      btk::math::Vector3D local_position_m_; ///< Center of triangle
      btk::math::Vector3D v0_;                ///< First vertex (relative to center)
      btk::math::Vector3D v1_;                ///< Second vertex (relative to center)
      btk::math::Vector3D v2_;                ///< Third vertex (relative to center)

      TriangleComponent(const btk::math::Vector3D& center, const btk::math::Vector3D& v0, const btk::math::Vector3D& v1, const btk::math::Vector3D& v2)
        : local_position_m_(center), v0_(v0), v1_(v1), v2_(v2) {}

      float area() const {
        btk::math::Vector3D edge1 = v1_ - v0_;
        btk::math::Vector3D edge2 = v2_ - v0_;
        return 0.5f * edge1.cross(edge2).magnitude();
      }

      btk::math::Vector3D inertiaLocal(float mass) const {
        // Simplified: treat as three point masses at vertices
        float point_mass = mass / 3.0f;
        float Ixx = 0.0f, Iyy = 0.0f, Izz = 0.0f;
        
        for (const auto& v : {v0_, v1_, v2_}) {
          Ixx += point_mass * (v.y * v.y + v.z * v.z);
          Iyy += point_mass * (v.x * v.x + v.z * v.z);
          Izz += point_mass * (v.x * v.x + v.y * v.y);
        }
        
        return btk::math::Vector3D(Ixx, Iyy, Izz);
      }

      bool contains(const btk::math::Vector3D& point) const {
        // Transform point to triangle's local space
        btk::math::Vector3D p = point - local_position_m_;
        
        // Barycentric coordinate test
        btk::math::Vector3D v0 = v1_ - v0_;
        btk::math::Vector3D v1 = v2_ - v0_;
        btk::math::Vector3D v2 = p - v0_;
        
        float dot00 = v0.dot(v0);
        float dot01 = v0.dot(v1);
        float dot02 = v0.dot(v2);
        float dot11 = v1.dot(v1);
        float dot12 = v1.dot(v2);
        
        float inv_denom = 1.0f / (dot00 * dot11 - dot01 * dot01);
        float u = (dot11 * dot02 - dot01 * dot12) * inv_denom;
        float v = (dot00 * dot12 - dot01 * dot02) * inv_denom;
        
        return (u >= 0.0f) && (v >= 0.0f) && (u + v <= 1.0f);
      }
    };

    /**
     * @brief Variant type holding any shape component
     */
    using ShapeComponent = std::variant<RectangleComponent, OvalComponent, TriangleComponent>;

    public:
    /**
     * @brief Represents a chain anchor point
     */
    struct ChainAnchor
    {
      btk::math::Vector3D world_position_m_;   ///< Fixed anchor point in world space
      btk::math::Vector3D local_attachment_m_; ///< Attachment point on target (local coords)
      float rest_length_m_;                    ///< Rest length of chain
      float spring_constant_;                  ///< Spring constant (N/m)

      ChainAnchor() : world_position_m_(0, 0, 0), local_attachment_m_(0, 0, 0), rest_length_m_(0), spring_constant_(0) {}
      ChainAnchor(const btk::math::Vector3D& world_pos, const btk::math::Vector3D& local_pos, float rest_length, float spring_k) 
        : world_position_m_(world_pos), local_attachment_m_(local_pos), rest_length_m_(rest_length), spring_constant_(spring_k) {}
    };

    /**
     * @brief Represents a bullet impact on the target
     */
    struct Impact
    {
      btk::math::Vector3D local_position_m_; ///< Hit position in target's local space
      float bullet_diameter_m_;              ///< Bullet diameter for paint removal
      float timestamp_s_;                    ///< Time of impact

      Impact() : local_position_m_(0, 0, 0), bullet_diameter_m_(0), timestamp_s_(0) {}
      Impact(const btk::math::Vector3D& local_pos, float diameter, float time) : local_position_m_(local_pos), bullet_diameter_m_(diameter), timestamp_s_(time) {}
    };

    /**
     * @brief Result of trajectory intersection check
     */
    struct IntersectionResult
    {
      bool hit;                              ///< Whether trajectory intersects target
      btk::math::Vector3D impact_point_m_;   ///< Impact point in world space
      btk::math::Vector3D impact_velocity_;  ///< Bullet velocity at impact (m/s)
      btk::math::Vector3D surface_normal_;   ///< Surface normal at impact point
      float impact_time_s_;                  ///< Time of impact
      float bullet_mass_kg_;                 ///< Bullet mass for momentum transfer
      float bullet_diameter_m_;              ///< Bullet diameter for impact recording

      IntersectionResult() : hit(false), impact_point_m_(0, 0, 0), impact_velocity_(0, 0, 0), surface_normal_(0, 0, 0), impact_time_s_(0.0f), bullet_mass_kg_(0.0f), bullet_diameter_m_(0.0f) {}
    };

    /**
     * @brief Initialize empty steel target
     *
     * @param thickness_m Target thickness in meters
     * @param density_kg_m3 Steel density (default ~7850 kg/m³)
     */
    SteelTarget(float thickness_m, float density_kg_m3 = 7850.0f);

    /**
     * @brief Add a rectangle component
     *
     * @param position Local position offset
     * @param width_m Width in meters
     * @param height_m Height in meters
     */
    void addRectangle(const btk::math::Vector3D& position, float width_m, float height_m);

    /**
     * @brief Add a circle component (oval with equal dimensions)
     *
     * @param position Local position offset
     * @param radius_m Radius in meters
     */
    void addCircle(const btk::math::Vector3D& position, float radius_m);

    /**
     * @brief Add an oval component
     *
     * @param position Local position offset
     * @param width_m Width in meters
     * @param height_m Height in meters
     */
    void addOval(const btk::math::Vector3D& position, float width_m, float height_m);

    /**
     * @brief Add a triangle component
     *
     * @param v0 First vertex (local space)
     * @param v1 Second vertex (local space)
     * @param v2 Third vertex (local space)
     */
    void addTriangle(const btk::math::Vector3D& v0, const btk::math::Vector3D& v1, const btk::math::Vector3D& v2);

    /**
     * @brief Add a chain anchor constraint
     *
     * @param world_position Fixed anchor point in world space
     * @param local_attachment Attachment point on target (local coords)
     * @param rest_length Rest length of chain
     * @param spring_constant Spring constant (N/m)
     */
    void addChainAnchor(const btk::math::Vector3D& world_position, const btk::math::Vector3D& local_attachment, float rest_length, float spring_constant);

    /**
     * @brief Set damping coefficients
     *
     * @param linear Linear velocity damping [0, 1]
     * @param angular Angular velocity damping [0, 1]
     */
    void setDamping(float linear, float angular);

    /**
     * @brief Process bullet hit from trajectory
     *
     * Checks for intersection, applies physics, records impact.
     * Does nothing if trajectory misses.
     *
     * @param trajectory Bullet trajectory to check
     * @return True if hit, false if miss
     */
    bool hit(const btk::ballistics::Trajectory& trajectory);

    /**
     * @brief Process direct bullet hit (manual)
     *
     * @param bullet Bullet with position, velocity, mass, and diameter
     */
    void hit(const btk::ballistics::Bullet& bullet);

    /**
     * @brief Advance physics simulation
     *
     * @param dt Time step in seconds
     */
    void timeStep(float dt);

    /**
     * @brief Get all recorded impacts
     */
    const std::vector<Impact>& getImpacts() const { return impacts_; }

    /**
     * @brief Get target shape components (for rendering/debugging)
     */
    const std::vector<ShapeComponent>& getComponents() const { return components_; }

    /**
     * @brief Convert world coordinates to target local coordinates
     *
     * @param world_point Point in world space
     * @return Point in target's local coordinate system
     */
    btk::math::Vector3D worldToLocal(const btk::math::Vector3D& world_point) const;

    /**
     * @brief Convert target local coordinates to world coordinates
     *
     * @param local_point Point in target's local coordinate system
     * @return Point in world space
     */
    btk::math::Vector3D localToWorld(const btk::math::Vector3D& local_point) const;

    /**
     * @brief Get center of mass position
     */
    const btk::math::Vector3D& getCenterOfMass() const { return position_m_; }

    /**
     * @brief Get current orientation
     */
    const btk::math::Quaternion& getOrientation() const { return orientation_; }

    /**
     * @brief Get current linear velocity
     */
    const btk::math::Vector3D& getVelocity() const { return velocity_ms_; }

    /**
     * @brief Get current angular velocity
     */
    const btk::math::Vector3D& getAngularVelocity() const { return angular_velocity_; }

    /**
     * @brief Get triangulated vertices as flat array for WebGL
     * 
     * Returns vertices as [x,y,z, x,y,z, ...] ready for WebGL buffer.
     * Each 9 consecutive floats form one triangle (3 vertices * 3 components).
     * 
     * @param segments_per_circle Number of segments to use for circular shapes (default 32)
     * @return Flat array of vertex coordinates in world space
     */
    std::vector<btk::math::Vector3D> getVertices(int segments_per_circle = 32) const;

    /**
     * @brief Get target mass
     */
    float getMass() const { return mass_kg_; }

    /**
     * @brief Set target position (world space)
     */
    void setPosition(const btk::math::Vector3D& position) { position_m_ = position; }

    /**
     * @brief Set target orientation from direction vector
     *
     * @param direction Normal vector indicating which direction the target faces
     *                  (e.g., {0, 0, 1} for vertical target facing +Z)
     * @param up Optional up vector to control plane orientation (defaults to +Z)
     */
    void setOrientation(const btk::math::Vector3D& direction, const btk::math::Vector3D& up = btk::math::Vector3D(0.0f, 0.0f, 1.0f));

    /**
     * @brief Set target orientation (internal quaternion method)
     */
    void setOrientationQuaternion(const btk::math::Quaternion& orientation) { orientation_ = orientation; }

    /**
     * @brief Clear all recorded impacts
     */
    void clearImpacts() { impacts_.clear(); }

    private:
    // Shape definition (local space)
    std::vector<ShapeComponent> components_;
    float thickness_m_;
    float steel_density_kg_m3_;

    // Physics state (world space)
    btk::math::Vector3D position_m_;       // Center of mass position
    btk::math::Quaternion orientation_;    // Current orientation
    btk::math::Vector3D velocity_ms_;      // Linear velocity
    btk::math::Vector3D angular_velocity_; // Angular velocity (rad/s)

    // Physical properties
    float mass_kg_;
    btk::math::Vector3D inertia_tensor_; // Diagonal inertia tensor (simplified)

    // Constraints and impacts
    std::vector<ChainAnchor> anchors_;
    std::vector<Impact> impacts_;

    // Damping
    float linear_damping_;
    float angular_damping_;

    /**
     * @brief Calculate mass and moment of inertia from shape components
     */
    void calculateMassAndInertia();

    /**
     * @brief Apply chain tension forces
     */
    void applyChainForces(float dt);

    /**
     * @brief Check if trajectory intersects target
     */
    std::optional<IntersectionResult> checkTrajectoryIntersection(const btk::ballistics::Trajectory& trajectory) const;

    /**
     * @brief Apply bullet impact physics
     */
    void applyBulletImpact(const IntersectionResult& intersection);

    /**
     * @brief Apply instantaneous impulse at a world-space point
     */
    void applyImpulse(const btk::math::Vector3D& impulse, const btk::math::Vector3D& world_position);

    /**
     * @brief Apply force at a world-space point
     */
    void applyForce(const btk::math::Vector3D& force, const btk::math::Vector3D& world_position, float dt);

    /**
     * @brief Record an impact for visualization
     */
    void recordImpact(const btk::math::Vector3D& world_position, float bullet_diameter, float time);

    /**
     * @brief Test if point is inside any component (2D)
     */
    bool isPointInTarget(const btk::math::Vector3D& point) const;

    /**
     * @brief Calculate transfer ratio based on impact angle
     */
    float calculateMomentumTransferRatio(float angle_to_normal) const;
  };

} // namespace btk::match

