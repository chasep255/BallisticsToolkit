#pragma once

#include "math/perlin_noise.h"
#include "math/vector.h"
#include <algorithm>
#include <array>
#include <cstdint>
#include <functional>
#include <map>
#include <random>
#include <string>
#include <vector>

namespace btk::physics
{

  /**
   * @brief Wind component for position and time-dependent wind
   */
  struct WindComponent
  {
    float amplitude_scale_; // Overall strength multiplier
    float period_s_;        // How long it takes to cycle (seconds)
    float wavelength_m_;    // How far apart similar patterns are (meters)
    float exponent_;        // Controls spikiness (1.0f = linear, >1.0f = spiky, <1.0f = smooth)

    // 2D Perlin noise generators
    btk::math::PerlinNoise crosswind_noise_; // For left/right wind component
    btk::math::PerlinNoise headwind_noise_;  // For forward/backward wind component

    WindComponent(float amp_scale, float period_s, float wavelength_m, float exponent)
      : amplitude_scale_(amp_scale), period_s_(period_s), wavelength_m_(wavelength_m), exponent_(exponent), crosswind_noise_(), headwind_noise_()
    {
    }
  };

  /**
   * @brief Wind generator for position and time-dependent wind
   */
  class WindGenerator
  {
    public:
    /**
     * @brief Construct wind generator
     */
    WindGenerator();

    /**
     * @brief Sample wind at given position and time
     *
     * @param x_m Position in meters
     * @param t_s Time in seconds
     * @return Wind vector (m/s)
     */
    btk::math::Vector3D operator()(float x_m, float t_s) const;

    /**
     * @brief Add a wind component with specified characteristics
     *
     * @param amplitude_scale Overall strength multiplier (m/s)
     * @param period_s How long it takes to cycle (seconds)
     * @param wavelength_m How far apart similar patterns are (meters)
     * @param exponent Controls spikiness (1.0f = linear, >1.0f = spiky, <1.0f = smooth)
     */
    void addWindComponent(float amplitude_scale, float period_s, float wavelength_m, float exponent = 1.0f);

    private:
    std::vector<WindComponent> components_;
  };

  /**
   * @brief Factory for creating WindGenerator instances with preset configurations
   */
  class WindPresets
  {
    public:
    /**
     * @brief Get a specific wind preset by name
     *
     * @param name Preset name (e.g., "Calm", "SwitchyLight", "StrongSteady")
     * @return WindGenerator object
     * @throws std::invalid_argument if preset not found
     */
    static WindGenerator getPreset(const std::string& name);

    /**
     * @brief List all available preset names
     *
     * @return Vector of preset names
     */
    static std::vector<std::string> listPresets();

    /**
     * @brief Check if a preset exists
     *
     * @param name Preset name
     * @return True if preset exists
     */
    static bool hasPreset(const std::string& name);

    private:
    static std::map<std::string, std::function<WindGenerator()>> presets_;
    static void initializePresets();
  };

} // namespace btk::physics