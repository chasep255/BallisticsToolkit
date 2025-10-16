#pragma once

#include "vector.h"
#include <map>
#include <string>
#include <vector>

namespace btk::ballistics
{

  /**
   * @brief 1D wind field generator with position and time dependence
   *
   * Generates wind vectors using sinusoidal modes and frozen-turbulence advection.
   * Supports both spatial turbulence and time-coherent switching behavior.
   */
  class WindGenerator
  {
    public:
    /**
     * @brief Construct with initial bias and advection speed
     *
     * @param bias Initial wind bias vector (m/s)
     * @param advection_speed Advection speed for frozen turbulence (m/s)
     */
    WindGenerator(const Vector3D& bias = Vector3D(0, 0, 0), double advection_speed = 0.0);

    /**
     * @brief Set the wind bias vector
     *
     * @param bias New bias vector (m/s)
     */
    void setBias(const Vector3D& bias);

    /**
     * @brief Set the advection speed for frozen turbulence
     *
     * @param speed Advection speed (m/s)
     */
    void setAdvection(double speed);

    /**
     * @brief Add a sinusoidal wind mode
     *
     * @param wavelength Wavelength in meters
     * @param amplitude Amplitude in m/s
     * @param phase Phase offset in radians
     */
    void addSine(double wavelength, double amplitude, double phase);

    /**
     * @brief Add random crosswind modes with specified characteristics
     *
     * @param num_modes Number of modes to add
     * @param min_wavelength Minimum wavelength (m)
     * @param max_wavelength Maximum wavelength (m)
     * @param target_rms Target RMS amplitude (m/s)
     * @param orientation_rad Orientation angle in radians (0 = +Y, π/2 = +X)
     * @param seed Random seed
     */
    void addRandomCrosswindModes(int num_modes, double min_wavelength, double max_wavelength, double target_rms, double orientation_rad, uint32_t seed);

    /**
     * @brief Clear all wind modes
     */
    void clearModes();

    /**
     * @brief Enable time-coherent switching behavior
     *
     * @param period_s Switching period in seconds
     * @param strength_mps RMS strength of switching component (m/s)
     * @param orientation_rad Orientation angle in radians
     */
    void setSwitchy(double period_s, double strength_mps, double orientation_rad);

    /**
     * @brief Sample wind at given position and time
     *
     * @param x_m Position in meters
     * @param t_s Time in seconds
     * @return Wind vector (m/s)
     */
    Vector3D operator()(double x_m, double t_s) const;

    private:
    struct Mode
    {
      double k;   // wavenumber (2π/λ)
      double amp; // amplitude
      double phi; // phase
    };

    Vector3D bias_;
    double advect_c_;
    std::vector<Mode> components_;

    // Time-coherent switching
    bool switchy_enabled_;
    double switchy_period_s_;
    double switchy_strength_mps_;
    double switchy_dir_cos_;
    double switchy_dir_sin_;

    // Helper functions
    static double prand01(uint64_t n);
    static double smoothFlip(double a, double b, double t);
  };

  /**
   * @brief Wind preset factory for creating common wind patterns
   *
   * Provides predefined wind patterns with realistic characteristics.
   * Similar to NRATargets but for wind conditions.
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