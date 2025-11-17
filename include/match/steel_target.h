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
      btk::math::Vector3D fixed_;            ///< Fixed anchor point (does not move with target)
      btk::math::Vector3D attachment_;       ///< Attachment point on target (moves with target)
      float rest_length_;                    ///< Rest length of chain
      float spring_constant_;                ///< Spring constant (N/m)

      ChainAnchor() : fixed_(0, 0, 0), attachment_(0, 0, 0), rest_length_(0), spring_constant_(0) {}
      ChainAnchor(const btk::math::Vector3D& fixed, const btk::math::Vector3D& attachment, float rest_length, float spring_k) 
        : fixed_(fixed), attachment_(attachment), rest_length_(rest_length), spring_constant_(spring_k) {}
    };

    /**
     * @brief Represents a bullet impact on the target
     */
    struct Impact
    {
      btk::math::Vector3D position_;
      float bullet_diameter_;
      float timestamp_s_;

      Impact() : position_(0, 0, 0), bullet_diameter_(0), timestamp_s_(0) {}
      Impact(const btk::math::Vector3D& pos, float diameter, float time) : position_(pos), bullet_diameter_(diameter), timestamp_s_(time) {}
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
     * @brief Initialize steel target with single shape
     *
     * @param width Target width (bounding box)
     * @param height Target height (bounding box)
     * @param thickness Target thickness
     * @param is_oval True for oval shape, false for rectangle
     */
    SteelTarget(float width, float height, float thickness, bool is_oval = false);

    /**
     * @brief Add a chain anchor constraint
     *
     * @param fixed Fixed anchor point (does not move with target)
     * @param attachment Attachment point on target (moves with target)
     * @param rest_length Rest length of chain
     * @param spring_constant Spring constant (N/m), defaults to 500 N/m
     */
    void addChainAnchor(const btk::math::Vector3D& fixed, const btk::math::Vector3D& attachment, float rest_length, float spring_constant = DEFAULT_SPRING_CONSTANT);

    /**
     * @brief Set damping coefficients
     *
     * @param linear Linear velocity damping [0, 1]
     * @param angular Angular velocity damping [0, 1]
     */
    void setDamping(float linear, float angular);

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
     * @brief Get target mass
     */
    float getMass() const { return mass_kg_; }

    /**
     * @brief Translate all components and anchors by the given offset
     */
    void translate(const btk::math::Vector3D& offset);

    /**
     * @brief Rotate all components and anchors to face the given normal direction
     * Components default to normal in +X direction
     */
    void rotate(const btk::math::Vector3D& normal);

    /**
     * @brief Clear all recorded impacts
     */
    void clearImpacts() { impacts_.clear(); }

    private:
    // Steel density constant (kg/m³)
    static constexpr float STEEL_DENSITY = 7850.0f;
    
    // Default spring constant for chain anchors (N/m)
    static constexpr float DEFAULT_SPRING_CONSTANT = 500.0f;

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
    std::vector<float> vertices_buffer_;  // Flat array: x,y,z,x,y,z,... in BTK world coordinates
    int segments_per_circle_;             // Number of segments for circular shapes

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
     * @brief Record an impact for visualization
     */
    void recordImpact(const btk::math::Vector3D& world_position, float bullet_diameter, float time);

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

