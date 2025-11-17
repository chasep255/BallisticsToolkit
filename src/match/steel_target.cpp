#include "match/steel_target.h"
#include "physics/constants.h"
#include "math/conversions.h"
#include <cmath>
#include <stdexcept>

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

namespace btk::match
{

  SteelTarget::SteelTarget(float width, float height, float thickness, bool is_oval)
    : width_(width),
      height_(height),
      thickness_(thickness),
      is_oval_(is_oval),
      position_(0.0f, 0.0f, 0.0f),
      normal_(1.0f, 0.0f, 0.0f),
      orientation_(btk::math::Quaternion()), // Identity orientation (no rotation)
      velocity_ms_(0.0f, 0.0f, 0.0f),
      angular_velocity_(0.0f, 0.0f, 0.0f),
      mass_kg_(0.0f),
      inertia_tensor_(0.0f, 0.0f, 0.0f),
      linear_damping_(0.95f),
      angular_damping_(0.95f),
      segments_per_circle_(32) {
    calculateMassAndInertia();
    updateDisplay(); // Initialize vertex buffer
  }

  void SteelTarget::addChainAnchor(const btk::math::Vector3D& fixed, const btk::math::Vector3D& attachment, float rest_length, float spring_constant) {
    anchors_.emplace_back(fixed, attachment, rest_length, spring_constant);
  }

  void SteelTarget::setDamping(float linear, float angular) {
    linear_damping_ = linear;
    angular_damping_ = angular;
  }

  void SteelTarget::translate(const btk::math::Vector3D& offset) {
    // Update center of mass
    position_ += offset;
    
    // Translate all chain attachments
    for (auto& anchor : anchors_) {
      anchor.attachment_ += offset;
    }
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
    
    btk::math::Quaternion rotation;
    if (dot < -0.9999f) {
      // Opposite direction, rotate 180 degrees around Z axis to keep target upright
      btk::math::Vector3D axis(0.0f, 0.0f, 1.0f);
      rotation = btk::math::Quaternion::fromAxisAngle(axis, 3.14159265359f);
    } else {
      // General case: rotate from current normal to target normal
      btk::math::Vector3D axis = current_normal.cross(target_normal).normalized();
      float angle = std::acos(dot);
      rotation = btk::math::Quaternion::fromAxisAngle(axis, angle);
    }
    
    // Rotate all chain attachments around center of mass
    for (auto& anchor : anchors_) {
      btk::math::Vector3D offset = anchor.attachment_ - position_;
      offset = rotation.rotate(offset);
      anchor.attachment_ = position_ + offset;
    }
    
    // Update orientation and normal
    orientation_ = rotation * orientation_;
    orientation_.normalize();
    normal_ = orientation_.rotate(btk::math::Vector3D(1.0f, 0.0f, 0.0f));
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
    // Calculate area based on shape
    float area;
    if (is_oval_) {
      // Oval (ellipse) area
      float a = width_ / 2.0f;
      float b = height_ / 2.0f;
      area = 3.14159265359f * a * b;
    } else {
      // Rectangle area
      area = width_ * height_;
    }

    // Calculate mass
    mass_kg_ = area * thickness_ * STEEL_DENSITY;

    // Calculate moment of inertia (shape is in YZ plane, centered at origin)
    if (is_oval_) {
      // Oval inertia
      float a = width_ / 2.0f;
      float b = height_ / 2.0f;
      inertia_tensor_.x = 0.25f * mass_kg_ * b * b;
      inertia_tensor_.y = 0.25f * mass_kg_ * a * a;
      inertia_tensor_.z = 0.25f * mass_kg_ * (a * a + b * b);
    } else {
      // Rectangle inertia
      inertia_tensor_.x = mass_kg_ * height_ * height_ / 12.0f;
      inertia_tensor_.y = mass_kg_ * width_ * width_ / 12.0f;
      inertia_tensor_.z = mass_kg_ * (width_ * width_ + height_ * height_) / 12.0f;
    }
  }

  bool SteelTarget::isPointInTarget(const btk::math::Vector3D& point) const {
    // Shape is in YZ plane, centered at position_
    float dy = point.y - position_.y;
    float dz = point.z - position_.z;
    
    if (is_oval_) {
      // Oval (ellipse) test
      float a = width_ / 2.0f;
      float b = height_ / 2.0f;
      return (dy * dy) / (a * a) + (dz * dz) / (b * b) <= 1.0f;
    } else {
      // Rectangle test
      return std::abs(dy) <= width_ / 2.0f && std::abs(dz) <= height_ / 2.0f;
    }
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

    // Apply to angular velocity (omega += I^-1 * L) using full 3D inertia
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

    // Move all chain attachments with the center of mass
    for (auto& anchor : anchors_) {
      anchor.attachment_ += position_delta;
    }

    // Angular velocity integration: allow X and Y axis rotation (twisting and swinging)
    // Z-axis is constrained (angular_velocity_.z was zeroed above) to reduce unphysical vertical spinning
    if (angular_velocity_.magnitude() > 1e-6f) {
      float angle = angular_velocity_.magnitude() * dt;
      btk::math::Vector3D axis = angular_velocity_.normalized();
      btk::math::Quaternion rotation = btk::math::Quaternion::fromAxisAngle(axis, angle);

      // Update orientation and normal from accumulated rotation
      orientation_ = rotation * orientation_;
      orientation_.normalize();
      normal_ = orientation_.rotate(btk::math::Vector3D(1.0f, 0.0f, 0.0f));

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

  void SteelTarget::updateDisplay() {
    vertices_buffer_.clear();
    float halfThickness = thickness_ / 2.0f;

    // Use full orientation quaternion to rotate from local (+X-normal) frame to world
    btk::math::Quaternion rotation_quat = orientation_;

    if (is_oval_) {
      // Oval with thickness: front face, back face, and edge
      // Shape is in YZ plane with normal in +X direction (before rotation)
      float rx = width_ / 2.0f;
      float ry = height_ / 2.0f;
      
      // Generate front and back faces
      for (int i = 0; i < segments_per_circle_; ++i) {
        float angle1 = (2.0f * M_PI_F * i) / segments_per_circle_;
        float angle2 = (2.0f * M_PI_F * (i + 1)) / segments_per_circle_;
        
        float cos1 = std::cos(angle1), sin1 = std::sin(angle1);
        float cos2 = std::cos(angle2), sin2 = std::sin(angle2);
        
        // Generate vertices in local space (relative to position_, normal in +X)
        btk::math::Vector3D centerFront_local(halfThickness, 0.0f, 0.0f);
        btk::math::Vector3D v1Front_local(halfThickness, rx * cos1, ry * sin1);
        btk::math::Vector3D v2Front_local(halfThickness, rx * cos2, ry * sin2);
        
        btk::math::Vector3D centerBack_local(-halfThickness, 0.0f, 0.0f);
        btk::math::Vector3D v1Back_local(-halfThickness, rx * cos1, ry * sin1);
        btk::math::Vector3D v2Back_local(-halfThickness, rx * cos2, ry * sin2);
        
        // Rotate vertices by current orientation (in BTK space)
        btk::math::Vector3D centerFront = position_ + rotation_quat.rotate(centerFront_local);
        btk::math::Vector3D v1Front = position_ + rotation_quat.rotate(v1Front_local);
        btk::math::Vector3D v2Front = position_ + rotation_quat.rotate(v2Front_local);
        btk::math::Vector3D centerBack = position_ + rotation_quat.rotate(centerBack_local);
        btk::math::Vector3D v1Back = position_ + rotation_quat.rotate(v1Back_local);
        btk::math::Vector3D v2Back = position_ + rotation_quat.rotate(v2Back_local);
        
        // Helper lambda to convert BTK coords to Three.js coords and push to buffer
        // BTK: X=downrange, Y=crossrange, Z=up
        // Three.js: X=right, Y=up, Z=towards camera
        auto pushThreeJsVertex = [&](const btk::math::Vector3D& btk) {
          vertices_buffer_.push_back(btk.y);   // BTK Y → Three X
          vertices_buffer_.push_back(btk.z);  // BTK Z → Three Y
          vertices_buffer_.push_back(-btk.x); // BTK -X → Three Z
        };
        
        // Front face - write as x,y,z,x,y,z,x,y,z in Three.js space
        pushThreeJsVertex(centerFront);
        pushThreeJsVertex(v1Front);
        pushThreeJsVertex(v2Front);
        
        // Back face
        pushThreeJsVertex(centerBack);
        pushThreeJsVertex(v2Back);
        pushThreeJsVertex(v1Back);
        
        // Edge face (quad connecting front and back)
        pushThreeJsVertex(v1Front);
        pushThreeJsVertex(v1Back);
        pushThreeJsVertex(v2Front);
        pushThreeJsVertex(v2Front);
        pushThreeJsVertex(v1Back);
        pushThreeJsVertex(v2Back);
      }
    } else {
      // Rectangle with thickness: front face, back face, and 4 edge faces
      // Shape is in YZ plane with normal in +X direction (before rotation)
      float hw = width_ / 2.0f;
      float hh = height_ / 2.0f;
      
      // Generate corners in local space (relative to position_, normal in +X)
      btk::math::Vector3D v0_local(-halfThickness, -hw, -hh);
      btk::math::Vector3D v1_local(-halfThickness, +hw, -hh);
      btk::math::Vector3D v2_local(-halfThickness, +hw, +hh);
      btk::math::Vector3D v3_local(-halfThickness, -hw, +hh);
      btk::math::Vector3D v4_local(+halfThickness, -hw, -hh);
      btk::math::Vector3D v5_local(+halfThickness, +hw, -hh);
      btk::math::Vector3D v6_local(+halfThickness, +hw, +hh);
      btk::math::Vector3D v7_local(+halfThickness, -hw, +hh);
      
      // Rotate to world space using full orientation (in BTK space)
      btk::math::Vector3D v0 = position_ + rotation_quat.rotate(v0_local);
      btk::math::Vector3D v1 = position_ + rotation_quat.rotate(v1_local);
      btk::math::Vector3D v2 = position_ + rotation_quat.rotate(v2_local);
      btk::math::Vector3D v3 = position_ + rotation_quat.rotate(v3_local);
      btk::math::Vector3D v4 = position_ + rotation_quat.rotate(v4_local);
      btk::math::Vector3D v5 = position_ + rotation_quat.rotate(v5_local);
      btk::math::Vector3D v6 = position_ + rotation_quat.rotate(v6_local);
      btk::math::Vector3D v7 = position_ + rotation_quat.rotate(v7_local);
      
      // Helper lambda to convert BTK coords to Three.js coords and push to buffer
      // BTK: X=downrange, Y=crossrange, Z=up
      // Three.js: X=right, Y=up, Z=towards camera
      auto pushThreeJsVertex = [&](const btk::math::Vector3D& btk) {
        vertices_buffer_.push_back(btk.y);   // BTK Y → Three X
        vertices_buffer_.push_back(btk.z);  // BTK Z → Three Y
        vertices_buffer_.push_back(-btk.x); // BTK -X → Three Z
      };
      
      // Front face (X = +halfThickness)
      pushThreeJsVertex(v4);
      pushThreeJsVertex(v5);
      pushThreeJsVertex(v6);
      pushThreeJsVertex(v4);
      pushThreeJsVertex(v6);
      pushThreeJsVertex(v7);
      
      // Back face (X = -halfThickness)
      pushThreeJsVertex(v0);
      pushThreeJsVertex(v2);
      pushThreeJsVertex(v1);
      pushThreeJsVertex(v0);
      pushThreeJsVertex(v3);
      pushThreeJsVertex(v2);
      
      // Edge faces (4 sides)
      // Bottom edge
      pushThreeJsVertex(v0);
      pushThreeJsVertex(v1);
      pushThreeJsVertex(v5);
      pushThreeJsVertex(v0);
      pushThreeJsVertex(v5);
      pushThreeJsVertex(v4);
      // Top edge
      pushThreeJsVertex(v2);
      pushThreeJsVertex(v6);
      pushThreeJsVertex(v3);
      pushThreeJsVertex(v3);
      pushThreeJsVertex(v6);
      pushThreeJsVertex(v7);
      // Left edge
      pushThreeJsVertex(v0);
      pushThreeJsVertex(v4);
      pushThreeJsVertex(v7);
      pushThreeJsVertex(v0);
      pushThreeJsVertex(v7);
      pushThreeJsVertex(v3);
      // Right edge
      pushThreeJsVertex(v1);
      pushThreeJsVertex(v5);
      pushThreeJsVertex(v6);
      pushThreeJsVertex(v1);
      pushThreeJsVertex(v6);
      pushThreeJsVertex(v2);
    }
  }

#ifdef __EMSCRIPTEN__
  emscripten::val SteelTarget::getVertices() const {
    using namespace emscripten;
    if (vertices_buffer_.empty()) {
      // Return an empty Float32Array
      return val::global("Float32Array").new_(0);
    }
    // Wrap a typed memory view in a JS value (Float32Array view into WASM memory)
    return val(typed_memory_view(vertices_buffer_.size(), vertices_buffer_.data()));
  }
#endif

} // namespace btk::match
