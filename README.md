# Ballistics Toolkit

Web-based ballistics calculator and match simulation suite for long-range shooting. Fast, accurate trajectory calculations with atmospheric and wind compensation, plus Monte Carlo match simulation with NRA targets.

**Website:** https://www.ballisticstoolkit.com/

## Features

### 📊 Ballistic Calculator
- **G1/G7 Drag Models** - Industry standard ballistic coefficients
- **Environmental Compensation** - Temperature, pressure, humidity, altitude
- **Wind Correction** - Full 3D wind modeling with intuitive clock-based direction
- **Client-Side Performance** - WebAssembly for fast calculations, no server needed
- **Comprehensive Output** - Drop, drift, velocity, energy, and time of flight

### 🎯 Target Simulator
- **Monte Carlo Simulation** - Statistical analysis of shooting precision
- **NRA Target Library** - 14 NRA targets (10 standard + 4 F-Class variants)
- **Realistic Variability** - Muzzle velocity, wind, and rifle accuracy modeling
- **Interactive Visualization** - Zoom, pan, and detailed shot impact display
- **Match Scoring** - Complete NRA scoring with X-counts and group size analysis

### 🌬️ Wind Simulator
- **Real-time Wind Visualization** - Interactive 2D wind field visualization showing wind speed and direction across the range
- **Realistic Wind Patterns** - Multi-octave curl noise generates natural swirling wind patterns that evolve over time
- **Multiple Presets** - Pre-configured wind patterns for different conditions
- **Threshold Gating** - Optional sigmoid gating creates realistic alternating quiet periods and gusts above a threshold
- **Adjustable Time Speed** - Speed up or slow down simulation time to observe wind patterns
- Note: This feature is experimental and evolving

### 🎮 F-Class Simulator
- **Authentic Match Experience** - 3 relays, 20 minutes each, 20 shots per relay with realistic F-Class rules
- **Dual Scopes** - Spotting scope for wind reading, rifle scope for precision aiming
- **Wind Reading** - Heat mirage effect responds to wind speed and direction; reactive 3D wind flags at multiple distances
- **Advanced Wind Simulation** - Multi‑octave curl noise with per‑component advection and multiple presets
- **Match-Style Scoring** - Authentic target animation, NRA scoring with X-count, detailed scorecard
- **Immersive Environment** - Procedural terrain, dynamic audio, comprehensive HUD
- **Debug Mode** - Add `?debug=1` to URL for rapid testing (1-min relays, 2 shots)

## Quick Start

### Ballistic Calculator
Visit the [Ballistic Calculator](https://www.ballisticstoolkit.com/ballistic-calc/ballistic-calc.html) and enter your:

1. **Bullet specs** - Weight, diameter, BC, drag function
2. **Conditions** - Temperature, pressure, humidity, altitude  
3. **Wind** - Speed and direction using 12-hour clock (12=tailwind, 3=right crosswind, 6=headwind, 9=left crosswind)
4. **Shot data** - Muzzle velocity, zero range, scope height

Results display drop and drift corrections in your choice of milliradians or MOA for precise long-range adjustments.

### Target Simulator
Navigate to the [Target Simulator](https://www.ballisticstoolkit.com/target-sim/target-sim.html) for match simulation:

1. **Bullet Parameters** - BC, muzzle velocity, diameter, drag function
2. **Match Setup** - Target selection, range, shots per match, number of matches
3. **Variability** - MV standard deviation, wind variability, rifle accuracy
4. **Environment** - Altitude, temperature, humidity, pressure

Watch realistic shot impacts on NRA targets with detailed logging and statistical analysis.

### F-Class Simulator
Visit the [F-Class Simulator](https://www.ballisticstoolkit.com/fclass-sim/fclass-sim.html):

1. **Pick Distance** (300–1000 yds) and wind preset (default: Vortex)
2. **Set Ballistics** (BC, MV, diameter, accuracy; G7 recommended)
3. **Scopes** (spotting: WASD/EQ; rifle: arrows/±)
4. **Match Flow** (Relay 1 sighters until “Go For Record”; Relays 2–3: 2 sighters)
5. **Shoot & Score** (per‑relay HUD, scorecard modal)

Tip: Use mirage + flags together. Mirage leans with crosswind and increases with zoom.

## Building from Source

Requires Emscripten SDK, CMake ≥ 3.16, and Python 3 (Web Server).

```bash
# Install Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

# Build
cd BallisticsToolkit
./build_web.sh
```

Opens local server at http://localhost:8001

## Technical Details

- **Engine**: 3DOF ballistics simulation with 2nd-order Runge-Kutta (RK2) midpoint method
- **Language**: C++17 compiled to WebAssembly with Emscripten
- **Frontend**: Vanilla JavaScript with modern CSS, no frameworks
- **Units**: SI base units internally with conversion utilities for user-friendly I/O
- **Performance**: Optimized C++ core with direct vector operations
- **Wind Module**: `WindGenerator` class (C++) implements a 2D curl field sampled from Simplex noise (x, y, t) with multi‑octave components (strength, spatial/temporal scales, exponent reshaping, optional sigmoid gating). Uses RMS normalization (one-time initialization from 1000 samples) for stable magnitude distribution, global advection (unified pattern movement), and clipping at 2x strength to prevent unrealistic wind speeds
- **Match Scoring**: Complete NRA scoring system with statistical analysis
- **Deployment**: GitHub Actions auto-deploys to GitHub Pages
- **Architecture**: Client-side only, no server required

## Contributing

Pull requests are welcome. By submitting a PR that is merged, you agree to the contribution terms in [CONTRIBUTING.md](CONTRIBUTING.md) (copyright assignment + exclusive commercial license).

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0. See the [LICENSE](LICENSE) file or https://polyformproject.org/licenses/noncommercial/1.0.0/ for details. Commercial use is not permitted without a separate license from the copyright holder.
