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
      btk::math::Vector3D relative_position_;  ///< Relative position from cloud center (normalized, scaled by radius)
      uint8_t color_[3];                       ///< RGB color with random jitter

      Particle() : relative_position_(0, 0, 0), color_{0, 0, 0} {}
      Particle(const btk::math::Vector3D& rel_pos, uint8_t r, uint8_t g, uint8_t b)
        : relative_position_(rel_pos), color_{r, g, b} {}
    };

    /**
     * @brief Construct dust cloud
     *
     * Particles have relative positions from cloud center, distributed using Gaussian distribution.
     * Cloud radius grows linearly over time (independent of alpha fade).
     * Cloud center advects with wind.
     * Alpha fades exponentially over time (alpha = e^(-fade_rate * t)), independent of radius growth.
     * Cloud disappears when alpha < 0.01.
     *
     * @param num_particles Initial number of particles
     * @param position Initial cloud center position
     * @param wind Wind vector (m/s) - advects cloud center
     * @param color_r Red component (0-255) - base color, each particle gets random jitter
     * @param color_g Green component (0-255) - base color, each particle gets random jitter
     * @param color_b Blue component (0-255) - base color, each particle gets random jitter
     * @param initial_radius Initial cloud radius in meters (default 0.1m = 10cm)
     * @param growth_rate Cloud radius growth rate in m/s (default 0.5 m/s)
     * @param fade_rate Alpha fade rate per second (default 0.5 = e^(-0.5t))
     * @param particle_diameter Particle diameter in meters (default 0.006m = 6mm)
     */
    DustCloud(int num_particles,
              const btk::math::Vector3D& position,
              const btk::math::Vector3D& wind,
              uint8_t color_r, uint8_t color_g, uint8_t color_b,
              float initial_radius = 0.1f,
              float growth_rate = 0.5f,
              float fade_rate = 0.5f,
              float particle_diameter = 0.006f);

    /**
     * @brief Advance simulation by time step
     *
     * Updates particle positions with wind, ages particles, and fades alpha.
     *
     * @param dt Time step in seconds
     */
    void timeStep(float dt);

    /**
     * @brief Get instance matrices buffer as JS-typed array view for zero-copy access
     *
     * Returns instance matrices as [m0,m1,m2,...,m15, m0,m1,m2,...,m15, ...] (16 floats per matrix).
     * Matrices are in column-major order for Three.js InstancedMesh.
     * Buffer is updated by calling timeStep() before this.
     */
#ifdef __EMSCRIPTEN__
    emscripten::val getInstanceMatrices() const;
#else
    const std::vector<float>& getInstanceMatrices() const { return matrices_buffer_; }
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
     * @brief Get particle diameter
     *
     * @return Particle diameter in meters
     */
    float getParticleDiameter() const { return particle_diameter_; }

    private:
    static constexpr float ALPHA_THRESHOLD = 0.01f; ///< Alpha threshold for particle visibility

    std::vector<Particle> particles_;      ///< All particles
    btk::math::Vector3D wind_;             ///< Constant wind vector (advects cloud center)
    btk::math::Vector3D center_position_;  ///< Current cloud center position
    float initial_radius_;                 ///< Initial cloud radius in meters
    float growth_rate_;                    ///< Cloud radius growth rate in m/s
    float fade_rate_;                      ///< Alpha fade rate per second (exponential decay)
    float radius_;                         ///< Current cloud radius in meters
    float particle_diameter_;              ///< Particle diameter in meters
    float alpha_;                          ///< Current alpha (shared by all particles, fades exponentially over time)
    float elapsed_time_;                   ///< Elapsed time since creation (for independent alpha fade)

    // Display buffers (updated each timeStep)
    std::vector<float> matrices_buffer_;    ///< Flat array: 16 floats per matrix (column-major) for InstancedMesh

    /**
     * @brief Update display buffers from particle data
     */
    void updateBuffers();
  };

} // namespace btk::rendering

