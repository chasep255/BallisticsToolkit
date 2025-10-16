#pragma once

#include "vector.h"
#include <algorithm>
#include <array>
#include <cstdint>
#include <functional>
#include <map>
#include <random>
#include <string>
#include <vector>

namespace btk::ballistics
{

  // ----------- PerlinNoise2D --------------------------------------------------

  class PerlinNoise2D
  {
    private:
    std::array<int, 256> perm_;

    // Perlin noise functions
    static double fade(double t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    static double lerp(double a, double b, double t) { return a + (b - a) * t; }
    static double grad(int h, double x, double y)
    {
      switch(h & 7)
      {
      case 0: return x + y;
      case 1: return x - y;
      case 2: return -x + y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
      }
    }

    double noise(double x, double y) const
    {
      int X = static_cast<int>(std::floor(x)) & 255;
      int Y = static_cast<int>(std::floor(y)) & 255;
      double xf = x - std::floor(x);
      double yf = y - std::floor(y);
      double u = fade(xf);
      double v = fade(yf);

      int aa = perm_[perm_[X] + Y];
      int ab = perm_[perm_[X] + Y + 1];
      int ba = perm_[perm_[X + 1] + Y];
      int bb = perm_[perm_[X + 1] + Y + 1];

      double x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
      double x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);

      return lerp(x1, x2, v);
    }

    public:
    PerlinNoise2D(uint32_t seed)
    {
      // Initialize permutation table
      for(int i = 0; i < 256; ++i)
        perm_[i] = i;
      std::mt19937 eng(seed);
      std::shuffle(perm_.begin(), perm_.end(), eng);
    }

    double operator()(double x, double y) const { return noise(x, y); }
  };

  /**
   * @brief Wind component for position and time-dependent wind
   */
  struct WindComponent
  {
    double amplitude_scale_; // Overall strength multiplier
    double period_s_;        // How long it takes to cycle (seconds)
    double wavelength_m_;    // How far apart similar patterns are (meters)
    double exponent_;        // Controls spikiness (1.0 = linear, >1.0 = spiky, <1.0 = smooth)

    // 2D Perlin noise generators
    PerlinNoise2D crosswind_noise_; // For left/right wind component
    PerlinNoise2D headwind_noise_;  // For forward/backward wind component

    WindComponent(double amp_scale, double period_s, double wavelength_m, double exponent, uint32_t seed)
      : amplitude_scale_(amp_scale), period_s_(period_s), wavelength_m_(wavelength_m), exponent_(exponent), crosswind_noise_(seed), headwind_noise_(seed + 1000)
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
     * @param seed Random seed for reproducible wind patterns
     */
    WindGenerator(uint32_t seed = 42);

    /**
     * @brief Sample wind at given position and time
     *
     * @param x_m Position in meters
     * @param t_s Time in seconds
     * @return Wind vector (m/s)
     */
    Vector3D operator()(double x_m, double t_s) const;

    /**
     * @brief Add a wind component with specified characteristics
     *
     * @param amplitude_scale Overall strength multiplier (m/s)
     * @param period_s How long it takes to cycle (seconds)
     * @param wavelength_m How far apart similar patterns are (meters)
     * @param exponent Controls spikiness (1.0 = linear, >1.0 = spiky, <1.0 = smooth)
     */
    void addWindComponent(double amplitude_scale, double period_s, double wavelength_m, double exponent = 1.0);

    /**
     * @brief Set the random seed for all components
     * @param seed New random seed
     */
    void setSeed(uint32_t seed);

    private:
    std::vector<WindComponent> components_;
    uint32_t seed_;
    uint32_t next_component_seed_;
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
     * @param seed Random seed for reproducible patterns
     * @return WindGenerator object
     * @throws std::invalid_argument if preset not found
     */
    static WindGenerator getPreset(const std::string& name, uint32_t seed = 42);

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
    static std::map<std::string, std::function<WindGenerator(uint32_t)>> presets_;
    static void initializePresets();
  };

} // namespace btk::ballistics