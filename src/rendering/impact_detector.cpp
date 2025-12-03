#include "rendering/impact_detector.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace btk::rendering
{

  // ===== Collider =====

  Collider::Collider(const std::vector<float>& vertices, const std::vector<uint32_t>& indices) : indices_(indices), position_(0, 0, 0), rotation_(0, 0, 0, 1)
  {
    if(vertices.size() % 3 != 0)
    {
      throw std::invalid_argument("Collider: vertex count must be multiple of 3");
    }

    vertices_.reserve(vertices.size() / 3);
    for(size_t i = 0; i < vertices.size(); i += 3)
    {
      vertices_.emplace_back(vertices[i], vertices[i + 1], vertices[i + 2]);
    }

    // If no indices provided, assume sequential triangulation
    if(indices_.empty() && !vertices_.empty())
    {
      indices_.reserve(vertices_.size());
      for(uint32_t i = 0; i < static_cast<uint32_t>(vertices_.size()); ++i)
      {
        indices_.push_back(i);
      }
    }

    if(indices_.size() % 3 != 0)
    {
      throw std::invalid_argument("Collider: index count must be multiple of 3");
    }

    computeLocalBounds();
    updateWorldBounds();
  }

  Collider::Collider(btk::rendering::SteelTarget* target, float radius_m) : position_(0, 0, 0), rotation_(0, 0, 0, 1), steel_target_(target)
  {
    // Store radius in min_bounds_m_.x (local bounds not used for steel targets)
    min_bounds_m_.x = radius_m;
    updateWorldBounds();
  }

  void Collider::computeLocalBounds()
  {
    if(vertices_.empty())
    {
      local_min_ = btk::math::Vector3D(0, 0, 0);
      local_max_ = btk::math::Vector3D(0, 0, 0);
      return;
    }

    local_min_ = vertices_[0];
    local_max_ = vertices_[0];

    for(const auto& v : vertices_)
    {
      local_min_.x = std::min(local_min_.x, v.x);
      local_min_.y = std::min(local_min_.y, v.y);
      local_min_.z = std::min(local_min_.z, v.z);

      local_max_.x = std::max(local_max_.x, v.x);
      local_max_.y = std::max(local_max_.y, v.y);
      local_max_.z = std::max(local_max_.z, v.z);
    }
  }

  void Collider::updateWorldBounds()
  {
    if(steel_target_)
    {
      // Steel target mode: compute bounds from target position + radius
      float radius = min_bounds_m_.x; // Radius stored here
      btk::math::Vector3D com = steel_target_->getCenterOfMass();
      min_bounds_m_ = btk::math::Vector3D(com.x - radius, com.y - radius, com.z - radius);
      max_bounds_m_ = btk::math::Vector3D(com.x + radius, com.y + radius, com.z + radius);
    }
    else
    {
      // Mesh mode: transform local AABB corners to world space
      btk::math::Vector3D corners[8] = {btk::math::Vector3D(local_min_.x, local_min_.y, local_min_.z), btk::math::Vector3D(local_max_.x, local_min_.y, local_min_.z),
                                        btk::math::Vector3D(local_min_.x, local_max_.y, local_min_.z), btk::math::Vector3D(local_max_.x, local_max_.y, local_min_.z),
                                        btk::math::Vector3D(local_min_.x, local_min_.y, local_max_.z), btk::math::Vector3D(local_max_.x, local_min_.y, local_max_.z),
                                        btk::math::Vector3D(local_min_.x, local_max_.y, local_max_.z), btk::math::Vector3D(local_max_.x, local_max_.y, local_max_.z)};

      btk::math::Vector3D world_corners[8];
      for(int i = 0; i < 8; ++i)
      {
        world_corners[i] = rotation_.rotate(corners[i]) + position_;
      }

      min_bounds_m_ = world_corners[0];
      max_bounds_m_ = world_corners[0];
      for(int i = 1; i < 8; ++i)
      {
        min_bounds_m_.x = std::min(min_bounds_m_.x, world_corners[i].x);
        min_bounds_m_.y = std::min(min_bounds_m_.y, world_corners[i].y);
        min_bounds_m_.z = std::min(min_bounds_m_.z, world_corners[i].z);
        max_bounds_m_.x = std::max(max_bounds_m_.x, world_corners[i].x);
        max_bounds_m_.y = std::max(max_bounds_m_.y, world_corners[i].y);
        max_bounds_m_.z = std::max(max_bounds_m_.z, world_corners[i].z);
      }
    }
  }

  const btk::math::Vector3D& Collider::minBounds() const { return min_bounds_m_; }

  const btk::math::Vector3D& Collider::maxBounds() const { return max_bounds_m_; }

  void Collider::setTransform(const btk::math::Vector3D& position, const btk::math::Quaternion& rotation)
  {
    position_ = position;
    rotation_ = rotation;
    updateWorldBounds();
  }

  bool Collider::segmentIntersectsAABB(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, const btk::math::Vector3D& min_bounds, const btk::math::Vector3D& max_bounds) const
  {
    // Slab method: project segment onto each axis and check for overlap
    // Segment: start_m + t * (end_m - start_m) for t in [0, 1]
    btk::math::Vector3D dir = end_m - start_m;
    btk::math::Vector3D inv_dir;
    inv_dir.x = (std::fabs(dir.x) > 1e-6f) ? (1.0f / dir.x) : std::numeric_limits<float>::max();
    inv_dir.y = (std::fabs(dir.y) > 1e-6f) ? (1.0f / dir.y) : std::numeric_limits<float>::max();
    inv_dir.z = (std::fabs(dir.z) > 1e-6f) ? (1.0f / dir.z) : std::numeric_limits<float>::max();

    float t_min = 0.0f;
    float t_max = 1.0f;

    // Test X axis
    float t1 = (min_bounds.x - start_m.x) * inv_dir.x;
    float t2 = (max_bounds.x - start_m.x) * inv_dir.x;
    float t_min_x = std::min(t1, t2);
    float t_max_x = std::max(t1, t2);
    t_min = std::max(t_min, t_min_x);
    t_max = std::min(t_max, t_max_x);

    if(t_min > t_max)
    {
      return false;
    }

    // Test Y axis
    t1 = (min_bounds.y - start_m.y) * inv_dir.y;
    t2 = (max_bounds.y - start_m.y) * inv_dir.y;
    float t_min_y = std::min(t1, t2);
    float t_max_y = std::max(t1, t2);
    t_min = std::max(t_min, t_min_y);
    t_max = std::min(t_max, t_max_y);

    if(t_min > t_max)
    {
      return false;
    }

    // Test Z axis
    t1 = (min_bounds.z - start_m.z) * inv_dir.z;
    t2 = (max_bounds.z - start_m.z) * inv_dir.z;
    float t_min_z = std::min(t1, t2);
    float t_max_z = std::max(t1, t2);
    t_min = std::max(t_min, t_min_z);
    t_max = std::min(t_max, t_max_z);

    return t_min <= t_max;
  }

  std::optional<float> Collider::intersectTriangle(const btk::math::Vector3D& ray_origin, const btk::math::Vector3D& ray_dir, const btk::math::Vector3D& v0, const btk::math::Vector3D& v1,
                                                   const btk::math::Vector3D& v2) const
  {
    // Möller–Trumbore intersection algorithm
    constexpr float EPSILON = 1e-6f;

    btk::math::Vector3D edge1 = v1 - v0;
    btk::math::Vector3D edge2 = v2 - v0;
    btk::math::Vector3D h = ray_dir.cross(edge2);
    float a = edge1.dot(h);

    if(std::fabs(a) < EPSILON)
    {
      return std::nullopt; // Ray parallel to triangle
    }

    float f = 1.0f / a;
    btk::math::Vector3D s = ray_origin - v0;
    float u = f * s.dot(h);

    if(u < 0.0f || u > 1.0f)
    {
      return std::nullopt;
    }

    btk::math::Vector3D q = s.cross(edge1);
    float v = f * ray_dir.dot(q);

    if(v < 0.0f || u + v > 1.0f)
    {
      return std::nullopt;
    }

    float t = f * edge2.dot(q);

    if(t >= 0.0f && t <= 1.0f)
    {
      return t;
    }

    return std::nullopt;
  }

  std::optional<ImpactResult> Collider::intersectSegment(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, float t_start_s, float t_end_s, float bullet_radius) const
  {
    using btk::math::Vector3D;

    // Early rejection: check if segment intersects AABB
    if(!segmentIntersectsAABB(start_m, end_m, min_bounds_m_, max_bounds_m_))
    {
      return std::nullopt;
    }

    if(steel_target_)
    {
      // Steel target mode: delegate to target
      auto hit_opt = steel_target_->intersectSegment(start_m, end_m, bullet_radius);
      if(!hit_opt.has_value())
      {
        return std::nullopt;
      }

      const auto& hit = *hit_opt;

      // Estimate time from distance along segment
      Vector3D dir = end_m - start_m;
      float segment_length = dir.magnitude();
      float t_param = (segment_length > 1e-6f) ? (hit.distance_m_ / segment_length) : 0.0f;

      float time_s = t_start_s + (t_end_s - t_start_s) * t_param;

      return ImpactResult(hit.point_world_, hit.normal_world_, time_s, object_id_);
    }
    else
    {
      // Mesh mode: transform ray to local space
      btk::math::Quaternion inv_rotation = rotation_.conjugate();
      Vector3D local_start = inv_rotation.rotate(start_m - position_);
      Vector3D local_end = inv_rotation.rotate(end_m - position_);
      Vector3D local_ray_dir = local_end - local_start;

      float closest_t = std::numeric_limits<float>::max();
      Vector3D closest_hit_local;
      Vector3D closest_normal_local;
      bool found_hit = false;

      // Test all triangles in local space
      for(size_t i = 0; i < indices_.size(); i += 3)
      {
        const Vector3D& v0 = vertices_[indices_[i]];
        const Vector3D& v1 = vertices_[indices_[i + 1]];
        const Vector3D& v2 = vertices_[indices_[i + 2]];

        auto t_opt = intersectTriangle(local_start, local_ray_dir, v0, v1, v2);
        if(t_opt.has_value() && t_opt.value() < closest_t)
        {
          closest_t = t_opt.value();
          closest_hit_local = local_start + local_ray_dir * closest_t;

          // Compute triangle normal in local space
          Vector3D edge1 = v1 - v0;
          Vector3D edge2 = v2 - v0;
          Vector3D normal = edge1.cross(edge2);
          float normal_len = normal.magnitude();
          if(normal_len > 1e-6f)
          {
            closest_normal_local = normal / normal_len;
          }
          else
          {
            // Degenerate triangle - use default up vector
            closest_normal_local = Vector3D(0, 1, 0);
          }

          found_hit = true;
        }
      }

      if(!found_hit)
      {
        return std::nullopt;
      }

      // Transform hit position and normal back to world space
      Vector3D closest_hit_pos = rotation_.rotate(closest_hit_local) + position_;
      Vector3D closest_normal = rotation_.rotate(closest_normal_local).normalized();

      float time_s = t_start_s + (t_end_s - t_start_s) * closest_t;

      return ImpactResult(closest_hit_pos, closest_normal, time_s, object_id_);
    }
  }

  // ===== ImpactDetector =====

  ImpactDetector::ImpactDetector(float bin_size_m, float world_min_x_m, float world_max_x_m, float world_min_z_m, float world_max_z_m)
    : bin_size_m_(bin_size_m), world_min_x_(world_min_x_m), world_max_x_(world_max_x_m), world_min_z_(world_min_z_m), world_max_z_(world_max_z_m)
  {
    if(bin_size_m <= 0.0f)
    {
      throw std::invalid_argument("ImpactDetector: bin_size_m must be > 0");
    }

    bins_x_ = static_cast<int>(std::ceil((world_max_x_ - world_min_x_) / bin_size_m_));
    bins_z_ = static_cast<int>(std::ceil((world_max_z_ - world_min_z_) / bin_size_m_));

    if(bins_x_ <= 0)
      bins_x_ = 1;
    if(bins_z_ <= 0)
      bins_z_ = 1;

    grid_.resize(bins_x_ * bins_z_);
  }

  void ImpactDetector::setColliderEnabled(int handle, bool enabled)
  {
    auto it = colliders_.find(handle);
    if(it != colliders_.end())
    {
      it->second.setEnabled(enabled);
    }
  }

  bool ImpactDetector::isColliderEnabled(int handle) const
  {
    auto it = colliders_.find(handle);
    if(it != colliders_.end())
    {
      return it->second.isEnabled();
    }
    return false;
  }

  int ImpactDetector::binIndexX(float x_m) const
  {
    int idx = static_cast<int>((x_m - world_min_x_) / bin_size_m_);
    return std::clamp(idx, 0, bins_x_ - 1);
  }

  int ImpactDetector::binIndexZ(float z_m) const
  {
    int idx = static_cast<int>((z_m - world_min_z_) / bin_size_m_);
    return std::clamp(idx, 0, bins_z_ - 1);
  }

  int ImpactDetector::gridIndex(int bin_x, int bin_z) const
  {
    if(bin_x < 0 || bin_x >= bins_x_ || bin_z < 0 || bin_z >= bins_z_)
    {
      return -1;
    }
    return bin_z * bins_x_ + bin_x;
  }

#ifdef __EMSCRIPTEN__
  int ImpactDetector::addMeshCollider(emscripten::val vertices_val, emscripten::val indices_val, int object_id)
  {
    // Convert JS typed arrays to C++ vectors using fast bulk conversion
    std::vector<float> vertices;
    std::vector<uint32_t> indices;

    if(!vertices_val.isNull() && !vertices_val.isUndefined())
    {
      vertices = emscripten::convertJSArrayToNumberVector<float>(vertices_val);
    }

    if(!indices_val.isNull() && !indices_val.isUndefined())
    {
      indices = emscripten::convertJSArrayToNumberVector<uint32_t>(indices_val);
    }

    int handle = getNextHandle();
    auto [it, inserted] = colliders_.emplace(handle, Collider(vertices, indices));
    it->second.setObjectId(object_id);

    // Geometry is already in world space, so compute bounds directly from vertices
    // and use identity transform (position=0, rotation=identity)
    // This ensures the collider is inserted into the correct grid bins
    btk::math::Vector3D geom_min(std::numeric_limits<float>::max(), std::numeric_limits<float>::max(), std::numeric_limits<float>::max());
    btk::math::Vector3D geom_max(std::numeric_limits<float>::lowest(), std::numeric_limits<float>::lowest(), std::numeric_limits<float>::lowest());

    for(size_t i = 0; i < vertices.size(); i += 3)
    {
      float x = vertices[i];
      float y = vertices[i + 1];
      float z = vertices[i + 2];
      geom_min.x = std::min(geom_min.x, x);
      geom_min.y = std::min(geom_min.y, y);
      geom_min.z = std::min(geom_min.z, z);
      geom_max.x = std::max(geom_max.x, x);
      geom_max.y = std::max(geom_max.y, y);
      geom_max.z = std::max(geom_max.z, z);
    }

    // Set transform to identity (geometry is already in world space)
    // This ensures world bounds match the geometry bounds
    it->second.setTransform(btk::math::Vector3D(0, 0, 0), btk::math::Quaternion::identity());

    Collider* collider_ptr = &it->second;
    const btk::math::Vector3D& min_b = collider_ptr->minBounds();
    const btk::math::Vector3D& max_b = collider_ptr->maxBounds();

    int min_bin_x = binIndexX(min_b.x);
    int max_bin_x = binIndexX(max_b.x);
    int min_bin_z = binIndexZ(min_b.z);
    int max_bin_z = binIndexZ(max_b.z);

    // Insert into all overlapping bins
    for(int bz = min_bin_z; bz <= max_bin_z; ++bz)
    {
      for(int bx = min_bin_x; bx <= max_bin_x; ++bx)
      {
        int gidx = gridIndex(bx, bz);
        if(gidx >= 0)
        {
          grid_[gidx].push_back(collider_ptr);
        }
      }
    }

    return handle;
  }
#endif

  int ImpactDetector::addSteelCollider(btk::rendering::SteelTarget* target, float radius_m, int object_id)
  {
    if(!target)
    {
      return -1;
    }

    int handle = getNextHandle();
    auto [it, inserted] = colliders_.emplace(handle, Collider(target, radius_m));
    it->second.setObjectId(object_id);

    Collider* collider_ptr = &it->second;
    const btk::math::Vector3D& min_b = collider_ptr->minBounds();
    const btk::math::Vector3D& max_b = collider_ptr->maxBounds();

    int min_bin_x = binIndexX(min_b.x);
    int max_bin_x = binIndexX(max_b.x);
    int min_bin_z = binIndexZ(min_b.z);
    int max_bin_z = binIndexZ(max_b.z);

    for(int bz = min_bin_z; bz <= max_bin_z; ++bz)
    {
      for(int bx = min_bin_x; bx <= max_bin_x; ++bx)
      {
        int gidx = gridIndex(bx, bz);
        if(gidx >= 0)
        {
          grid_[gidx].push_back(collider_ptr);
        }
      }
    }

    return handle;
  }

  std::optional<ImpactResult> ImpactDetector::checkSegmentCollisions(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, float t_start_s, float t_end_s, float bullet_radius) const
  {
    const float min_x = std::min(start_m.x, end_m.x);
    const float max_x = std::max(start_m.x, end_m.x);
    const float min_z = std::min(start_m.z, end_m.z);
    const float max_z = std::max(start_m.z, end_m.z);

    const int min_bin_x = binIndexX(min_x);
    const int max_bin_x = binIndexX(max_x);
    const int min_bin_z = binIndexZ(min_z);
    const int max_bin_z = binIndexZ(max_z);

    std::optional<ImpactResult> earliest_hit;
    float earliest_time = std::numeric_limits<float>::max();

    for(int bz = min_bin_z; bz <= max_bin_z; ++bz)
    {
      for(int bx = min_bin_x; bx <= max_bin_x; ++bx)
      {
        const int gidx = gridIndex(bx, bz);
        if(gidx < 0)
          continue;

        for(Collider* collider_ptr : grid_[gidx])
        {
          // Skip disabled colliders
          if(!collider_ptr->isEnabled())
          {
            continue;
          }

          auto hit_opt = collider_ptr->intersectSegment(start_m, end_m, t_start_s, t_end_s, bullet_radius);

          if(hit_opt.has_value())
          {
            if(hit_opt->time_s < earliest_time)
            {
              earliest_time = hit_opt->time_s;
              earliest_hit = hit_opt;
            }
          }
        }
      }
    }

    return earliest_hit;
  }

  void ImpactDetector::moveCollider(int handle, const btk::math::Vector3D& position, const btk::math::Quaternion& rotation)
  {
    auto it = colliders_.find(handle);
    if(it == colliders_.end())
    {
      return; // Handle not found
    }

    auto& collider = it->second;

    // Get old bounds for grid removal
    const auto old_min = collider.minBounds();
    const auto old_max = collider.maxBounds();

    // Update collider transform
    collider.setTransform(position, rotation);

    // Get new bounds
    const auto& new_min = collider.minBounds();
    const auto& new_max = collider.maxBounds();

    // Check if grid cells changed
    int old_min_x = binIndexX(old_min.x);
    int old_max_x = binIndexX(old_max.x);
    int old_min_z = binIndexZ(old_min.z);
    int old_max_z = binIndexZ(old_max.z);

    int new_min_x = binIndexX(new_min.x);
    int new_max_x = binIndexX(new_max.x);
    int new_min_z = binIndexZ(new_min.z);
    int new_max_z = binIndexZ(new_max.z);

    if(old_min_x == new_min_x && old_max_x == new_max_x && old_min_z == new_min_z && old_max_z == new_max_z)
    {
      return; // Same grid cells, no update needed
    }

    Collider* collider_ptr = &collider;

    // Remove from old cells
    for(int bz = old_min_z; bz <= old_max_z; ++bz)
    {
      for(int bx = old_min_x; bx <= old_max_x; ++bx)
      {
        int gidx = gridIndex(bx, bz);
        if(gidx < 0)
          continue;

        auto& cell = grid_[gidx];
        cell.erase(std::remove(cell.begin(), cell.end(), collider_ptr), cell.end());
      }
    }

    // Add to new cells
    for(int bz = new_min_z; bz <= new_max_z; ++bz)
    {
      for(int bx = new_min_x; bx <= new_max_x; ++bx)
      {
        int gidx = gridIndex(bx, bz);
        if(gidx >= 0)
        {
          grid_[gidx].push_back(collider_ptr);
        }
      }
    }
  }

  void ImpactDetector::removeCollider(int handle)
  {
    auto it = colliders_.find(handle);
    if(it == colliders_.end())
    {
      return; // Handle not found
    }

    Collider* collider_ptr = &it->second;

    // Remove from all grid cells
    const auto& min_b = collider_ptr->minBounds();
    const auto& max_b = collider_ptr->maxBounds();

    for(int bz = binIndexZ(min_b.z); bz <= binIndexZ(max_b.z); ++bz)
    {
      for(int bx = binIndexX(min_b.x); bx <= binIndexX(max_b.x); ++bx)
      {
        int gidx = gridIndex(bx, bz);
        if(gidx < 0)
          continue;

        auto& cell = grid_[gidx];
        cell.erase(std::remove(cell.begin(), cell.end(), collider_ptr), cell.end());
      }
    }

    // Remove from map
    colliders_.erase(it);
  }

  std::optional<ImpactResult> ImpactDetector::findFirstImpact(const btk::ballistics::Trajectory& trajectory, float t0_s, float t1_s) const
  {
    const int point_count = static_cast<int>(trajectory.getPointCount());
    if(point_count < 2)
    {
      return std::nullopt;
    }

    // Binary search for the last point at or before t0_s
    // This ensures we catch segments that straddle t0_s
    int left = 0;
    int right = point_count - 1;
    int start_idx = 0;

    while(left <= right)
    {
      int mid = left + (right - left) / 2;
      float t = trajectory.getPoint(mid).getTime();
      if(t <= t0_s)
      {
        start_idx = mid;
        left = mid + 1;
      }
      else
      {
        right = mid - 1;
      }
    }

    // start_idx is now the last point <= t0_s, which is the start of a segment that might overlap [t0_s, t1_s]

    // Scan segments until we pass t1_s
    for(int i = start_idx; i < point_count - 1; ++i)
    {
      const auto& p0 = trajectory.getPoint(i);
      const auto& p1 = trajectory.getPoint(i + 1);

      const float seg_t0 = p0.getTime();
      const float seg_t1 = p1.getTime();

      // Stop when segments are completely past t1_s
      if(seg_t0 > t1_s)
      {
        break;
      }

      const auto& start_m = p0.getPosition();
      const auto& end_m = p1.getPosition();
      const float bullet_radius = p0.getState().getDiameter() * 0.5f;

      auto hit_opt = checkSegmentCollisions(start_m, end_m, seg_t0, seg_t1, bullet_radius);

      if(hit_opt.has_value())
      {
        // Since segments are time-sorted, first hit is earliest hit
        return hit_opt;
      }
    }

    return std::nullopt;
  }

} // namespace btk::rendering
