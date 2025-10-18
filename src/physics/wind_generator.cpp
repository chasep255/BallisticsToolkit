#include "physics/wind_generator.h"
#include <stdexcept>

namespace btk::physics
{

  // ----------- WindGenerator --------------------------------------------------

  WindGenerator::WindGenerator() {}

  btk::math::Vector3D WindGenerator::operator()(float x_m, float t_s) const
  {
    float total_crosswind = 0.0f; // Left/right component
    float total_headwind = 0.0f;  // Forward/backward component

    // Sum all wind components
    for(const auto& component : components_)
    {
      // Calculate spatial and temporal coordinates for noise sampling
      // Convert period/wavelength to frequencies for noise sampling
      float spatial_freq = 1.0f / component.wavelength_m_;
      float temporal_freq = 1.0f / component.period_s_;

      float spatial_x = x_m * spatial_freq;
      float temporal_t = t_s * temporal_freq;

      // Sample the 2D Perlin noise for both components
      float crosswind_raw = component.crosswind_noise_.noise2D(spatial_x, temporal_t);
      float headwind_raw = component.headwind_noise_.noise2D(spatial_x, temporal_t);

      // Apply exponent to control spikiness
      float crosswind = std::pow(std::abs(crosswind_raw), component.exponent_) * std::copysign(1.0f, crosswind_raw);
      float headwind = std::pow(std::abs(headwind_raw), component.exponent_) * std::copysign(1.0f, headwind_raw);

      // Scale by amplitude and add to totals
      total_crosswind += crosswind * component.amplitude_scale_;
      total_headwind += headwind * component.amplitude_scale_;
    }

    return btk::math::Vector3D(total_headwind, total_crosswind, 0.0f);
  }

  void WindGenerator::addWindComponent(float amplitude_scale, float period_s, float wavelength_m, float exponent) { components_.emplace_back(amplitude_scale, period_s, wavelength_m, exponent); }

  // ----------- WindPresets ----------------------------------------------------

  std::map<std::string, std::function<WindGenerator()>> WindPresets::presets_;

  void WindPresets::initializePresets()
  {
    // Calm wind - very light and smooth
    presets_["Calm"] = []()
    {
      WindGenerator w;
      w.addWindComponent(1.6f, 7200.0f, 100000.0f, 0.5f); // Very slow bias (2+ hour cycles, 100km wavelength)
      w.addWindComponent(3.0f, 1200.0f, 10000.0f, 0.7f);  // Very slow changes (20+ min cycles, 10km wavelength)
      w.addWindComponent(1.6f, 100.0f, 1000.0f, 0.8f);    // Gentle micro-variations (1.7f min, 1km wavelength)
      return w;
    };

    // Light breeze - gentle and steady
    presets_["LightBreeze"] = []()
    {
      WindGenerator w;
      w.addWindComponent(2.4f, 7200.0f, 100000.0f, 0.5f); // Very slow bias (2+ hour cycles, 100km wavelength)
      w.addWindComponent(4.4f, 600.0f, 5000.0f, 1.0f);    // Slow, predictable (10+ min cycles, 5km wavelength)
      w.addWindComponent(3.0f, 20.0f, 500.0f, 1.2f);      // Some gentle variation (20 sec, 500m wavelength)
      return w;
    };

    // Moderate wind - more active with some gusts
    presets_["Moderate"] = []()
    {
      WindGenerator w;
      w.addWindComponent(3.6f, 7200.0f, 100000.0f, 0.5f); // Very slow bias (2+ hour cycles, 100km wavelength)
      w.addWindComponent(6.0f, 300.0f, 2000.0f, 1.0f);    // Slow background (5+ min cycles, 2km wavelength)
      w.addWindComponent(4.4f, 60.0f, 200.0f, 1.5f);      // Medium gusts (1-2 min cycles, 200m wavelength)
      w.addWindComponent(3.6f, 2.0f, 100.0f, 2.0f);       // Quick gusts (2 sec cycles, 100m wavelength)
      return w;
    };

    // Strong wind - steady with occasional gusts
    presets_["Strong"] = []()
    {
      WindGenerator w;
      w.addWindComponent(8.0f, 7200.0f, 100000.0f, 0.5f); // Very slow bias (2+ hour cycles, 100km wavelength)
      w.addWindComponent(16.0f, 300.0f, 2000.0f, 1.0f);   // Steady background (5+ min cycles, 2km wavelength)
      w.addWindComponent(12.0f, 60.0f, 330.0f, 1.5f);     // Occasional gusts (1-2 min cycles, 330m wavelength)
      return w;
    };

    // Variable wind - multiple scales with different spikiness
    presets_["Variable"] = []()
    {
      WindGenerator w;
      w.addWindComponent(4.0f, 7200.0f, 100000.0f, 0.5f); // Very slow bias (2+ hour cycles, 100km wavelength)
      w.addWindComponent(7.6f, 1200.0f, 10000.0f, 0.8f);  // Very slow large-scale (20+ min, 10km wavelength)
      w.addWindComponent(6.0f, 120.0f, 500.0f, 1.2f);     // Medium scale (2-3 min cycles, 500m wavelength)
      w.addWindComponent(4.4f, 20.0f, 100.0f, 1.8f);      // Active gusts (20 sec cycles, 100m wavelength)
      w.addWindComponent(3.0f, 1.3f, 20.0f, 3.0f);        // Very spiky micro-turbulence (1.3f sec cycles, 20m wavelength)
      return w;
    };

    // Shear wind - between moderate and strong with direction changes over 1000 yards
    presets_["Shear"] = []()
    {
      WindGenerator w;
      w.addWindComponent(5.0f, 7200.0f, 100000.0f, 0.5f); // Very slow bias (2+ hour cycles, 100km wavelength)
      w.addWindComponent(10.0f, 300.0f, 3000.0f, 1.0f);   // Steady background (5+ min cycles, 3km wavelength)
      w.addWindComponent(8.0f, 75.0f, 250.0f, 1.3f);      // Medium gusts (1.25f min cycles, 250m wavelength)
      w.addWindComponent(6.0f, 2.5f, 67.0f, 1.8f);        // Direction changes over range (2.5f sec cycles, 67m wavelength)
      return w;
    };
  }

  WindGenerator WindPresets::getPreset(const std::string& name)
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

    return it->second();
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