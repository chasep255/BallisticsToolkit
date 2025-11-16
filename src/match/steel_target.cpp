#include "match/steel_target.h"
#include "physics/constants.h"
#include "math/conversions.h"
#include <cmath>
#include <stdexcept>

namespace btk::match
{

  SteelTarget::SteelTarget(float thickness_m, float density_kg_m3)
    : thickness_m_(thickness_m),
      steel_density_kg_m3_(density_kg_m3),
      position_m_(0.0f, 0.0f, 0.0f),
      orientation_(btk::math::Quaternion::identity()),
      velocity_ms_(0.0f, 0.0f, 0.0f),
      angular_velocity_(0.0f, 0.0f, 0.0f),
      mass_kg_(0.0f),
      inertia_tensor_(0.0f, 0.0f, 0.0f),
      linear_damping_(0.99f),
      angular_damping_(0.98f) {
  }

  void SteelTarget::addRectangle(const btk::math::Vector3D& position, float width_m, float height_m) {
    components_.push_back(RectangleComponent(position, width_m, height_m));
    calculateMassAndInertia();
  }

  void SteelTarget::addCircle(const btk::math::Vector3D& position, float radius_m) {
    float diameter = radius_m * 2.0f;
    components_.push_back(OvalComponent(position, diameter, diameter));
    calculateMassAndInertia();
  }

  void SteelTarget::addOval(const btk::math::Vector3D& position, float width_m, float height_m) {
    components_.push_back(OvalComponent(position, width_m, height_m));
    calculateMassAndInertia();
  }

  void SteelTarget::addTriangle(const btk::math::Vector3D& v0, const btk::math::Vector3D& v1, const btk::math::Vector3D& v2) {
    btk::math::Vector3D center = (v0 + v1 + v2) / 3.0f;
    components_.push_back(TriangleComponent(center, v0, v1, v2));
    calculateMassAndInertia();
  }

  void SteelTarget::addChainAnchor(const btk::math::Vector3D& world_position, const btk::math::Vector3D& local_attachment, float rest_length, float spring_constant) {
    anchors_.emplace_back(world_position, local_attachment, rest_length, spring_constant);
  }

  void SteelTarget::setDamping(float linear, float angular) {
    linear_damping_ = linear;
    angular_damping_ = angular;
  }

  void SteelTarget::setOrientation(const btk::math::Vector3D& direction, const btk::math::Vector3D& up) {
    // Normalize inputs
    btk::math::Vector3D dir = direction.normalized();
    btk::math::Vector3D upVec = up.normalized();
    
    // Default orientation: components are in XY plane (z=0), normal is +Z
    // We want to rotate so that:
    // - The +Z normal becomes the target direction
    // - The local Y axis (height) aligns with the up vector
    
    // Build target basis:
    // - Z axis (normal) should point in direction
    // - Y axis (height) should point in up direction
    // - X axis (width) = Y × Z
    
    btk::math::Vector3D targetZ = dir;  // Normal direction
    btk::math::Vector3D targetY = upVec; // Up direction
    
    // Ensure targetY is perpendicular to targetZ
    float dot = targetY.dot(targetZ);
    if (std::abs(dot) > 0.9f) {
      // Up vector is nearly parallel to direction, use a default perpendicular
      if (std::abs(targetZ.x) < 0.9f) {
        targetY = btk::math::Vector3D(1.0f, 0.0f, 0.0f);
      } else {
        targetY = btk::math::Vector3D(0.0f, 1.0f, 0.0f);
      }
      targetY = (targetY - targetZ * targetY.dot(targetZ)).normalized();
    } else {
      targetY = (targetY - targetZ * dot).normalized();
    }
    
    btk::math::Vector3D targetX = targetY.cross(targetZ).normalized();
    
    // Build rotation matrix: columns are what local axes map to
    // Local X (1,0,0) -> targetX
    // Local Y (0,1,0) -> targetY
    // Local Z (0,0,1) -> targetZ
    
    float m00 = targetX.x, m01 = targetY.x, m02 = targetZ.x;
    float m10 = targetX.y, m11 = targetY.y, m12 = targetZ.y;
    float m20 = targetX.z, m21 = targetY.z, m22 = targetZ.z;
    
    // Convert rotation matrix to quaternion
    float trace = m00 + m11 + m22;
    if (trace > 0.0f) {
      float s = std::sqrt(trace + 1.0f) * 2.0f;
      float w = 0.25f * s;
      float x = (m21 - m12) / s;
      float y = (m02 - m20) / s;
      float z = (m10 - m01) / s;
      orientation_ = btk::math::Quaternion(w, x, y, z).normalized();
    } else if ((m00 > m11) && (m00 > m22)) {
      float s = std::sqrt(1.0f + m00 - m11 - m22) * 2.0f;
      float w = (m21 - m12) / s;
      float x = 0.25f * s;
      float y = (m01 + m10) / s;
      float z = (m02 + m20) / s;
      orientation_ = btk::math::Quaternion(w, x, y, z).normalized();
    } else if (m11 > m22) {
      float s = std::sqrt(1.0f + m11 - m00 - m22) * 2.0f;
      float w = (m02 - m20) / s;
      float x = (m01 + m10) / s;
      float y = 0.25f * s;
      float z = (m12 + m21) / s;
      orientation_ = btk::math::Quaternion(w, x, y, z).normalized();
    } else {
      float s = std::sqrt(1.0f + m22 - m00 - m11) * 2.0f;
      float w = (m10 - m01) / s;
      float x = (m02 + m20) / s;
      float y = (m12 + m21) / s;
      float z = 0.25f * s;
      orientation_ = btk::math::Quaternion(w, x, y, z).normalized();
    }
  }

  btk::math::Vector3D SteelTarget::worldToLocal(const btk::math::Vector3D& world_point) const {
    btk::math::Vector3D offset = world_point - position_m_;
    return orientation_.conjugate().rotate(offset);
  }

  btk::math::Vector3D SteelTarget::localToWorld(const btk::math::Vector3D& local_point) const {
    return position_m_ + orientation_.rotate(local_point);
  }

  bool SteelTarget::hit(const btk::ballistics::Trajectory& trajectory) {
    auto intersection = checkTrajectoryIntersection(trajectory);
    if (!intersection.has_value()) {
      return false;
    }
    applyBulletImpact(intersection.value());
    return true;
  }

  void SteelTarget::hit(const btk::ballistics::Bullet& bullet) {
    btk::math::Vector3D impact_point = bullet.getPosition();
    btk::math::Vector3D velocity = bullet.getVelocity();
    
    // Calculate bullet momentum
    float mass = bullet.getWeight();
    btk::math::Vector3D bullet_momentum = velocity * mass;
    
    // Surface normal (assuming flat target in local XY plane, normal is +Z)
    btk::math::Vector3D local_normal(0.0f, 0.0f, 1.0f);
    btk::math::Vector3D surface_normal = orientation_.rotate(local_normal);
    
    // Calculate impact angle
    btk::math::Vector3D impact_direction = velocity / velocity.magnitude();
    float cos_angle = impact_direction.dot(surface_normal);
    float angle_to_normal = std::acos(std::fabs(cos_angle));
    
    // Calculate momentum transfer ratio
    float transfer_ratio = calculateMomentumTransferRatio(angle_to_normal);
    
    // Apply impulse
    btk::math::Vector3D impulse = bullet_momentum * transfer_ratio;
    applyImpulse(impulse, impact_point);
    
    // Record impact for visualization
    recordImpact(impact_point, bullet.getDiameter(), 0.0f);
  }

  void SteelTarget::calculateMassAndInertia() {
    if (components_.empty()) {
      mass_kg_ = 0.0f;
      inertia_tensor_ = btk::math::Vector3D(0.0f, 0.0f, 0.0f);
      return;
    }

    float total_area = 0.0f;
    btk::math::Vector3D weighted_center(0.0f, 0.0f, 0.0f);
    btk::math::Vector3D total_inertia(0.0f, 0.0f, 0.0f);

    // Process each component
    for (const auto& component : components_) {
      std::visit([&](const auto& shape) {
        // Calculate area and mass for this component
        float area = shape.area();
        float component_mass = area * thickness_m_ * steel_density_kg_m3_;

        total_area += area;
        weighted_center += shape.local_position_m_ * area;

        // Get local inertia for this component
        btk::math::Vector3D local_inertia = shape.inertiaLocal(component_mass);

        // Apply parallel axis theorem to move inertia to target center
        // I_total = I_local + m * d^2
        float dx = shape.local_position_m_.x;
        float dy = shape.local_position_m_.y;
        float dz = shape.local_position_m_.z;

        local_inertia.x += component_mass * (dy * dy + dz * dz);
        local_inertia.y += component_mass * (dx * dx + dz * dz);
        local_inertia.z += component_mass * (dx * dx + dy * dy);

        total_inertia += local_inertia;
      }, component);
    }

    // Calculate total mass
    mass_kg_ = total_area * thickness_m_ * steel_density_kg_m3_;

    // Store inertia tensor
    inertia_tensor_ = total_inertia;
  }

  bool SteelTarget::isPointInTarget(const btk::math::Vector3D& point) const {
    // Check if point is inside any component
    for (const auto& component : components_) {
      bool inside = std::visit([&](const auto& shape) {
        return shape.contains(point);
      }, component);

      if (inside) {
        return true;
      }
    }
    return false;
  }

  std::optional<SteelTarget::IntersectionResult> SteelTarget::checkTrajectoryIntersection(const btk::ballistics::Trajectory& trajectory) const {
    // Target's downrange distance (position.x in ballistics coordinate system)
    float target_distance_m = position_m_.x;

    // Get trajectory point at target distance
    auto traj_point = trajectory.atDistance(target_distance_m);
    if (!traj_point.has_value()) {
      return std::nullopt;
    }

    // Transform impact point to target's local space
    btk::math::Vector3D impact_world = traj_point->getPosition();
    btk::math::Vector3D impact_local = worldToLocal(impact_world);

    // Check if point is inside any component
    if (!isPointInTarget(impact_local)) {
      return std::nullopt;
    }

    // We have a hit! Build intersection result
    const auto& bullet = traj_point->getState();
    
    IntersectionResult result;
    result.hit = true;
    result.impact_point_m_ = impact_world;
    result.impact_time_s_ = traj_point->getTime();
    result.impact_velocity_ = bullet.getVelocity();
    result.bullet_mass_kg_ = bullet.getWeight();
    result.bullet_diameter_m_ = bullet.getDiameter();

    // Surface normal (assuming flat target in local XY plane, normal is +Z)
    btk::math::Vector3D local_normal(0.0f, 0.0f, 1.0f);
    result.surface_normal_ = orientation_.rotate(local_normal);

    return result;
  }

  float SteelTarget::calculateMomentumTransferRatio(float angle_to_normal) const {
    // Simple model: perpendicular hits (0°) transfer maximum momentum
    // Oblique hits transfer less based on cos(angle)
    // At grazing angles (90°), very little momentum is transferred
    float cos_angle = std::cos(angle_to_normal);
    
    // Use squared cosine for more realistic falloff
    // Full transfer at 0°, ~0.5 at 45°, ~0 at 90°
    float transfer = cos_angle * cos_angle;
    
    // Clamp to reasonable range [0.1, 1.0] (even grazing hits transfer some momentum)
    return std::max(0.1f, transfer);
  }

  void SteelTarget::applyBulletImpact(const IntersectionResult& intersection) {
    if (!intersection.hit) {
      return;
    }

    // Calculate bullet momentum
    btk::math::Vector3D bullet_momentum = intersection.impact_velocity_ * intersection.bullet_mass_kg_;
    
    // Calculate impact angle
    btk::math::Vector3D impact_direction = intersection.impact_velocity_;
    impact_direction = impact_direction / impact_direction.magnitude();
    float cos_angle = impact_direction.dot(intersection.surface_normal_);
    float angle_to_normal = std::acos(std::fabs(cos_angle));
    
    // Calculate momentum transfer ratio
    float transfer_ratio = calculateMomentumTransferRatio(angle_to_normal);
    
    // Apply impulse
    btk::math::Vector3D impulse = bullet_momentum * transfer_ratio;
    applyImpulse(impulse, intersection.impact_point_m_);
    
    // Record impact for visualization
    btk::math::Vector3D impact_local = worldToLocal(intersection.impact_point_m_);
    impacts_.emplace_back(impact_local, intersection.bullet_diameter_m_, intersection.impact_time_s_);
  }

  void SteelTarget::applyImpulse(const btk::math::Vector3D& impulse, const btk::math::Vector3D& world_position) {
    // Linear impulse
    velocity_ms_ += impulse / mass_kg_;
    
    // Angular impulse (torque = r × F)
    btk::math::Vector3D r = world_position - position_m_;
    btk::math::Vector3D angular_impulse = r.cross(impulse);
    
    // Apply to angular velocity (omega += I^-1 * L)
    btk::math::Vector3D angular_accel(
      angular_impulse.x / inertia_tensor_.x,
      angular_impulse.y / inertia_tensor_.y,
      angular_impulse.z / inertia_tensor_.z
    );
    
    angular_velocity_ += angular_accel;
  }

  void SteelTarget::applyForce(const btk::math::Vector3D& force, const btk::math::Vector3D& world_position, float dt) {
    // Convert force to impulse
    btk::math::Vector3D impulse = force * dt;
    applyImpulse(impulse, world_position);
  }

  void SteelTarget::timeStep(float dt) {
    // Apply gravity
    btk::math::Vector3D gravity_force(0.0f, -btk::physics::Constants::GRAVITY * mass_kg_, 0.0f);
    applyForce(gravity_force, position_m_, dt);
    
    // Apply chain tension forces
    applyChainForces(dt);
    
    // Apply damping
    velocity_ms_ = velocity_ms_ * linear_damping_;
    angular_velocity_ = angular_velocity_ * angular_damping_;
    
    // Semi-implicit Euler integration for stability
    position_m_ += velocity_ms_ * dt;
    orientation_.integrateAngularVelocity(angular_velocity_, dt);
  }

  void SteelTarget::applyChainForces(float dt) {
    for (const auto& anchor : anchors_) {
      // Transform local attachment point to world space
      btk::math::Vector3D attachment_world = localToWorld(anchor.local_attachment_m_);
      
      // Vector from anchor to attachment point
      btk::math::Vector3D vec = attachment_world - anchor.world_position_m_;
      float distance = vec.magnitude();
      
      if (distance < 1e-6f) continue; // Avoid division by zero
      
      // Chain tension: only applies force when stretched beyond rest length
      float extension = distance - anchor.rest_length_m_;
      
      // Chains can't push, only pull (tension only when extended)
      if (extension > 0.0f) {
        btk::math::Vector3D direction = vec / distance;
        btk::math::Vector3D tension_force = direction * (-anchor.spring_constant_ * extension);
        
        // Apply tension force at attachment point (handles both linear and angular)
        applyForce(tension_force, attachment_world, dt);
      }
    }
  }

  void SteelTarget::recordImpact(const btk::math::Vector3D& world_position, float bullet_diameter, float time) {
    // Transform to local space
    btk::math::Vector3D impact_local = worldToLocal(world_position);
    
    impacts_.emplace_back(impact_local, bullet_diameter, time);
  }

  std::vector<btk::math::Vector3D> SteelTarget::getVertices(int segments_per_circle) const {
    std::vector<btk::math::Vector3D> vertices;
    float halfThickness = thickness_m_ / 2.0f;

    for (const auto& component : components_) {
      std::visit([&](const auto& shape) {
        using T = std::decay_t<decltype(shape)>;
        
        if constexpr (std::is_same_v<T, RectangleComponent>) {
          // Rectangle with thickness: front face, back face, and 4 edge faces
          float hw = shape.width_m_ / 2.0f;
          float hh = shape.height_m_ / 2.0f;
          
          // Local space corners (in XY plane, Z is normal)
          btk::math::Vector3D v0(-hw, -hh, -halfThickness);
          btk::math::Vector3D v1( hw, -hh, -halfThickness);
          btk::math::Vector3D v2( hw,  hh, -halfThickness);
          btk::math::Vector3D v3(-hw,  hh, -halfThickness);
          btk::math::Vector3D v4(-hw, -hh,  halfThickness);
          btk::math::Vector3D v5( hw, -hh,  halfThickness);
          btk::math::Vector3D v6( hw,  hh,  halfThickness);
          btk::math::Vector3D v7(-hw,  hh,  halfThickness);
          
          btk::math::Vector3D pos = shape.local_position_m_;
          
          // Front face (Z = +halfThickness)
          vertices.push_back(localToWorld(pos + v4));
          vertices.push_back(localToWorld(pos + v5));
          vertices.push_back(localToWorld(pos + v6));
          vertices.push_back(localToWorld(pos + v4));
          vertices.push_back(localToWorld(pos + v6));
          vertices.push_back(localToWorld(pos + v7));
          
          // Back face (Z = -halfThickness)
          vertices.push_back(localToWorld(pos + v0));
          vertices.push_back(localToWorld(pos + v2));
          vertices.push_back(localToWorld(pos + v1));
          vertices.push_back(localToWorld(pos + v0));
          vertices.push_back(localToWorld(pos + v3));
          vertices.push_back(localToWorld(pos + v2));
          
          // Edge faces (4 sides)
          // Bottom edge
          vertices.push_back(localToWorld(pos + v0));
          vertices.push_back(localToWorld(pos + v1));
          vertices.push_back(localToWorld(pos + v5));
          vertices.push_back(localToWorld(pos + v0));
          vertices.push_back(localToWorld(pos + v5));
          vertices.push_back(localToWorld(pos + v4));
          // Top edge
          vertices.push_back(localToWorld(pos + v2));
          vertices.push_back(localToWorld(pos + v6));
          vertices.push_back(localToWorld(pos + v3));
          vertices.push_back(localToWorld(pos + v3));
          vertices.push_back(localToWorld(pos + v6));
          vertices.push_back(localToWorld(pos + v7));
          // Left edge
          vertices.push_back(localToWorld(pos + v0));
          vertices.push_back(localToWorld(pos + v4));
          vertices.push_back(localToWorld(pos + v7));
          vertices.push_back(localToWorld(pos + v0));
          vertices.push_back(localToWorld(pos + v7));
          vertices.push_back(localToWorld(pos + v3));
          // Right edge
          vertices.push_back(localToWorld(pos + v1));
          vertices.push_back(localToWorld(pos + v5));
          vertices.push_back(localToWorld(pos + v6));
          vertices.push_back(localToWorld(pos + v1));
          vertices.push_back(localToWorld(pos + v6));
          vertices.push_back(localToWorld(pos + v2));
          
        } else if constexpr (std::is_same_v<T, OvalComponent>) {
          // Oval with thickness: front face, back face, and edge
          float rx = shape.width_m_ / 2.0f;
          float ry = shape.height_m_ / 2.0f;
          btk::math::Vector3D pos = shape.local_position_m_;
          
          // Generate front and back faces
          for (int i = 0; i < segments_per_circle; ++i) {
            float angle1 = (2.0f * M_PI_F * i) / segments_per_circle;
            float angle2 = (2.0f * M_PI_F * (i + 1)) / segments_per_circle;
            
            float cos1 = std::cos(angle1), sin1 = std::sin(angle1);
            float cos2 = std::cos(angle2), sin2 = std::sin(angle2);
            
            // Front face (Z = +halfThickness)
            btk::math::Vector3D centerFront(0.0f, 0.0f, halfThickness);
            btk::math::Vector3D v1Front(rx * cos1, ry * sin1, halfThickness);
            btk::math::Vector3D v2Front(rx * cos2, ry * sin2, halfThickness);
            vertices.push_back(localToWorld(pos + centerFront));
            vertices.push_back(localToWorld(pos + v1Front));
            vertices.push_back(localToWorld(pos + v2Front));
            
            // Back face (Z = -halfThickness)
            btk::math::Vector3D centerBack(0.0f, 0.0f, -halfThickness);
            btk::math::Vector3D v1Back(rx * cos1, ry * sin1, -halfThickness);
            btk::math::Vector3D v2Back(rx * cos2, ry * sin2, -halfThickness);
            vertices.push_back(localToWorld(pos + centerBack));
            vertices.push_back(localToWorld(pos + v2Back));
            vertices.push_back(localToWorld(pos + v1Back));
            
            // Edge face (quad connecting front and back)
            btk::math::Vector3D v1f(rx * cos1, ry * sin1, halfThickness);
            btk::math::Vector3D v2f(rx * cos2, ry * sin2, halfThickness);
            btk::math::Vector3D v1b(rx * cos1, ry * sin1, -halfThickness);
            btk::math::Vector3D v2b(rx * cos2, ry * sin2, -halfThickness);
            // First triangle of quad
            vertices.push_back(localToWorld(pos + v1f));
            vertices.push_back(localToWorld(pos + v1b));
            vertices.push_back(localToWorld(pos + v2f));
            // Second triangle of quad
            vertices.push_back(localToWorld(pos + v2f));
            vertices.push_back(localToWorld(pos + v1b));
            vertices.push_back(localToWorld(pos + v2b));
          }
          
        } else if constexpr (std::is_same_v<T, TriangleComponent>) {
          // Triangle: just use the vertices as-is (assumes they already define a 3D triangle)
          vertices.push_back(localToWorld(shape.v0_));
          vertices.push_back(localToWorld(shape.v1_));
          vertices.push_back(localToWorld(shape.v2_));
        }
      }, component);
    }

    return vertices;
  }

} // namespace btk::match
