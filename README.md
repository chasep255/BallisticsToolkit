# Ballistics Toolkit

Web-based ballistics calculator and match simulation suite for long-range shooting. Fast, accurate trajectory calculations with atmospheric and wind compensation, plus Monte Carlo match simulation with competitive targets.

**Website:** https://www.ballisticstoolkit.com/  
**Contact:** admin@ballisticstoolkit.com

## Features

### 📊 Ballistic Calculator
- **G1/G7 Drag Models** - Industry standard ballistic coefficients
- **Environmental Compensation** - Temperature, humidity, altitude (pressure derived)
- **Wind Correction** - Full 3D wind modeling with intuitive clock-based direction
- **Spin Effects** - Spin drift and crosswind jump modeling with bullet spin rate calculation
- **Client-Side Performance** - WebAssembly for fast calculations, no server needed
- **Comprehensive Output** - Drop, drift, velocity, energy, and time of flight

### 🎯 Target Simulator
- **Monte Carlo Simulation** - Statistical analysis of shooting precision
- **Target Library** - 14 competitive targets (10 standard + 4 F-Class variants)
- **Realistic Variability** - Muzzle velocity, wind, and rifle accuracy modeling
- **Spin Effects** - Spin drift and crosswind jump included in trajectory calculations
- **Interactive Visualization** - Zoom, pan, and detailed shot impact display
- **Match Scoring** - Complete competitive scoring with X-counts and group size analysis

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
- **Spin Effects** - Spin drift and crosswind jump included in trajectory calculations
- **Match-Style Scoring** - Authentic target animation, competitive scoring with X-count, detailed scorecard
- **Immersive Environment** - Procedural terrain, dynamic audio, comprehensive HUD
- **Debug Mode** - Add `?debug=1` to URL for rapid testing (1-min relays, 2 shots)

## Quick Start

### Ballistic Calculator
Visit the [Ballistic Calculator](https://www.ballisticstoolkit.com/ballistic-calc/ballistic-calc.html) and enter your:

1. **Bullet specs** - Weight (grains), diameter (inches), length (inches), BC, drag function, twist rate (inches per turn)
2. **Conditions** - Temperature, humidity, altitude (pressure derived)  
3. **Wind** - Speed and direction using 12-hour clock (12=tailwind, 3=right crosswind, 6=headwind, 9=left crosswind)
4. **Shot data** - Muzzle velocity, zero range, scope height

Results display drop and drift corrections (including spin drift) in your choice of milliradians or MOA for precise long-range adjustments.

### Target Simulator
Navigate to the [Target Simulator](https://www.ballisticstoolkit.com/target-sim/target-sim.html) for match simulation:

1. **Bullet Parameters** - Weight (grains), length (inches), diameter (inches), BC, muzzle velocity, twist rate (inches per turn), drag function
2. **Match Setup** - Target selection, range, shots per match, number of matches
3. **Variability** - MV standard deviation, wind variability, rifle accuracy
4. **Environment** - Altitude, temperature, humidity (pressure derived)

Watch realistic shot impacts on competitive targets with detailed logging and statistical analysis. Trajectories include spin drift and crosswind jump effects.

### F-Class Simulator
Visit the [F-Class Simulator](https://www.ballisticstoolkit.com/fclass-sim/fclass-sim.html):

1. **Pick Distance** (300–1000 yds) and wind preset (default: Vortex)
2. **Set Ballistics** (BC, MV, diameter, weight, length, twist rate, accuracy; G7 recommended)
3. **Scopes** (spotting: WASD/EQ; rifle: arrows/±)
4. **Match Flow** (Relay 1 sighters until "Go For Record"; Relays 2–3: 2 sighters)
5. **Shoot & Score** (per‑relay HUD, scorecard modal)

Tip: Use mirage + flags together. Mirage leans with crosswind and increases with zoom. Spin drift is automatically included in trajectory calculations.

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

- **Engine**: Trajectory simulation with 2nd‑order Runge‑Kutta (RK2) midpoint method
- **Language**: C++17 compiled to WebAssembly with Emscripten
- **Frontend**: Vanilla JavaScript with modern CSS, no frameworks
- **Performance**: Optimized C++ core with direct vector operations
- **Spin Aerodynamics**: 4DOF trajectory with simplified, empirically tuned spin effects (spin drift and crosswind jump); spin rate from twist and muzzle velocity
- **Wind Module**: 2D curl‑noise wind field with presets; realistic, evolving patterns
- **Match Scoring**: Competitive scoring system with statistics
- **Deployment**: GitHub Actions auto‑deploys to GitHub Pages
- **Architecture**: Client‑side only, no server required

## Contributing

Pull requests are welcome. By submitting a PR that is merged, you agree to the contribution terms in [CONTRIBUTING.md](CONTRIBUTING.md) (copyright assignment + exclusive commercial license).

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0. See the [LICENSE](LICENSE) file or https://polyformproject.org/licenses/noncommercial/1.0.0/ for details. Commercial use is not permitted without a separate license from the copyright holder.
