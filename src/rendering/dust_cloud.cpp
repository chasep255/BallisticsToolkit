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

  DustCloud::DustCloud(int num_particles, const btk::math::Vector3D& position, float initial_radius, float growth_rate)
    : center_position_(position), initial_radius_(initial_radius), growth_rate_(growth_rate), radius_(initial_radius), alpha_(1.0f)
  {
    // Initialize particles with relative positions using Gaussian distribution (denser at center)
    // Scale relative positions by initial radius so they represent actual positions in meters
    particles_.reserve(num_particles);
    for(int i = 0; i < num_particles; ++i)
    {
      // Relative position using Gaussian distribution (normal random, mean=0, stddev=1)
      // This creates denser distribution at center, tapering off at edges
      // Scale by initial radius so particles are distributed within the initial cloud size
      btk::math::Vector3D relative_position(btk::math::Random::normal(0.0f, 1.0f) * initial_radius_, btk::math::Random::normal(0.0f, 1.0f) * initial_radius_,
                                            btk::math::Random::normal(0.0f, 1.0f) * initial_radius_);

      particles_.emplace_back(relative_position);
    }

    // Initialize buffers
    updateBuffers();
  }

  void DustCloud::timeStep(float dt, const btk::math::Vector3D& wind)
  {
    // Grow radius linearly over time
    radius_ += growth_rate_ * dt;

    // Calculate alpha inversely proportional to radius: alpha = initial_radius / current_radius
    // As the cloud expands, alpha decreases proportionally to 1/radius
    if(radius_ > 0.0f)
    {
      alpha_ = initial_radius_ / radius_;
      alpha_ = alpha_ * alpha_ * alpha_;
      if(alpha_ < 0.0f)
      {
        alpha_ = 0.0f;
      }
    }
    else
    {
      alpha_ = 0.0f;
    }

    // Advect cloud center with wind (move with the air velocity)
    center_position_ += wind * dt;

    // Update display buffers
    updateBuffers();
  }

  void DustCloud::updateBuffers()
  {
    positions_buffer_.clear();

    // Skip if cloud is fully faded
    if(alpha_ < ALPHA_THRESHOLD)
    {
      return;
    }

    // Scale factor: current radius / initial radius (scales relative positions)
    // Since relative positions are already in meters (scaled by initial_radius), we scale by radius ratio
    float radius_scale = radius_ / initial_radius_;

    // BTK coordinates: X=crossrange, Y=up, Z=-downrange (meters)
    // Three.js scene also uses meters now, so we push world-space positions directly.
    for(const auto& particle : particles_)
    {
      // Calculate world position: center + scaled relative position
      // relative_position_ is already in meters (scaled by initial_radius), so scale by radius ratio
      btk::math::Vector3D world_position = center_position_ + particle.relative_position_ * radius_scale;

      // Store position (3 floats: x, y, z)
      positions_buffer_.push_back(world_position.x);
      positions_buffer_.push_back(world_position.y);
      positions_buffer_.push_back(world_position.z);
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

  btk::math::Vector3D DustCloud::getCenterPosition() const { return center_position_; }

#ifdef __EMSCRIPTEN__
  emscripten::val DustCloud::getPositions() const
  {
    using namespace emscripten;
    if(positions_buffer_.empty())
    {
      return val::global("Float32Array").new_(0);
    }
    return val(typed_memory_view(positions_buffer_.size(), positions_buffer_.data()));
  }
#endif

} // namespace btk::rendering
