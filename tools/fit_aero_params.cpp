#include "ballistics/simulator.h"
#include "ballistics/bullet.h"
#include "physics/atmosphere.h"
#include "math/vector.h"
#include "math/conversions.h"
#include "math/random.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <cmath>
#include <string>
#include <iomanip>
#include <algorithm>

using namespace btk;

struct Observation
{
  std::string bullet_name;
  float caliber_in;
  float length_in;
  float bc_g7;
  float twist_in;
  float mv_fps;
  float range_yd;
  float wind_0_mrad;
  float vert_0_mrad;
  float wind_5_mrad;
  float vert_5_mrad;
  float wind_10_mrad;
  float vert_10_mrad;
  float wind_neg5_mrad;
  float vert_neg5_mrad;
  float wind_neg10_mrad;
  float vert_neg10_mrad;
};

std::vector<Observation> parseCSV(const std::string& filename)
{
  std::vector<Observation> observations;
  std::ifstream file(filename);
  
  if (!file.is_open())
  {
    std::cerr << "Failed to open file: " << filename << std::endl;
    return observations;
  }

  std::string line;
  std::getline(file, line); // Skip header

  while (std::getline(file, line))
  {
    std::stringstream ss(line);
    Observation obs;
    std::string token;

    std::getline(ss, obs.bullet_name, ',');
    std::getline(ss, token, ','); obs.caliber_in = std::stof(token) / 1000.0f; // Convert from 224 to 0.224
    std::getline(ss, token, ','); obs.length_in = std::stof(token);
    std::getline(ss, token, ','); obs.bc_g7 = std::stof(token);
    std::getline(ss, token, ','); obs.twist_in = std::stof(token);
    std::getline(ss, token, ','); obs.mv_fps = std::stof(token);
    std::getline(ss, token, ','); obs.range_yd = std::stof(token);
    std::getline(ss, token, ','); obs.wind_0_mrad = std::stof(token);
    std::getline(ss, token, ','); obs.vert_0_mrad = std::stof(token);
    std::getline(ss, token, ','); obs.wind_5_mrad = std::stof(token);
    std::getline(ss, token, ','); obs.vert_5_mrad = std::stof(token);
    std::getline(ss, token, ','); obs.wind_10_mrad = std::stof(token);
    std::getline(ss, token, ','); obs.vert_10_mrad = std::stof(token);
    std::getline(ss, token, ','); obs.wind_neg5_mrad = std::stof(token);
    std::getline(ss, token, ','); obs.vert_neg5_mrad = std::stof(token);
    std::getline(ss, token, ','); obs.wind_neg10_mrad = std::stof(token);
    std::getline(ss, token, ','); obs.vert_neg10_mrad = std::stof(token);

    // Sanity checks: validate vertical ordering (crosswind jump causes drop with positive wind)
    // vert_10 > vert_5 > vert_0 > vert_neg5 > vert_neg10
    if (!(obs.vert_10_mrad > obs.vert_5_mrad && obs.vert_5_mrad > obs.vert_0_mrad &&
          obs.vert_0_mrad > obs.vert_neg5_mrad && obs.vert_neg5_mrad > obs.vert_neg10_mrad))
    {
      std::cerr << "ERROR: Invalid vertical ordering for " << obs.bullet_name 
                << " @ " << obs.range_yd << " yards" << std::endl;
      std::cerr << "  Expected: vert_10 > vert_5 > vert_0 > vert_neg5 > vert_neg10" << std::endl;
      std::cerr << "  Got: " << obs.vert_10_mrad << " > " << obs.vert_5_mrad << " > " 
                << obs.vert_0_mrad << " > " << obs.vert_neg5_mrad << " > " 
                << obs.vert_neg10_mrad << std::endl;
      std::exit(1);
    }
    
    // Sanity checks: validate horizontal ordering (windage should increase with wind speed)
    // wind_0 < wind_5 < wind_10 and wind_neg10 < wind_neg5 < wind_0
    if (!(obs.wind_0_mrad < obs.wind_5_mrad && obs.wind_5_mrad < obs.wind_10_mrad))
    {
      std::cerr << "ERROR: Invalid positive wind ordering for " << obs.bullet_name 
                << " @ " << obs.range_yd << " yards" << std::endl;
      std::cerr << "  Expected: wind_0 < wind_5 < wind_10" << std::endl;
      std::cerr << "  Got: " << obs.wind_0_mrad << " < " << obs.wind_5_mrad << " < " 
                << obs.wind_10_mrad << std::endl;
      std::exit(1);
    }
    
    if (!(obs.wind_neg10_mrad < obs.wind_neg5_mrad && obs.wind_neg5_mrad < obs.wind_0_mrad))
    {
      std::cerr << "ERROR: Invalid negative wind ordering for " << obs.bullet_name 
                << " @ " << obs.range_yd << " yards" << std::endl;
      std::cerr << "  Expected: wind_neg10 < wind_neg5 < wind_0" << std::endl;
      std::cerr << "  Got: " << obs.wind_neg10_mrad << " < " << obs.wind_neg5_mrad << " < " 
                << obs.wind_0_mrad << std::endl;
      std::exit(1);
    }

    observations.push_back(obs);
  }

  return observations;
}

// Compute predicted spin drift (W=0) and crosswind jump for a specific wind speed
std::pair<float, float> computePredictedDeltas(const Observation& obs, float lift_slope, float restoring_moment_slope, float yaw_of_repose_scale, float beta_lag_scale, float wind_mph)
{
  // Setup bullet
  float weight_kg = btk::math::Conversions::grainsToKg(obs.caliber_in * obs.caliber_in * obs.length_in * 1000.0f); // Rough estimate
  float diameter_m = btk::math::Conversions::inchesToMeters(obs.caliber_in);
  float length_m = btk::math::Conversions::inchesToMeters(obs.length_in);
  
  ballistics::Bullet bullet(weight_kg, diameter_m, length_m, obs.bc_g7, ballistics::DragFunction::G7);
  
  // Setup atmosphere (standard conditions)
  float temp_k = btk::math::Conversions::fahrenheitToKelvin(59.0f);
  float altitude_m = 0.0f;
  float humidity = 0.5f;
  physics::Atmosphere atmosphere(temp_k, altitude_m, humidity, 0.0f);
  
  // Setup simulator with tuned parameters
  ballistics::Simulator simulator;
  simulator.setInitialBullet(bullet);
  simulator.setAtmosphere(atmosphere);
  simulator.setLiftSlopePerRad(lift_slope);
  simulator.setRestoringMomentSlopePerRad(restoring_moment_slope);
  simulator.setYawOfReposeScale(yaw_of_repose_scale);
  simulator.setBetaLagScale(beta_lag_scale);
  
  // Zero at 100 yards with 2" scope height, no wind
  float zero_range_m = btk::math::Conversions::yardsToMeters(100.0f);
  float scope_height_m = btk::math::Conversions::inchesToMeters(2.0f);
  float mv_mps = btk::math::Conversions::fpsToMps(obs.mv_fps);
  float twist_m = btk::math::Conversions::inchesToMeters(obs.twist_in);
  float spin_rate = ballistics::Bullet::computeSpinRateFromTwist(mv_mps, twist_m);
  
  math::Vector3D zero_wind(0.0f, 0.0f, 0.0f);
  simulator.setWind(zero_wind);
  
  math::Vector3D target_pos(zero_range_m, 0.0f, scope_height_m);
  simulator.computeZero(mv_mps, target_pos, 0.001f, 20, 0.001f, spin_rate);
  
  // Simulate to target range with zero wind (for spin drift)
  // Reset to initial zeroed state before simulating
  simulator.resetToInitial();
  simulator.setWind(zero_wind);
  
  float target_range_m = btk::math::Conversions::yardsToMeters(obs.range_yd);
  ballistics::Trajectory traj_zero = simulator.simulate(target_range_m, 0.001f, 60.0f);
  std::optional<ballistics::TrajectoryPoint> point_zero = traj_zero.atDistance(target_range_m);
  
  if (!point_zero.has_value())
  {
    return {0.0f, 0.0f};
  }
  
  math::Vector3D pos_zero = point_zero->getState().getPosition();
  float drift_zero_mrad = (pos_zero.y / target_range_m) * 1000.0f;
  float drop_zero_mrad = ((pos_zero.z - scope_height_m) / target_range_m) * 1000.0f;
  
  // If wind_mph is 0, we're just computing spin drift
  if (std::abs(wind_mph) < 0.1f)
  {
    return {drift_zero_mrad, 0.0f};
  }
  
  // For crosswind jump, reset to initial state and simulate with wind
  simulator.resetToInitial();  // Reset to the zeroed initial state
  
  float wind_mps = btk::math::Conversions::mphToMps(wind_mph);
  math::Vector3D crosswind(0.0f, wind_mps, 0.0f); // Positive Y = from right
  
  simulator.setWind(crosswind);
  ballistics::Trajectory traj_wind = simulator.simulate(target_range_m, 0.001f, 60.0f);
  std::optional<ballistics::TrajectoryPoint> point_wind = traj_wind.atDistance(target_range_m);
  
  if (!point_wind.has_value())
  {
    return {drift_zero_mrad, 0.0f};
  }
  
  math::Vector3D pos_wind = point_wind->getState().getPosition();
  float drop_wind_mrad = ((pos_wind.z - scope_height_m) / target_range_m) * 1000.0f;
  
  // Crosswind jump delta (vertical change from zero wind to wind condition)
  float crosswind_jump_delta = drop_wind_mrad - drop_zero_mrad;
  
  return {drift_zero_mrad, crosswind_jump_delta};
}

// Expanded observation for fitting (one per wind condition)
struct FitObservation
{
  std::string bullet_name;
  float range_yd;
  float wind_mph;
  bool is_drift;  // true = spin drift (W=0), false = crosswind jump (W!=0)
  float observed_value;
  const Observation* source_obs;
};

// Expand observations into individual fit points
std::vector<FitObservation> expandObservations(const std::vector<Observation>& observations)
{
  std::vector<FitObservation> fit_obs;
  
  for (const auto& obs : observations)
  {
    // Spin drift observation (W=0)
    fit_obs.push_back({obs.bullet_name, obs.range_yd, 0.0f, true, obs.wind_0_mrad, &obs});
    
    // Crosswind jump observations (W!=0)
    // 5 mph
    fit_obs.push_back({obs.bullet_name, obs.range_yd, 5.0f, false, obs.vert_0_mrad - obs.vert_5_mrad, &obs});
    // 10 mph
    fit_obs.push_back({obs.bullet_name, obs.range_yd, 10.0f, false, obs.vert_0_mrad - obs.vert_10_mrad, &obs});
    // -5 mph
    fit_obs.push_back({obs.bullet_name, obs.range_yd, -5.0f, false, obs.vert_0_mrad - obs.vert_neg5_mrad, &obs});
    // -10 mph
    fit_obs.push_back({obs.bullet_name, obs.range_yd, -10.0f, false, obs.vert_0_mrad - obs.vert_neg10_mrad, &obs});
  }
  
  return fit_obs;
}

// Compute residuals for all fit observations
std::vector<float> computeResiduals(const std::vector<FitObservation>& fit_observations, float lift_slope, float restoring_moment_slope, float yaw_of_repose_scale, float beta_lag_scale)
{
  std::vector<float> residuals;
  
  for (const auto& fit_obs : fit_observations)
  {
    auto [pred_drift, pred_jump] = computePredictedDeltas(*fit_obs.source_obs, lift_slope, restoring_moment_slope, yaw_of_repose_scale, beta_lag_scale, fit_obs.wind_mph);
    
    float predicted_value = fit_obs.is_drift ? pred_drift : pred_jump;
    float residual = predicted_value - fit_obs.observed_value;
    residuals.push_back(residual);
  }
  
  return residuals;
}

// Solve 4x4 linear system using Gaussian elimination with partial pivoting
// Input: A is 4x5 augmented matrix [A|b]
// Output: solution vector [x0, x1, x2, x3]
void solveLinearSystem4x4(float A[4][5], float solution[4])
{
  // Gaussian elimination with partial pivoting
  for (int k = 0; k < 4; ++k)
  {
    // Find pivot
    int pivot = k;
    for (int i = k + 1; i < 4; ++i)
    {
      if (std::abs(A[i][k]) > std::abs(A[pivot][k]))
      {
        pivot = i;
      }
    }
    
    // Swap rows
    if (pivot != k)
    {
      for (int j = 0; j < 5; ++j)
      {
        std::swap(A[k][j], A[pivot][j]);
      }
    }
    
    // Check for singular matrix
    if (std::abs(A[k][k]) < 1e-12f)
    {
      std::cerr << "ERROR: Singular matrix in linear system solver" << std::endl;
      std::exit(1);
    }
    
    // Eliminate
    for (int i = k + 1; i < 4; ++i)
    {
      float factor = A[i][k] / A[k][k];
      for (int j = k; j < 5; ++j)
      {
        A[i][j] -= factor * A[k][j];
      }
    }
  }
  
  // Back substitution
  for (int i = 3; i >= 0; --i)
  {
    solution[i] = A[i][4];
    for (int j = i + 1; j < 4; ++j)
    {
      solution[i] -= A[i][j] * solution[j];
    }
    solution[i] /= A[i][i];
  }
}

// Print detailed residual report
void printResidualReport(const std::vector<FitObservation>& fit_observations, 
                         const std::vector<float>& initial_residuals,
                         const std::vector<float>& final_residuals)
{
  // Create sorted index array by descending absolute final error
  std::vector<size_t> sorted_indices(fit_observations.size());
  for (size_t i = 0; i < sorted_indices.size(); ++i)
  {
    sorted_indices[i] = i;
  }
  
  std::sort(sorted_indices.begin(), sorted_indices.end(),
            [&final_residuals](size_t a, size_t b) {
              return std::abs(final_residuals[a]) > std::abs(final_residuals[b]);
            });
  
  std::cout << "\n====================================================================================================\n";
  std::cout << "DETAILED RESIDUAL REPORT (sorted by error, worst first)\n";
  std::cout << "====================================================================================================\n";
  std::cout << std::setw(15) << "Bullet" 
            << std::setw(8) << "Range"
            << std::setw(8) << "Wind"
            << std::setw(8) << "Type"
            << std::setw(10) << "Obs"
            << std::setw(12) << "Init Pred"
            << std::setw(12) << "Final Pred"
            << std::setw(12) << "Final Err"
            << "\n";
  std::cout << "----------------------------------------------------------------------------------------------------\n";
  
  for (size_t idx : sorted_indices)
  {
    const auto& fit_obs = fit_observations[idx];
    
    float init_err = initial_residuals[idx];
    float final_err = final_residuals[idx];
    float obs_value = fit_obs.observed_value;
    float init_pred_value = obs_value + init_err;
    float final_pred_value = obs_value + final_err;
    
    std::cout << std::setw(15) << fit_obs.bullet_name
              << std::setw(8) << std::fixed << std::setprecision(0) << fit_obs.range_yd
              << std::setw(8) << std::setprecision(1) << fit_obs.wind_mph
              << std::setw(8) << (fit_obs.is_drift ? "Drift" : "Jump")
              << std::setw(10) << std::setprecision(3) << obs_value
              << std::setw(12) << init_pred_value
              << std::setw(12) << final_pred_value
              << std::setw(12) << final_err
              << "\n";
  }
  
  std::cout << "----------------------------------------------------------------------------------------------------\n";
  
  // Summary statistics
  float initial_sse = 0.0f, final_sse = 0.0f;
  for (size_t i = 0; i < initial_residuals.size(); ++i)
  {
    initial_sse += initial_residuals[i] * initial_residuals[i];
    final_sse += final_residuals[i] * final_residuals[i];
  }
  
  float initial_rmse = std::sqrt(initial_sse / initial_residuals.size());
  float final_rmse = std::sqrt(final_sse / final_residuals.size());
  float improvement = 100.0f * (initial_rmse - final_rmse) / initial_rmse;
  
  std::cout << "\nSummary:\n";
  std::cout << "  Initial RMSE: " << std::fixed << std::setprecision(4) << initial_rmse << " mils\n";
  std::cout << "  Final RMSE:   " << final_rmse << " mils\n";
  std::cout << "  Improvement:  " << std::setprecision(1) << improvement << "%\n";
  std::cout << "====================================================================================================\n";
}

// Simulated annealing to find good initial parameters
struct ParameterSet {
  float lift_slope;
  float restoring_moment_slope;
  float yaw_of_repose_scale;
  float beta_lag_scale;
  float sse;
};

ParameterSet simulatedAnnealing(const std::vector<FitObservation>& fit_observations,
                                 float initial_temp, float cooling_rate, int iterations_per_temp)
{
  // Start with default parameters
  ParameterSet current = {1.5f, -0.07f, 0.2f, 0.5f, 0.0f};
  
  // Compute initial SSE
  std::vector<float> residuals = computeResiduals(fit_observations, current.lift_slope, 
                                                   current.restoring_moment_slope,
                                                   current.yaw_of_repose_scale, 
                                                   current.beta_lag_scale);
  for (float r : residuals) current.sse += r * r;
  
  ParameterSet best = current;
  float temperature = initial_temp;
  
  std::cout << "Starting simulated annealing..." << std::endl;
  std::cout << "  Initial SSE: " << current.sse << std::endl;
  
  int total_iterations = 0;
  while (temperature > 1e-6f) {
    for (int i = 0; i < iterations_per_temp; ++i) {
      // Generate neighbor by perturbing parameters
      ParameterSet neighbor = current;
      
      // Adaptive step size based on temperature
      float step_scale = temperature / initial_temp;
      
      neighbor.lift_slope += math::Random::normal(0.0f, 0.3f * step_scale);
      neighbor.restoring_moment_slope += math::Random::normal(0.0f, 0.02f * step_scale);
      neighbor.yaw_of_repose_scale += math::Random::normal(0.0f, 0.05f * step_scale);
      neighbor.beta_lag_scale += math::Random::normal(0.0f, 0.1f * step_scale);
      
      // Enforce reasonable bounds
      neighbor.lift_slope = std::clamp(neighbor.lift_slope, 0.5f, 3.0f);
      neighbor.restoring_moment_slope = std::clamp(neighbor.restoring_moment_slope, -0.15f, -0.01f);
      neighbor.yaw_of_repose_scale = std::clamp(neighbor.yaw_of_repose_scale, 0.05f, 0.5f);
      neighbor.beta_lag_scale = std::clamp(neighbor.beta_lag_scale, 0.1f, 1.0f);
      
      // Compute neighbor SSE
      residuals = computeResiduals(fit_observations, neighbor.lift_slope,
                                   neighbor.restoring_moment_slope,
                                   neighbor.yaw_of_repose_scale,
                                   neighbor.beta_lag_scale);
      neighbor.sse = 0.0f;
      for (float r : residuals) neighbor.sse += r * r;
      
      // Accept or reject based on Metropolis criterion
      float delta_sse = neighbor.sse - current.sse;
      if (delta_sse < 0.0f || math::Random::nextFloat() < std::exp(-delta_sse / temperature)) {
        current = neighbor;
        
        if (current.sse < best.sse) {
          best = current;
        }
      }
      
      total_iterations++;
    }
    
    // Cool down
    temperature *= cooling_rate;
    
    // Print progress periodically
    if (total_iterations % 500 == 0) {
      std::cout << "  Iteration " << total_iterations 
                << ": Best SSE = " << best.sse 
                << " (T = " << temperature << ")" << std::endl;
    }
  }
  
  std::cout << "Simulated annealing complete after " << total_iterations << " iterations" << std::endl;
  std::cout << "  Best SSE found: " << best.sse << std::endl;
  std::cout << "  Best parameters:" << std::endl;
  std::cout << "    lift_slope = " << best.lift_slope << std::endl;
  std::cout << "    restoring_moment_slope = " << best.restoring_moment_slope << std::endl;
  std::cout << "    yaw_of_repose_scale = " << best.yaw_of_repose_scale << std::endl;
  std::cout << "    beta_lag_scale = " << best.beta_lag_scale << std::endl;
  std::cout << std::endl;
  
  return best;
}

// Levenberg-Marquardt optimization
void fitParameters(const std::vector<Observation>& observations)
{
  // Expand observations into individual fit points
  std::vector<FitObservation> fit_observations = expandObservations(observations);
  
  std::cout << "Expanded to " << fit_observations.size() << " fit observations\n";
  std::cout << "  (1 drift + 4 jump per bullet/range combination)\n\n";
  
  // Phase 1: Simulated annealing to escape local minima
  ParameterSet sa_result = simulatedAnnealing(fit_observations, 1.0f, 0.8f, 50);
  
  // Phase 2: Levenberg-Marquardt refinement starting from SA result
  std::cout << "Starting Levenberg-Marquardt refinement..." << std::endl;
  float lift_slope = sa_result.lift_slope;
  float restoring_moment_slope = sa_result.restoring_moment_slope;
  float yaw_of_repose_scale = sa_result.yaw_of_repose_scale;
  float beta_lag_scale = sa_result.beta_lag_scale;
  
  float lambda = 0.001f;
  const float lambda_up = 10.0f;
  const float lambda_down = 0.1f;
  const int max_iterations = 100;
  const float tolerance = 1e-6f;
  
  std::vector<float> initial_residuals = computeResiduals(fit_observations, lift_slope, restoring_moment_slope, yaw_of_repose_scale, beta_lag_scale);
  std::vector<float> residuals = initial_residuals;
  float sse = 0.0f;
  for (float r : residuals) sse += r * r;
  
  std::cout << "LM starting parameters (from SA):" << std::endl;
  std::cout << "  lift_slope_per_rad = " << lift_slope << std::endl;
  std::cout << "  restoring_moment_slope_per_rad = " << restoring_moment_slope << std::endl;
  std::cout << "  yaw_of_repose_scale = " << yaw_of_repose_scale << std::endl;
  std::cout << "  beta_lag_scale = " << beta_lag_scale << std::endl;
  std::cout << "Starting SSE: " << sse << std::endl << std::endl;
  
  for (int iter = 0; iter < max_iterations; ++iter)
  {
    // Compute Jacobian using numerical derivatives
    const float h = 1e-6f;
    std::vector<float> J_lift, J_restoring, J_yaw, J_beta;
    
    std::vector<float> r_plus_lift = computeResiduals(fit_observations, lift_slope + h, restoring_moment_slope, yaw_of_repose_scale, beta_lag_scale);
    std::vector<float> r_plus_restoring = computeResiduals(fit_observations, lift_slope, restoring_moment_slope + h, yaw_of_repose_scale, beta_lag_scale);
    std::vector<float> r_plus_yaw = computeResiduals(fit_observations, lift_slope, restoring_moment_slope, yaw_of_repose_scale + h, beta_lag_scale);
    std::vector<float> r_plus_beta = computeResiduals(fit_observations, lift_slope, restoring_moment_slope, yaw_of_repose_scale, beta_lag_scale + h);
    
    for (size_t i = 0; i < residuals.size(); ++i)
    {
      J_lift.push_back((r_plus_lift[i] - residuals[i]) / h);
      J_restoring.push_back((r_plus_restoring[i] - residuals[i]) / h);
      J_yaw.push_back((r_plus_yaw[i] - residuals[i]) / h);
      J_beta.push_back((r_plus_beta[i] - residuals[i]) / h);
    }
    
    // Compute J^T * J and J^T * r
    float JtJ[4][4] = {};
    float Jtr[4] = {};
    std::vector<float>* J_cols[4] = {&J_lift, &J_restoring, &J_yaw, &J_beta};
    
    for (size_t i = 0; i < residuals.size(); ++i)
    {
      for (int j = 0; j < 4; ++j)
      {
        for (int k = 0; k < 4; ++k)
        {
          JtJ[j][k] += (*J_cols[j])[i] * (*J_cols[k])[i];
        }
        Jtr[j] += (*J_cols[j])[i] * residuals[i];
      }
    }
    
    // Apply Levenberg-Marquardt damping
    for (int i = 0; i < 4; ++i)
    {
      JtJ[i][i] *= (1.0f + lambda);
    }
    
    // Build augmented matrix [JtJ | -Jtr]
    float augmented_matrix[4][5];
    for (int i = 0; i < 4; ++i)
    {
      for (int j = 0; j < 4; ++j)
      {
        augmented_matrix[i][j] = JtJ[i][j];
      }
      augmented_matrix[i][4] = -Jtr[i];
    }
    
    // Solve for parameter deltas
    float delta[4];
    solveLinearSystem4x4(augmented_matrix, delta);
    
    // Try new parameters
    float new_lift = lift_slope + delta[0];
    float new_restoring = restoring_moment_slope + delta[1];
    float new_yaw = yaw_of_repose_scale + delta[2];
    float new_beta = beta_lag_scale + delta[3];
    
    std::vector<float> new_residuals = computeResiduals(fit_observations, new_lift, new_restoring, new_yaw, new_beta);
    float new_sse = 0.0f;
    for (float r : new_residuals) new_sse += r * r;
    
    if (new_sse < sse)
    {
      // Accept step
      lift_slope = new_lift;
      restoring_moment_slope = new_restoring;
      yaw_of_repose_scale = new_yaw;
      beta_lag_scale = new_beta;
      residuals = new_residuals;
      sse = new_sse;
      lambda *= lambda_down;
      
      // Print progress every 10 iterations
      if ((iter + 1) % 10 == 0)
      {
        std::cout << "Iteration " << (iter + 1) << ": SSE = " << sse << " (lambda = " << lambda << ")" << std::endl;
      }
      
      // Check convergence by parameter change
      float delta_norm = std::sqrt(delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2] + delta[3] * delta[3]);
      if (delta_norm < tolerance)
      {
        std::cout << "\nConverged (parameter change < " << tolerance << ")" << std::endl;
        break;
      }
    }
    else
    {
      // Reject step and increase damping
      lambda *= lambda_up;
      if (lambda > 1e6f)
      {
        std::cout << "\nConverged (lambda > 1e6, at local minimum)" << std::endl;
        break;
      }
    }
  }
  std::cout << "\nFinal parameters:" << std::endl;
  std::cout << "constexpr float LIFT_SLOPE_PER_RAD = " << lift_slope << "f;" << std::endl;
  std::cout << "constexpr float RESTORING_MOMENT_SLOPE_PER_RAD = " << restoring_moment_slope << "f;" << std::endl;
  std::cout << "constexpr float YAW_OF_REPOSE_SCALE = " << yaw_of_repose_scale << "f;" << std::endl;
  std::cout << "constexpr float BETA_LAG_SCALE = " << beta_lag_scale << "f;" << std::endl;
  std::cout << "\nFinal SSE: " << sse << std::endl;
  std::cout << "RMSE: " << std::sqrt(sse / residuals.size()) << " mils" << std::endl;
  
  // Print detailed residual report
  printResidualReport(fit_observations, initial_residuals, residuals);
}

int main(int argc, char** argv)
{
  std::string csv_file = "/home/chase/Desktop/spin_fit.csv";
  
  if (argc > 1)
  {
    csv_file = argv[1];
  }
  
  std::cout << "================================" << std::endl;
  std::cout << "Loading observations from " << csv_file << "..." << std::endl;
  
  std::vector<Observation> observations = parseCSV(csv_file);
  
  if (observations.empty())
  {
    std::cerr << "No observations loaded!" << std::endl;
    return 1;
  }
  
  std::cout << "Loaded " << observations.size() << " observations" << std::endl;
  std::cout << "Total residuals: " << (observations.size() * 2) << " (drift + jump)" << std::endl << std::endl;
  
  fitParameters(observations);
  
  return 0;
}

