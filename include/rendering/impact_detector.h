#pragma once

#include "ballistics/trajectory.h"
#include "math/vector.h"
#include "rendering/steel_target.h"
#include <memory>
#include <optional>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

namespace btk::rendering
{

  /**
   * @brief Result of a bullet-object impact.
   */
  struct ImpactResult
  {
    btk::math::Vector3D position_m; ///< Impact point in BTK coordinates (meters)
    btk::math::Vector3D normal;     ///< Surface normal at impact
    float time_s;                   ///< Time of impact (seconds)
    int object_id;                  ///< Application-defined object ID

    ImpactResult() : position_m(0, 0, 0), normal(0, 0, 1), time_s(0), object_id(-1) {}

    ImpactResult(const btk::math::Vector3D& pos, const btk::math::Vector3D& n, float t, int id) : position_m(pos), normal(n), time_s(t), object_id(id) {}
  };

  /**
   * @brief Interface for hittable objects in the impact detector.
   */
  class IImpactObject
  {
    public:
    virtual ~IImpactObject() = default;

    /**
     * @brief Test if a segment intersects this object.
     *
     * @param start_m      Segment start in BTK coordinates (meters)
     * @param end_m        Segment end in BTK coordinates (meters)
     * @param t_start_s    Time at segment start (seconds)
     * @param t_end_s      Time at segment end (seconds)
     * @param bullet_radius Bullet radius for line-break rule (meters)
     * @param object_id    Application object ID
     * @return ImpactResult if hit, std::nullopt otherwise
     */
    virtual std::optional<ImpactResult> intersectSegment(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, float t_start_s, float t_end_s, float bullet_radius,
                                                         int object_id) const = 0;

    /// Check if this collider is enabled
    bool isEnabled() const { return enabled_; }

    /// Set enabled state
    void setEnabled(bool enabled) { enabled_ = enabled; }

    protected:
    bool enabled_ = true; ///< Enabled state (disabled colliders are skipped)
  };

  /**
   * @brief Collider for static triangle meshes (rocks, berm, trees, poles).
   */
  class MeshCollider : public IImpactObject
  {
    public:
    /**
     * @brief Construct from triangle mesh geometry.
     *
     * @param vertices Flat array [x0,y0,z0, x1,y1,z1, ...] in meters
     * @param indices  Triangle indices (if empty, assumes sequential: every 3 verts = 1 triangle)
     */
    MeshCollider(const std::vector<float>& vertices, const std::vector<uint32_t>& indices = {});

    std::optional<ImpactResult> intersectSegment(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, float t_start_s, float t_end_s, float bullet_radius,
                                                 int object_id) const override;

    /// Get AABB min for binning.
    const btk::math::Vector3D& minBounds() const { return min_bounds_m_; }

    /// Get AABB max for binning.
    const btk::math::Vector3D& maxBounds() const { return max_bounds_m_; }

    private:
    std::vector<btk::math::Vector3D> vertices_;
    std::vector<uint32_t> indices_;
    btk::math::Vector3D min_bounds_m_;
    btk::math::Vector3D max_bounds_m_;

    void computeBounds();

    bool segmentIntersectsAABB(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, const btk::math::Vector3D& min_bounds, const btk::math::Vector3D& max_bounds) const;

    std::optional<float> intersectTriangle(const btk::math::Vector3D& ray_origin, const btk::math::Vector3D& ray_dir, const btk::math::Vector3D& v0, const btk::math::Vector3D& v1,
                                           const btk::math::Vector3D& v2) const;
  };

  /**
   * @brief Collider adapter for a moving SteelTarget.
   */
  class SteelCollider : public IImpactObject
  {
    public:
    explicit SteelCollider(btk::rendering::SteelTarget* target);

    std::optional<ImpactResult> intersectSegment(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, float t_start_s, float t_end_s, float bullet_radius,
                                                 int object_id) const override;

    private:
    btk::rendering::SteelTarget* target_; ///< Non-owning pointer
  };

  /**
   * @brief Spatial grid-based impact detector for fast trajectory queries.
   *
   * Grid bins are defined over the XZ plane (BTK coords). Each object is
   * registered with its AABB and inserted into all overlapping bins.
   */
  class ImpactDetector
  {
    public:
    /**
     * @brief Construct detector with world bounds and bin size.
     *
     * @param bin_size_m    Bin size in meters (default 10m)
     * @param world_min_x_m Min X of world in meters
     * @param world_max_x_m Max X of world in meters
     * @param world_min_z_m Min Z of world in meters
     * @param world_max_z_m Max Z of world in meters
     */
    ImpactDetector(float bin_size_m, float world_min_x_m, float world_max_x_m, float world_min_z_m, float world_max_z_m);

    /**
     * @brief Register a static mesh collider from geometry.
     *
     * Uses fast bulk conversion (convertJSArrayToNumberVector) for efficient JS → C++ data transfer.
     * JS should pass a Float32Array of vertices and optional Uint32Array of indices.
     *
     * @param vertices_val Emscripten val wrapping Float32Array [x0,y0,z0, ...]
     * @param indices_val  Emscripten val wrapping Uint32Array (optional, empty for sequential)
     * @param object_id    Application ID
     * @return Collider handle (>=0) or -1 on error
     */
#ifdef __EMSCRIPTEN__
    int addMeshCollider(emscripten::val vertices_val, emscripten::val indices_val, int object_id);
#endif

    /**
     * @brief Register a moving steel target.
     *
     * @param target      SteelTarget pointer (non-owning, must outlive detector)
     * @param radius_m    Radius for bin coverage (accounts for swing)
     * @param object_id   Application ID
     * @return Collider handle (>=0) or -1 on error
     */
    int addSteelCollider(btk::rendering::SteelTarget* target, float radius_m, int object_id);

    /**
     * @brief Find first impact of a trajectory in time interval [t0, t1].
     *
     * @param trajectory Bullet trajectory in BTK coords
     * @param t0_s       Start time (seconds)
     * @param t1_s       End time (seconds)
     * @return ImpactResult if hit, std::nullopt otherwise
     */
    std::optional<ImpactResult> findFirstImpact(const btk::ballistics::Trajectory& trajectory, float t0_s, float t1_s) const;

    /**
     * @brief Enable or disable a collider by handle.
     *
     * Disabled colliders are skipped during collision detection.
     *
     * @param handle Collider handle returned from addMeshCollider or addSteelCollider
     * @param enabled True to enable, false to disable
     */
    void setColliderEnabled(int handle, bool enabled);

    /**
     * @brief Check if a collider is enabled.
     *
     * @param handle Collider handle
     * @return True if enabled, false if disabled or invalid handle
     */
    bool isColliderEnabled(int handle) const;

    private:
    struct ObjectRecord
    {
      int collider_handle;
      int object_id;
    };

    float bin_size_m_;
    float world_min_x_;
    float world_max_x_;
    float world_min_z_;
    float world_max_z_;
    int bins_x_;
    int bins_z_;

    std::vector<std::vector<ObjectRecord>> grid_; ///< bins_x_ * bins_z_ bins
    std::vector<std::unique_ptr<IImpactObject>> colliders_;

    int binIndexX(float x_m) const;
    int binIndexZ(float z_m) const;
    int gridIndex(int bin_x, int bin_z) const;

    std::optional<ImpactResult> checkSegmentCollisions(const btk::math::Vector3D& start_m, const btk::math::Vector3D& end_m, float t_start_s, float t_end_s, float bullet_radius) const;
  };

} // namespace btk::rendering
