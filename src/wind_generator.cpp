#include "wind_generator.h"
#include <stdexcept>

namespace btk::ballistics
{

// ----------- WindGenerator --------------------------------------------------

WindGenerator::WindGenerator(uint32_t seed) 
  : seed_(seed), next_component_seed_(seed + 10000)
{
}

Vector3D WindGenerator::operator()(double x_m, double t_s) const
{
  double total_crosswind = 0.0;  // Left/right component
  double total_headwind = 0.0;   // Forward/backward component
  
  // Sum all wind components
  for (const auto& component : components_) {
    // Calculate spatial and temporal coordinates for noise sampling
    // Convert period/wavelength to frequencies for noise sampling
    double spatial_freq = 1.0 / component.wavelength_m_;
    double temporal_freq = 1.0 / component.period_s_;
    
    double spatial_x = x_m * spatial_freq;
    double temporal_t = t_s * temporal_freq;
    
    // Sample the 2D Perlin noise for both components
    double crosswind_raw = component.crosswind_noise_(spatial_x, temporal_t);
    double headwind_raw = component.headwind_noise_(spatial_x, temporal_t);
    
    // Apply exponent to control spikiness
    double crosswind = std::pow(std::abs(crosswind_raw), component.exponent_) * std::copysign(1.0, crosswind_raw);
    double headwind = std::pow(std::abs(headwind_raw), component.exponent_) * std::copysign(1.0, headwind_raw);
    
    // Scale by amplitude and add to totals
    total_crosswind += crosswind * component.amplitude_scale_;
    total_headwind += headwind * component.amplitude_scale_;
  }
  
  return Vector3D(total_headwind, total_crosswind, 0.0);
}

void WindGenerator::addWindComponent(double amplitude_scale, double period_s, double wavelength_m, double exponent)
{
  components_.emplace_back(amplitude_scale, period_s, wavelength_m, exponent, next_component_seed_);
  next_component_seed_ += 1000;  // Ensure different seeds for each component
}

void WindGenerator::setSeed(uint32_t seed)
{
  seed_ = seed;
  next_component_seed_ = seed + 10000;
  
  // Reinitialize all components with new seeds
  for (size_t i = 0; i < components_.size(); ++i) {
    uint32_t component_seed = seed + 10000 + (i * 1000);
    components_[i] = WindComponent(
      components_[i].amplitude_scale_,
      components_[i].period_s_,
      components_[i].wavelength_m_,
      components_[i].exponent_,
      component_seed
    );
  }
}

// ----------- WindPresets ----------------------------------------------------

std::map<std::string, std::function<WindGenerator(uint32_t)>> WindPresets::presets_;

void WindPresets::initializePresets()
{
  // Calm wind - very light and smooth
  presets_["Calm"] = [](uint32_t seed) {
    WindGenerator w(seed);
    w.addWindComponent(1.6, 7200.0, 100000.0, 0.5);  // Very slow bias (2+ hour cycles, 100km wavelength)
    w.addWindComponent(3.0, 1200.0, 10000.0, 0.7);  // Very slow changes (20+ min cycles, 10km wavelength)
    w.addWindComponent(1.6, 100.0, 1000.0, 0.8);    // Gentle micro-variations (1.7 min, 1km wavelength)
    return w;
  };
  
  // Light breeze - gentle and steady
  presets_["LightBreeze"] = [](uint32_t seed) {
    WindGenerator w(seed);
    w.addWindComponent(2.4, 7200.0, 100000.0, 0.5);  // Very slow bias (2+ hour cycles, 100km wavelength)
    w.addWindComponent(4.4, 600.0, 5000.0, 1.0);  // Slow, predictable (10+ min cycles, 5km wavelength)
    w.addWindComponent(3.0, 20.0, 500.0, 1.2);    // Some gentle variation (20 sec, 500m wavelength)
    return w;
  };
  
  // Moderate wind - more active with some gusts
  presets_["Moderate"] = [](uint32_t seed) {
    WindGenerator w(seed);
    w.addWindComponent(3.6, 7200.0, 100000.0, 0.5);  // Very slow bias (2+ hour cycles, 100km wavelength)
    w.addWindComponent(6.0, 300.0, 2000.0, 1.0);  // Slow background (5+ min cycles, 2km wavelength)
    w.addWindComponent(4.4, 60.0, 200.0, 1.5);     // Medium gusts (1-2 min cycles, 200m wavelength)
    w.addWindComponent(3.6, 2.0, 100.0, 2.0);      // Quick gusts (2 sec cycles, 100m wavelength)
    return w;
  };
  
  // Strong wind - steady with occasional gusts
  presets_["Strong"] = [](uint32_t seed) {
    WindGenerator w(seed);
    w.addWindComponent(8.0, 7200.0, 100000.0, 0.5);  // Very slow bias (2+ hour cycles, 100km wavelength)
    w.addWindComponent(16.0, 300.0, 2000.0, 1.0);   // Steady background (5+ min cycles, 2km wavelength)
    w.addWindComponent(12.0, 60.0, 330.0, 1.5);     // Occasional gusts (1-2 min cycles, 330m wavelength)
    return w;
  };
  
  // Variable wind - multiple scales with different spikiness
  presets_["Variable"] = [](uint32_t seed) {
    WindGenerator w(seed);
    w.addWindComponent(4.0, 7200.0, 100000.0, 0.5);  // Very slow bias (2+ hour cycles, 100km wavelength)
    w.addWindComponent(7.6, 1200.0, 10000.0, 0.8); // Very slow large-scale (20+ min, 10km wavelength)
    w.addWindComponent(6.0, 120.0, 500.0, 1.2);   // Medium scale (2-3 min cycles, 500m wavelength)
    w.addWindComponent(4.4, 20.0, 100.0, 1.8);     // Active gusts (20 sec cycles, 100m wavelength)
    w.addWindComponent(3.0, 1.3, 20.0, 3.0);     // Very spiky micro-turbulence (1.3 sec cycles, 20m wavelength)
    return w;
  };
  
  // Shear wind - between moderate and strong with direction changes over 1000 yards
  presets_["Shear"] = [](uint32_t seed) {
    WindGenerator w(seed);
    w.addWindComponent(5.0, 7200.0, 100000.0, 0.5);  // Very slow bias (2+ hour cycles, 100km wavelength)
    w.addWindComponent(10.0, 300.0, 3000.0, 1.0);   // Steady background (5+ min cycles, 3km wavelength)
    w.addWindComponent(8.0, 75.0, 250.0, 1.3);     // Medium gusts (1.25 min cycles, 250m wavelength)
    w.addWindComponent(6.0, 2.5, 67.0, 1.8);      // Direction changes over range (2.5 sec cycles, 67m wavelength)
    return w;
  };
}

WindGenerator WindPresets::getPreset(const std::string& name, uint32_t seed)
{
  // Always ensure presets are initialized
  if (presets_.empty()) {
    initializePresets();
  }

  auto it = presets_.find(name);
  if (it == presets_.end()) {
    throw std::invalid_argument("Unknown wind preset: " + name);
  }

  return it->second(seed);
}

std::vector<std::string> WindPresets::listPresets()
{
  if (presets_.empty()) {
    initializePresets();
  }

  std::vector<std::string> names;
  for (const auto& pair : presets_) {
    names.push_back(pair.first);
  }
  return names;
}

bool WindPresets::hasPreset(const std::string& name)
{
  if (presets_.empty()) {
    initializePresets();
  }
  
  return presets_.find(name) != presets_.end();
}

} // namespace btk::ballistics