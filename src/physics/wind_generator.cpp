#include "physics/wind_generator.h"
#include "math/conversions.h"
#include "math/random.h"
#include "physics/constants.h"
#include <cmath>
#include <stdexcept>

using namespace btk::math::literals;

namespace btk::physics
{

  WindGenerator::WindGenerator() : current_time_(0.0f)
  {
    // Initialize sample corners to reasonable defaults
    // In new coordinate system: X=crossrange, Y=up, Z=-downrange
    sample_corners_[0] = btk::math::Vector3D(-100.0f, 0.0f, 0.0f);      // crossrange min, vertical min, downrange max (z=0 means -downrange=0)
    sample_corners_[1] = btk::math::Vector3D(100.0f, 100.0f, -1000.0f); // crossrange max, vertical max, downrange min (z=-1000 means -downrange=-1000, so downrange=1000)
  }

  void WindGenerator::addComponent(float strength, float downrange_scale, float crossrange_scale, float temporal_scale, float exponent, float sigmoid_threshold)
  {
    WindComponent component;
    component.strength = strength;
    component.downrange_scale = downrange_scale;
    component.crossrange_scale = crossrange_scale;
    component.temporal_scale = temporal_scale;
    component.exponent = exponent;
    component.sigmoid_threshold = sigmoid_threshold;

    components_.push_back(component);
  }

  void WindGenerator::advanceTime(float current_time)
  {
    float dt = current_time - current_time_;
    current_time_ = current_time;

    // Initialize RMS on first call: sample 1000 (x,y,t) locations
    if(!rms_initialized_ && !components_.empty())
    {
      rms_initialized_ = true;
      initializeRMS();
    }

    // Clamp dt to range [0, 1] seconds for stability
    dt = std::clamp(dt, 0.0f, 1.0f);

    // Sample N random points within the range
    constexpr int num_samples = 10;
    btk::math::Vector3D avg_wind(0.0f, 0.0f, 0.0f);

    for(int i = 0; i < num_samples; ++i)
    {
      // Random point within sample_corners_
      float x = btk::math::Random::uniform(sample_corners_[0].x, sample_corners_[1].x);
      float y = btk::math::Random::uniform(sample_corners_[0].y, sample_corners_[1].y);
      float z = btk::math::Random::uniform(sample_corners_[0].z, sample_corners_[1].z);

      btk::math::Vector3D sample_pos(x, y, z);
      btk::math::Vector3D wind = sample(sample_pos); // composite wind

      avg_wind += wind;
    }
    avg_wind /= static_cast<float>(num_samples);

    // Update global advection velocity with EMA
    global_advection_velocity_ = global_advection_velocity_ * (1.0f - advection_alpha_) + avg_wind * advection_gain_ * advection_alpha_;

    // Integrate global offset
    global_advection_offset_ += global_advection_velocity_ * dt;
  }

  void WindGenerator::setSampleCorners(const btk::math::Vector3D& min_corner, const btk::math::Vector3D& max_corner)
  {
    sample_corners_[0] = min_corner;
    sample_corners_[1] = max_corner;
  }

  void WindGenerator::setAdvectionGain(float gain) { advection_gain_ = std::max(0.0f, gain); }

  float WindGenerator::getAdvectionGain() const { return advection_gain_; }

  void WindGenerator::setAdvectionAlpha(float alpha) { advection_alpha_ = std::clamp(alpha, 0.0f, 1.0f); }

  int WindGenerator::getNumActiveComponents() const { return components_.size(); }

  float WindGenerator::getComponentStrength(int index) const
  {
    if(index < 0 || index >= static_cast<int>(components_.size()))
    {
      return 0.0f;
    }
    return components_[index].strength;
  }

  float WindGenerator::getComponentDownrangeScale(int index) const
  {
    if(index < 0 || index >= static_cast<int>(components_.size()))
    {
      return 0.0f;
    }
    return components_[index].downrange_scale;
  }

  float WindGenerator::getComponentCrossrangeScale(int index) const
  {
    if(index < 0 || index >= static_cast<int>(components_.size()))
    {
      return 0.0f;
    }
    return components_[index].crossrange_scale;
  }

  float WindGenerator::getComponentTemporalScale(int index) const
  {
    if(index < 0 || index >= static_cast<int>(components_.size()))
    {
      return 0.0f;
    }
    return components_[index].temporal_scale;
  }

  float WindGenerator::getComponentExponent(int index) const
  {
    if(index < 0 || index >= static_cast<int>(components_.size()))
    {
      return 1.0f;
    }
    return components_[index].exponent;
  }

  float WindGenerator::getComponentSigmoidThreshold(int index) const
  {
    if(index < 0 || index >= static_cast<int>(components_.size()))
    {
      return 0.0f;
    }
    return components_[index].sigmoid_threshold;
  }

  float WindGenerator::getComponentRMS(int index) const
  {
    if(index < 0 || index >= static_cast<int>(components_.size()))
    {
      return 0.0f;
    }
    return components_[index].magnitude_rms_;
  }

  btk::math::Vector3D WindGenerator::getGlobalAdvectionOffset() const { return global_advection_offset_; }

  btk::math::Vector3D WindGenerator::getGlobalAdvectionVelocity() const { return global_advection_velocity_; }

  float WindGenerator::getCurrentTime() const { return current_time_; }

  btk::math::Vector3D WindGenerator::computeCurl(int octave_index, const btk::math::Vector3D& position, float time) const
  {
    if(octave_index < 0 || octave_index >= static_cast<int>(components_.size()))
    {
      return btk::math::Vector3D(0.0f, 0.0f, 0.0f);
    }

    const WindComponent& component = components_[octave_index];

    // To compute curl, we sample a potential field ψ and take spatial derivatives.
    // 2D curl: (curl_x, curl_y) = (∂ψ/∂y, -∂ψ/∂x)
    // We compute finite differences in scaled space, then convert to world-space
    // derivatives via the chain rule (1/scale).
    const float epsilon = 0.01f; // Dimensionless step in scaled space

    // Use global advection offset
    // In new coordinate system: position.x = crossrange, position.y = vertical, position.z = -downrange
    float downrange = -position.z - (-global_advection_offset_.z); // downrange is -Z
    float crossrange = position.x - global_advection_offset_.x;    // crossrange is X

    // Scale coordinates by spatial scales (larger scale => slower spatial variation)
    float scaled_x = downrange / component.downrange_scale;
    float scaled_y = crossrange / component.crossrange_scale;

    // Scale time by temporal scale (use explicit time parameter)
    float scaled_time = time / component.temporal_scale;

    // Central differences in scaled space for better accuracy
    float psi_x_plus = component.noise.noise3D(scaled_x + epsilon, scaled_y, scaled_time);
    float psi_x_minus = component.noise.noise3D(scaled_x - epsilon, scaled_y, scaled_time);
    float psi_y_plus = component.noise.noise3D(scaled_x, scaled_y + epsilon, scaled_time);
    float psi_y_minus = component.noise.noise3D(scaled_x, scaled_y - epsilon, scaled_time);

    float dpsi_dscaled_x = (psi_x_plus - psi_x_minus) / (2.0f * epsilon);
    float dpsi_dscaled_y = (psi_y_plus - psi_y_minus) / (2.0f * epsilon);

    // Chain rule: scaled_x = x / scale => d(scaled_x)/dx = 1/scale
    float dpsi_dx = dpsi_dscaled_x / component.downrange_scale;
    float dpsi_dy = dpsi_dscaled_y / component.crossrange_scale;

    // Curl of the field: (∂ψ/∂y, -∂ψ/∂x)
    float curl_x = dpsi_dy;
    float curl_y = -dpsi_dx;

    // Return raw curl vector (no normalization, no scaling)
    return btk::math::Vector3D(curl_x, curl_y, 0.0f);
  }

  void WindGenerator::initializeRMS()
  {
    constexpr int num_samples = 1000;

    for(size_t i = 0; i < components_.size(); ++i)
    {
      auto& component = components_[i];

      // Sample 1000 random (x, y, t) locations
      // Track magnitude_squared to compute RMS
      float sum_magnitude_squared = 0.0f;

      for(int j = 0; j < num_samples; ++j)
      {
        // Random (crossrange, downrange) within pattern window: 1000x spatial scales, centered at advection_offset
        // In new coordinate system: X=crossrange, Y=up, Z=-downrange
        float offset_crossrange = btk::math::Random::uniform(-1000.0f, 1000.0f) * component.crossrange_scale;
        float offset_downrange = btk::math::Random::uniform(-1000.0f, 1000.0f) * component.downrange_scale;
        float time_offset = btk::math::Random::uniform(-1000.0f, 1000.0f) * component.temporal_scale;

        btk::math::Vector3D sample_pos = btk::math::Vector3D(offset_crossrange, 0.0f, -offset_downrange);
        float sample_time = current_time_ + time_offset;

        // Compute curl vector and get magnitude
        btk::math::Vector3D curl = computeCurl(i, sample_pos, sample_time);
        float magnitude = std::sqrt(curl.x * curl.x + curl.y * curl.y);

        sum_magnitude_squared += magnitude * magnitude;
      }

      // Compute RMS: sqrt(mean(magnitude^2))
      const float mean_magnitude_squared = sum_magnitude_squared / static_cast<float>(num_samples);
      component.magnitude_rms_ = std::sqrt(mean_magnitude_squared);
    }
  }

  btk::math::Vector3D WindGenerator::sampleComponent(int octave_index, const btk::math::Vector3D& position) const
  {
    if(octave_index < 0 || octave_index >= static_cast<int>(components_.size()))
    {
      return btk::math::Vector3D(0.0f, 0.0f, 0.0f);
    }

    const WindComponent& component = components_[octave_index];

    // Compute raw curl vector; advection offset is applied inside computeCurl
    btk::math::Vector3D curl = computeCurl(octave_index, position, current_time_);

    // Convert to polar coordinates
    float magnitude = std::sqrt(curl.x * curl.x + curl.y * curl.y);
    float angle = std::atan2(curl.y, curl.x);

    // Normalize magnitude by RMS for stable energy levels
    float normalized_magnitude = magnitude / (component.magnitude_rms_ + 1e-6f);

    // Apply exponent reshaping to the normalized magnitude
    float exp_magnitude = normalized_magnitude;
    if(component.exponent != 1.0f)
    {
      exp_magnitude = std::pow(normalized_magnitude, component.exponent);
    }

    // Convert final normalized magnitude back to original scale
    float final_magnitude = exp_magnitude * component.strength;

    // Apply optional self-gating sigmoid to final magnitude (relative to strength)
    if(component.sigmoid_threshold > 0.0f)
    {
      // Self-gating: final magnitude gates itself through sigmoid
      // Higher magnitude -> more gate opens -> more output
      // threshold relative to strength
      float threshold = component.sigmoid_threshold * component.strength;
      // Sharper gating: increase slope of the logistic
      const float slope = 4.0f;
      final_magnitude = final_magnitude / (1.0f + std::exp(-slope * (final_magnitude - threshold)));
    }

    // Clip at 2x strength to prevent excessive wind speeds
    final_magnitude = std::min(final_magnitude, 2.0f * component.strength);

    // Convert back to cartesian coordinates
    // curl_x is downrange component, curl_y is crossrange component (in old 2D curl space)
    float curl_downrange = final_magnitude * std::cos(angle);
    float curl_crossrange = final_magnitude * std::sin(angle);

    // Convert to new coordinate system: X=crossrange, Y=up, Z=-downrange
    // Return as (crossrange, 0, -downrange) - no vertical component from 2D curl
    return btk::math::Vector3D(curl_crossrange, 0.0f, -curl_downrange);
  }

  btk::math::Vector3D WindGenerator::sample(const btk::math::Vector3D& pos) const
  {
    // Allow sampling outside bounds - wind field is continuous
    btk::math::Vector3D velocity = btk::math::Vector3D(0.0f, 0.0f, 0.0f);
    for(size_t i = 0; i < components_.size(); i++)
    {
      velocity += sampleComponent(i, pos);
    }
    return velocity;
  }

  btk::math::Vector3D WindGenerator::sample(float x_m, float y_m, float z_m) const { return sample(btk::math::Vector3D(x_m, y_m, z_m)); }

  btk::math::Vector3D WindGenerator::operator()(float x_m, float y_m, float z_m) const { return sample(x_m, y_m, z_m); }

  btk::math::Vector3D WindGenerator::operator()(const btk::math::Vector3D& pos) const { return sample(pos); }

  // ----------- WindPresets ----------------------------------------------------

  std::map<std::string, std::function<WindGenerator()>> WindPresets::presets_;

  void WindPresets::initializePresets()
  {
    presets_.clear();

    presets_["Zero"] = []()
    {
      WindGenerator w;
      return w;
    };

    presets_["Dead"] = []()
    {
      WindGenerator w;
      w.setAdvectionGain(5.0);
      w.addComponent(0.5_mph, 10000.0_yd, 10000.0_yd, 15.0_min, 0.5f);         // steady base
      w.addComponent(0.25_mph, 1000.0_yd, 1000.0_yd, 3.0_min, 0.5f, 0.25_mph); // gusty component with gate

      return w;
    };

    presets_["Calm"] = []()
    {
      WindGenerator w;
      w.setAdvectionGain(5.0);
      w.addComponent(1.0_mph, 10000.0_yd, 10000.0_yd, 15.0_min, 0.5f);       // steady base
      w.addComponent(0.5_mph, 1000.0_yd, 1000.0_yd, 3.0_min, 0.5f, 0.5_mph); // gusty component with gate

      return w;
    };

    presets_["Moderate"] = []()
    {
      WindGenerator w;
      w.setAdvectionGain(5.0);
      w.addComponent(3.0_mph, 10000.0_yd, 10000.0_yd, 15.0_min, 0.5f);       // steady base
      w.addComponent(1.5_mph, 2000.0_yd, 2000.0_yd, 5.0_min, 0.5f);          // local variations
      w.addComponent(6.0_mph, 1000.0_yd, 1000.0_yd, 0.5_min, 0.5f, 3.0_mph); // gusts
      return w;
    };

    presets_["Strong"] = []()
    {
      WindGenerator w;
      w.setAdvectionGain(5.0);
      w.addComponent(7.0_mph, 10000.0_yd, 10000.0_yd, 15.0_min, 0.5f);        // steady base
      w.addComponent(10.0_mph, 1000.0_yd, 1000.0_yd, 3.0_min, 0.5f, 8.0_mph); // gusty component with gate

      return w;
    };

    presets_["Extra Strong"] = []()
    {
      WindGenerator w;
      w.setAdvectionGain(5.0);
      w.addComponent(12.0_mph, 10000.0_yd, 10000.0_yd, 15.0_min, 0.5f);        // steady base
      w.addComponent(15.0_mph, 1000.0_yd, 1000.0_yd, 3.0_min, 0.5f, 10.0_mph); // gusty component with gate

      return w;
    };
  }

  WindGenerator WindPresets::getPreset(const std::string& name, const btk::math::Vector3D& min_corner, const btk::math::Vector3D& max_corner)
  {
    // Always ensure presets are initialized
    if(presets_.empty())
    {
      initializePresets();
    }

    auto it = presets_.find(name);
    if(it == presets_.end())
    {
      throw std::invalid_argument("Unknown wind preset: " + name);
    }

    WindGenerator w = it->second();
    w.setSampleCorners(min_corner, max_corner);
    return w;
  }

  std::vector<std::string> WindPresets::listPresets()
  {
    if(presets_.empty())
    {
      initializePresets();
    }

    std::vector<std::string> names;
    for(const auto& pair : presets_)
    {
      names.push_back(pair.first);
    }
    return names;
  }

  bool WindPresets::hasPreset(const std::string& name)
  {
    if(presets_.empty())
    {
      initializePresets();
    }

    return presets_.find(name) != presets_.end();
  }

} // namespace btk::physics