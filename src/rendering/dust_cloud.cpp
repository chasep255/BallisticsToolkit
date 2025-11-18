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
                       float lifetime,
                       float spawn_radius,
                       const btk::math::Vector3D& direction_bias)
    : wind_(wind)
  {
    color_[0] = color_r;
    color_[1] = color_g;
    color_[2] = color_b;

    // Normalize direction bias if provided
    btk::math::Vector3D normalized_bias = direction_bias;
    float bias_length = normalized_bias.magnitude();
    if (bias_length > 1e-6f)
    {
      normalized_bias = normalized_bias / bias_length;
    }

    // Initialize particles with random positions and velocities around spawn point
    particles_.reserve(num_particles);
    for (int i = 0; i < num_particles; ++i)
    {
      // Random offset within spawn radius (horizontal only - particles spawn on ground)
      float angle = btk::math::Random::uniform(0.0f, 2.0f * M_PI_F);
      float radius = btk::math::Random::uniform(0.0f, spawn_radius);
      // No vertical offset - particles spawn at ground level
      float height = 0.0f;

      btk::math::Vector3D offset(
        radius * std::cos(angle),
        radius * std::sin(angle),
        height
      );

      // Random velocity for particle walk (dust-like, slow expansion)
      // Use normal distribution for more natural random walk
      float vel_scale = 0.2f; // m/s - slow dust particles
      btk::math::Vector3D random_velocity(
        btk::math::Random::normal(0.0f, vel_scale),
        btk::math::Random::normal(0.0f, vel_scale),
        btk::math::Random::normal(0.0f, vel_scale) // Random in all directions including up
      );

      // Add direction bias to initial velocity (biased towards surface normal)
      if (bias_length > 1e-6f)
      {
        float bias_strength = 0.5f; // m/s - strength of directional bias
        random_velocity = random_velocity + normalized_bias * bias_strength;
      }

      // Random lifetime variation (±20%)
      float particle_lifetime = lifetime * btk::math::Random::uniform(0.8f, 1.2f);

      particles_.emplace_back(position + offset, random_velocity, particle_lifetime);
    }

    // Initialize buffers
    updateBuffers();
  }

  void DustCloud::timeStep(float dt)
  {
    // Update each particle
    for (auto& particle : particles_)
    {
      // Add random walk to velocity (Brownian motion - subtle for dust)
      float walk_strength = 0.2f; // m/s² - subtle random acceleration for dust
      btk::math::Vector3D random_walk(
        btk::math::Random::normal(0.0f, walk_strength),
        btk::math::Random::normal(0.0f, walk_strength),
        btk::math::Random::normal(0.0f, walk_strength) // Random in all directions including up
      );
      particle.velocity_ += random_walk * dt;
      
      // Dampen velocity slightly to prevent infinite expansion
      particle.velocity_ *= 0.99f;
      
      // Move particle with combined wind and random velocity
      btk::math::Vector3D total_velocity = wind_ + particle.velocity_;
      particle.position_ += total_velocity * dt;

      // Age particle
      particle.age_ += dt;

      // Calculate alpha fade (faster fade - cubic for quicker disappearance)
      float lifetime_ratio = particle.age_ / particle.lifetime_;
      if (lifetime_ratio >= 1.0f) {
        // Particle has exceeded its lifetime - fully faded
        particle.alpha_ = 0.0f;
      } else {
        float fade = 1.0f - lifetime_ratio;
        particle.alpha_ = fade * fade * fade; // Cubic fade (faster than quadratic)
      }
    }

    // Update display buffers
    updateBuffers();
  }

  void DustCloud::updateBuffers()
  {
    matrices_buffer_.clear();

    // BTK coordinates: X=downrange, Y=crossrange, Z=up
    // Three.js coordinates: X=right, Y=up, Z=towards camera
    for (const auto& particle : particles_)
    {
      // Skip particles that are fully faded
      if (particle.alpha_ < 0.01f)
      {
        continue;
      }

      // Convert BTK to Three.js coordinates
      float x = particle.position_.y;   // BTK Y → Three X
      float y = particle.position_.z;  // BTK Z → Three Y
      float z = -particle.position_.x;  // BTK -X → Three Z

      // Create translation matrix (column-major order for Three.js)
      // Three.js Matrix4 layout: [col0, col1, col2, col3] = [m0-m3, m4-m7, m8-m11, m12-m15]
      // Translation matrix: identity with translation in last column
      matrices_buffer_.push_back(1.0f);  // m0
      matrices_buffer_.push_back(0.0f);  // m1
      matrices_buffer_.push_back(0.0f);  // m2
      matrices_buffer_.push_back(0.0f);  // m3
      matrices_buffer_.push_back(0.0f);  // m4
      matrices_buffer_.push_back(1.0f);  // m5
      matrices_buffer_.push_back(0.0f);  // m6
      matrices_buffer_.push_back(0.0f);  // m7
      matrices_buffer_.push_back(0.0f);  // m8
      matrices_buffer_.push_back(0.0f);  // m9
      matrices_buffer_.push_back(1.0f);  // m10
      matrices_buffer_.push_back(0.0f);  // m11
      matrices_buffer_.push_back(x);     // m12 (translation X)
      matrices_buffer_.push_back(y);     // m13 (translation Y)
      matrices_buffer_.push_back(z);     // m14 (translation Z)
      matrices_buffer_.push_back(1.0f);  // m15
    }
  }
  
  float DustCloud::getAlpha() const
  {
    // Return maximum alpha of all particles (for uniform cloud fade)
    float max_alpha = 0.0f;
    for (const auto& particle : particles_)
    {
      if (particle.alpha_ > max_alpha)
      {
        max_alpha = particle.alpha_;
      }
    }
    return max_alpha;
  }

  bool DustCloud::isDone() const
  {
    // Check if all particles have faded to zero
    for (const auto& particle : particles_)
    {
      if (particle.alpha_ > 0.0f)
      {
        return false;
      }
    }
    return true;
  }

  int DustCloud::getParticleCount() const
  {
    constexpr float ALPHA_THRESHOLD = 0.01f;
    int count = 0;
    for (const auto& particle : particles_)
    {
      if (particle.alpha_ >= ALPHA_THRESHOLD)
      {
        count++;
      }
    }
    return count;
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

