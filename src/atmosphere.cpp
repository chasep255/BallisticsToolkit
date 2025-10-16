#include "atmosphere.h"
#include "constants.h"
#include <cmath>
#include <iomanip>
#include <sstream>

namespace btk
{
  namespace ballistics
  {

    // Atmosphere implementation
    Atmosphere::Atmosphere() : temperature_(Constants::TEMPERATURE_STANDARD_FAHRENHEIT), altitude_(0.0), humidity_(0.5), pressure_(calculateStandardPressure(0.0)) {}

    Atmosphere::Atmosphere(double temperature, double altitude, double humidity, double pressure)
      : temperature_(temperature), altitude_(altitude), humidity_(humidity), pressure_(pressure > 0 ? pressure : calculateStandardPressure(altitude))
    {
      if(humidity < 0.0 || humidity > 1.0)
      {
        throw std::invalid_argument("Humidity must be between 0.0 and 1.0");
      }
    }

    double Atmosphere::getPressure() const { return pressure_; }

    double Atmosphere::getAirDensity() const
    {
      // Use ideal gas law with humidity correction: ρ = (P - 0.378*e) / (R * T)
      // where e is vapor pressure, R is specific gas constant for dry air

      double pressure_pa = getPressure();
      double temperature_k = temperature_;

      // Specific gas constant for dry air
      constexpr double R_specific = Constants::GAS_CONSTANT_UNIVERSAL / Constants::MOLAR_MASS_DRY_AIR;

      // Calculate vapor pressure (simplified approximation)
      // e_sat ≈ 611.2 * exp(17.67 * (T - 273.15) / (T - 29.65))
      double T_c = temperature_k - 273.15;
      double e_sat = 611.2 * std::exp(17.67 * T_c / (temperature_k + 243.5 - 273.15));
      double e = humidity_ * e_sat;

      // Density with humidity correction (like Python)
      double density = (pressure_pa - 0.378 * e) / (R_specific * temperature_k);

      return density;
    }

    double Atmosphere::getSpeedOfSound() const
    {
      // Speed of sound: c = sqrt(γ * R * T)
      // where γ = heat capacity ratio, R = specific gas constant, T = temperature

      double temperature_k = temperature_;
      double R_specific = Constants::GAS_CONSTANT_UNIVERSAL / Constants::MOLAR_MASS_DRY_AIR;

      double speed_of_sound = std::sqrt(Constants::HEAT_CAPACITY_RATIO_AIR * R_specific * temperature_k);

      return speed_of_sound;
    }

    Atmosphere Atmosphere::standard() { return Atmosphere(); }

    Atmosphere Atmosphere::atAltitude(double altitude)
    {
      // Calculate temperature at altitude using standard lapse rate
      double temperature_k = Constants::TEMPERATURE_STANDARD_KELVIN + Constants::TEMPERATURE_LAPSE_RATE * altitude;

      return Atmosphere(temperature_k, altitude, 0.5, 0.0);
    }

    double Atmosphere::calculateStandardPressure(double altitude) const
    {
      // Barometric formula: P = P0 * exp(-h / H)
      // where P0 = standard pressure, h = altitude, H = scale height

      double pressure_pa = Constants::PRESSURE_STANDARD_PASCALS * std::exp(-altitude / Constants::PRESSURE_SCALE_HEIGHT);

      return pressure_pa;
    }

  } // namespace ballistics
} // namespace btk
