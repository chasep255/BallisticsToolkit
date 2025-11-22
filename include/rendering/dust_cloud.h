#pragma once

#include "math/vector.h"
#include <vector>

// Forward declaration for WASM builds
#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

namespace btk::rendering
{

  /**
   * @brief Particle system for dust clouds
   *
   * Simulates dust particles that drift with wind and fade away over time.
   * Particles move with constant wind velocity (includes upward drift).
   * No gravity is applied - particles only move with wind.
   */
  class DustCloud
  {
    public:
    /**
     * @brief Particle structure
     */
    struct Particle
    {
      btk::math::Vector3D relative_position_; ///< Relative position from cloud center (normalized, scaled by radius)

      Particle() : relative_position_(0, 0, 0) {}
      Particle(const btk::math::Vector3D& rel_pos) : relative_position_(rel_pos) {}
    };

    /**
     * @brief Construct dust cloud
     *
     * Particles have relative positions from cloud center, distributed using Gaussian distribution.
     * Cloud radius grows linearly over time.
     * Cloud center advects with wind (wind sampled dynamically each timeStep).
     * Alpha decays inversely with radius: alpha = initial_radius / current_radius
     * As the cloud expands, alpha decreases proportionally to 1/radius.
     * Cloud disappears when alpha < 0.01.
     *
     * @param num_particles Initial number of particles
     * @param position Initial cloud center position
     * @param initial_radius Initial cloud radius in meters (default 0.1m = 10cm)
     * @param growth_rate Cloud radius growth rate in m/s (default 0.5 m/s)
     */
    DustCloud(int num_particles, const btk::math::Vector3D& position, float initial_radius = 0.1f, float growth_rate = 0.5f);

    /**
     * @brief Advance simulation by time step
     *
     * Updates particle positions with wind, ages particles, and fades alpha.
     * Wind is sampled dynamically at cloud center position each frame.
     *
     * @param dt Time step in seconds
     * @param wind Wind vector (m/s) at cloud center position - advects cloud center
     */
    void timeStep(float dt, const btk::math::Vector3D& wind);

    /**
     * @brief Get positions buffer as JS-typed array view for zero-copy access
     *
     * Returns positions as [x0,y0,z0, x1,y1,z1, ...] (3 floats per particle).
     * Positions are in Three.js coordinates (yards).
     * Buffer is updated by calling timeStep() before this.
     */
#ifdef __EMSCRIPTEN__
    emscripten::val getPositions() const;
#else
    const std::vector<float>& getPositions() const { return positions_buffer_; }
#endif

    /**
     * @brief Get global alpha for the dust cloud
     *
     * Returns the maximum alpha of all particles (0.0 to 1.0).
     * Used for fading the entire cloud uniformly.
     */
    float getAlpha() const;

    /**
     * @brief Check if all particles have faded out
     *
     * @return True if all particles have alpha < threshold (0.01)
     */
    bool isDone() const;

    /**
     * @brief Get current number of active particles
     *
     * @return Number of particles with alpha > threshold
     */
    int getParticleCount() const;

    /**
     * @brief Get current cloud center position
     *
     * @return Cloud center position in BTK coordinates (meters)
     */
    btk::math::Vector3D getCenterPosition() const;

    private:
    static constexpr float ALPHA_THRESHOLD = 0.01f; ///< Alpha threshold for particle visibility

    std::vector<Particle> particles_;     ///< All particles
    btk::math::Vector3D center_position_; ///< Current cloud center position
    float initial_radius_;                ///< Initial cloud radius in meters
    float growth_rate_;                   ///< Cloud radius growth rate in m/s
    float radius_;                        ///< Current cloud radius in meters
    float alpha_;                         ///< Current alpha (decays inversely with radius: initial_radius / radius)

    // Display buffers (updated each timeStep)
    std::vector<float> positions_buffer_; ///< Flat array: 3 floats per particle (x,y,z in yards)

    /**
     * @brief Update display buffers from particle data
     */
    void updateBuffers();
  };

} // namespace btk::rendering
