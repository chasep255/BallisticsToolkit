# Ballistics Toolkit

Client-side web-based ballistics calculator and simulation suite for long-range shooting. Fast, accurate trajectory calculations with atmospheric and wind compensation, spin effects (spin drift and crosswind jump), Monte Carlo target simulation, and interactive F-Class match simulator with wind visualization.

**Website:** https://www.ballisticstoolkit.com/  
**Contact:** admin@ballisticstoolkit.com

## Features

### 📊 Ballistic Calculator
- **G1/G7 Drag Models** - Industry standard drag functions with ballistic coefficients
- **Environmental Compensation** - Temperature, humidity, and altitude (atmospheric pressure calculated automatically)
- **Spin Effects** - Spin drift and crosswind jump modeling with bullet spin rate calculation
- **Client-Side Performance** - WebAssembly for fast calculations, no server needed

### 🎯 Target Simulator
- **Monte Carlo Simulation** - Statistical analysis of shooting precision
- **Target Library** - 14 competitive targets to choose from
- **Realistic Variability** - Muzzle velocity, wind, and rifle accuracy modeling
- **Spin Effects** - Crosswind jump included in analysis
- **Interactive Visualization** - Zoom, pan, and detailed shot impact display
- **Match Scoring** - Complete competitive scoring with X-counts, line breaking, and group size analysis

### 🌬️ Wind Simulator
- **Real-time Wind Visualization** - Interactive 2D wind field visualization showing wind speed and direction across the range
- **Realistic Wind Patterns** - Multi-octave curl noise generates natural swirling wind patterns that evolve over time
- **Multiple Presets** - Pre-configured wind patterns for different conditions
- **Adjustable Time Speed** - Speed up or slow down simulation time to observe wind patterns

### 🎮 F-Class Simulator
- **Authentic Match Experience** - 3 relays, 20 minutes each, 20 shots per relay with realistic F-Class rules
- **Dual Scopes** - Spotting scope for wind reading, rifle scope for aiming
- **Wind Reading** - Heat mirage effect responds to wind speed and direction; reactive 3D wind flags at multiple distances
- **Advanced Wind Simulation** - Multi‑octave curl noise with advection and multiple presets (see Wind Simulator)
- **Spin Effects** - Spin drift and crosswind jump included in trajectory calculations and trace visualizations
- **Match-Style Scoring** - Authentic target animation, detailed scorecard
- **Immersive Environment** - Procedural terrain, dynamic audio, comprehensive HUD
- **Debug Mode** - Add `?debug=1` to URL for rapid testing (1-min relays, 2 shots)

### 🔩 Steel Target Simulator *(Under Construction)*
- **Physics Animation Demo** - Currently showcases realistic steel target dynamics with chain constraints, momentum transfer, and bullet impact visualization
- **Current Demo** - Features 4 targets (6" circle, 18"×30" rectangle, 12" circle, 12"×18" rectangle) demonstrating rigid body physics
- **Future Plans** - Will expand to a full shooting range simulator with multiple reactive steel targets and realistic shooting scenarios

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

Watch realistic shot impacts on competitive targets with detailed logging and statistical analysis. Trajectories include crosswind jump effects.

### F-Class Simulator
Visit the [F-Class Simulator](https://www.ballisticstoolkit.com/fclass-sim/fclass-sim.html) for an interactive match experience:

1. **Match Setup** - Select distance (300–1000 yds) and wind preset
2. **Bullet Parameters** - BC (G7 recommended), muzzle velocity, diameter (inches), weight (grains), length (inches), twist rate (inches per turn), rifle accuracy
3. **Controls** - Spotting scope: WASD/EQ keys; rifle scope: arrow keys/±; shoot with spacebar
4. **Match Format** - Three 20-minute relays, 20 shots each; Relay 1: unlimited sighters until "Go For Record"; Relays 2–3: 2 sighters each

Experience authentic F-Class matches with wind reading (heat mirage and reactive flags), realistic wind simulation, and detailed scoring. Spin drift and crosswind jump are automatically included in trajectory calculations. Use mirage and flags together—mirage leans with crosswind and increases with zoom.

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
- **Frontend**: Vanilla JavaScript with modern CSS
- **Performance**: Optimized C++ core with WebGL graphics
- **Spin Aerodynamics**: 4DOF trajectory with simplified, empirically tuned spin effects (spin drift and crosswind jump); spin rate from twist and muzzle velocity
- **Wind Module**: 2D curl‑noise wind field with presets; realistic, evolving patterns
- **Match Scoring**: Competitive scoring system with statistics
- **Deployment**: GitHub Actions auto‑deploys to GitHub Pages
- **Architecture**: Client‑side only, no server required

## Contributing

Pull requests are welcome. By submitting a PR that is merged, you agree to the contribution terms in [CONTRIBUTING.md](CONTRIBUTING.md) (copyright assignment + exclusive commercial license).

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0. See the [LICENSE](LICENSE) file or https://polyformproject.org/licenses/noncommercial/1.0.0/ for details. Commercial use is not permitted without a separate license from the copyright holder.
