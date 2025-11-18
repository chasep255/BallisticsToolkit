#include "rendering/steel_target.h"
#include "physics/constants.h"
#include "math/conversions.h"
#include "math/random.h"
#include <cmath>
#include <stdexcept>

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

namespace btk::rendering
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
      is_moving_(true), // Assume moving initially
      mass_kg_(0.0f),
      inertia_tensor_(0.0f, 0.0f, 0.0f),
      linear_damping_(DEFAULT_LINEAR_DAMPING),
      angular_damping_(DEFAULT_ANGULAR_DAMPING),
      segments_per_circle_(32),
      texture_width_(512),
      texture_height_(512) {
    // Default colors: bright red paint, gray metal
    paint_color_[0] = 255; paint_color_[1] = 40; paint_color_[2] = 40;
    metal_color_[0] = 140; metal_color_[1] = 140; metal_color_[2] = 140;
    
    calculateMassAndInertia();
    updateDisplay(); // Initialize vertex buffer
    initializeTexture(); // Initialize texture buffer
  }

  SteelTarget::SteelTarget(float width, float height, float thickness, bool is_oval,
                           const btk::math::Vector3D& position, const btk::math::Vector3D& normal)
    : width_(width),
      height_(height),
      thickness_(thickness),
      is_oval_(is_oval),
      position_(position),
      normal_(normal.normalized()),
      orientation_(btk::math::Quaternion()),
      velocity_ms_(0.0f, 0.0f, 0.0f),
      angular_velocity_(0.0f, 0.0f, 0.0f),
      is_moving_(true), // Assume moving initially
      mass_kg_(0.0f),
      inertia_tensor_(0.0f, 0.0f, 0.0f),
      linear_damping_(DEFAULT_LINEAR_DAMPING),
      angular_damping_(DEFAULT_ANGULAR_DAMPING),
      segments_per_circle_(32),
      texture_width_(512),
      texture_height_(512) {
    // Default colors: bright red paint, gray metal
    paint_color_[0] = 255; paint_color_[1] = 40; paint_color_[2] = 40;
    metal_color_[0] = 140; metal_color_[1] = 140; metal_color_[2] = 140;
    
    // Calculate orientation from normal
    btk::math::Vector3D default_normal(1.0f, 0.0f, 0.0f);
    float dot = normal_.dot(default_normal);
    
    if (dot < -0.9999f) {
      // Opposite direction: 180° rotation around Z
      btk::math::Vector3D axis(0.0f, 0.0f, 1.0f);
      orientation_ = btk::math::Quaternion::fromAxisAngle(axis, 3.14159265359f);
    } else if (dot < 0.9999f) {
      // General case
      btk::math::Vector3D axis = default_normal.cross(normal_).normalized();
      float angle = std::acos(dot);
      orientation_ = btk::math::Quaternion::fromAxisAngle(axis, angle);
    }
    // else: already aligned, identity quaternion is correct
    
    calculateMassAndInertia();
    updateDisplay();
    initializeTexture();
  }

  void SteelTarget::addChainAnchor(const btk::math::Vector3D& local_attachment, const btk::math::Vector3D& world_fixed) {
    // Transform local attachment to world space
    btk::math::Vector3D world_attachment = localToWorld(local_attachment);
    
    // Calculate rest length as distance from world_fixed to world_attachment
    float rest_length = (world_fixed - world_attachment).magnitude();
    
    anchors_.emplace_back(local_attachment, world_fixed, rest_length, DEFAULT_SPRING_CONSTANT, DEFAULT_CHAIN_DAMPING);
  }


  btk::math::Vector3D SteelTarget::localToWorld(const btk::math::Vector3D& local_point) const {
    // Rotate the local point by the target's orientation
    btk::math::Vector3D rotated = orientation_.rotate(local_point);
    // Translate by the target's position
    return position_ + rotated;
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
    recordImpact(bullet);
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
    
    // Create bullet for impact recording
    btk::ballistics::Bullet impact_bullet(
      intersection.bullet_mass_kg_,
      intersection.bullet_diameter_,
      intersection.bullet_diameter_ * 3.0f, // Estimate length
      0.3f, // Estimate BC
      btk::ballistics::DragFunction::G7
    );
    btk::ballistics::Bullet flying_bullet(impact_bullet, intersection.impact_point_, intersection.impact_velocity_, 0.0f);
    
    // Record impact for visualization
    recordImpact(flying_bullet);
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
    
    // Impulse applied - target is now moving
    is_moving_ = true;
  }

  void SteelTarget::applyForce(const btk::math::Vector3D& force, const btk::math::Vector3D& world_position, float dt) {
    // Convert force to impulse
    btk::math::Vector3D impulse = force * dt;
    applyImpulse(impulse, world_position);
  }

  void SteelTarget::timeStep(float dt) {
    // Clamp dt to maximum 1 second
    dt = std::min(dt, 1.0f);
    
    // Subdivide into smaller steps if needed for stability
    constexpr float MAX_SUBSTEP_DT = 0.005f;  // 5ms maximum substep (can be smaller)
    
    // Subdivide into smaller steps if needed
    int num_substeps = static_cast<int>(std::ceil(dt / MAX_SUBSTEP_DT));
    float substep_dt = dt / num_substeps;
    
    for (int i = 0; i < num_substeps; ++i) {
      // Apply gravity (BTK: Z is up, so gravity is in -Z direction)
      btk::math::Vector3D gravity_force(0.0f, 0.0f, -btk::physics::Constants::GRAVITY * mass_kg_);
      applyForce(gravity_force, position_, substep_dt);
      
      // Apply chain tension forces
      applyChainForces(substep_dt);
      
      // Apply damping proportional to dt
      // Convert damping coefficients to per-second rates
      // damping_factor = damping_coefficient^dt
      float linear_damping_factor = std::pow(linear_damping_, substep_dt);
      float angular_damping_factor = std::pow(angular_damping_, substep_dt);
      velocity_ms_ = velocity_ms_ * linear_damping_factor;
      angular_velocity_ = angular_velocity_ * angular_damping_factor;

      // Semi-implicit Euler integration
      position_ += velocity_ms_ * substep_dt;
      
      // Angular velocity integration
      float angular_speed = angular_velocity_.magnitude();
      if (angular_speed > 0.0f) {
        float angle = angular_speed * substep_dt;
        btk::math::Vector3D axis = angular_velocity_ / angular_speed;
        btk::math::Quaternion rotation = btk::math::Quaternion::fromAxisAngle(axis, angle);
        orientation_ = rotation * orientation_;
        orientation_.normalize();
        normal_ = orientation_.rotate(btk::math::Vector3D(1.0f, 0.0f, 0.0f));
      }
    }
    
    // Update is_moving flag based on velocity thresholds
    float linear_speed = velocity_ms_.magnitude();
    float angular_speed = angular_velocity_.magnitude();
    is_moving_ = !(linear_speed < VELOCITY_THRESHOLD && angular_speed < ANGULAR_VELOCITY_THRESHOLD);
  }

  void SteelTarget::applyChainForces(float dt) {
    for (const auto& anchor : anchors_) {
      // Transform local attachment to world space
      btk::math::Vector3D world_attachment = localToWorld(anchor.local_attachment_);
      
      // Vector from world_fixed to world_attachment
      btk::math::Vector3D vec = world_attachment - anchor.world_fixed_;
      float distance = vec.magnitude();
      
      if (distance < 1e-6f) continue; // Avoid division by zero
      
      // Chain tension: only applies force when stretched beyond rest length
      float extension = distance - anchor.rest_length_;
      
      // Chains can't push, only pull (tension only when extended)
      if (extension > 0.0f) {
        // Direction from attachment to fixed (pulling back)
        btk::math::Vector3D direction = (anchor.world_fixed_ - world_attachment) / distance;
        
        // Calculate velocity of attachment point along chain direction
        // Velocity of a point on rigid body = v_com + omega × r
        btk::math::Vector3D r = world_attachment - position_;
        btk::math::Vector3D attachment_velocity = velocity_ms_ + angular_velocity_.cross(r);
        
        // Velocity component along chain direction (positive = extending)
        float velocity_along_chain = attachment_velocity.dot(direction);
        
        // Spring force: F = -k * x (restoring force)
        btk::math::Vector3D spring_force = direction * (anchor.spring_constant_ * extension);
        
        // Damping force: F = -c * v (dissipates energy, prevents bouncing)
        // Only apply when extending (velocity > 0) - chains don't resist going slack
        btk::math::Vector3D damping_force(0.0f, 0.0f, 0.0f);
        if (velocity_along_chain > 0.0f) {
          damping_force = direction * (-anchor.damping_coefficient_ * velocity_along_chain);
        }
        
        // Total force - critically damped system prevents oscillation
        btk::math::Vector3D total_force = spring_force + damping_force;
        
        // Apply force at world_attachment point (handles both linear and angular)
        applyForce(total_force, world_attachment, dt);
      }
    }
  }

  void SteelTarget::recordImpact(const btk::ballistics::Bullet& bullet) {
    // Convert bullet position and velocity to target-local coordinates
    btk::math::Vector3D local_pos = bullet.getPosition() - position_;
    btk::math::Quaternion inv_orientation = orientation_.conjugate();
    btk::math::Vector3D local_pos_rotated = inv_orientation.rotate(local_pos);
    btk::math::Vector3D local_vel_rotated = inv_orientation.rotate(bullet.getVelocity());
    
    // Determine which face was hit based on local X coordinate
    // In local frame: +X is front face, -X is back face
    bool is_front_face = local_pos_rotated.x > 0.0f;
    
    // Store impact in local coordinates
    impacts_.emplace_back(local_pos_rotated, local_vel_rotated, bullet.getDiameter(), 0.0f);
    
    drawImpactOnTexture(local_pos_rotated, bullet.getDiameter(), is_front_face);
  }

  void SteelTarget::updateDisplay() {
    vertices_buffer_.clear();
    uvs_buffer_.clear();
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
        
        // Helper lambda to push UV coordinates for FRONT face (left half of texture)
        auto pushUVFront = [&](const btk::math::Vector3D& local) {
          float u = 0.5f + local.y / width_;   // Y maps to U [0, 1]
          float v = 0.5f + local.z / height_;  // Z maps to V [0, 1]
          u = u * 0.5f;  // Scale to left half [0, 0.5]
          uvs_buffer_.push_back(u);
          uvs_buffer_.push_back(v);
        };
        
        // Helper lambda to push UV coordinates for BACK face (right half of texture)
        auto pushUVBack = [&](const btk::math::Vector3D& local) {
          float u = 0.5f + local.y / width_;   // Y maps to U [0, 1]
          float v = 0.5f + local.z / height_;  // Z maps to V [0, 1]
          u = u * 0.5f + 0.5f;  // Scale to right half [0.5, 1.0]
          uvs_buffer_.push_back(u);
          uvs_buffer_.push_back(v);
        };
        
        // Helper lambda to push blank UVs (for edges - no texture)
        auto pushBlankUV = [&]() {
          uvs_buffer_.push_back(-1.0f);  // Outside texture range
          uvs_buffer_.push_back(-1.0f);
        };
        
        // Front face - maps to left half of texture
        pushThreeJsVertex(centerFront);
        pushUVFront(centerFront_local);
        pushThreeJsVertex(v1Front);
        pushUVFront(v1Front_local);
        pushThreeJsVertex(v2Front);
        pushUVFront(v2Front_local);
        
        // Back face - maps to right half of texture
        pushThreeJsVertex(centerBack);
        pushUVBack(centerBack_local);
        pushThreeJsVertex(v2Back);
        pushUVBack(v2Back_local);
        pushThreeJsVertex(v1Back);
        pushUVBack(v1Back_local);
        
        // Edge face (quad connecting front and back) - 2 triangles - no texture
        pushThreeJsVertex(v1Front);
        pushBlankUV();
        pushThreeJsVertex(v1Back);
        pushBlankUV();
        pushThreeJsVertex(v2Front);
        pushBlankUV();
        
        pushThreeJsVertex(v2Front);
        pushBlankUV();
        pushThreeJsVertex(v1Back);
        pushBlankUV();
        pushThreeJsVertex(v2Back);
        pushBlankUV();
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
      
      // Helper lambda to push UV coordinates for FRONT face (left half of texture)
      auto pushUVFront = [&](const btk::math::Vector3D& local) {
        float u = 0.5f + local.y / width_;   // Y maps to U [0, 1]
        float v = 0.5f + local.z / height_;  // Z maps to V [0, 1]
        u = u * 0.5f;  // Scale to left half [0, 0.5]
        uvs_buffer_.push_back(u);
        uvs_buffer_.push_back(v);
      };
      
      // Helper lambda to push UV coordinates for BACK face (right half of texture)
      auto pushUVBack = [&](const btk::math::Vector3D& local) {
        float u = 0.5f + local.y / width_;   // Y maps to U [0, 1]
        float v = 0.5f + local.z / height_;  // Z maps to V [0, 1]
        u = u * 0.5f + 0.5f;  // Scale to right half [0.5, 1.0]
        uvs_buffer_.push_back(u);
        uvs_buffer_.push_back(v);
      };
      
      // Helper lambda to push blank UVs (for edges - no texture)
      auto pushBlankUV = [&]() {
        uvs_buffer_.push_back(-1.0f);  // Outside texture range
        uvs_buffer_.push_back(-1.0f);
      };
      
      // Front face (X = +halfThickness) - maps to left half of texture
      pushThreeJsVertex(v4); pushUVFront(v4_local);
      pushThreeJsVertex(v5); pushUVFront(v5_local);
      pushThreeJsVertex(v6); pushUVFront(v6_local);
      pushThreeJsVertex(v4); pushUVFront(v4_local);
      pushThreeJsVertex(v6); pushUVFront(v6_local);
      pushThreeJsVertex(v7); pushUVFront(v7_local);
      
      // Back face (X = -halfThickness) - maps to right half of texture
      pushThreeJsVertex(v0); pushUVBack(v0_local);
      pushThreeJsVertex(v2); pushUVBack(v2_local);
      pushThreeJsVertex(v1); pushUVBack(v1_local);
      pushThreeJsVertex(v0); pushUVBack(v0_local);
      pushThreeJsVertex(v3); pushUVBack(v3_local);
      pushThreeJsVertex(v2); pushUVBack(v2_local);
      
      // Edge faces (4 sides) - no texture
      // Bottom edge
      pushThreeJsVertex(v0); pushBlankUV();
      pushThreeJsVertex(v1); pushBlankUV();
      pushThreeJsVertex(v5); pushBlankUV();
      pushThreeJsVertex(v0); pushBlankUV();
      pushThreeJsVertex(v5); pushBlankUV();
      pushThreeJsVertex(v4); pushBlankUV();
      // Top edge
      pushThreeJsVertex(v2); pushBlankUV();
      pushThreeJsVertex(v6); pushBlankUV();
      pushThreeJsVertex(v3); pushBlankUV();
      pushThreeJsVertex(v3); pushBlankUV();
      pushThreeJsVertex(v6); pushBlankUV();
      pushThreeJsVertex(v7); pushBlankUV();
      // Left edge
      pushThreeJsVertex(v0); pushBlankUV();
      pushThreeJsVertex(v4); pushBlankUV();
      pushThreeJsVertex(v7); pushBlankUV();
      pushThreeJsVertex(v0); pushBlankUV();
      pushThreeJsVertex(v7); pushBlankUV();
      pushThreeJsVertex(v3); pushBlankUV();
      // Right edge
      pushThreeJsVertex(v1); pushBlankUV();
      pushThreeJsVertex(v5); pushBlankUV();
      pushThreeJsVertex(v6); pushBlankUV();
      pushThreeJsVertex(v1); pushBlankUV();
      pushThreeJsVertex(v6); pushBlankUV();
      pushThreeJsVertex(v2); pushBlankUV();
    }
  }

#ifdef __EMSCRIPTEN__
  emscripten::val SteelTarget::getVertices() const {
    using namespace emscripten;
    if (vertices_buffer_.empty()) {
      return val::global("Float32Array").new_(0);
    }
    return val(typed_memory_view(vertices_buffer_.size(), vertices_buffer_.data()));
  }

  emscripten::val SteelTarget::getUVs() const {
    using namespace emscripten;
    if (uvs_buffer_.empty()) {
      return val::global("Float32Array").new_(0);
    }
    return val(typed_memory_view(uvs_buffer_.size(), uvs_buffer_.data()));
  }

  emscripten::val SteelTarget::getTexture() const {
    using namespace emscripten;
    if (texture_buffer_.empty()) {
      return val::global("Uint8Array").new_(0);
    }
    return val(typed_memory_view(texture_buffer_.size(), texture_buffer_.data()));
  }
#endif

  void SteelTarget::setColors(uint8_t paint_r, uint8_t paint_g, uint8_t paint_b,
                               uint8_t metal_r, uint8_t metal_g, uint8_t metal_b) {
    paint_color_[0] = paint_r;
    paint_color_[1] = paint_g;
    paint_color_[2] = paint_b;
    metal_color_[0] = metal_r;
    metal_color_[1] = metal_g;
    metal_color_[2] = metal_b;
  }

  void SteelTarget::initializeTexture(int texture_width, int texture_height) {
    // Calculate texture size based on target aspect ratio
    // Keep a reasonable resolution while matching aspect ratio
    float aspect_ratio = width_ / height_;
    
    if (aspect_ratio > 1.0f) {
      // Width is larger
      texture_width_ = texture_width;
      texture_height_ = static_cast<int>(texture_width / aspect_ratio);
    } else {
      // Height is larger or square
      texture_height_ = texture_height;
      texture_width_ = static_cast<int>(texture_height * aspect_ratio);
    }
    
    // Allocate RGBA buffer - texture is 2x width (front on left half, back on right half)
    texture_width_ = texture_width_ * 2;  // Double the width to fit both faces side-by-side
    size_t pixel_count = texture_width_ * texture_height_;
    texture_buffer_.resize(pixel_count * 4);
    
    // Fill entire texture with paint color (fully opaque)
    for (size_t i = 0; i < pixel_count; ++i) {
      texture_buffer_[i * 4 + 0] = paint_color_[0]; // R
      texture_buffer_[i * 4 + 1] = paint_color_[1]; // G
      texture_buffer_[i * 4 + 2] = paint_color_[2]; // B
      texture_buffer_[i * 4 + 3] = 255;              // A
    }
  }

  void SteelTarget::drawImpactOnTexture(const btk::math::Vector3D& local_position,
                                         float bullet_diameter,
                                         bool is_front_face) {
    // In local frame, target is in YZ plane (X is normal)
    // Map Y and Z to UV coordinates [0, 1]
    float u = 0.5f + local_position.y / width_;
    float v = 0.5f + local_position.z / height_;
    
    // Offset U coordinate based on which face: front = left half (0-0.5), back = right half (0.5-1.0)
    // Since texture_width_ is 2x the target aspect, we need to map to the correct half
    float u_offset = is_front_face ? 0.0f : 0.5f;
    u = u * 0.5f + u_offset;  // Scale U to half width and offset to correct half
    
    // Skip if outside texture bounds
    if (u < 0.0f || u > 1.0f || v < 0.0f || v > 1.0f) {
      return;
    }
    
    // Convert UV to pixel coordinates
    int center_x = static_cast<int>(u * texture_width_);
    int center_y = static_cast<int>(v * texture_height_);
    
    // Draw splatter as a circle revealing metal underneath
    // Splatter radius based on bullet diameter (scaled to texture space)
    float splatter_radius_m = bullet_diameter * 3.0f; // 2x bullet diameter
    // Use average of texture dimensions for circular splatter
    float avg_texture_size = (texture_width_ + texture_height_) / 2.0f;
    float avg_target_size = (width_ + height_) / 2.0f;
    int splatter_radius_px = static_cast<int>((splatter_radius_m / avg_target_size) * avg_texture_size);
    splatter_radius_px = std::max(3, splatter_radius_px); // Minimum 3 pixels
    
    // Draw main circular splatter
    for (int dy = -splatter_radius_px; dy <= splatter_radius_px; ++dy) {
      for (int dx = -splatter_radius_px; dx <= splatter_radius_px; ++dx) {
        int px = center_x + dx;
        int py = center_y + dy;
        
        // Check bounds
        if (px < 0 || px >= texture_width_ || py < 0 || py >= texture_height_) continue;
        
        // Calculate distance from center
        float dist = std::sqrt(static_cast<float>(dx * dx + dy * dy));
        
        if (dist <= splatter_radius_px) {
          // Blend from metal (center) to paint (edge)
          float blend = dist / splatter_radius_px; // 0 at center, 1 at edge
          blend = blend * blend; // Quadratic falloff for softer edge
          
          size_t pixel_idx = (py * texture_width_ + px) * 4;
          
          // Blend between metal and paint colors
          texture_buffer_[pixel_idx + 0] = static_cast<uint8_t>(
            metal_color_[0] * (1.0f - blend) + paint_color_[0] * blend);
          texture_buffer_[pixel_idx + 1] = static_cast<uint8_t>(
            metal_color_[1] * (1.0f - blend) + paint_color_[1] * blend);
          texture_buffer_[pixel_idx + 2] = static_cast<uint8_t>(
            metal_color_[2] * (1.0f - blend) + paint_color_[2] * blend);
          texture_buffer_[pixel_idx + 3] = 255; // Fully opaque
        }
      }
    }
    
    // Draw sharp spikes radiating outward
    int num_spikes = 10 + btk::math::Random::uniformInt(-4, 4);
    
    for (int spike = 0; spike < num_spikes; ++spike) {
      // Base angle evenly distributed, with random variation
      float base_angle = (2.0f * M_PI_F * spike) / num_spikes;
      float angle_variation = btk::math::Random::uniform(-0.3f, 0.3f);
      float angle = base_angle + angle_variation;
      
      float spike_dir_x = std::cos(angle);
      float spike_dir_y = std::sin(angle);
      
      // Random spike length and width
      float length_randomness = btk::math::Random::uniform(0.8f, 1.2f);
      float spike_length = splatter_radius_px * 3.0f * length_randomness;
      float spike_width = 2.5f * btk::math::Random::uniform(0.8f, 1.2f);
      
      // Draw spike as a thin triangle
      for (float t = 0.0f; t < spike_length; t += 0.5f) {
        float width_at_t = spike_width * (1.0f - t / spike_length); // Taper to point
        
        int spike_x = center_x + static_cast<int>(spike_dir_x * t);
        int spike_y = center_y + static_cast<int>(spike_dir_y * t);
        
        // Draw width of spike at this point
        for (int w = -static_cast<int>(width_at_t); w <= static_cast<int>(width_at_t); ++w) {
          int px = spike_x + static_cast<int>(spike_dir_y * w);
          int py = spike_y - static_cast<int>(spike_dir_x * w);
          
          if (px >= 0 && px < texture_width_ && py >= 0 && py < texture_height_) {
            size_t pixel_idx = (py * texture_width_ + px) * 4;
            
            // Fade spike from metal to paint along its length
            float fade = t / spike_length;
            fade = fade * fade; // Quadratic falloff
            
            texture_buffer_[pixel_idx + 0] = static_cast<uint8_t>(
              metal_color_[0] * (1.0f - fade) + paint_color_[0] * fade);
            texture_buffer_[pixel_idx + 1] = static_cast<uint8_t>(
              metal_color_[1] * (1.0f - fade) + paint_color_[1] * fade);
            texture_buffer_[pixel_idx + 2] = static_cast<uint8_t>(
              metal_color_[2] * (1.0f - fade) + paint_color_[2] * fade);
            texture_buffer_[pixel_idx + 3] = 255;
          }
        }
      }
    }
  }

} // namespace btk::rendering
