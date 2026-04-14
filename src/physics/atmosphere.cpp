#include "physics/atmosphere.h"
#include "physics/constants.h"
#include <cmath>
#include <stdexcept>

namespace btk
{
  namespace physics
  {

    // Atmosphere implementation
    Atmosphere::Atmosphere()
      : temperature_(btk::physics::Constants::TEMPERATURE_STANDARD_KELVIN),
        altitude_(0.0f),
        humidity_(0.5f),
        pressure_(calculateStandardPressure(0.0f))
    {}

    Atmosphere::Atmosphere(float temperature, float altitude, float humidity, float pressure)
      : temperature_(temperature), altitude_(altitude), humidity_(humidity), pressure_(pressure > 0 ? pressure : calculateStandardPressure(altitude))
    {
      if(temperature <= 0.0f)
      {
        throw std::invalid_argument("Temperature must be positive (Kelvin)");
      }
      if(humidity < 0.0f || humidity > 1.0f)
      {
        throw std::invalid_argument("Humidity must be between 0.0f and 1.0f");
      }
    }

    float Atmosphere::getPressure() const { return pressure_; }

    float Atmosphere::getAirDensity() const
    {
      // Use ideal gas law with humidity correction: ρ = (P - 0.378f*e) / (R * T)
      // where e is vapor pressure, R is specific gas constant for dry air

      float pressure_pa = getPressure();
      float temperature_k = temperature_;

      // Specific gas constant for dry air
      constexpr float R_specific = btk::physics::Constants::GAS_CONSTANT_UNIVERSAL / btk::physics::Constants::MOLAR_MASS_DRY_AIR;

      // Calculate vapor pressure (simplified approximation)
      // e_sat ≈ 611.2f * exp(17.67f * (T - 273.15f) / (T - 29.65f))
      float T_c = temperature_k - 273.15f;
      float e_sat = 611.2f * std::exp(17.67f * T_c / (temperature_k + 243.5f - 273.15f));
      float e = humidity_ * e_sat;

      // Density with humidity correction (like Python)
      float density = (pressure_pa - 0.378f * e) / (R_specific * temperature_k);

      return density;
    }

    float Atmosphere::getSpeedOfSound() const
    {
      // Speed of sound with humidity correction
      // c = sqrt(γ * P / ρ) where γ = heat capacity ratio, P = pressure, ρ = density
      // This automatically accounts for temperature, pressure, and humidity via density
      
      float pressure_pa = getPressure();
      float density = getAirDensity();
      
      float speed_of_sound = std::sqrt(btk::physics::Constants::HEAT_CAPACITY_RATIO_AIR * pressure_pa / density);

      return speed_of_sound;
    }

    Atmosphere Atmosphere::standard() { return Atmosphere(); }

    Atmosphere Atmosphere::atAltitude(float altitude)
    {
      // Calculate temperature at altitude using standard lapse rate
      float temperature_k = btk::physics::Constants::TEMPERATURE_STANDARD_KELVIN + btk::physics::Constants::TEMPERATURE_LAPSE_RATE * altitude;

      return Atmosphere(temperature_k, altitude, 0.5f, 0.0f);
    }

    float Atmosphere::calculateStandardPressure(float altitude) const
    {
      // ISA power-law: P = P0 * (T0/(T0+L*h))^(gM/(R*L)) = P0 * (1+L*h/T0)^(-g/(R_specific*L))
      constexpr float R_specific = btk::physics::Constants::GAS_CONSTANT_UNIVERSAL / btk::physics::Constants::MOLAR_MASS_DRY_AIR;
      constexpr float exponent = -btk::physics::Constants::GRAVITY / (R_specific * btk::physics::Constants::TEMPERATURE_LAPSE_RATE);

      float base = 1.0f + (btk::physics::Constants::TEMPERATURE_LAPSE_RATE * altitude) / btk::physics::Constants::TEMPERATURE_STANDARD_KELVIN;
      if(base <= 0.0f)
        return 0.0f;

      return btk::physics::Constants::PRESSURE_STANDARD_PASCALS * std::pow(base, exponent);
    }

  } // namespace physics
} // namespace btk
