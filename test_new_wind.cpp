#include "include/wind_generator.h"
#include <iostream>
#include <iomanip>

int main() {
    std::cout << "Testing new WindGenerator API...\n";
    std::cout << "================================\n\n";
    
    // Create a wind generator
    btk::ballistics::WindGenerator wind(42);
    
    // Add some wind components
    std::cout << "Adding wind components...\n";
    wind.addWindComponent(2.0, 0.1, 0.005);  // 2 m/s, 0.1 Hz, 0.005 cycles/m
    wind.addWindComponent(1.0, 0.5, 0.02);   // 1 m/s, 0.5 Hz, 0.02 cycles/m
    
    // Test sampling at different positions and times
    std::cout << "\nSampling wind at various positions and times:\n";
    std::cout << "Position (m) | Time (s) | Crosswind (m/s) | Headwind (m/s)\n";
    std::cout << "-------------|----------|-----------------|----------------\n";
    
    for (int x = 0; x <= 1000; x += 200) {
        for (int t = 0; t <= 10; t += 5) {
            auto wind_vec = wind(x, t);
            std::cout << std::setw(12) << x << " | " 
                      << std::setw(8) << t << " | "
                      << std::setw(15) << std::fixed << std::setprecision(3) << wind_vec.y << " | "
                      << std::setw(14) << wind_vec.x << "\n";
        }
    }
    
    // Test presets
    std::cout << "\nTesting presets:\n";
    auto presets = btk::ballistics::WindPresets::listPresets();
    for (const auto& preset : presets) {
        std::cout << "Preset: " << preset << "\n";
        auto preset_wind = btk::ballistics::WindPresets::getPreset(preset, 123);
        auto sample = preset_wind(500.0, 5.0);
        std::cout << "  Sample at (500m, 5s): cross=" << std::fixed << std::setprecision(3) 
                  << sample.y << " m/s, head=" << sample.x << " m/s\n";
    }
    
    return 0;
}
