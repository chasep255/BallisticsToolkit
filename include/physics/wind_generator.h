#pragma once

#include "math/simplex_noise.h"
#include "math/vector.h"
#include <functional>
#include <map>
#include <string>
#include <vector>

namespace btk::physics
{

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
     * @brief Advance internal time to given value
     *
     * @param current_time Current time in seconds (assumed to be monotonic)
     */
    void advanceTime(float current_time);

    /**
     * @brief Sample wind at given position using current internal time
     *
     * @param x_m Downrange position in meters
     * @param y_m Crossrange position in meters
     * @param z_m Vertical position in meters (ignored - no altitude variation)
     * @return Wind vector (m/s) in BTK coordinates: (x=headwind, y=crosswind, z=vertical)
     */
    btk::math::Vector3D operator()(float x_m, float y_m, float z_m) const;

    /**
     * @brief Sample wind at a specific location using Vector3D
     *
     * @param pos Position vector (x=downrange, y=crossrange, z=height) in meters
     * @return Wind vector (m/s) in BTK coordinates: (x=headwind, y=crosswind, z=vertical)
     */
    btk::math::Vector3D operator()(const btk::math::Vector3D& pos) const;

    /**
     * @brief Sample wind at a specific location
     *
     * @param x_m X coordinate in meters (downrange)
     * @param y_m Y coordinate in meters (crossrange, positive = right)
     * @param z_m Z coordinate in meters (height)
     * @return Wind vector (m/s) in BTK coordinates: (x=headwind, y=crosswind, z=vertical)
     */
    btk::math::Vector3D sample(float x_m, float y_m, float z_m) const;

    /**
     * @brief Sample wind at a specific location using Vector3D
     *
     * @param pos Position vector (x=downrange, y=crossrange, z=height) in meters
     * @return Wind vector (m/s) in BTK coordinates: (x=headwind, y=crosswind, z=vertical)
     */
    btk::math::Vector3D sample(const btk::math::Vector3D& pos) const;

    /**
     * @brief Set the corners of the 3D sampling rectangle
     *
     * @param min_corner Minimum corner (x_min, y_min, z_min)
     * @param max_corner Maximum corner (x_max, y_max, z_max)
     */
    void setSampleCorners(const btk::math::Vector3D& min_corner, const btk::math::Vector3D& max_corner);

    /**
     * @brief Set the advection gain (multiplier for advection speed)
     *
     * @param gain Advection gain multiplier (higher = faster advection)
     */
    void setAdvectionGain(float gain);

    /**
     * @brief Get the advection gain
     *
     * @return Current advection gain multiplier
     */
    float getAdvectionGain() const;

    /**
     * @brief Set the advection EMA smoothing factor
     *
     * @param alpha EMA smoothing factor (0.0 = no smoothing, 1.0 = no memory)
     */
    void setAdvectionAlpha(float alpha);

    /**
     * @brief Add a wind component octave
     *
     * @param strength Wind strength multiplier (scales the activated curl field)
     * @param downrange_scale Spatial scale in downrange direction (larger = slower spatial variation)
     * @param crossrange_scale Spatial scale in crossrange direction (larger = slower spatial variation)
     * @param temporal_scale Temporal scale (larger = slower temporal variation)
     * @param exponent Exponent for reshaping magnitude. < 1.0 = gustier (near strength), > 1.0 = steadier
     * @param sigmoid_threshold Sigmoid threshold in m/s. 0 = no sigmoid, > 0 = wind speed where gate opens
     */
    void addComponent(float strength, float downrange_scale, float crossrange_scale, float temporal_scale, float exponent = 1.0f, float sigmoid_threshold = 0.0f);

    /**
     * @brief Get the number of active wind components
     *
     * @return Number of active components (0 to NUM_OCTAVES)
     */
    int getNumActiveComponents() const;

    /**
     * @brief Get component strength
     *
     * @param index Component index (0 to NUM_OCTAVES-1)
     * @return Component strength (wind speed multiplier)
     */
    float getComponentStrength(int index) const;

    /**
     * @brief Get component downrange scale
     *
     * @param index Component index (0 to NUM_OCTAVES-1)
     * @return Component downrange scale
     */
    float getComponentDownrangeScale(int index) const;

    /**
     * @brief Get component crossrange scale
     *
     * @param index Component index (0 to NUM_OCTAVES-1)
     * @return Component crossrange scale
     */
    float getComponentCrossrangeScale(int index) const;

    /**
     * @brief Get component temporal scale
     *
     * @param index Component index (0 to NUM_OCTAVES-1)
     * @return Component temporal scale
     */
    float getComponentTemporalScale(int index) const;

    /**
     * @brief Get component exponent
     *
     * @param index Component index (0 to NUM_OCTAVES-1)
     * @return Component exponent for reshaping magnitude. < 1.0 = gustier (near strength), > 1.0 = steadier
     */
    float getComponentExponent(int index) const;

    /**
     * @brief Get component sigmoid gate threshold (m/s)
     *
     * @param index Component index (0 to NUM_OCTAVES-1)
     * @return Gate threshold in m/s. 0 = no gating (disabled)
     */
    float getComponentSigmoidThreshold(int index) const;

    /**
     * @brief Get component RMS value
     *
     * @param index Component index (0 to NUM_OCTAVES-1)
     * @return Component RMS value for normalization
     */
    float getComponentRMS(int index) const;

    /**
     * @brief Get global advection offset
     *
     * @return Global advection offset vector applied to all components
     */
    btk::math::Vector3D getGlobalAdvectionOffset() const;

    /**
     * @brief Get global advection velocity
     *
     * @return Global advection velocity vector (m/s) applied to all components
     */
    btk::math::Vector3D getGlobalAdvectionVelocity() const;

    /**
     * @brief Get current simulation time
     *
     * @return Current internal time in seconds
     */
    float getCurrentTime() const;

    /**
     * @brief Sample wind from a specific component
     *
     * @param octave_index Component index (0 to NUM_OCTAVES-1)
     * @param position Position to sample at (x, y, z)
     * @return Wind vector from this component only
     */
    btk::math::Vector3D sampleComponent(int octave_index, const btk::math::Vector3D& position) const;

    private:
    // Compute raw curl vector (curl_x, curl_y) at a specific position and time
    btk::math::Vector3D computeCurl(int octave_index, const btk::math::Vector3D& position, float time) const;

    // Initialize normalization by sampling 1000 (x,y,t) locations and computing magnitude std_dev
    void initializeRMS();

    struct WindComponent
    {
      float strength = 0.0f;          // wind strength multiplier (scales tanh-activated curl field)
      float downrange_scale = 0.0f;   // spatial scale in downrange direction (larger = slower spatial variation)
      float crossrange_scale = 0.0f;  // spatial scale in crossrange direction (larger = slower spatial variation)
      float temporal_scale = 0.0f;    // temporal scale (larger = slower time variation)
      float exponent = 1.0f;          // exponent for reshaping magnitude. < 1.0 = gustier (near strength), > 1.0 = steadier
      float sigmoid_threshold = 0.0f; // gate threshold in m/s (0 = disabled)
      float magnitude_rms_ = 0.0f;    // RMS of magnitude for normalization (set during initialization)
      math::SimplexNoise noise;       // each component gets its own noise instance

      WindComponent() {}
    };

    float current_time_;
    bool rms_initialized_ = false;                  // Track if RMS has been initialized
    btk::math::Vector3D sample_corners_[2];         // corners of the sample area to create advection
    float advection_gain_ = 1.0f;                   // Multiplier for advection speed (higher = faster advection)
    float advection_alpha_ = 0.01f;                 // EMA smoothing factor for advection velocity
    btk::math::Vector3D global_advection_offset_;   // single offset for all components
    btk::math::Vector3D global_advection_velocity_; // EMA-smoothed global velocity

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
    static WindGenerator getPreset(const std::string& name, const btk::math::Vector3D& min_corner, const btk::math::Vector3D& max_corner);

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