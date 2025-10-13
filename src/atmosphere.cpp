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
        Atmosphere::Atmosphere()
            : temperature_(Temperature::fahrenheit(constants::TEMPERATURE_STANDARD_FAHRENHEIT)),
              altitude_(Distance::feet(0)), humidity_(0.5), pressure_(calculateStandardPressure(Distance::feet(0)))
        {
        }

        Atmosphere::Atmosphere(const Temperature& temperature, const Distance& altitude, double humidity,
                               const Pressure& pressure)
            : temperature_(temperature), altitude_(altitude), humidity_(humidity),
              pressure_(pressure.pascals() > 0 ? pressure : calculateStandardPressure(altitude))
        {
            if(humidity < 0.0 || humidity > 1.0)
            {
                throw std::invalid_argument("Humidity must be between 0.0 and 1.0");
            }
        }

        const Pressure& Atmosphere::getPressure() const
        {
            return pressure_;
        }

        double Atmosphere::getAirDensity() const
        {
            // Use ideal gas law with humidity correction: ρ = (P - 0.378*e) / (R * T)
            // where e is vapor pressure, R is specific gas constant for dry air

            const Pressure& p = getPressure();
            double pressure_pa = p.pascals();
            double temperature_k = temperature_.kelvin();

            // Specific gas constant for dry air
            double R_specific = constants::GAS_CONSTANT_UNIVERSAL / constants::MOLAR_MASS_DRY_AIR;

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

            double temperature_k = temperature_.kelvin();
            double R_specific = constants::GAS_CONSTANT_UNIVERSAL / constants::MOLAR_MASS_DRY_AIR;

            double speed_of_sound = std::sqrt(constants::HEAT_CAPACITY_RATIO_AIR * R_specific * temperature_k);

            return speed_of_sound;
        }

        Atmosphere Atmosphere::standard()
        {
            return Atmosphere();
        }

        Atmosphere Atmosphere::atAltitude(const Distance& altitude)
        {
            // Calculate temperature at altitude using standard lapse rate
            double altitude_m = altitude.meters();
            double temperature_k =
                constants::TEMPERATURE_STANDARD_KELVIN + constants::TEMPERATURE_LAPSE_RATE * altitude_m;
            Temperature temp = Temperature::kelvin(temperature_k);

            return Atmosphere(temp, altitude, 0.5, Pressure::pascals(0));
        }

        std::string Atmosphere::toString() const
        {
            std::ostringstream oss;
            oss << "Atmosphere(" << std::fixed << std::setprecision(1) << temperature_.fahrenheit() << "°F, "
                << altitude_.feet() << "ft, " << std::setprecision(0) << humidity_ * 100 << "% humidity)";
            return oss.str();
        }

        Pressure Atmosphere::calculateStandardPressure(const Distance& altitude) const
        {
            // Barometric formula: P = P0 * exp(-h / H)
            // where P0 = standard pressure, h = altitude, H = scale height

            double altitude_m = altitude.meters();
            double pressure_pa =
                constants::PRESSURE_STANDARD_PASCALS * std::exp(-altitude_m / constants::PRESSURE_SCALE_HEIGHT);

            return Pressure::pascals(pressure_pa);
        }

        // Wind implementation
        Wind::Wind(const Velocity& speed, const Angle& direction, const Velocity& vertical)
            : speed_(speed), direction_(direction), vertical_(vertical)
        {
        }

        Wind::Wind(const Velocity& speed, const Angle& direction)
            : speed_(speed), direction_(direction), vertical_(Velocity::mph(0))
        {
        }

        Wind Wind::calm()
        {
            return Wind(Velocity::mph(0), Angle::degrees(0), Velocity::mph(0));
        }

        std::tuple<double, double, double> Wind::getComponents() const
        {
            // Convert wind to 3D coordinate system:
            // - Downrange (X): positive = tailwind, negative = headwind
            // - Crossrange (Y): positive = right crosswind, negative = left crosswind
            // - Vertical (Z): positive = updraft, negative = downdraft

            double speed_mps = speed_.mps();
            double direction_rad = direction_.radians();
            double vertical_mps = vertical_.mps();

            // Horizontal wind components
            double downrange_mps = -speed_mps * std::cos(direction_rad); // Negative for headwind
            double crossrange_mps = speed_mps * std::sin(direction_rad); // Positive for right crosswind

            return std::make_tuple(downrange_mps, crossrange_mps, vertical_mps);
        }

        std::tuple<Velocity, Velocity, Velocity> Wind::getComponentVelocities() const
        {
            auto [dr, cr, vert] = getComponents();
            return std::make_tuple(Velocity::mps(dr), Velocity::mps(cr), Velocity::mps(vert));
        }

        std::string Wind::toString() const
        {
            std::ostringstream oss;
            if(speed_.mph() == 0 && vertical_.mph() == 0)
            {
                oss << "Wind(calm)";
            }
            else
            {
                oss << "Wind(" << std::fixed << std::setprecision(0) << speed_.mph() << " mph at "
                    << direction_.degrees() << "°, " << vertical_.mph() << " mph vertical)";
            }
            return oss.str();
        }

    } // namespace ballistics
} // namespace btk
