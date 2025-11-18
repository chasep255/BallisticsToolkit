#include "rendering/dust_cloud.h"
#include "math/conversions.h"
#include "math/random.h"
#include <cmath>

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#include <emscripten/wire.h>
#endif

namespace btk::rendering
{

  DustCloud::DustCloud(int num_particles,
                       const btk::math::Vector3D& position,
                       const btk::math::Vector3D& wind,
                       uint8_t color_r, uint8_t color_g, uint8_t color_b,
                       float initial_velocity_scale,
                       float fade_rate,
                       float drag_coefficient,
                       float particle_diameter)
    : wind_(wind), initial_velocity_scale_(initial_velocity_scale), fade_rate_(fade_rate), 
      drag_coefficient_(drag_coefficient), particle_diameter_(particle_diameter), alpha_(1.0f)
  {
    // Initialize particles with random velocities and color jitter (spawn from exact position)
    particles_.reserve(num_particles);
    for (int i = 0; i < num_particles; ++i)
    {
      // Random velocity for explosion-like initial burst
      // Use normal distribution for natural random spread
      btk::math::Vector3D random_velocity(
        btk::math::Random::normal(0.0f, initial_velocity_scale_),
        btk::math::Random::normal(0.0f, initial_velocity_scale_),
        btk::math::Random::normal(0.0f, initial_velocity_scale_) // Random in all directions including up
      );

      // Add random color jitter (±20% variation)
      uint8_t jitter_r = static_cast<uint8_t>(std::max(0, std::min(255, 
        static_cast<int>(color_r + btk::math::Random::normal(0.0f, color_r * 0.2f)))));
      uint8_t jitter_g = static_cast<uint8_t>(std::max(0, std::min(255, 
        static_cast<int>(color_g + btk::math::Random::normal(0.0f, color_g * 0.2f)))));
      uint8_t jitter_b = static_cast<uint8_t>(std::max(0, std::min(255, 
        static_cast<int>(color_b + btk::math::Random::normal(0.0f, color_b * 0.2f)))));

      particles_.emplace_back(position, random_velocity, jitter_r, jitter_g, jitter_b);
    }

    // Initialize buffers
    updateBuffers();
  }

  void DustCloud::timeStep(float dt)
  {
    // Fade alpha exponentially over time (more realistic: alpha = e^(-fade_rate * t))
    // Exponential decay: faster fade initially, slower as it approaches zero
    alpha_ *= std::exp(-fade_rate_ * dt);
    if (alpha_ < 0.0f) {
      alpha_ = 0.0f;
    }

    // Update each particle position
    for (auto& particle : particles_)
    {
      // Apply quadratic drag to particle velocity (excluding wind)
      // Drag force F ∝ v², so acceleration a = -drag_coefficient * v² * v̂
      // This slows down particles based on their speed squared
      float speed = particle.velocity_.magnitude();
      if (speed > 0.001f) // Only apply drag if particle is moving
      {
        // Drag acceleration opposes velocity direction
        btk::math::Vector3D velocity_dir = particle.velocity_.normalized();
        
        // Drag force magnitude: F = drag_coefficient * v²
        // Acceleration: a = F/m = drag_coefficient * v² (assuming unit mass)
        float drag_acceleration = drag_coefficient_ * speed * speed;
        
        // Apply drag acceleration (opposes motion)
        btk::math::Vector3D drag_accel = velocity_dir * (-drag_acceleration);
        particle.velocity_ += drag_accel * dt;
        
        // Clamp to zero if velocity becomes very small (prevents jitter)
        if (particle.velocity_.magnitude() < 0.001f)
        {
          particle.velocity_ = btk::math::Vector3D(0.0f, 0.0f, 0.0f);
        }
      }
      
      // Move particle with combined wind and drag-damped velocity
      // Wind advects particles (air movement), drag only affects relative velocity
      btk::math::Vector3D total_velocity = wind_ + particle.velocity_;
      particle.position_ += total_velocity * dt;
    }

    // Update display buffers
    updateBuffers();
  }

  void DustCloud::updateBuffers()
  {
    matrices_buffer_.clear();

    // Skip if cloud is fully faded
    if (alpha_ < ALPHA_THRESHOLD)
    {
      return;
    }

    // BTK coordinates: X=downrange, Y=crossrange, Z=up
    // Three.js coordinates: X=right, Y=up, Z=towards camera
    for (const auto& particle : particles_)
    {
      // Convert BTK to Three.js coordinates
      float x = particle.position_.y;   // BTK Y → Three X
      float y = particle.position_.z;  // BTK Z → Three Y
      float z = -particle.position_.x;  // BTK -X → Three Z

      // Create identity scale (no growth) and translation matrix (column-major order for Three.js)
      // Three.js Matrix4 layout: [col0, col1, col2, col3] = [m0-m3, m4-m7, m8-m11, m12-m15]
      // Identity scale matrix: 1.0 on diagonal, translation in last column
      matrices_buffer_.push_back(1.0f);  // m0 (scale X)
      matrices_buffer_.push_back(0.0f);  // m1
      matrices_buffer_.push_back(0.0f);  // m2
      matrices_buffer_.push_back(0.0f);   // m3
      matrices_buffer_.push_back(0.0f);  // m4
      matrices_buffer_.push_back(1.0f);  // m5 (scale Y)
      matrices_buffer_.push_back(0.0f);  // m6
      matrices_buffer_.push_back(0.0f);  // m7
      matrices_buffer_.push_back(0.0f);  // m8
      matrices_buffer_.push_back(0.0f);  // m9
      matrices_buffer_.push_back(1.0f);  // m10 (scale Z)
      matrices_buffer_.push_back(0.0f);  // m11
      matrices_buffer_.push_back(x);     // m12 (translation X)
      matrices_buffer_.push_back(y);     // m13 (translation Y)
      matrices_buffer_.push_back(z);     // m14 (translation Z)
      matrices_buffer_.push_back(1.0f);  // m15
    }
  }
  
  float DustCloud::getAlpha() const
  {
    // Return shared alpha (all particles have the same alpha)
    return alpha_;
  }

  bool DustCloud::isDone() const
  {
    // Check if cloud has faded below threshold (all particles share the same alpha)
    return alpha_ < ALPHA_THRESHOLD;
  }

  int DustCloud::getParticleCount() const
  {
    // Return all particles if cloud is visible, 0 if faded
    return (alpha_ >= ALPHA_THRESHOLD) ? static_cast<int>(particles_.size()) : 0;
  }

#ifdef __EMSCRIPTEN__
  emscripten::val DustCloud::getInstanceMatrices() const
  {
    using namespace emscripten;
    if (matrices_buffer_.empty())
    {
      return val::global("Float32Array").new_(0);
    }
    return val(typed_memory_view(matrices_buffer_.size(), matrices_buffer_.data()));
  }
#endif

} // namespace btk::rendering

