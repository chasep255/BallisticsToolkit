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
    double spatial_x = x_m * component.spatial_frequency_;
    double temporal_t = t_s * component.temporal_frequency_;
    
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

void WindGenerator::addWindComponent(double amplitude_scale, double temporal_frequency, double spatial_frequency, double exponent)
{
  components_.emplace_back(amplitude_scale, temporal_frequency, spatial_frequency, exponent, next_component_seed_);
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
      components_[i].temporal_frequency_,
      components_[i].spatial_frequency_,
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
    w.addWindComponent(0.8, 0.0001, 0.00001, 0.5);  // Very slow bias (2+ hour cycles)
    w.addWindComponent(1.5, 0.001, 0.0001, 0.7);  // Very slow changes (20+ min cycles)
    w.addWindComponent(0.8, 0.01, 0.001, 0.8);    // Gentle micro-variations
    return w;
  };
  
  // Light breeze - gentle and steady
  presets_["LightBreeze"] = [](uint32_t seed) {
    WindGenerator w(seed);
    w.addWindComponent(1.2, 0.0001, 0.00001, 0.5);  // Very slow bias (2+ hour cycles)
    w.addWindComponent(2.2, 0.002, 0.0002, 1.0);  // Slow, predictable (10+ min cycles)
    w.addWindComponent(1.5, 0.05, 0.002, 1.2);    // Some gentle variation
    return w;
  };
  
  // Moderate wind - more active with some gusts
  presets_["Moderate"] = [](uint32_t seed) {
    WindGenerator w(seed);
    w.addWindComponent(1.8, 0.0001, 0.00001, 0.5);  // Very slow bias (2+ hour cycles)
    w.addWindComponent(3.0, 0.005, 0.0005, 1.0);  // Slow background (5+ min cycles)
    w.addWindComponent(2.2, 0.1, 0.005, 1.5);     // Medium gusts (1-2 min cycles)
    w.addWindComponent(1.8, 0.5, 0.01, 2.0);      // Quick gusts (30 sec cycles)
    return w;
  };
  
  // Strong wind - very gusty and chaotic
  presets_["Strong"] = [](uint32_t seed) {
    WindGenerator w(seed);
    w.addWindComponent(6.0, 0.0001, 0.00001, 0.5);  // Very slow bias (2+ hour cycles)
    w.addWindComponent(12.0, 0.01, 0.001, 1.2);   // Slow background (3+ min cycles)
    w.addWindComponent(18.0, 0.2, 0.005, 2.0);     // Strong gusts (15-30 sec cycles)
    w.addWindComponent(9.0, 1.0, 0.02, 2.5);     // Very spiky micro-gusts (10 sec cycles)
    return w;
  };
  
  // Variable wind - multiple scales with different spikiness
  presets_["Variable"] = [](uint32_t seed) {
    WindGenerator w(seed);
    w.addWindComponent(2.0, 0.0001, 0.00001, 0.5);  // Very slow bias (2+ hour cycles)
    w.addWindComponent(3.8, 0.001, 0.0001, 0.8); // Very slow large-scale (20+ min)
    w.addWindComponent(3.0, 0.05, 0.002, 1.2);   // Medium scale (2-3 min cycles)
    w.addWindComponent(2.2, 0.3, 0.01, 1.8);     // Active gusts (1 min cycles)
    w.addWindComponent(1.5, 1.5, 0.05, 3.0);     // Very spiky micro-turbulence (20 sec cycles)
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