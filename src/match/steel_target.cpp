#include "match/steel_target.h"
#include "physics/constants.h"
#include "math/conversions.h"
#include <cmath>
#include <stdexcept>

namespace btk::match
{

  SteelTarget::SteelTarget(float thickness, float density)
    : thickness_(thickness),
      steel_density_(density),
      position_(0.0f, 0.0f, 0.0f),
      normal_(1.0f, 0.0f, 0.0f),
      velocity_ms_(0.0f, 0.0f, 0.0f),
      angular_velocity_(0.0f, 0.0f, 0.0f),
      mass_kg_(0.0f),
      inertia_tensor_(0.0f, 0.0f, 0.0f),
      linear_damping_(0.99f),
      angular_damping_(0.98f) {
  }

  void SteelTarget::addRectangle(const btk::math::Vector3D& position, float width, float height) {
    components_.push_back(RectangleComponent(position, width, height));
    calculateMassAndInertia();
  }

  void SteelTarget::addCircle(const btk::math::Vector3D& position, float radius) {
    float diameter = radius * 2.0f;
    components_.push_back(OvalComponent(position, diameter, diameter));
    calculateMassAndInertia();
  }

  void SteelTarget::addOval(const btk::math::Vector3D& position, float width, float height) {
    components_.push_back(OvalComponent(position, width, height));
    calculateMassAndInertia();
  }

  void SteelTarget::addTriangle(const btk::math::Vector3D& v0, const btk::math::Vector3D& v1, const btk::math::Vector3D& v2) {
    btk::math::Vector3D center = (v0 + v1 + v2) / 3.0f;
    components_.push_back(TriangleComponent(center, v0, v1, v2));
    calculateMassAndInertia();
  }

  void SteelTarget::addChainAnchor(const btk::math::Vector3D& fixed, const btk::math::Vector3D& attachment, float rest_length, float spring_constant) {
    anchors_.emplace_back(fixed, attachment, rest_length, spring_constant);
  }

  void SteelTarget::setDamping(float linear, float angular) {
    linear_damping_ = linear;
    angular_damping_ = angular;
  }

  void SteelTarget::translate(const btk::math::Vector3D& offset) {
    // Translate all components
    for (auto& component : components_) {
      std::visit([&](auto& shape) {
        shape.position_ += offset;
      }, component);
    }
    
    // Translate all chain attachments
    for (auto& anchor : anchors_) {
      anchor.attachment_ += offset;
    }
    
    // Update center of mass
    position_ += offset;
  }

  void SteelTarget::rotate(const btk::math::Vector3D& normal) {
    // Normalize target normal
    btk::math::Vector3D target_normal = normal.normalized();
    
    // Current normal (default is +X)
    btk::math::Vector3D current_normal = normal_;
    
    // Check if already aligned
    float dot = target_normal.dot(current_normal);
    if (dot > 0.9999f) {
      // Already aligned, no rotation needed
      return;
    }
    
    // Get center of mass before rotation (for rotating around it)
    btk::math::Vector3D com = position_;
    
    if (dot < -0.9999f) {
      // Opposite direction, rotate 180 degrees around Z axis to keep target upright
      btk::math::Vector3D axis(0.0f, 0.0f, 1.0f);
      btk::math::Quaternion rotation = btk::math::Quaternion::fromAxisAngle(axis, 3.14159265359f);
      
      // Rotate all components around center of mass
      for (auto& component : components_) {
        std::visit([&](auto& shape) {
          btk::math::Vector3D offset = shape.position_ - com;
          offset = rotation.rotate(offset);
          shape.position_ = com + offset;
        }, component);
      }
      
      // Rotate all chain attachments around center of mass
      for (auto& anchor : anchors_) {
        btk::math::Vector3D offset = anchor.attachment_ - com;
        offset = rotation.rotate(offset);
        anchor.attachment_ = com + offset;
      }
      
      normal_ = target_normal;
      calculateMassAndInertia();
      return;
    }
    
    // General case: rotate from current normal to target normal
    btk::math::Vector3D axis = current_normal.cross(target_normal).normalized();
    float angle = std::acos(dot);
    btk::math::Quaternion rotation = btk::math::Quaternion::fromAxisAngle(axis, angle);
    
    // Rotate all components around center of mass
    for (auto& component : components_) {
      std::visit([&](auto& shape) {
        btk::math::Vector3D offset = shape.position_ - com;
        offset = rotation.rotate(offset);
        shape.position_ = com + offset;
      }, component);
    }
    
    // Rotate all chain attachments around center of mass
    for (auto& anchor : anchors_) {
      btk::math::Vector3D offset = anchor.attachment_ - com;
      offset = rotation.rotate(offset);
      anchor.attachment_ = com + offset;
    }
    
    // Update normal
    normal_ = target_normal;
    
    // Recalculate center of mass and inertia
    calculateMassAndInertia();
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
    
    // Surface normal
    btk::math::Vector3D surface_normal = normal_;
    
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
        float component_mass = area * thickness_ * steel_density_;

        total_area += area;
        weighted_center += shape.position_ * area;

        // Get local inertia for this component
        btk::math::Vector3D local_inertia = shape.inertiaLocal(component_mass);

        // Apply parallel axis theorem to move inertia to target center
        // I_total = I_local + m * d^2
        float dx = shape.position_.x;
        float dy = shape.position_.y;
        float dz = shape.position_.z;

        local_inertia.x += component_mass * (dy * dy + dz * dz);
        local_inertia.y += component_mass * (dx * dx + dz * dz);
        local_inertia.z += component_mass * (dx * dx + dy * dy);

        total_inertia += local_inertia;
      }, component);
    }

    // Calculate total mass
    mass_kg_ = total_area * thickness_ * steel_density_;

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
    float target_distance_m = position_.x;

    // Get trajectory point at target distance
    auto traj_point = trajectory.atDistance(target_distance_m);
    if (!traj_point.has_value()) {
      return std::nullopt;
    }

    // Get impact point
    btk::math::Vector3D impact_point = traj_point->getPosition();

    // Check if point is inside any component
    if (!isPointInTarget(impact_point)) {
      return std::nullopt;
    }

    // We have a hit! Build intersection result
    const auto& bullet = traj_point->getState();
    
    IntersectionResult result;
    result.hit = true;
    result.impact_point_ = impact_point;
    result.impact_time_s_ = traj_point->getTime();
    result.impact_velocity_ = bullet.getVelocity();
    result.bullet_mass_kg_ = bullet.getWeight();
    result.bullet_diameter_ = bullet.getDiameter();

    // Surface normal
    result.surface_normal_ = normal_;

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
    applyImpulse(impulse, intersection.impact_point_);
    
    // Record impact for visualization
    impacts_.emplace_back(intersection.impact_point_, intersection.bullet_diameter_, intersection.impact_time_s_);
  }

  void SteelTarget::applyImpulse(const btk::math::Vector3D& impulse, const btk::math::Vector3D& world_position) {
    // Linear impulse
    velocity_ms_ += impulse / mass_kg_;
    
    // Angular impulse (torque = r × F)
    btk::math::Vector3D r = world_position - position_;
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
    // Apply gravity (BTK: Z is up, so gravity is in -Z direction)
    btk::math::Vector3D gravity_force(0.0f, 0.0f, -btk::physics::Constants::GRAVITY * mass_kg_);
    applyForce(gravity_force, position_, dt);
    
    // Apply chain tension forces
    applyChainForces(dt);
    
    // Apply damping
    velocity_ms_ = velocity_ms_ * linear_damping_;
    angular_velocity_ = angular_velocity_ * angular_damping_;
    
    // Semi-implicit Euler integration for stability
    btk::math::Vector3D position_delta = velocity_ms_ * dt;
    position_ += position_delta;
    
    // Move all components and attachments with the center of mass
    for (auto& component : components_) {
      std::visit([&](auto& shape) {
        shape.position_ += position_delta;
      }, component);
    }
    
    for (auto& anchor : anchors_) {
      anchor.attachment_ += position_delta;
    }
    
    // Angular velocity integration: rotate normal and all components
    if (angular_velocity_.magnitude() > 1e-6f) {
      float angle = angular_velocity_.magnitude() * dt;
      btk::math::Vector3D axis = angular_velocity_.normalized();
      btk::math::Quaternion rotation = btk::math::Quaternion::fromAxisAngle(axis, angle);
      
      // Rotate normal
      normal_ = rotation.rotate(normal_);
      
      // Rotate all components around center of mass
      for (auto& component : components_) {
        std::visit([&](auto& shape) {
          btk::math::Vector3D offset = shape.position_ - position_;
          offset = rotation.rotate(offset);
          shape.position_ = position_ + offset;
        }, component);
      }
      
      // Rotate all chain attachments around center of mass
      for (auto& anchor : anchors_) {
        btk::math::Vector3D offset = anchor.attachment_ - position_;
        offset = rotation.rotate(offset);
        anchor.attachment_ = position_ + offset;
      }
    }
  }

  void SteelTarget::applyChainForces(float dt) {
    for (const auto& anchor : anchors_) {
      // Vector from fixed anchor to attachment point
      btk::math::Vector3D vec = anchor.attachment_ - anchor.fixed_;
      float distance = vec.magnitude();
      
      if (distance < 1e-6f) continue; // Avoid division by zero
      
      // Chain tension: only applies force when stretched beyond rest length
      float extension = distance - anchor.rest_length_;
      
      // Chains can't push, only pull (tension only when extended)
      if (extension > 0.0f) {
        // Direction from attachment to fixed (pulling back)
        btk::math::Vector3D direction = (anchor.fixed_ - anchor.attachment_) / distance;
        // Spring force: F = -k * x (restoring force)
        btk::math::Vector3D tension_force = direction * (anchor.spring_constant_ * extension);
        
        // Apply tension force at attachment point (handles both linear and angular)
        applyForce(tension_force, anchor.attachment_, dt);
      }
    }
  }

  void SteelTarget::recordImpact(const btk::math::Vector3D& position, float bullet_diameter, float time) {
    impacts_.emplace_back(position, bullet_diameter, time);
  }

  std::vector<btk::math::Vector3D> SteelTarget::getVertices(int segments_per_circle) const {
    std::vector<btk::math::Vector3D> vertices;
    float halfThickness = thickness_ / 2.0f;

    for (const auto& component : components_) {
      std::visit([&](const auto& shape) {
        using T = std::decay_t<decltype(shape)>;
        
        if constexpr (std::is_same_v<T, RectangleComponent>) {
          // Rectangle with thickness: front face, back face, and 4 edge faces
          // Components are in YZ plane with normal in +X direction
          float hw = shape.width_ / 2.0f;
          float hh = shape.height_ / 2.0f;
          
          // Corners relative to component center (normal in +X)
          btk::math::Vector3D v0(shape.position_.x - halfThickness, shape.position_.y - hw, shape.position_.z - hh);
          btk::math::Vector3D v1(shape.position_.x - halfThickness, shape.position_.y + hw, shape.position_.z - hh);
          btk::math::Vector3D v2(shape.position_.x - halfThickness, shape.position_.y + hw, shape.position_.z + hh);
          btk::math::Vector3D v3(shape.position_.x - halfThickness, shape.position_.y - hw, shape.position_.z + hh);
          btk::math::Vector3D v4(shape.position_.x + halfThickness, shape.position_.y - hw, shape.position_.z - hh);
          btk::math::Vector3D v5(shape.position_.x + halfThickness, shape.position_.y + hw, shape.position_.z - hh);
          btk::math::Vector3D v6(shape.position_.x + halfThickness, shape.position_.y + hw, shape.position_.z + hh);
          btk::math::Vector3D v7(shape.position_.x + halfThickness, shape.position_.y - hw, shape.position_.z + hh);
          
          // Front face (X = +halfThickness)
          vertices.push_back(v4);
          vertices.push_back(v5);
          vertices.push_back(v6);
          vertices.push_back(v4);
          vertices.push_back(v6);
          vertices.push_back(v7);
          
          // Back face (X = -halfThickness)
          vertices.push_back(v0);
          vertices.push_back(v2);
          vertices.push_back(v1);
          vertices.push_back(v0);
          vertices.push_back(v3);
          vertices.push_back(v2);
          
          // Edge faces (4 sides)
          // Bottom edge
          vertices.push_back(v0);
          vertices.push_back(v1);
          vertices.push_back(v5);
          vertices.push_back(v0);
          vertices.push_back(v5);
          vertices.push_back(v4);
          // Top edge
          vertices.push_back(v2);
          vertices.push_back(v6);
          vertices.push_back(v3);
          vertices.push_back(v3);
          vertices.push_back(v6);
          vertices.push_back(v7);
          // Left edge
          vertices.push_back(v0);
          vertices.push_back(v4);
          vertices.push_back(v7);
          vertices.push_back(v0);
          vertices.push_back(v7);
          vertices.push_back(v3);
          // Right edge
          vertices.push_back(v1);
          vertices.push_back(v5);
          vertices.push_back(v6);
          vertices.push_back(v1);
          vertices.push_back(v6);
          vertices.push_back(v2);
          
        } else if constexpr (std::is_same_v<T, OvalComponent>) {
          // Oval with thickness: front face, back face, and edge
          // Components are in YZ plane with normal in +X direction
          float rx = shape.width_ / 2.0f;
          float ry = shape.height_ / 2.0f;
          btk::math::Vector3D pos = shape.position_;
          
          // Generate front and back faces
          for (int i = 0; i < segments_per_circle; ++i) {
            float angle1 = (2.0f * M_PI_F * i) / segments_per_circle;
            float angle2 = (2.0f * M_PI_F * (i + 1)) / segments_per_circle;
            
            float cos1 = std::cos(angle1), sin1 = std::sin(angle1);
            float cos2 = std::cos(angle2), sin2 = std::sin(angle2);
            
            // Front face (X = +halfThickness)
            btk::math::Vector3D centerFront(pos.x + halfThickness, pos.y, pos.z);
            btk::math::Vector3D v1Front(pos.x + halfThickness, pos.y + rx * cos1, pos.z + ry * sin1);
            btk::math::Vector3D v2Front(pos.x + halfThickness, pos.y + rx * cos2, pos.z + ry * sin2);
            vertices.push_back(centerFront);
            vertices.push_back(v1Front);
            vertices.push_back(v2Front);
            
            // Back face (X = -halfThickness)
            btk::math::Vector3D centerBack(pos.x - halfThickness, pos.y, pos.z);
            btk::math::Vector3D v1Back(pos.x - halfThickness, pos.y + rx * cos1, pos.z + ry * sin1);
            btk::math::Vector3D v2Back(pos.x - halfThickness, pos.y + rx * cos2, pos.z + ry * sin2);
            vertices.push_back(centerBack);
            vertices.push_back(v2Back);
            vertices.push_back(v1Back);
            
            // Edge face (quad connecting front and back)
            btk::math::Vector3D v1f(pos.x + halfThickness, pos.y + rx * cos1, pos.z + ry * sin1);
            btk::math::Vector3D v2f(pos.x + halfThickness, pos.y + rx * cos2, pos.z + ry * sin2);
            btk::math::Vector3D v1b(pos.x - halfThickness, pos.y + rx * cos1, pos.z + ry * sin1);
            btk::math::Vector3D v2b(pos.x - halfThickness, pos.y + rx * cos2, pos.z + ry * sin2);
            // First triangle of quad
            vertices.push_back(v1f);
            vertices.push_back(v1b);
            vertices.push_back(v2f);
            // Second triangle of quad
            vertices.push_back(v2f);
            vertices.push_back(v1b);
            vertices.push_back(v2b);
          }
          
        } else if constexpr (std::is_same_v<T, TriangleComponent>) {
          // Triangle: vertices are already in final positions
          vertices.push_back(shape.v0_);
          vertices.push_back(shape.v1_);
          vertices.push_back(shape.v2_);
        }
      }, component);
    }

    return vertices;
  }

} // namespace btk::match
