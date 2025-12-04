#pragma once

#include "ballistics/bullet.h"
#include "ballistics/trajectory.h"
#include "math/quaternion.h"
#include "math/vector.h"
#include <cmath>
#include <optional>
#include <vector>

// Forward declaration for WASM builds (for getVertices())
#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

namespace btk::rendering
{

  /**
   * @brief 3D rigid body steel target with physics simulation
   *
   * Simulates a steel target with:
   * - Single shape (rectangle or oval)
   * - Full 3D rigid body physics
   * - Chain anchor constraints
   * - Bullet impact momentum transfer
   * - Impact recording for paint removal visualization
   */
  class SteelTarget
  {
    public:
    /**
     * @brief Represents a chain anchor point
     */
    struct ChainAnchor
    {
      btk::math::Vector3D local_attachment_; ///< Attachment point in local coordinates (moves with target)
      btk::math::Vector3D world_fixed_;      ///< Fixed anchor point in world coordinates (never moves)
      float rest_length_;                    ///< Rest length of chain (recalculated when target moves)

      ChainAnchor() : local_attachment_(0, 0, 0), world_fixed_(0, 0, 0), rest_length_(0) {}
      ChainAnchor(const btk::math::Vector3D& local_attach, const btk::math::Vector3D& world_fixed, float rest_length)
        : local_attachment_(local_attach), world_fixed_(world_fixed), rest_length_(rest_length)
      {
      }
    };

    /**
     * @brief Represents a bullet impact on the target
     */
    struct Impact
    {
      btk::math::Vector3D position_local_; // Position in target-local coordinates (YZ plane)
      btk::math::Vector3D velocity_local_; // Impact velocity in target-local coordinates
      float bullet_diameter_;
      float timestamp_s_;

      Impact() : position_local_(0, 0, 0), velocity_local_(0, 0, 0), bullet_diameter_(0), timestamp_s_(0) {}
      Impact(const btk::math::Vector3D& local_pos, const btk::math::Vector3D& local_vel, float diameter, float time)
        : position_local_(local_pos), velocity_local_(local_vel), bullet_diameter_(diameter), timestamp_s_(time)
      {
      }
    };

    /**
     * @brief Result of a simple ray-style intersection test against the target
     */
    struct RaycastHit
    {
      btk::math::Vector3D point_world_;  ///< Impact point in world coordinates
      btk::math::Vector3D normal_world_; ///< Surface normal at impact point (world coordinates)
      float distance_m_;                 ///< Distance from segment start to impact point in meters

      RaycastHit() : point_world_(0, 0, 0), normal_world_(0, 0, 0), distance_m_(0.0f) {}
    };

    /**
     * @brief Initialize steel target with single shape at origin
     *
     * @param width Target width (bounding box)
     * @param height Target height (bounding box)
     * @param thickness Target thickness
     * @param is_oval True for oval shape, false for rectangle
     * @param texture_size Texture dimensions (default 256x256)
     */
    SteelTarget(float width, float height, float thickness, bool is_oval = false, int texture_size = 256);

    /**
     * @brief Initialize steel target with position and orientation
     *
     * @param width Target width (bounding box)
     * @param height Target height (bounding box)
     * @param thickness Target thickness
     * @param is_oval True for oval shape, false for rectangle
     * @param position Initial position (center of mass)
     * @param normal Surface normal direction (target faces this direction)
     * @param texture_size Texture dimensions (default 256x256)
     */
    SteelTarget(float width, float height, float thickness, bool is_oval, const btk::math::Vector3D& position, const btk::math::Vector3D& normal, int texture_size = 256);

    /**
     * @brief Add a chain anchor constraint
     *
     * @param local_attachment Attachment point in local coordinates (moves with target)
     * @param world_fixed Fixed anchor point in world coordinates (never moves)
     *
     * Rest length is automatically calculated by transforming local_attachment to world space
     * and measuring distance to world_fixed. Spring constant is set to DEFAULT_SPRING_CONSTANT (1000 N/m).
     */
    void addChainAnchor(const btk::math::Vector3D& local_attachment, const btk::math::Vector3D& world_fixed);

    /**
     * @brief Process direct bullet hit
     *
     * @param bullet Bullet with position, velocity, mass, and diameter
     */
    void hit(const btk::ballistics::Bullet& bullet);

    /**
     * @brief Ray-style intersection test with the target using a line segment.
     *
     * The segment is defined in world coordinates by two endpoints. The method
     * transforms the segment into the target's local space and tests against
     * the finite plate (rectangle or oval) lying in the target's mid-plane.
     *
     * Uses the "line break rule": if bullet_radius > 0, expands the target
     * bounds by the bullet radius, so near-misses within the bullet radius count as hits.
     *
     * @param start World-space start point of the segment
     * @param end World-space end point of the segment
     * @param bullet_radius Bullet radius in meters (default 0, no expansion)
     * @return RaycastHit with world-space impact point/normal if hit, std::nullopt otherwise
     */
    std::optional<RaycastHit> intersectSegment(const btk::math::Vector3D& start, const btk::math::Vector3D& end, float bullet_radius = 0.0f) const;

    /**
     * @brief Intersect a full bullet trajectory with this target.
     *
     * Uses the target's current pose to compute its downrange extent, then
     * extracts the corresponding segment from the trajectory and raycasts it
     * against the plate. If an impact is found, returns the corresponding
     * TrajectoryPoint (state along the trajectory) at the impact distance.
     *
     * @param trajectory Bullet trajectory in world coordinates
     * @return TrajectoryPoint at impact if hit, std::nullopt if the trajectory misses
     */
    std::optional<btk::ballistics::TrajectoryPoint> intersectTrajectory(const btk::ballistics::Trajectory& trajectory) const;

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
     * @brief Get all chain anchors
     */
    const std::vector<ChainAnchor>& getAnchors() const { return anchors_; }
    
    /**
     * @brief Get all chain anchors (non-const for Emscripten bindings)
     */
    std::vector<ChainAnchor>& getAnchorsRef() { return anchors_; }

    /**
     * @brief Get center of mass position
     */
    const btk::math::Vector3D& getCenterOfMass() const { return position_; }

    /**
     * @brief Get current normal direction
     */
    const btk::math::Vector3D& getNormal() const { return normal_; }

    /**
     * @brief Get current linear velocity
     */
    const btk::math::Vector3D& getVelocity() const { return velocity_ms_; }

    /**
     * @brief Get current angular velocity
     */
    const btk::math::Vector3D& getAngularVelocity() const { return angular_velocity_; }

    /**
     * @brief Get current orientation
     */
    const btk::math::Quaternion& getOrientation() const { return orientation_; }

    /**
     * @brief Check if target is currently moving
     */
    bool isMoving() const { return is_moving_; }

    /**
     * @brief Transform a point from local coordinates to world coordinates
     *
     * @param local_point Point in local coordinate system
     * @return Point in world coordinate system
     */
    btk::math::Vector3D localToWorld(const btk::math::Vector3D& local_point) const;

    /**
     * @brief Update the vertex buffer with current position and orientation
     */
    void updateDisplay();

    /**
     * @brief Get vertex buffer as a JS-typed array view for zero-copy access
     *
     * Returns vertices as [x,y,z, x,y,z, ...] in Three.js coordinates.
     * Each 9 consecutive floats form one triangle (3 vertices * 3 components).
     * Buffer is updated by calling updateDisplay() before this.
     */
#ifdef __EMSCRIPTEN__
    emscripten::val getVertices() const;
#else
    // Non-WASM builds can access the raw buffer directly
    const std::vector<float>& getVertices() const { return vertices_buffer_; }
#endif

    /**
     * @brief Get UV buffer as a JS-typed array view for zero-copy access
     *
     * Returns UVs as [u,v, u,v, ...] for texture mapping.
     * Each 6 consecutive floats form one triangle (3 vertices * 2 components).
     * Buffer is updated by calling updateDisplay() before this.
     */
#ifdef __EMSCRIPTEN__
    emscripten::val getUVs() const;
#else
    const std::vector<float>& getUVs() const { return uvs_buffer_; }
#endif

    /**
     * @brief Get normal buffer as a JS-typed array view for zero-copy access
     *
     * Returns normals as [nx,ny,nz, nx,ny,nz, ...] for lighting.
     * Each 9 consecutive floats form one triangle (3 vertices * 3 components).
     * Buffer is updated by calling updateDisplay() before this.
     */
#ifdef __EMSCRIPTEN__
    emscripten::val getNormals() const;
#else
    const std::vector<float>& getNormals() const { return normals_buffer_; }
#endif

    /**
     * @brief Get texture buffer as memory view for zero-copy access
     *
     * Returns RGBA texture data as [r,g,b,a, r,g,b,a, ...] ready for WebGL texture.
     * Texture shows paint color with bullet impacts revealing metal underneath.
     * Buffer is updated by calling updateTexture().
     *
     * @return Memory view of texture buffer (RGBA bytes)
     */
#ifdef __EMSCRIPTEN__
    emscripten::val getTexture() const;
#else
    const std::vector<uint8_t>& getTexture() const { return texture_buffer_; }
#endif

    /**
     * @brief Get texture dimensions
     */
    int getTextureWidth() const { return texture_width_; }
    int getTextureHeight() const { return texture_height_; }

    /**
     * @brief Initialize texture with paint color
     *
     * Creates the initial texture filled with paint color.
     * Call this once during setup or when resetting the target.
     *
     */
    void initializeTexture();

    /**
     * @brief Set paint and metal colors
     *
     * @param paint_r Paint red (0-255)
     * @param paint_g Paint green (0-255)
     * @param paint_b Paint blue (0-255)
     * @param metal_r Metal red (0-255, default 128)
     * @param metal_g Metal green (0-255, default 128)
     * @param metal_b Metal blue (0-255, default 128)
     */
    void setColors(uint8_t paint_r, uint8_t paint_g, uint8_t paint_b, uint8_t metal_r = 128, uint8_t metal_g = 128, uint8_t metal_b = 128);

    /**
     * @brief Get target mass
     */
    float getMass() const { return mass_kg_; }

    /**
     * @brief Clear all recorded impacts and reset texture to clean paint
     */
    void clearImpacts()
    {
      impacts_.clear();
      initializeTexture();
    }

    /**
     * @brief Enable or disable verbose debug logging for this target.
     *
     * When enabled, the physics step will print detailed state (orientation,
     * velocities, chain forces) to stdout each substep. Intended for debugging
     * a single problematic target selected from the UI.
     */
    void setDebug(bool debug) { debug_ = debug; }

    private:
    // Steel density constant (kg/m³)
    static constexpr float STEEL_DENSITY = 7850.0f;

    // Spring constant for chain anchors (N/m) - very high for rigid chains
    static constexpr float SPRING_CONSTANT = 10000.0f;

    // Chain damping coefficient (N·s/m) - critically damped to prevent bouncing
    // Chains dissipate energy and don't bounce back - they just stop
    static constexpr float CHAIN_DAMPING = 200.0f;

    // Minimum mass for stability (prevents very light targets from becoming unstable)
    static constexpr float MIN_MASS = 2.0f; // kg

    // Damping coefficients (fraction remaining after 1 second)
    static constexpr float LINEAR_DAMPING = 0.5f;  // 50% velocity remains after 1 second
    static constexpr float ANGULAR_DAMPING = 0.5f; // 50% angular velocity remains after 1 second

    // Velocity thresholds for "done moving" detection
    static constexpr float VELOCITY_THRESHOLD = 0.2f;         // m/s
    static constexpr float ANGULAR_VELOCITY_THRESHOLD = 0.2f; // rad/s

    // Time window for settle detection (must be below thresholds for this long)
    static constexpr float SETTLE_TIME_THRESHOLD_S = 1.0f; // seconds

    // Maximum acceleration to prevent numerical instability
    static constexpr float MAX_ACCELERATION = 50.0f; // m/s²

    // Shape definition (in YZ plane, normal in +X direction)
    float width_;
    float height_;
    float thickness_;
    bool is_oval_;

    // Physics state
    btk::math::Vector3D position_;         // Center of mass position
    btk::math::Vector3D normal_;           // Current surface normal direction
    btk::math::Quaternion orientation_;    // Full 3D orientation (from local +X-normal frame to world)
    btk::math::Vector3D velocity_ms_;      // Linear velocity
    btk::math::Vector3D angular_velocity_; // Angular velocity (rad/s)
    bool is_moving_;                       // True if target is moving (updated during timeStep)
    float time_below_threshold_s_ = 0.0f;  // Time spent below velocity thresholds
    bool debug_ = false;                   // Verbose debug logging flag

    // Physical properties
    float mass_kg_;
    btk::math::Vector3D inertia_tensor_; // Diagonal inertia tensor (simplified)

    // Constraints and impacts
    std::vector<ChainAnchor> anchors_;
    std::vector<Impact> impacts_;

    // Display buffer
    std::vector<float> vertices_buffer_; // Flat array: x,y,z,x,y,z,... in Three.js coordinates
    std::vector<float> uvs_buffer_;      // Flat array: u,v,u,v,... for texture mapping
    std::vector<float> normals_buffer_;  // Flat array: nx,ny,nz,nx,ny,nz,... for lighting
    int segments_per_circle_;            // Number of segments for circular shapes

    // Texture buffer (RGBA format) - single texture with front on left half, back on right half
    std::vector<uint8_t> texture_buffer_; // Combined texture: r,g,b,a,r,g,b,a,...
    int texture_width_;                   // Total texture width in pixels (2x target aspect)
    int texture_height_;                  // Texture height in pixels
    uint8_t paint_color_[3];              // RGB paint color
    uint8_t metal_color_[3];              // RGB metal color

    /**
     * @brief Calculate mass and moment of inertia from shape
     */
    void calculateMassAndInertia();

    /**
     * @brief Apply chain tension forces
     */
    void applyChainForces(float dt);

    /**
     * @brief Apply instantaneous impulse at a world-space point
     */
    void applyImpulse(const btk::math::Vector3D& impulse, const btk::math::Vector3D& world_position);

    /**
     * @brief Apply force at a world-space point
     */
    void applyForce(const btk::math::Vector3D& force, const btk::math::Vector3D& world_position, float dt);

    /**
     * @brief Record an impact for visualization and update texture
     *
     * Converts bullet data to local coordinates, stores the impact,
     * and incrementally updates the texture with the new splatter mark.
     */
    void recordImpact(const btk::ballistics::Bullet& bullet);

    /**
     * @brief Draw a single impact splatter on the texture
     *
     * Draws the splatter mark for one impact with random spikes radiating outward.
     *
     * @param local_position Impact position in local coordinates
     * @param bullet_diameter Bullet diameter in meters
     * @param is_front_face True to draw on front texture, false for back texture
     */
    void drawImpactOnTexture(const btk::math::Vector3D& local_position, float bullet_diameter, bool is_front_face);

    /**
     * @brief Calculate transfer ratio based on impact angle
     */
    float calculateMomentumTransferRatio(float angle_to_normal) const;
  };

} // namespace btk::rendering
