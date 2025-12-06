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

### ⚖️ Load Comparison
- **Side-by-Side Comparison** - Compare two loads with drop, velocity, energy, wind drift, and flight time
- **100-Yard Intervals** - Data at every 100 yards out to your specified max range
- **Percentage Advantage** - See how much better or worse Bullet 2 is compared to Bullet 1
- **Flexible Units** - Display drop and drift in MOA, MRAD, or inches
- **10 mph Crosswind** - Standard crosswind for consistent drift comparison

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

### 🔩 Steel Target Simulator
- **Interactive Steel Range** - Shooting simulator with reactive steel targets and full ballistics. Multiple target racks from 100 to 1760 yards (1 mile) with plates from ~2″ chips to large 6‑ft gongs.
- **Hunting Mode** - Enable boars and prairie dogs via checkbox. Prairie dogs scattered 100-1000 yards, pop up/down randomly. Boars spawn 150-1200 yards, walk randomly.
- **Realistic Ballistics** - 4DOF trajectory simulation with G1/G7 drag models, wind presets, spin drift, and crosswind jump. Muzzle velocity variation (MV σ) and rifle accuracy (MOA) model real-world shot-to-shot spreads.
- **Target Physics** - Steel targets hang from virtual chains with momentum transfer, damping, and rotation. Center hits drive linear swing; edge hits kick targets into rotation. Impacts leave visible mark splatter and spawn metal dust.
- **Impact Detection** - Spatial binning system for efficient collision detection. Accurate hit/miss detection with visual feedback (HUD shows impact status).
- **Wind & Environment** - 3D landscape with wind flags along the range driven by the same curl‑noise wind field used for the f-class sim. Brown ground dust when you miss; silver‑gray metallic dust when you hit steel.
- **Scope & HUD** - Dual scopes (rifle + spotting) with pointer lock: click either scope to enter, `Tab` to switch between scopes, move mouse to pan, wheel or `+`/`-` to zoom (4×–40×), click to fire (rifle scope only), `Esc` to exit. Active scope shows a dull red border. MRAD or MOA scope type selection with matching reticle ticks and dial units. HUD shows current dial settings.
- **Mirage/Optical Effects** - Optional heat mirage simulation that moves with the wind, letting you read wind speed and direction through the shimmer. Includes depth-of-field blur based on focus distance. Refocus active scope with `F` key or right-click (desktop) or long-press (mobile).
- **Audio Feedback** - Shot sounds play immediately; impact sounds (ping) play with distance-based delay and volume attenuation.

## Quick Start

### Ballistic Calculator
Visit the [Ballistic Calculator](https://www.ballisticstoolkit.com/ballistic-calc/ballistic-calc.html) and enter your:

1. **Bullet specs** - Weight (grains), diameter (inches), length (inches), BC, drag function, twist rate (inches per turn)
2. **Conditions** - Temperature, humidity, altitude (pressure derived)  
3. **Wind** - Speed and direction using 12-hour clock (12=tailwind, 3=right crosswind, 6=headwind, 9=left crosswind)
4. **Shot data** - Muzzle velocity, zero range, scope height

Results display drop and drift corrections (including spin drift) in your choice of milliradians or MOA for precise long-range adjustments.

### Load Comparison
Visit the [Load Comparison](https://www.ballisticstoolkit.com/load-comp/load-comp.html) to compare two loads:

1. **Bullet 1** - Weight, BC, drag model (G1/G7), muzzle velocity
2. **Bullet 2** - Weight, BC, drag model (G1/G7), muzzle velocity
3. **Settings** - Max range, display units (MOA/MRAD/inches)

Results show drop, velocity, energy, wind drift, and flight time for each bullet at 100-yard intervals, with percentage advantage highlighting which load performs better.

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

### Steel Target Simulator
Visit the [Steel Target Simulator](https://www.ballisticstoolkit.com/steel-sim/steel-sim.html) for interactive steel shooting:

1. **Bullet Setup** - BC, muzzle velocity, diameter, weight, twist rate, MV variation, rifle accuracy
2. **Environment** - Wind preset selection, optional mirage effects
3. **Controls** - Click scope to enter, mouse to aim, click to fire, Tab to switch scopes, Esc to exit
4. **Targets** - Steel plates from 100 to 1760 yards with reactive physics and impact feedback

Shoot reactive steel targets with realistic ballistics, dust effects, and audio feedback. Optional hunting mode adds prairie dogs and boars.

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
