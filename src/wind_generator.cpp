#include "wind_generator.h"
#include <cmath>
#include <functional>
#include <random>
#include <stdexcept>

namespace btk::ballistics
{

  // WindGenerator implementation
  WindGenerator::WindGenerator(const Vector3D& bias, double advection_speed)
    : bias_(bias), advect_c_(advection_speed), switchy_enabled_(false), switchy_period_s_(0.0), switchy_strength_mps_(0.0), switchy_dir_cos_(0.0), switchy_dir_sin_(1.0)
  {
  }

  void WindGenerator::setBias(const Vector3D& bias) { bias_ = bias; }

  void WindGenerator::setAdvection(double speed) { advect_c_ = speed; }

  void WindGenerator::addSine(double wavelength, double amplitude, double phase) { components_.push_back({2.0 * M_PI / wavelength, amplitude, phase}); }

  void WindGenerator::addRandomCrosswindModes(int num_modes, double min_wavelength, double max_wavelength, double target_rms, double orientation_rad, uint32_t seed)
  {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<double> U01(0.0, 1.0);
    std::uniform_real_distribution<double> Uang(0.0, 2.0 * M_PI);

    const double cos_orient = std::cos(orientation_rad);
    const double sin_orient = std::sin(orientation_rad);

    for(int i = 0; i < num_modes; ++i)
    {
      const double k = 2.0 * M_PI / (min_wavelength + (max_wavelength - min_wavelength) * U01(rng));
      const double amp = target_rms * std::sqrt(2.0 / num_modes) * (0.5 + U01(rng));
      const double phi = Uang(rng);

      // Apply orientation to the mode
      const double amp_x = amp * cos_orient;
      const double amp_y = amp * sin_orient;

      // Add X and Y components as separate modes
      components_.push_back({k, amp_x, phi});
      components_.push_back({k, amp_y, phi + M_PI / 2.0});
    }
  }

  void WindGenerator::clearModes() { components_.clear(); }

  void WindGenerator::setSwitchy(double period_s, double strength_mps, double orientation_rad)
  {
    switchy_enabled_ = (period_s > 0.0 && strength_mps > 0.0);
    switchy_period_s_ = period_s;
    switchy_strength_mps_ = strength_mps;
    switchy_dir_cos_ = std::cos(orientation_rad);
    switchy_dir_sin_ = std::sin(orientation_rad);
  }

  Vector3D WindGenerator::operator()(double x_m, double t_s) const
  {
    Vector3D w = bias_;
    const double xadv = x_m - advect_c_ * t_s; // frozen-flow advection

    for(const auto& c : components_)
    {
      const double s = std::sin(c.k * xadv + c.phi);
      w.x += c.amp * s;
      w.y += c.amp * s;
      w.z += c.amp * s;
    }

    // Add time-coherent switchy component if enabled
    if(switchy_enabled_ && switchy_period_s_ > 0.0)
    {
      const double phase = (t_s / switchy_period_s_);
      const uint64_t idx = static_cast<uint64_t>(std::floor(phase));
      const double local = phase - std::floor(phase);

      // Pseudo-random signs per interval for flipping behavior
      const double s0 = prand01(idx) > 0.5 ? 1.0 : -1.0;
      const double s1 = prand01(idx + 1) > 0.5 ? 1.0 : -1.0;
      const double sSmooth = smoothFlip(s0, s1, local);
      const double A = switchy_strength_mps_ * sSmooth;

      w.x += A * switchy_dir_cos_ * 0.0; // horizontal only goes to Y
      w.y += A * switchy_dir_sin_;
    }

    return w;
  }

  double WindGenerator::prand01(uint64_t n)
  {
    // xorshift64*
    n ^= n >> 12;
    n ^= n << 25;
    n ^= n >> 27;
    uint64_t x = n * 2685821657736338717ULL;
    // Map to (0,1)
    const double inv = 1.0 / static_cast<double>(~0ULL);
    return (static_cast<double>(x) * inv);
  }

  double WindGenerator::smoothFlip(double a, double b, double t)
  {
    // Cosine interpolation for smooth transitions
    double ft = (1 - std::cos(M_PI * t)) * 0.5;
    return a * (1 - ft) + b * ft;
  }

  // WindPresets implementation
  std::map<std::string, std::function<WindGenerator(uint32_t)>> WindPresets::presets_;

  WindGenerator WindPresets::getPreset(const std::string& name, uint32_t seed)
  {
    if(presets_.empty())
    {
      initializePresets();
    }

    auto it = presets_.find(name);
    if(it == presets_.end())
    {
      throw std::invalid_argument("Wind preset '" + name + "' not found");
    }

    return it->second(seed);
  }

  std::vector<std::string> WindPresets::listPresets()
  {
    if(presets_.empty())
    {
      initializePresets();
    }

    std::vector<std::string> names;
    for(const auto& [name, factory] : presets_)
    {
      names.push_back(name);
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

  void WindPresets::initializePresets()
  {
    // Helper function for random orientation favoring crosswinds
    auto getCrosswindOrientation = [](uint32_t seed) -> double
    {
      std::mt19937 rng(seed);
      std::uniform_real_distribution<double> U01(0.0, 1.0);
      std::uniform_real_distribution<double> Ujit(-M_PI / 12.0, M_PI / 12.0);
      const bool left = (U01(rng) < 0.5);
      const double base = left ? M_PI : 0.0; // π => -Y, 0 => +Y
      return base + Ujit(rng);
    };

    presets_["Calm"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(0.0, 0.1, 0.0), 3.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(6, 200.0, 800.0, 0.3, azimuth, seed + 1);
      return w;
    };

    presets_["LightBreeze"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(0.0, 0.5, 0.0), 5.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(8, 150.0, 600.0, 0.6, azimuth, seed + 1);
      return w;
    };

    presets_["SwitchyLight"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(0.0, 0.1, 0.0), 6.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(6, 1500.0, 4000.0, 0.2, azimuth, seed + 1);
      w.setSwitchy(60.0, 1.0, azimuth);
      return w;
    };

    presets_["QuarteringTail"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(2.0, 1.5, 0.0), 8.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(10, 100.0, 700.0, 0.8, azimuth, seed + 1);
      return w;
    };

    presets_["GustyCrosswind"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(0.5, 3.0, 0.0), 10.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(12, 50.0, 400.0, 1.5, azimuth, seed + 1);
      return w;
    };

    presets_["SwitchyModerate"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(0.0, 0.3, 0.0), 7.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(8, 1500.0, 4000.0, 0.4, azimuth, seed + 1);
      w.setSwitchy(45.0, 2.0, azimuth);
      return w;
    };

    presets_["StrongSteady"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(1.0, 5.0, 0.0), 12.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(10, 150.0, 800.0, 1.0, azimuth, seed + 1);
      return w;
    };

    presets_["StrongSwitchy"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(0.0, 0.4, 0.0), 12.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(10, 1500.0, 5000.0, 0.6, azimuth, seed + 1);
      w.setSwitchy(30.0, 3.0, azimuth);
      return w;
    };

    presets_["MirageCoupledTail"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(1.5, 2.5, 0.0), 9.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(14, 80.0, 500.0, 1.2, azimuth, seed + 1);
      return w;
    };

    presets_["StormyGustFront"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(2.0, 6.0, 0.0), 15.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(18, 30.0, 500.0, 3.0, azimuth, seed + 1);
      return w;
    };

    presets_["Gale"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(2.0, 8.0, 0.0), 18.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(14, 80.0, 800.0, 2.5, azimuth, seed + 1);
      return w;
    };

    presets_["VariableBreeze"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(0.2, 1.2, 0.0), 4.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(10, 70.0, 700.0, 0.9, azimuth, seed + 1);
      return w;
    };

    presets_["Coastal"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(1.5, 3.5, 0.0), 9.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(12, 60.0, 900.0, 1.6, azimuth, seed + 1);
      return w;
    };

    presets_["MountainValley"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(1.0, 2.5, 0.0), 7.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(16, 40.0, 500.0, 1.8, azimuth, seed + 1);
      return w;
    };

    presets_["ThermalGusts"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(0.5, 2.0, 0.0), 6.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(20, 30.0, 400.0, 2.2, azimuth, seed + 1);
      return w;
    };

    presets_["FrontalPassage"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(3.0, 6.0, 0.0), 14.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(18, 50.0, 700.0, 2.8, azimuth, seed + 1);
      return w;
    };

    presets_["LullAndGust"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(0.5, 2.5, 0.0), 8.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(12, 80.0, 800.0, 1.5, azimuth, seed + 1);
      return w;
    };

    presets_["ShearLayer"] = [=](uint32_t seed)
    {
      WindGenerator w(Vector3D(1.0, 4.0, 0.0), 11.0);
      const double azimuth = getCrosswindOrientation(seed);
      w.addRandomCrosswindModes(22, 20.0, 400.0, 2.0, azimuth, seed + 1);
      return w;
    };
  }

} // namespace btk::ballistics
