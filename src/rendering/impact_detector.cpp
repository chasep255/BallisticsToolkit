#include "rendering/impact_detector.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace btk::rendering
{

  // ===== MeshCollider =====

  MeshCollider::MeshCollider(const std::vector<float>& vertices, const std::vector<uint32_t>& indices) : indices_(indices)
  {
    if(vertices.size() % 3 != 0)
    {
      throw std::invalid_argument("MeshCollider: vertex count must be multiple of 3");
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
      throw std::invalid_argument("MeshCollider: index count must be multiple of 3");
    }

    computeBounds();
  }

  void MeshCollider::computeBounds()
  {
    if(vertices_.empty())
    {
      min_bounds_m_ = btk::math::Vector3D(0, 0, 0);
      max_bounds_m_ = btk::math::Vector3D(0, 0, 0);
      return;
    }

    min_bounds_m_ = vertices_[0];
    max_bounds_m_ = vertices_[0];

    for(const auto& v : vertices_)
    {
      min_bounds_m_.x = std::min(min_bounds_m_.x, v.x);
      min_bounds_m_.y = std::min(min_bounds_m_.y, v.y);
      min_bounds_m_.z = std::min(min_bounds_m_.z, v.z);

      max_bounds_m_.x = std::max(max_bounds_m_.x, v.x);
      max_bounds_m_.y = std::max(max_bounds_m_.y, v.y);
      max_bounds_m_.z = std::max(max_bounds_m_.z, v.z);
    }
  }

  std::optional<float> MeshCollider::intersectTriangle(const btk::math::Vector3D& ray_origin, const btk::math::Vector3D& ray_dir, const btk::math::Vector3D& v0, const btk::math::Vector3D& v1,
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

  std::optional<ImpactResult> MeshCollider::intersectSegment(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, float t_start_s, float t_end_s, float /*bullet_radius*/,
                                                             int object_id) const
  {
    using btk::math::Vector3D;

    Vector3D ray_dir = end_m - start_m;
    float closest_t = std::numeric_limits<float>::max();
    Vector3D closest_hit_pos;
    Vector3D closest_normal;
    bool found_hit = false;

    // Test all triangles
    for(size_t i = 0; i < indices_.size(); i += 3)
    {
      const Vector3D& v0 = vertices_[indices_[i]];
      const Vector3D& v1 = vertices_[indices_[i + 1]];
      const Vector3D& v2 = vertices_[indices_[i + 2]];

      auto t_opt = intersectTriangle(start_m, ray_dir, v0, v1, v2);
      if(t_opt.has_value() && t_opt.value() < closest_t)
      {
        closest_t = t_opt.value();
        closest_hit_pos = start_m + ray_dir * closest_t;

        // Compute triangle normal
        Vector3D edge1 = v1 - v0;
        Vector3D edge2 = v2 - v0;
        closest_normal = edge1.cross(edge2).normalized();

        found_hit = true;
      }
    }

    if(!found_hit)
    {
      return std::nullopt;
    }

    float time_s = t_start_s + (t_end_s - t_start_s) * closest_t;

    return ImpactResult(closest_hit_pos, closest_normal, time_s, object_id);
  }

  // ===== SteelCollider =====

  SteelCollider::SteelCollider(btk::rendering::SteelTarget* target) : target_(target) {}

  std::optional<ImpactResult> SteelCollider::intersectSegment(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, float t_start_s, float t_end_s, float bullet_radius,
                                                              int object_id) const
  {
    if(!target_)
    {
      return std::nullopt;
    }

    auto hit_opt = target_->intersectSegment(start_m, end_m, bullet_radius);
    if(!hit_opt.has_value())
    {
      return std::nullopt;
    }

    const auto& hit = *hit_opt;

    // Estimate time from distance along segment
    btk::math::Vector3D dir = end_m - start_m;
    float segment_length = dir.magnitude();
    float t_param = (segment_length > 1e-6f) ? (hit.distance_m_ / segment_length) : 0.0f;

    float time_s = t_start_s + (t_end_s - t_start_s) * t_param;

    return ImpactResult(hit.point_world_, hit.normal_world_, time_s, object_id);
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
    // Convert JS typed arrays to C++ vectors
    std::vector<float> vertices;
    std::vector<uint32_t> indices;

    if(!vertices_val.isNull() && !vertices_val.isUndefined())
    {
      unsigned int vlen = vertices_val["length"].as<unsigned int>();
      vertices.reserve(vlen);
      for(unsigned int i = 0; i < vlen; ++i)
      {
        vertices.push_back(vertices_val[i].as<float>());
      }
    }

    if(!indices_val.isNull() && !indices_val.isUndefined())
    {
      unsigned int ilen = indices_val["length"].as<unsigned int>();
      indices.reserve(ilen);
      for(unsigned int i = 0; i < ilen; ++i)
      {
        indices.push_back(indices_val[i].as<uint32_t>());
      }
    }

    auto collider = std::make_unique<MeshCollider>(vertices, indices);

    const btk::math::Vector3D& min_b = collider->minBounds();
    const btk::math::Vector3D& max_b = collider->maxBounds();

    int min_bin_x = binIndexX(min_b.x);
    int max_bin_x = binIndexX(max_b.x);
    int min_bin_z = binIndexZ(min_b.z);
    int max_bin_z = binIndexZ(max_b.z);

    int handle = static_cast<int>(colliders_.size());
    colliders_.push_back(std::move(collider));

    ObjectRecord rec;
    rec.collider_handle = handle;
    rec.object_id = object_id;

    // Insert into all overlapping bins
    for(int bz = min_bin_z; bz <= max_bin_z; ++bz)
    {
      for(int bx = min_bin_x; bx <= max_bin_x; ++bx)
      {
        int gidx = gridIndex(bx, bz);
        if(gidx >= 0)
        {
          grid_[gidx].push_back(rec);
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

    auto collider = std::make_unique<SteelCollider>(target);

    btk::math::Vector3D com = target->getCenterOfMass();

    int min_bin_x = binIndexX(com.x - radius_m);
    int max_bin_x = binIndexX(com.x + radius_m);
    int min_bin_z = binIndexZ(com.z - radius_m);
    int max_bin_z = binIndexZ(com.z + radius_m);

    int handle = static_cast<int>(colliders_.size());
    colliders_.push_back(std::move(collider));

    ObjectRecord rec;
    rec.collider_handle = handle;
    rec.object_id = object_id;

    for(int bz = min_bin_z; bz <= max_bin_z; ++bz)
    {
      for(int bx = min_bin_x; bx <= max_bin_x; ++bx)
      {
        int gidx = gridIndex(bx, bz);
        if(gidx >= 0)
        {
          grid_[gidx].push_back(rec);
        }
      }
    }

    return handle;
  }

  std::optional<ImpactResult> ImpactDetector::checkSegmentCollisions(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, float t_start_s, float t_end_s,
                                                                      float bullet_radius) const
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

        for(const auto& rec : grid_[gidx])
        {
          auto hit_opt = colliders_[rec.collider_handle]->intersectSegment(start_m, end_m, t_start_s, t_end_s, bullet_radius, rec.object_id);

          if(hit_opt.has_value() && hit_opt->time_s < earliest_time)
          {
            earliest_time = hit_opt->time_s;
            earliest_hit = hit_opt;
          }
        }
      }
    }

    return earliest_hit;
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
