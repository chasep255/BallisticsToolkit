#include "rendering/steel_target.h"
#include "math/conversions.h"
#include "math/random.h"
#include "physics/constants.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace btk::rendering
{
  SteelTarget::SteelTarget(float width, float height, float thickness, bool is_oval, int texture_size)
    : width_(width), height_(height), thickness_(thickness), is_oval_(is_oval), position_(0.0f, 0.0f, 0.0f), normal_(0.0f, 0.0f, -1.0f), orientation_(btk::math::Quaternion()),
      velocity_ms_(0.0f, 0.0f, 0.0f), angular_velocity_(0.0f, 0.0f, 0.0f), is_moving_(true), time_below_threshold_s_(0.0f), mass_kg_(0.0f), inertia_tensor_(0.0f, 0.0f, 0.0f),
      texture_width_(texture_size * 2), texture_height_(texture_size) // 2x width for front/back halves
  {
    // Default colors: bright red paint, gray metal
    paint_color_[0] = 255;
    paint_color_[1] = 40;
    paint_color_[2] = 40;
    metal_color_[0] = 140;
    metal_color_[1] = 140;
    metal_color_[2] = 140;

    calculateMassAndInertia();
    initializeTexture(); // Initialize texture buffer
  }

  SteelTarget::SteelTarget(float width, float height, float thickness, bool is_oval, const btk::math::Vector3D& position, const btk::math::Vector3D& normal, int texture_size)
    : width_(width), height_(height), thickness_(thickness), is_oval_(is_oval), position_(position), normal_(normal.normalized()), orientation_(btk::math::Quaternion()),
      velocity_ms_(0.0f, 0.0f, 0.0f), angular_velocity_(0.0f, 0.0f, 0.0f), is_moving_(true), time_below_threshold_s_(0.0f), mass_kg_(0.0f), inertia_tensor_(0.0f, 0.0f, 0.0f),
      texture_width_(texture_size * 2), texture_height_(texture_size) // 2x width for front/back halves
  {
    // Default colors: bright red paint, gray metal
    paint_color_[0] = 255;
    paint_color_[1] = 40;
    paint_color_[2] = 40;
    metal_color_[0] = 140;
    metal_color_[1] = 140;
    metal_color_[2] = 140;

    // Calculate orientation from normal
    btk::math::Vector3D default_normal(0.0f, 0.0f, -1.0f);
    float dot = normal_.dot(default_normal);

    if(dot < -0.9999f)
    {
      // Opposite direction: 180° rotation around Y
      btk::math::Vector3D axis(0.0f, 1.0f, 0.0f);
      orientation_ = btk::math::Quaternion::fromAxisAngle(axis, 3.14159265359f);
    }
    else if(dot < 0.9999f)
    {
      // General case
      btk::math::Vector3D axis = default_normal.cross(normal_).normalized();
      float angle = std::acos(dot);
      orientation_ = btk::math::Quaternion::fromAxisAngle(axis, angle);
    }
    // else: already aligned, identity quaternion is correct

    calculateMassAndInertia();
    initializeTexture();
  }

  void SteelTarget::addChainAnchor(const btk::math::Vector3D& local_attachment, const btk::math::Vector3D& world_fixed)
  {
    // Transform local attachment to world space
    btk::math::Vector3D world_attachment = localToWorld(local_attachment);

    // Calculate rest length as distance from world_fixed to world_attachment
    float rest_length = (world_fixed - world_attachment).magnitude();

    anchors_.emplace_back(local_attachment, world_fixed, rest_length);
  }

  btk::math::Vector3D SteelTarget::localToWorld(const btk::math::Vector3D& local_point) const
  {
    // Rotate the local point by the target's orientation
    btk::math::Vector3D rotated = orientation_.rotate(local_point);
    // Translate by the target's position
    return position_ + rotated;
  }

  void SteelTarget::hit(const btk::ballistics::Bullet& bullet)
  {
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
    is_moving_ = true;
    time_below_threshold_s_ = 0.0f;
    btk::math::Vector3D impulse = bullet_momentum * transfer_ratio;
    applyImpulse(impulse, impact_point);

    // Record impact for visualization
    recordImpact(bullet);
  }

  std::optional<btk::ballistics::TrajectoryPoint> SteelTarget::intersectTrajectory(const btk::ballistics::Trajectory& trajectory) const
  {
    using btk::math::Vector3D;

    if(trajectory.isEmpty())
    {
      return std::nullopt;
    }

    // Compute downrange distance (positive meters) of the target's plate corners
    // using the same convention as TrajectoryPoint::getDistance() (distance = -Z).
    float half_width = width_ * 0.5f;
    float half_height = height_ * 0.5f;

    Vector3D corners_local[4] = {Vector3D(-half_width, -half_height, 0.0f), Vector3D(half_width, -half_height, 0.0f), Vector3D(half_width, half_height, 0.0f),
                                 Vector3D(-half_width, half_height, 0.0f)};

    float min_dist = std::numeric_limits<float>::max();
    float max_dist = std::numeric_limits<float>::lowest();

    for(const auto& c_local : corners_local)
    {
      Vector3D c_world = position_ + orientation_.rotate(c_local);
      float d = -c_world.z; // positive downrange distance
      min_dist = std::min(min_dist, d);
      max_dist = std::max(max_dist, d);
    }

    if(!(min_dist < max_dist))
    {
      return std::nullopt;
    }

    // Extract the trajectory segment that spans the target's downrange extent
    auto pt_start_opt = trajectory.atDistance(min_dist);
    auto pt_end_opt = trajectory.atDistance(max_dist);
    if(!pt_start_opt.has_value() || !pt_end_opt.has_value())
    {
      return std::nullopt;
    }

    const Vector3D& p_start = pt_start_opt->getPosition();
    const Vector3D& p_end = pt_end_opt->getPosition();

    // Get bullet radius for line break rule (bullet diameter doesn't change during flight)
    float bullet_radius = pt_start_opt->getState().getDiameter() * 0.5f;

    // Raycast this segment into the target (with line break rule)
    auto hit_opt = intersectSegment(p_start, p_end, bullet_radius);
    if(!hit_opt.has_value())
    {
      return std::nullopt;
    }

    const Vector3D& hit_point = hit_opt->point_world_;
    float hit_dist = -hit_point.z;

    // Query the trajectory state at the impact distance
    auto pt_hit_opt = trajectory.atDistance(hit_dist);
    if(!pt_hit_opt.has_value())
    {
      return std::nullopt;
    }

    // Return the trajectory point at the impact distance; caller can use its
    // Bullet state or position as needed.
    return pt_hit_opt;
  }

  std::optional<SteelTarget::RaycastHit> SteelTarget::intersectSegment(const btk::math::Vector3D& start, const btk::math::Vector3D& end, float bullet_radius) const
  {
    // Transform segment into target-local space where the plate lies in the XY
    // plane with its mid-plane at Z = 0 and finite width_/height_ extents.
    btk::math::Quaternion inv_orientation = orientation_.conjugate();

    btk::math::Vector3D start_local = inv_orientation.rotate(start - position_);
    btk::math::Vector3D end_local = inv_orientation.rotate(end - position_);
    btk::math::Vector3D dir_local = end_local - start_local;

    // If segment is nearly parallel to plate plane (local Z), treat as no hit
    constexpr float EPS = 1e-6f;
    if(std::fabs(dir_local.z) < EPS)
    {
      return std::nullopt;
    }

    // Intersect segment with plate mid-plane at z = 0
    // start_local.z + t * dir_local.z = 0  =>  t = -start_local.z / dir_local.z
    float t = -start_local.z / dir_local.z;
    if(t < 0.0f || t > 1.0f)
    {
      // Intersection with plane lies outside the segment
      return std::nullopt;
    }

    // Compute local-space intersection point
    btk::math::Vector3D hit_local = start_local + dir_local * t;

    // Check against finite plate extents in local XY
    // Line break rule: expand bounds by bullet radius
    float half_width = width_ * 0.5f + bullet_radius;
    float half_height = height_ * 0.5f + bullet_radius;

    bool inside = false;
    if(is_oval_)
    {
      // Elliptical plate: (x/a)^2 + (y/b)^2 <= 1
      // Expanded ellipse with bullet radius
      float nx = hit_local.x / half_width;
      float ny = hit_local.y / half_height;
      inside = (nx * nx + ny * ny) <= 1.0f;
    }
    else
    {
      // Rectangular plate: |x| <= half_width, |y| <= half_height
      // Expanded rectangle with bullet radius
      inside = (std::fabs(hit_local.x) <= half_width) && (std::fabs(hit_local.y) <= half_height);
    }

    if(!inside)
    {
      return std::nullopt;
    }

    // Convert intersection point and normal back to world space
    btk::math::Vector3D hit_world = position_ + orientation_.rotate(hit_local);

    // Use the current target normal for the surface normal in world space.
    // This matches the plate's facing direction used elsewhere.
    btk::math::Vector3D normal_world = normal_;

    // Distance along the original world-space segment to the impact point
    float segment_length = (end - start).magnitude();
    float distance_m = segment_length * t;

    RaycastHit result;
    result.point_world_ = hit_world;
    result.normal_world_ = normal_world;
    result.distance_m_ = distance_m;
    return result;
  }

  void SteelTarget::calculateMassAndInertia()
  {
    // Calculate area based on shape
    float area;
    if(is_oval_)
    {
      // Oval (ellipse) area
      float a = width_ / 2.0f;
      float b = height_ / 2.0f;
      area = 3.14159265359f * a * b;
    }
    else
    {
      // Rectangle area
      area = width_ * height_;
    }

    // Calculate mass from geometry
    float calculated_mass = area * thickness_ * STEEL_DENSITY;

    // Apply minimum mass for stability
    mass_kg_ = std::max(calculated_mass, MIN_MASS);

    // Calculate moment of inertia (shape is in YZ plane, centered at origin)
    // Use calculated mass for geometric properties, then scale by actual mass ratio
    float mass_ratio = (calculated_mass > 0.0f) ? (mass_kg_ / calculated_mass) : 1.0f;
    if(is_oval_)
    {
      // Oval inertia (calculated with geometric mass, then scaled)
      float a = width_ / 2.0f;
      float b = height_ / 2.0f;
      inertia_tensor_.x = 0.25f * calculated_mass * b * b * mass_ratio;
      inertia_tensor_.y = 0.25f * calculated_mass * a * a * mass_ratio;
      inertia_tensor_.z = 0.25f * calculated_mass * (a * a + b * b) * mass_ratio;
    }
    else
    {
      // Rectangle inertia (calculated with geometric mass, then scaled)
      inertia_tensor_.x = calculated_mass * height_ * height_ / 12.0f * mass_ratio;
      inertia_tensor_.y = calculated_mass * width_ * width_ / 12.0f * mass_ratio;
      inertia_tensor_.z = calculated_mass * (width_ * width_ + height_ * height_) / 12.0f * mass_ratio;
    }
  }

  float SteelTarget::calculateMomentumTransferRatio(float angle_to_normal) const
  {
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

  void SteelTarget::applyImpulse(const btk::math::Vector3D& impulse, const btk::math::Vector3D& world_position)
  {
    // Linear impulse
    velocity_ms_ += impulse / mass_kg_;

    // Angular impulse: apply torque consistently with local-space inertia tensor.
    // 1) Lever arm and force in world space
    btk::math::Vector3D r_world = world_position - position_;
    btk::math::Vector3D F_world = impulse;

    // 2) Convert r and F to local space using the conjugate (inverse) rotation
    btk::math::Quaternion inv_orientation = orientation_.conjugate();
    btk::math::Vector3D r_local = inv_orientation.rotate(r_world);
    btk::math::Vector3D F_local = inv_orientation.rotate(F_world);

    // 3) Torque in local space
    btk::math::Vector3D torque_local = r_local.cross(F_local);

    // 4) Angular acceleration in local space using diagonal inertia tensor
    btk::math::Vector3D ang_acc_local(torque_local.x / inertia_tensor_.x, torque_local.y / inertia_tensor_.y, torque_local.z / inertia_tensor_.z);

    // 5) Convert angular acceleration back to world space and accumulate
    btk::math::Vector3D ang_acc_world = orientation_.rotate(ang_acc_local);
    angular_velocity_ += ang_acc_world;
  }

  void SteelTarget::applyForce(const btk::math::Vector3D& force, const btk::math::Vector3D& world_position, float dt)
  {
    // Convert force to impulse
    btk::math::Vector3D impulse = force * dt;
    applyImpulse(impulse, world_position);
  }

  void SteelTarget::timeStep(float dt)
  {
    // Clamp dt to maximum 1 second
    dt = std::min(dt, 1.0f);

    // Subdivide into smaller steps if needed for stability
    constexpr float MAX_SUBSTEP_DT = 0.001f; // 1ms maximum substep

    // Subdivide into smaller steps if needed
    int num_substeps = static_cast<int>(std::ceil(dt / MAX_SUBSTEP_DT));
    float substep_dt = dt / num_substeps;

    for(int i = 0; i < num_substeps; ++i)
    {
      // Apply gravity (BTK: Y is up, so gravity is in -Y direction)
      btk::math::Vector3D gravity_force(0.0f, -btk::physics::Constants::GRAVITY * mass_kg_, 0.0f);
      applyForce(gravity_force, position_, substep_dt);

      // Apply chain tension forces
      applyChainForces(substep_dt);

      // Apply damping proportional to dt
      // Convert damping coefficients to per-second rates
      // damping_factor = damping_coefficient^dt
      float linear_damping_factor = std::pow(LINEAR_DAMPING, substep_dt);
      float angular_damping_factor = std::pow(ANGULAR_DAMPING, substep_dt);
      velocity_ms_ = velocity_ms_ * linear_damping_factor;
      angular_velocity_ = angular_velocity_ * angular_damping_factor;

      // Semi-implicit Euler integration
      position_ += velocity_ms_ * substep_dt;

      // Angular velocity integration
      float angular_speed = angular_velocity_.magnitude();
      if(angular_speed > 1e-6f)
      {
        float angle = angular_speed * substep_dt;
        btk::math::Vector3D axis = angular_velocity_ / angular_speed;
        btk::math::Quaternion rotation = btk::math::Quaternion::fromAxisAngle(axis, angle);
        orientation_ = rotation * orientation_;
        orientation_.normalize();
        // Recompute surface normal from orientation.
        // Local default normal is (0, 0, -1) (uprange), so rotate that into world space.
        normal_ = orientation_.rotate(btk::math::Vector3D(0.0f, 0.0f, -1.0f));
      }
    }

    // Update is_moving flag based on velocity thresholds with time-window settle detection
    float linear_speed = velocity_ms_.magnitude();
    float angular_speed = angular_velocity_.magnitude();

    if(linear_speed < VELOCITY_THRESHOLD && angular_speed < ANGULAR_VELOCITY_THRESHOLD)
    {
      // Accumulate time spent below thresholds
      time_below_threshold_s_ += dt;

      // Only settle after sustained period below threshold (avoids settling at swing apex)
      if(time_below_threshold_s_ >= SETTLE_TIME_THRESHOLD_S)
      {
        is_moving_ = false;
      }
    }
    else
    {
      // Reset settle timer when speeds exceed thresholds
      time_below_threshold_s_ = 0.0f;
      is_moving_ = true;
    }
  }

  void SteelTarget::applyChainForces(float dt)
  {
    for(const auto& anchor : anchors_)
    {
      // Transform local attachment to world space
      btk::math::Vector3D world_attachment = localToWorld(anchor.local_attachment_);

      // Vector from world_fixed to world_attachment
      btk::math::Vector3D vec = world_attachment - anchor.world_fixed_;
      float distance = vec.magnitude();

      if(distance < 1e-6f)
        continue; // Avoid division by zero

      // Chain tension: only applies force when stretched beyond rest length
      float extension = distance - anchor.rest_length_;

      // Chains can't push, only pull (tension only when extended)
      if(extension > 0.0f)
      {
        // Direction from attachment to fixed (pulling back)
        btk::math::Vector3D direction = (anchor.world_fixed_ - world_attachment) / distance;

        // Calculate velocity of attachment point along chain direction
        // Velocity of a point on rigid body = v_com + omega × r
        btk::math::Vector3D r = world_attachment - position_;
        btk::math::Vector3D attachment_velocity = velocity_ms_ + angular_velocity_.cross(r);

        // Velocity component along chain direction (positive = extending)
        float velocity_along_chain = attachment_velocity.dot(direction);

        // Spring force: F = -k * x (restoring force)
        btk::math::Vector3D spring_force = direction * (SPRING_CONSTANT * extension);

        // Damping force: F = -c * v (dissipates energy, prevents bouncing)
        // Only apply when extending (velocity > 0) - chains don't resist going slack
        btk::math::Vector3D damping_force(0.0f, 0.0f, 0.0f);
        if(velocity_along_chain > 0.0f)
        {
          damping_force = direction * (-CHAIN_DAMPING * velocity_along_chain);
        }

        // Total force - critically damped system prevents oscillation
        btk::math::Vector3D total_force = spring_force + damping_force;

        // Apply force at world_attachment point (handles both linear and angular)
        applyForce(total_force, world_attachment, dt);
      }
    }
  }

  void SteelTarget::recordImpact(const btk::ballistics::Bullet& bullet)
  {
    // Convert bullet position and velocity to target-local coordinates
    btk::math::Vector3D local_pos = bullet.getPosition() - position_;
    btk::math::Quaternion inv_orientation = orientation_.conjugate();
    btk::math::Vector3D local_pos_rotated = inv_orientation.rotate(local_pos);
    btk::math::Vector3D local_vel_rotated = inv_orientation.rotate(bullet.getVelocity());

    // Clamp local position to actual target bounds (for line break rule hits)
    // This ensures texture mapping works correctly even when hit point is outside bounds
    float half_width = width_ * 0.5f;
    float half_height = height_ * 0.5f;
    btk::math::Vector3D local_pos_clamped = local_pos_rotated;

    if(is_oval_)
    {
      // For oval targets, clamp to ellipse boundary
      float nx = local_pos_rotated.x / half_width;
      float ny = local_pos_rotated.y / half_height;
      float dist_from_center = std::sqrt(nx * nx + ny * ny);
      if(dist_from_center > 1.0f)
      {
        // Project point onto ellipse boundary by scaling normalized coordinates
        float scale = 1.0f / dist_from_center;
        local_pos_clamped.x = nx * scale * half_width;
        local_pos_clamped.y = ny * scale * half_height;
      }
    }
    else
    {
      // For rectangular targets, clamp to rectangle boundary
      local_pos_clamped.x = std::max(-half_width, std::min(half_width, local_pos_rotated.x));
      local_pos_clamped.y = std::max(-half_height, std::min(half_height, local_pos_rotated.y));
    }
    // Z component stays the same (should be near 0 anyway)

    // Determine which face was hit based on bullet velocity vs surface normal.
    // If the bullet velocity opposes the surface normal (dot < 0), it struck the front face.
    // If it roughly aligns with the normal (dot > 0), it struck the back face.
    btk::math::Vector3D vel_world = bullet.getVelocity();
    bool is_front_face = vel_world.dot(normal_) < 0.0f;

    // Store impact in local coordinates (use original position for physics, clamped for display)
    impacts_.emplace_back(local_pos_rotated, local_vel_rotated, bullet.getDiameter(), 0.0f);

    // Draw impact using clamped position to ensure it's within texture bounds
    drawImpactOnTexture(local_pos_clamped, bullet.getDiameter(), is_front_face);
  }

#ifdef __EMSCRIPTEN__
  emscripten::val SteelTarget::getTexture() const
  {
    using namespace emscripten;
    if(texture_buffer_.empty())
    {
      return val::global("Uint8Array").new_(0);
    }
    return val(typed_memory_view(texture_buffer_.size(), texture_buffer_.data()));
  }
#endif

  void SteelTarget::setColors(uint8_t paint_r, uint8_t paint_g, uint8_t paint_b, uint8_t metal_r, uint8_t metal_g, uint8_t metal_b)
  {
    paint_color_[0] = paint_r;
    paint_color_[1] = paint_g;
    paint_color_[2] = paint_b;
    metal_color_[0] = metal_r;
    metal_color_[1] = metal_g;
    metal_color_[2] = metal_b;
  }

  void SteelTarget::initializeTexture()
  {
    // texture_width_ and texture_height_ set by constructor
    size_t pixel_count = texture_width_ * texture_height_;
    texture_buffer_.resize(pixel_count * 4);

    // Fill entire texture with paint color (fully opaque)
    for(size_t i = 0; i < pixel_count; ++i)
    {
      texture_buffer_[i * 4 + 0] = paint_color_[0]; // R
      texture_buffer_[i * 4 + 1] = paint_color_[1]; // G
      texture_buffer_[i * 4 + 2] = paint_color_[2]; // B
      texture_buffer_[i * 4 + 3] = 255;             // A
    }
  }

  void SteelTarget::drawImpactOnTexture(const btk::math::Vector3D& local_position, float bullet_diameter, bool is_front_face)
  {
    // In local frame, target is in XY plane (Z is normal)
    // Map X and Y to UV coordinates [0, 1]
    float u = 0.5f + local_position.x / width_;
    float v = 0.5f + local_position.y / height_;

    // Skip if outside texture bounds
    if(u < 0.0f || u > 1.0f || v < 0.0f || v > 1.0f)
    {
      return;
    }

    // Texture is split: left half = front face (u=0-0.5), right half = back face (u=0.5-1.0)
    // Scale u to half width and offset to correct half
    int half_texture_width = texture_width_ / 2;
    int u_offset = is_front_face ? 0 : half_texture_width;

    // Convert UV to pixel coordinates within the correct half
    int center_x = u_offset + static_cast<int>(u * half_texture_width);
    int center_y = static_cast<int>(v * texture_height_);

    // Bounds for this face's half of the texture
    int u_min = is_front_face ? 0 : half_texture_width;
    int u_max = is_front_face ? half_texture_width : texture_width_;

    // Draw splatter as a circle revealing metal underneath
    // Splatter radius based on bullet diameter (scaled to texture space)
    float splatter_radius_m = bullet_diameter * 3.0f; // 3x bullet diameter

    // Calculate radius in pixels for X and Y separately to account for aspect ratio
    // Half texture width maps to target width, full texture height maps to target height
    int splatter_radius_px_x = static_cast<int>((splatter_radius_m / width_) * half_texture_width);
    int splatter_radius_px_y = static_cast<int>((splatter_radius_m / height_) * texture_height_);
    splatter_radius_px_x = std::max(3, splatter_radius_px_x);
    splatter_radius_px_y = std::max(3, splatter_radius_px_y);

    // Draw ellipse that appears circular on the target
    for(int dy = -splatter_radius_px_y; dy <= splatter_radius_px_y; ++dy)
    {
      for(int dx = -splatter_radius_px_x; dx <= splatter_radius_px_x; ++dx)
      {
        int px = center_x + dx;
        int py = center_y + dy;

        // Check bounds - confine to correct half of texture
        if(px < u_min || px >= u_max || py < 0 || py >= texture_height_)
          continue;

        // Calculate normalized distance (ellipse equation: (dx/rx)^2 + (dy/ry)^2 <= 1)
        float nx = static_cast<float>(dx) / splatter_radius_px_x;
        float ny = static_cast<float>(dy) / splatter_radius_px_y;
        float dist = std::sqrt(nx * nx + ny * ny);

        if(dist <= 1.0f)
        {
          // Blend from metal (center) to paint (edge)
          float blend = dist * dist; // Quadratic falloff for softer edge (dist is already 0-1)

          size_t pixel_idx = (py * texture_width_ + px) * 4;

          // Blend between metal and paint colors
          texture_buffer_[pixel_idx + 0] = static_cast<uint8_t>(metal_color_[0] * (1.0f - blend) + paint_color_[0] * blend);
          texture_buffer_[pixel_idx + 1] = static_cast<uint8_t>(metal_color_[1] * (1.0f - blend) + paint_color_[1] * blend);
          texture_buffer_[pixel_idx + 2] = static_cast<uint8_t>(metal_color_[2] * (1.0f - blend) + paint_color_[2] * blend);
          texture_buffer_[pixel_idx + 3] = 255; // Fully opaque
        }
      }
    }

    // Draw sharp spikes radiating outward
    int num_spikes = 10 + btk::math::Random::uniformInt(-4, 4);

    for(int spike = 0; spike < num_spikes; ++spike)
    {
      // Base angle evenly distributed, with random variation
      float base_angle = (2.0f * M_PI_F * spike) / num_spikes;
      float angle_variation = btk::math::Random::uniform(-0.3f, 0.3f);
      float angle = base_angle + angle_variation;

      // Direction in normalized space, then scale by aspect ratio for pixel space
      float dir_nx = std::cos(angle);
      float dir_ny = std::sin(angle);

      // Random spike length (in normalized units, like splatter radius)
      float length_randomness = btk::math::Random::uniform(0.8f, 1.2f);
      float spike_length_norm = 3.0f * length_randomness; // 3x splatter radius
      float spike_width = 2.5f * btk::math::Random::uniform(0.8f, 1.2f);

      // Draw spike as a thin triangle
      for(float t = 0.0f; t < spike_length_norm; t += 0.05f)
      {
        float width_at_t = spike_width * (1.0f - t / spike_length_norm); // Taper to point

        // Convert normalized position to pixel position
        int spike_x = center_x + static_cast<int>(dir_nx * t * splatter_radius_px_x);
        int spike_y = center_y + static_cast<int>(dir_ny * t * splatter_radius_px_y);

        // Draw width of spike at this point
        for(int w = -static_cast<int>(width_at_t); w <= static_cast<int>(width_at_t); ++w)
        {
          int px = spike_x + static_cast<int>(dir_ny * w);
          int py = spike_y - static_cast<int>(dir_nx * w);

          // Check bounds - confine to correct half of texture
          if(px >= u_min && px < u_max && py >= 0 && py < texture_height_)
          {
            size_t pixel_idx = (py * texture_width_ + px) * 4;

            // Fade spike from metal to paint along its length
            float fade = t / spike_length_norm;
            fade = fade * fade; // Quadratic falloff

            texture_buffer_[pixel_idx + 0] = static_cast<uint8_t>(metal_color_[0] * (1.0f - fade) + paint_color_[0] * fade);
            texture_buffer_[pixel_idx + 1] = static_cast<uint8_t>(metal_color_[1] * (1.0f - fade) + paint_color_[1] * fade);
            texture_buffer_[pixel_idx + 2] = static_cast<uint8_t>(metal_color_[2] * (1.0f - fade) + paint_color_[2] * fade);
            texture_buffer_[pixel_idx + 3] = 255;
          }
        }
      }
    }
  }

} // namespace btk::rendering
