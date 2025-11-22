#pragma once

#include "math/vector.h"
#include <cmath>
#include <vector>

// Forward declaration for WASM builds
#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

namespace btk::rendering
{

  /**
   * @brief 3D wind flag with physics-based flapping animation
   *
   * Simulates a wind flag with:
   * - Wind-responsive angle and direction
   * - Flapping animation based on wind speed
   * - Segmented flag geometry
   */
  class WindFlag
  {
    public:
    /**
     * @brief Initialize wind flag with configurable parameters
     *
     * @param flag_base_width Flag base width in yards (default: 60.0f/36.0f = 1.67f)
     * @param flag_tip_width Flag tip width in yards (default: 24.0f/36.0f = 0.67f)
     * @param flag_length Flag length in yards (default: 16.0f/3.0f = 5.33f)
     * @param flag_thickness Flag thickness in yards (default: 0.05f)
     * @param flag_segments Number of segments for flag geometry (default: 10)
     * @param flag_min_angle Minimum angle from vertical in degrees (default: 1.0f)
     * @param flag_max_angle Maximum angle from vertical in degrees (default: 90.0f)
     * @param flag_angle_response_k Nonlinear angle response coefficient (default: 0.0205f)
     * @param flag_angle_interpolation_speed Angle interpolation speed in deg/s (default: 30.0f)
     * @param flag_direction_interpolation_speed Direction interpolation speed in rad/s (default: 1.0f)
     * @param flag_flap_frequency_base Base flap frequency in Hz (default: 0.5f)
     * @param flag_flap_frequency_scale Flap frequency scale in Hz/mph (default: 0.25f)
     * @param flag_flap_amplitude Flap amplitude in yards (default: 0.3f)
     * @param flag_wave_length Wave length along flag (default: 1.5f)
     */
    WindFlag(float flag_base_width = 60.0f / 36.0f, float flag_tip_width = 24.0f / 36.0f, float flag_length = 16.0f / 3.0f, float flag_thickness = 0.05f, int flag_segments = 10,
             float flag_min_angle = 1.0f, float flag_max_angle = 90.0f, float flag_angle_response_k = 0.0205f, float flag_angle_interpolation_speed = 30.0f,
             float flag_direction_interpolation_speed = 1.0f, float flag_flap_frequency_base = 0.5f, float flag_flap_frequency_scale = 0.25f, float flag_flap_amplitude = 0.3f,
             float flag_wave_length = 1.5f);

    /**
     * @brief Set flag position in Three.js coordinates (yards)
     */
    void setPosition(float x, float y, float z);

    /**
     * @brief Get flag position in Three.js coordinates (yards)
     */
    btk::math::Vector3D getPosition() const { return position_; }

    /**
     * @brief Update flag physics state based on wind
     *
     * @param deltaTime Time step in seconds
     * @param wind_btk Wind vector in BTK coordinates (m/s): X=crossrange, Y=up, Z=-downrange
     */
    void update(float deltaTime, const btk::math::Vector3D& wind_btk);

    /**
     * @brief Update the vertex buffer with current flag geometry
     */
    void updateDisplay();

    /**
     * @brief Get vertex buffer as a JS-typed array view for zero-copy access
     *
     * Returns vertices as [x,y,z, x,y,z, ...] in Three.js coordinates (yards).
     * Buffer is updated by calling updateDisplay() before this.
     */
#ifdef __EMSCRIPTEN__
    emscripten::val getVertices() const;
#else
    const std::vector<float>& getVertices() const { return vertices_buffer_; }
#endif

    /**
     * @brief Get UV buffer as a JS-typed array view for zero-copy access
     *
     * Returns UVs as [u,v, u,v, ...] for texture mapping.
     * Buffer is updated by calling updateDisplay() before this.
     */
#ifdef __EMSCRIPTEN__
    emscripten::val getUVs() const;
#else
    const std::vector<float>& getUVs() const { return uvs_buffer_; }
#endif

    /**
     * @brief Get index buffer as a JS-typed array view for zero-copy access
     *
     * Returns indices as [i0, i1, i2, ...] for triangle faces.
     * Buffer is updated by calling updateDisplay() before this.
     */
#ifdef __EMSCRIPTEN__
    emscripten::val getIndices() const;
#else
    const std::vector<uint32_t>& getIndices() const { return indices_buffer_; }
#endif

    private:
    // Configuration parameters
    float flag_base_width_;
    float flag_tip_width_;
    float flag_length_;
    float flag_thickness_;
    int flag_segments_;
    float flag_min_angle_;
    float flag_max_angle_;
    float flag_angle_response_k_;
    float flag_angle_interpolation_speed_;
    float flag_direction_interpolation_speed_;
    float flag_flap_frequency_base_;
    float flag_flap_frequency_scale_;
    float flag_flap_amplitude_;
    float flag_wave_length_;

    // State
    btk::math::Vector3D position_; // Three.js coordinates (yards)
    float current_angle_;          // Current angle from vertical (degrees)
    float current_direction_;      // Current wind direction (radians)
    float flap_phase_;             // Current flap phase (radians)

    // Buffers
    std::vector<float> vertices_buffer_;   // Flat array: x,y,z,x,y,z,... in Three.js coordinates
    std::vector<float> uvs_buffer_;        // Flat array: u,v,u,v,... for texture mapping
    std::vector<uint32_t> indices_buffer_; // Triangle indices

    // Helper methods
    void calculateFlagSegmentPosition(int segmentIndex, float angleDeg, float direction, float flapPhase, float& outX, float& outY, float& outZ, float& outHalfWidth);
  };

} // namespace btk::rendering
