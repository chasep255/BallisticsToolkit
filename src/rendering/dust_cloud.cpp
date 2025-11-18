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
                       float initial_radius,
                       float growth_rate,
                       float fade_rate,
                       float particle_diameter)
    : wind_(wind), center_position_(position), initial_radius_(initial_radius), 
      growth_rate_(growth_rate), fade_rate_(fade_rate), radius_(initial_radius), 
      particle_diameter_(particle_diameter), alpha_(1.0f), elapsed_time_(0.0f)
  {
    // Initialize particles with relative positions using Gaussian distribution (denser at center)
    // Scale relative positions by initial radius so they represent actual positions in meters
    particles_.reserve(num_particles);
    for (int i = 0; i < num_particles; ++i)
    {
      // Relative position using Gaussian distribution (normal random, mean=0, stddev=1)
      // This creates denser distribution at center, tapering off at edges
      // Scale by initial radius so particles are distributed within the initial cloud size
      btk::math::Vector3D relative_position(
        btk::math::Random::normal(0.0f, 1.0f) * initial_radius_,
        btk::math::Random::normal(0.0f, 1.0f) * initial_radius_,
        btk::math::Random::normal(0.0f, 1.0f) * initial_radius_
      );

      // Add random color jitter (±20% variation)
      uint8_t jitter_r = static_cast<uint8_t>(std::max(0, std::min(255, 
        static_cast<int>(color_r + btk::math::Random::normal(0.0f, color_r * 0.2f)))));
      uint8_t jitter_g = static_cast<uint8_t>(std::max(0, std::min(255, 
        static_cast<int>(color_g + btk::math::Random::normal(0.0f, color_g * 0.2f)))));
      uint8_t jitter_b = static_cast<uint8_t>(std::max(0, std::min(255, 
        static_cast<int>(color_b + btk::math::Random::normal(0.0f, color_b * 0.2f)))));

      particles_.emplace_back(relative_position, jitter_r, jitter_g, jitter_b);
    }

    // Initialize buffers
    updateBuffers();
  }

  void DustCloud::timeStep(float dt)
  {
    // Grow radius linearly over time (accumulate growth, independent of alpha)
    radius_ += growth_rate_ * dt;
    
    // Update elapsed time for independent alpha fade
    elapsed_time_ += dt;
    
    // Calculate alpha exponentially over time (independent of radius growth)
    // alpha = e^(-fade_rate * t)
    alpha_ = std::exp(-fade_rate_ * elapsed_time_);
    if (alpha_ < 0.0f) {
      alpha_ = 0.0f;
    }
    
    // Advect cloud center with wind
    center_position_ += wind_ * dt;

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

    // Scale factor: current radius / initial radius (scales relative positions)
    // Since relative positions are already in meters (scaled by initial_radius), we scale by radius ratio
    float radius_scale = radius_ / initial_radius_;

    // BTK coordinates: X=downrange, Y=crossrange, Z=up
    // Three.js coordinates: X=right, Y=up, Z=towards camera
    for (const auto& particle : particles_)
    {
      // Calculate world position: center + scaled relative position
      // relative_position_ is already in meters (scaled by initial_radius), so scale by radius ratio
      btk::math::Vector3D world_position = center_position_ + particle.relative_position_ * radius_scale;
      
      // Convert BTK to Three.js coordinates
      float x = world_position.y;   // BTK Y → Three X
      float y = world_position.z;  // BTK Z → Three Y
      float z = -world_position.x;  // BTK -X → Three Z

      // Create identity scale and translation matrix (column-major order for Three.js)
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

