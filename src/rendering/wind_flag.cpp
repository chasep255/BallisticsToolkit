#include "rendering/wind_flag.h"
#include "math/conversions.h"
#include "math/random.h"
#include <algorithm>
#include <cmath>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

namespace btk::rendering
{

  WindFlag::WindFlag(float flag_base_width, float flag_tip_width, float flag_length, float flag_thickness, int flag_segments, float flag_min_angle, float flag_max_angle, float flag_angle_response_k,
                     float flag_angle_interpolation_speed, float flag_direction_interpolation_speed, float flag_flap_frequency_base, float flag_flap_frequency_scale, float flag_flap_amplitude,
                     float flag_wave_length)
    : flag_base_width_(flag_base_width), flag_tip_width_(flag_tip_width), flag_length_(flag_length), flag_thickness_(flag_thickness), flag_segments_(flag_segments), flag_min_angle_(flag_min_angle),
      flag_max_angle_(flag_max_angle), flag_angle_response_k_(flag_angle_response_k), flag_angle_interpolation_speed_(flag_angle_interpolation_speed),
      flag_direction_interpolation_speed_(flag_direction_interpolation_speed), flag_flap_frequency_base_(flag_flap_frequency_base), flag_flap_frequency_scale_(flag_flap_frequency_scale),
      flag_flap_amplitude_(flag_flap_amplitude), flag_wave_length_(flag_wave_length), position_(0.0f, 0.0f, 0.0f), current_angle_(flag_min_angle), current_direction_(0.0f), flap_phase_(0.0f)
  {
    updateDisplay();
  }

  void WindFlag::setPosition(float x, float y, float z) { position_ = btk::math::Vector3D(x, y, z); }

  void WindFlag::update(float deltaTime, const btk::math::Vector3D& wind)
  {
    // Extract horizontal wind components (m/s)
    // BTK: X=crossrange (right), Y=up, Z=-downrange
    float crossrange_mps = wind.x; // +X = wind blowing to the right
    float downrange_mps = -wind.z; // Z=-downrange, so -wind.z = +downrange (tailwind toward targets)
    float windHoriz_mps = std::sqrt(crossrange_mps * crossrange_mps + downrange_mps * downrange_mps);
    float windHoriz_mph = btk::math::Conversions::mpsToMph(windHoriz_mps);

    // Wind direction in ground plane (BTK space).
    // Treat (crossrange_mps, downrange_mps) as a 2D vector:
    //  - X = crossrange (right)
    //  - Y = downrange (toward targets)
    // direction is measured from +X toward +downrange.
    float targetDirection = windHoriz_mps > 1e-6f ? std::atan2(downrange_mps, crossrange_mps) : current_direction_;

    // Nonlinear angle response: angle = min + span * (1 - exp(-K * v_h^2))
    float span = flag_max_angle_ - flag_min_angle_;
    float targetAngleDeg = flag_min_angle_ + span * (1.0f - std::exp(-flag_angle_response_k_ * windHoriz_mph * windHoriz_mph));

    // Smooth interpolate current angle toward target
    float angleDiff = targetAngleDeg - current_angle_;
    float angleStep = std::copysign(std::min(std::abs(angleDiff), flag_angle_interpolation_speed_ * deltaTime), angleDiff);
    current_angle_ += angleStep;

    // Smooth interpolate current direction toward target
    float dirDiff = targetDirection - current_direction_;
    // Normalize to [-PI, PI]
    while(dirDiff > M_PI)
      dirDiff -= 2.0f * M_PI;
    while(dirDiff < -M_PI)
      dirDiff += 2.0f * M_PI;
    float dirStep = std::copysign(std::min(std::abs(dirDiff), flag_direction_interpolation_speed_ * deltaTime), dirDiff);
    current_direction_ += dirStep;

    // Update flap phase based on horizontal wind speed
    float flapFrequency = flag_flap_frequency_base_ + windHoriz_mph * flag_flap_frequency_scale_;
    flap_phase_ += flapFrequency * 2.0f * M_PI * deltaTime;
    // Keep phase in reasonable range to avoid overflow
    while(flap_phase_ > 2.0f * M_PI)
      flap_phase_ -= 2.0f * M_PI;
    while(flap_phase_ < 0.0f)
      flap_phase_ += 2.0f * M_PI;
  }

  void WindFlag::calculateFlagSegmentPosition(int segmentIndex, float angleDeg, float direction, float flapPhase, float& outX, float& outY, float& outZ, float& outHalfWidth)
  {
    const float t = static_cast<float>(segmentIndex) / static_cast<float>(flag_segments_ - 1);
    const float halfBase = flag_base_width_ / 2.0f;
    const float halfTip = flag_tip_width_ / 2.0f;
    outHalfWidth = halfBase + (halfTip - halfBase) * t;

    // Calculate position with wind angle and flapping
    const float angleRad = angleDeg * M_PI / 180.0f;
    const float cosDir = std::cos(direction);
    const float sinDir = std::sin(direction);
    const float cosPitch = std::cos(angleRad);
    const float sinPitch = std::sin(angleRad);

    // BTK / Three.js coords: X=crossrange (right), Y=up, Z=-downrange.
    // direction is measured from +X toward +downrange, so the horizontal
    // wind direction vector is:
    //   h = (cosDir, 0, -sinDir)
    const float segmentX = cosDir * sinPitch * flag_length_ * t;  // Horizontal extension in wind direction (X)
    const float segmentY = -cosPitch * flag_length_ * t;          // Vertical droop (negative Y = down)
    const float segmentZ = -sinDir * sinPitch * flag_length_ * t; // Depth extension in wind direction (Z)

    // Flapping animation - flag waves in the wind
    const float wavePosition = t * flag_wave_length_;
    const float waveOffset = std::sin(flapPhase + wavePosition * 2.0f * M_PI) * flag_flap_amplitude_;
    const float flapAmplitude = waveOffset * t;

    // Flapping perpendicular to wind direction (makes flag visible from all angles).
    // Perpendicular horizontal vector to h = (cosDir, 0, -sinDir) is:
    //   p = (sinDir, 0, cosDir)
    const float flapX = sinDir * flapAmplitude; // Horizontal flapping
    const float flapZ = cosDir * flapAmplitude; // Depth flapping

    outX = segmentX + flapX;
    outY = segmentY;
    outZ = segmentZ + flapZ;
  }

  void WindFlag::updateDisplay()
  {
    vertices_buffer_.clear();
    uvs_buffer_.clear();
    indices_buffer_.clear();
    normals_buffer_.clear();

    const float halfThickness = flag_thickness_ / 2.0f;

    // Generate vertices for each segment
    for(int i = 0; i < flag_segments_; ++i)
    {
      float segX, segY, segZ, halfWidth;
      calculateFlagSegmentPosition(i, current_angle_, current_direction_, flap_phase_, segX, segY, segZ, halfWidth);

      // Flag is vertical (in XY plane), with top/bottom in Y direction.
      // Front/back faces are offset in Z direction (thickness).
      // 4 vertices per segment: topFront, bottomFront, topBack, bottomBack.
      // All coordinates are in BTK world space (meters), which now matches the
      // Three.js scene units, so we push them directly.

      // Top front vertex
      vertices_buffer_.push_back(position_.x + segX);
      vertices_buffer_.push_back(position_.y + segY + halfWidth);
      vertices_buffer_.push_back(position_.z + segZ + halfThickness);

      // Bottom front vertex
      vertices_buffer_.push_back(position_.x + segX);
      vertices_buffer_.push_back(position_.y + segY - halfWidth);
      vertices_buffer_.push_back(position_.z + segZ + halfThickness);

      // Top back vertex
      vertices_buffer_.push_back(position_.x + segX);
      vertices_buffer_.push_back(position_.y + segY + halfWidth);
      vertices_buffer_.push_back(position_.z + segZ - halfThickness);

      // Bottom back vertex
      vertices_buffer_.push_back(position_.x + segX);
      vertices_buffer_.push_back(position_.y + segY - halfWidth);
      vertices_buffer_.push_back(position_.z + segZ - halfThickness);

      // UV coordinates (red top, yellow bottom) for both faces
      const float t = static_cast<float>(i) / static_cast<float>(flag_segments_ - 1);
      uvs_buffer_.push_back(t);    // Top front U
      uvs_buffer_.push_back(0.0f); // Top front V
      uvs_buffer_.push_back(t);    // Bottom front U
      uvs_buffer_.push_back(1.0f); // Bottom front V
      uvs_buffer_.push_back(t);    // Top back U
      uvs_buffer_.push_back(0.0f); // Top back V
      uvs_buffer_.push_back(t);    // Bottom back U
      uvs_buffer_.push_back(1.0f); // Bottom back V
    }

    // Generate indices for front and back faces
    for(int i = 0; i < flag_segments_ - 1; ++i)
    {
      const uint32_t idx = i * 4; // 4 vertices per segment

      // Front face triangles
      indices_buffer_.push_back(idx);
      indices_buffer_.push_back(idx + 1);
      indices_buffer_.push_back(idx + 4); // First triangle
      indices_buffer_.push_back(idx + 1);
      indices_buffer_.push_back(idx + 5);
      indices_buffer_.push_back(idx + 4); // Second triangle

      // Back face triangles (reverse winding)
      indices_buffer_.push_back(idx + 2);
      indices_buffer_.push_back(idx + 6);
      indices_buffer_.push_back(idx + 3); // First triangle
      indices_buffer_.push_back(idx + 3);
      indices_buffer_.push_back(idx + 6);
      indices_buffer_.push_back(idx + 7); // Second triangle
    }

    // Add side faces to connect front and back
    for(int i = 0; i < flag_segments_ - 1; ++i)
    {
      const uint32_t idx = i * 4;

      // Top edge side face
      indices_buffer_.push_back(idx);
      indices_buffer_.push_back(idx + 4);
      indices_buffer_.push_back(idx + 2); // First triangle
      indices_buffer_.push_back(idx + 2);
      indices_buffer_.push_back(idx + 4);
      indices_buffer_.push_back(idx + 6); // Second triangle

      // Bottom edge side face
      indices_buffer_.push_back(idx + 1);
      indices_buffer_.push_back(idx + 3);
      indices_buffer_.push_back(idx + 5); // First triangle
      indices_buffer_.push_back(idx + 3);
      indices_buffer_.push_back(idx + 7);
      indices_buffer_.push_back(idx + 5); // Second triangle
    }

    // Compute vertex normals
    const size_t numVertices = vertices_buffer_.size() / 3;
    normals_buffer_.resize(vertices_buffer_.size(), 0.0f);

    // For each triangle, compute face normal and accumulate to vertex normals
    for(size_t i = 0; i < indices_buffer_.size(); i += 3)
    {
      const uint32_t i0 = indices_buffer_[i];
      const uint32_t i1 = indices_buffer_[i + 1];
      const uint32_t i2 = indices_buffer_[i + 2];

      // Get vertex positions
      const float* v0 = &vertices_buffer_[i0 * 3];
      const float* v1 = &vertices_buffer_[i1 * 3];
      const float* v2 = &vertices_buffer_[i2 * 3];

      // Compute edge vectors
      const float edge1x = v1[0] - v0[0];
      const float edge1y = v1[1] - v0[1];
      const float edge1z = v1[2] - v0[2];

      const float edge2x = v2[0] - v0[0];
      const float edge2y = v2[1] - v0[1];
      const float edge2z = v2[2] - v0[2];

      // Compute face normal (cross product)
      float nx = edge1y * edge2z - edge1z * edge2y;
      float ny = edge1z * edge2x - edge1x * edge2z;
      float nz = edge1x * edge2y - edge1y * edge2x;

      // Normalize face normal
      const float len = std::sqrt(nx * nx + ny * ny + nz * nz);
      if(len > 1e-6f)
      {
        nx /= len;
        ny /= len;
        nz /= len;
      }

      // Accumulate to vertex normals
      normals_buffer_[i0 * 3] += nx;
      normals_buffer_[i0 * 3 + 1] += ny;
      normals_buffer_[i0 * 3 + 2] += nz;

      normals_buffer_[i1 * 3] += nx;
      normals_buffer_[i1 * 3 + 1] += ny;
      normals_buffer_[i1 * 3 + 2] += nz;

      normals_buffer_[i2 * 3] += nx;
      normals_buffer_[i2 * 3 + 1] += ny;
      normals_buffer_[i2 * 3 + 2] += nz;
    }

    // Normalize all vertex normals
    for(size_t i = 0; i < numVertices; ++i)
    {
      float* n = &normals_buffer_[i * 3];
      const float len = std::sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
      if(len > 1e-6f)
      {
        n[0] /= len;
        n[1] /= len;
        n[2] /= len;
      }
      else
      {
        // Fallback to default normal if degenerate
        n[0] = 0.0f;
        n[1] = 1.0f;
        n[2] = 0.0f;
      }
    }
  }

#ifdef __EMSCRIPTEN__
  emscripten::val WindFlag::getVertices() const
  {
    using namespace emscripten;
    if(vertices_buffer_.empty())
    {
      return val::global("Float32Array").new_(0);
    }
    return val(typed_memory_view(vertices_buffer_.size(), vertices_buffer_.data()));
  }

  emscripten::val WindFlag::getUVs() const
  {
    using namespace emscripten;
    if(uvs_buffer_.empty())
    {
      return val::global("Float32Array").new_(0);
    }
    return val(typed_memory_view(uvs_buffer_.size(), uvs_buffer_.data()));
  }

  emscripten::val WindFlag::getIndices() const
  {
    using namespace emscripten;
    if(indices_buffer_.empty())
    {
      return val::global("Uint32Array").new_(0);
    }
    return val(typed_memory_view(indices_buffer_.size(), indices_buffer_.data()));
  }

  emscripten::val WindFlag::getNormals() const
  {
    using namespace emscripten;
    if(normals_buffer_.empty())
    {
      return val::global("Float32Array").new_(0);
    }
    return val(typed_memory_view(normals_buffer_.size(), normals_buffer_.data()));
  }
#endif

} // namespace btk::rendering
