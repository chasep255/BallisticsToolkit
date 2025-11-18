#pragma once

#include "ballistics/trajectory.h"
#include "math/quaternion.h"
#include "math/vector.h"
#include <cmath>
#include <optional>
#include <variant>
#include <vector>

// Forward declaration for WASM builds (for getVertices())
#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

namespace btk::match
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
      btk::math::Vector3D local_attachment_;  ///< Attachment point in local coordinates (moves with target)
      btk::math::Vector3D world_fixed_;       ///< Fixed anchor point in world coordinates (never moves)
      float rest_length_;                     ///< Rest length of chain (recalculated when target moves)
      float spring_constant_;                 ///< Spring constant (N/m)

      ChainAnchor() : local_attachment_(0, 0, 0), world_fixed_(0, 0, 0), rest_length_(0), spring_constant_(0) {}
      ChainAnchor(const btk::math::Vector3D& local_attach, const btk::math::Vector3D& world_fixed, float rest_length, float spring_k) 
        : local_attachment_(local_attach), world_fixed_(world_fixed), rest_length_(rest_length), spring_constant_(spring_k) {}
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
        : position_local_(local_pos), velocity_local_(local_vel), bullet_diameter_(diameter), timestamp_s_(time) {}
    };

    /**
     * @brief Result of trajectory intersection check
     */
    struct IntersectionResult
    {
      bool hit;                              ///< Whether trajectory intersects target
      btk::math::Vector3D impact_point_;   ///< Impact point in world space
      btk::math::Vector3D impact_velocity_;  ///< Bullet velocity at impact
      btk::math::Vector3D surface_normal_;   ///< Surface normal at impact point
      float impact_time_s_;                  ///< Time of impact
      float bullet_mass_kg_;                 ///< Bullet mass for momentum transfer
      float bullet_diameter_;              ///< Bullet diameter for impact recording

      IntersectionResult() : hit(false), impact_point_(0, 0, 0), impact_velocity_(0, 0, 0), surface_normal_(0, 0, 0), impact_time_s_(0.0f), bullet_mass_kg_(0.0f), bullet_diameter_(0.0f) {}
    };

    /**
     * @brief Initialize steel target with single shape at origin
     *
     * @param width Target width (bounding box)
     * @param height Target height (bounding box)
     * @param thickness Target thickness
     * @param is_oval True for oval shape, false for rectangle
     */
    SteelTarget(float width, float height, float thickness, bool is_oval = false);
    
    /**
     * @brief Initialize steel target with position and orientation
     *
     * @param width Target width (bounding box)
     * @param height Target height (bounding box)
     * @param thickness Target thickness
     * @param is_oval True for oval shape, false for rectangle
     * @param position Initial position (center of mass)
     * @param normal Surface normal direction (target faces this direction)
     */
    SteelTarget(float width, float height, float thickness, bool is_oval,
                const btk::math::Vector3D& position, const btk::math::Vector3D& normal);

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
     * @brief Get all chain anchors
     */
    const std::vector<ChainAnchor>& getAnchors() const { return anchors_; }

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
     * @param texture_width Texture width in pixels (default 512)
     * @param texture_height Texture height in pixels (default 512)
     */
    void initializeTexture(int texture_width = 512, int texture_height = 512);

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
    void setColors(uint8_t paint_r, uint8_t paint_g, uint8_t paint_b,
                   uint8_t metal_r = 128, uint8_t metal_g = 128, uint8_t metal_b = 128);

    /**
     * @brief Get target mass
     */
    float getMass() const { return mass_kg_; }

    /**
     * @brief Clear all recorded impacts and reset texture to clean paint
     */
    void clearImpacts() { 
      impacts_.clear();
      initializeTexture(texture_width_, texture_height_);
    }

    private:
    // Steel density constant (kg/m³)
    static constexpr float STEEL_DENSITY = 7850.0f;
    
    // Default spring constant for chain anchors (N/m)
    static constexpr float DEFAULT_SPRING_CONSTANT = 1000.0f;
    
    // Default damping coefficients (fraction remaining after 1 second)
    static constexpr float DEFAULT_LINEAR_DAMPING = 0.75f;  // 75% velocity remains after 1 second
    static constexpr float DEFAULT_ANGULAR_DAMPING = 0.1f;  // 10% angular velocity remains after 1 second

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

    // Physical properties
    float mass_kg_;
    btk::math::Vector3D inertia_tensor_; // Diagonal inertia tensor (simplified)

    // Constraints and impacts
    std::vector<ChainAnchor> anchors_;
    std::vector<Impact> impacts_;

    // Damping
    float linear_damping_;
    float angular_damping_;

    // Display buffer
    std::vector<float> vertices_buffer_;  // Flat array: x,y,z,x,y,z,... in Three.js coordinates
    std::vector<float> uvs_buffer_;       // Flat array: u,v,u,v,... for texture mapping
    int segments_per_circle_;             // Number of segments for circular shapes
    
    // Texture buffer (RGBA format) - single texture with front on left half, back on right half
    std::vector<uint8_t> texture_buffer_;       // Combined texture: r,g,b,a,r,g,b,a,...
    int texture_width_;                         // Total texture width in pixels (2x target aspect)
    int texture_height_;                        // Texture height in pixels
    uint8_t paint_color_[3];                    // RGB paint color
    uint8_t metal_color_[3];                    // RGB metal color

    /**
     * @brief Calculate mass and moment of inertia from shape
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
    void drawImpactOnTexture(const btk::math::Vector3D& local_position, 
                             float bullet_diameter,
                             bool is_front_face);

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

