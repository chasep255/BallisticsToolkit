#pragma once

#include "atmosphere.h"
#include "bullet.h"
#include "simulator.h"
#include "trajectory.h"
#include <memory>
#include <vector>

namespace btk::ballistics_calc
{

  /**
   * @brief WebAssembly ballistics calculator interface
   *
   * Provides C++ interface for JavaScript bindings to calculate
   * ballistic trajectories with atmospheric and wind compensation.
   */
  class BallisticsCalculator
  {
    public:
    /**
     * @brief Initialize bullet parameters
     */
    void initializeBullet(double weight_grains, double diameter_inches, double length_inches, double bc,
                          int drag_function);

    /**
     * @brief Set atmospheric conditions
     */
    void setAtmosphere(double temperature_f, double pressure_inhg, double humidity_percent, double altitude_feet);

    /**
     * @brief Set wind conditions
     */
    void setWind(double wind_speed_mph, double wind_direction_deg);

    /**
     * @brief Calculate trajectory
     *
     * @return Pointer to trajectory data (free with freeTrajectory)
     */
    void* calculateTrajectory(double muzzle_velocity_fps, double zero_range_yards, double scope_height_inches,
                              double max_range_yards, double step_yards);

    /**
     * @brief Free trajectory data
     */
    void freeTrajectory(void* trajectory_data);

    /**
     * @brief Get trajectory point at specific range
     *
     * @return 1 if successful, 0 if range not found
     */
    int getTrajectoryPoint(void* trajectory_data, double range_yards, double* drop_mrad, double* drift_mrad,
                           double* velocity_fps, double* energy_ftlbf, double* time_sec);

    /**
     * @brief Get number of trajectory points
     */
    int getTrajectoryPointCount(void* trajectory_data);

    private:
    std::unique_ptr<btk::ballistics::Bullet> bullet_;
    std::unique_ptr<btk::ballistics::Atmosphere> atmosphere_;
    std::unique_ptr<btk::ballistics::Wind> wind_;
  };

  /**
   * @brief C-style interface for JavaScript binding
   */
  extern "C"
  {
    void* ballistics_calc_create();
    void ballistics_calc_destroy(void* solver);

    void ballistics_calc_set_bullet(void* solver, double weight_grains, double diameter_inches, double length_inches,
                                    double bc, int drag_function);

    void ballistics_calc_set_atmosphere(void* solver, double temperature_f, double pressure_inhg,
                                        double humidity_percent, double altitude_feet);

    void ballistics_calc_set_wind(void* solver, double wind_speed_mph, double wind_direction_deg);

    void* ballistics_calc_calculate_trajectory(void* solver, double muzzle_velocity_fps, double zero_range_yards,
                                               double scope_height_inches, double max_range_yards, double step_yards);

    void ballistics_calc_free_trajectory(void* trajectory_data);

    int ballistics_calc_get_trajectory_point(void* trajectory_data, double range_yards, double* drop_mrad,
                                             double* drift_mrad, double* velocity_fps, double* energy_ftlbf,
                                             double* time_sec);

    int ballistics_calc_get_trajectory_point_count(void* trajectory_data);
  }

} // namespace btk::ballistics_calc
