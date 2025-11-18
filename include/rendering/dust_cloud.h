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
      btk::math::Vector3D position_;  ///< Current position in world space
      btk::math::Vector3D velocity_;  ///< Random velocity for particle walk
      float age_;                     ///< Current age in seconds
      float lifetime_;                ///< Total lifetime in seconds
      float alpha_;                   ///< Current alpha (0.0 to 1.0)

      Particle() : position_(0, 0, 0), velocity_(0, 0, 0), age_(0), lifetime_(0), alpha_(1.0f) {}
      Particle(const btk::math::Vector3D& pos, const btk::math::Vector3D& vel, float lifetime)
        : position_(pos), velocity_(vel), age_(0), lifetime_(lifetime), alpha_(1.0f) {}
    };

    /**
     * @brief Construct dust cloud
     *
     * @param num_particles Initial number of particles
     * @param position Initial position (particles spawn here with random offset)
     * @param wind Wind vector (m/s) - includes upward drift component
     * @param color_r Red component (0-255)
     * @param color_g Green component (0-255)
     * @param color_b Blue component (0-255)
     * @param lifetime Particle lifetime in seconds (default 5.0)
     * @param spawn_radius Radius around position to spawn particles (default 0.1m)
     * @param direction_bias Normalized direction vector to bias initial velocities (default none)
     */
    DustCloud(int num_particles,
              const btk::math::Vector3D& position,
              const btk::math::Vector3D& wind,
              uint8_t color_r, uint8_t color_g, uint8_t color_b,
              float lifetime = 5.0f,
              float spawn_radius = 0.1f,
              const btk::math::Vector3D& direction_bias = btk::math::Vector3D(0, 0, 0));

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
     * @brief Set wind vector
     *
     * @param wind New wind vector (m/s)
     */
    void setWind(const btk::math::Vector3D& wind) { wind_ = wind; }

    private:
    std::vector<Particle> particles_;      ///< All particles
    btk::math::Vector3D wind_;             ///< Constant wind vector (includes upward drift)
    uint8_t color_[3];                     ///< RGB color

    // Display buffers (updated each timeStep)
    std::vector<float> matrices_buffer_;    ///< Flat array: 16 floats per matrix (column-major) for InstancedMesh

    /**
     * @brief Update display buffers from particle data
     */
    void updateBuffers();
  };

} // namespace btk::rendering

