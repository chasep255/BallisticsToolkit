# Ballistics Toolkit

Client-side web-based ballistics calculator and simulation suite for long-range shooting. Built with WebAssembly and Three.js, it provides trajectory calculations with atmospheric and wind compensation, spin effects, load comparison, Performance Matrix analysis, Monte Carlo target simulation, hit simulation, interactive steel target simulator, an interactive F-Class match simulator with wind visualization, and a printable target generator.

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

### 🎛️ Performance Matrix
- **BC/MV Grid Comparison** - Compare wind drift, drop, velocity, energy, and MV sensitivity across different ballistic coefficients and muzzle velocities
- **Five Analysis Tables** - Wind drift (10 mph crosswind), drop, final velocity, final energy, and MV sensitivity (±0.5% velocity variation)
- **Color-Coded Results** - Green shows best performance, red shows worst, with smooth interpolation between
- **Customizable Ranges** - Define BC range (start/end/increment) and MV range
- **Flexible Settings** - G1/G7 drag models, MOA/MRAD/inches units, ft-lbs/Joules energy, full atmosphere controls
- **Load Development** - Identify optimal BC/MV combinations and evaluate sensitivity to velocity variations

### 🎯 Target Simulator
- **Monte Carlo Simulation** - Statistical analysis of shooting precision
- **Target Library** - 14 competitive targets to choose from
- **Realistic Variability** - Muzzle velocity, wind, and rifle accuracy modeling
- **Spin Effects** - Crosswind jump included in analysis
- **Interactive Visualization** - Zoom, pan, and detailed shot impact display
- **Match Scoring** - Competitive scoring with X-counts, line breaking, and group size analysis

### 🎲 Hit Simulator
- **Monte Carlo Simulation** - Run up to 50,000 shots against custom target shapes
- **Custom Target Shapes** - Circle (by diameter) or rectangle (by width/height) in inches
- **Dispersion Statistics** - Hit probability, horizontal/vertical spread, extreme spread, mean radius, radial standard deviation, and CEP
- **Full Ballistics** - Same G1/G7 drag models, atmosphere, spin effects, and wind variability as the other tools
- **Persistent Settings** - Cookie-based save/restore of all parameters

### 🌬️ Wind Simulator
- **Real-time Wind Visualization** - Interactive 2D wind field visualization showing wind speed and direction across the range
- **Procedural Wind Patterns** - Multi-octave curl noise generates swirling wind patterns that evolve over time
- **Wind Presets** - Zero, Dead, Calm, Moderate, Strong, Extra Strong
- **Adjustable Time Speed** - Speed up or slow down simulation time to observe wind patterns

### 🎮 F-Class Simulator
- **Two Match Modes** - String Fire (configurable matches, shots per match, and minutes per match; defaults 3 × 20 shots × 20 min aggregate) and Pair Fire (two players alternating on one rifle/target)
- **Pair Fire** - Per-turn timer (or unlimited), per-player sighters and configurable record shots, per-shooter scope persistence, dual HUD with active-shooter highlight, and X-count → sudden-death tiebreak
- **Dual Scopes** - Spotting scope for wind reading, rifle scope for aiming
- **Wind Reading** - Heat mirage effect responds to wind speed and direction; reactive 3D wind markers (selectable wind flags or wind socks) at multiple distances
- **Advanced Wind Simulation** - Multi‑octave curl noise with advection and multiple presets (see Wind Simulator)
- **Spin Effects** - Spin drift and crosswind jump included in trajectory calculations and trace visualizations
- **Match-Style Scoring** - Authentic target animation, detailed scorecard with per-section impact (grouping) diagrams
- **Remote Play (Beta)** - Host a match and stream the live view (and audio) to another person who plays it remotely. The host shares a single invite link; connections are brokered by the free PeerJS service and the audio/video is peer-to-peer (no account). In Pair Fire the host plays Player 1 and the remote player plays Player 2, with turn-gated controls
- **Immersive Environment** - Procedural terrain, dynamic audio, comprehensive HUD
- **Debug Mode** - Add `?debug=1` to URL for rapid testing (1-min matches, 2 shots)

### 🔩 Steel Target Simulator
- **Interactive Steel Range** - Shooting simulator with reactive steel targets and full ballistics. Multiple target racks from 100 to 1760 yards (1 mile) with plates from ~2″ chips to large 6‑ft gongs.
- **Hunting Mode** - Enable boars and prairie dogs via separate checkboxes. Prairie dogs scattered 100-1000 yards, pop up/down randomly. Boars spawn 150-1200 yards, walk randomly.
- **Physics-Based Ballistics** - 4DOF trajectory simulation with G1/G7 drag models, wind presets, spin drift, and crosswind jump. Muzzle velocity variation (MV σ) and rifle accuracy (MOA) model shot-to-shot spreads.
- **Target Physics** - Steel targets hang from virtual chains with momentum transfer, damping, and rotation. Center hits drive linear swing; edge hits kick targets into rotation. Impacts leave visible mark splatter and spawn metal dust.
- **Impact Detection** - Spatial binning system for efficient collision detection. Accurate hit/miss detection with visual feedback (HUD shows impact status).
- **Wind & Environment** - 3D landscape with selectable wind markers (wind socks or flags) along the range driven by the same curl‑noise wind field used for the f-class sim. Brown ground dust when you miss; silver‑gray metallic dust when you hit steel.
- **Scope & HUD** - Dual scopes (rifle + spotting) with pointer lock: click either scope to enter, `Tab` to switch between scopes, move mouse to pan, wheel or `+`/`-` to zoom (rifle: 4×–40×, spotting: 4×–80×), click to fire (rifle scope only), `Esc` to exit. Active scope shows a dull red border. MRAD or MOA scope type selection with matching reticle ticks and dial units. HUD shows current dial settings.
- **Mirage/Optical Effects** - Optional heat mirage simulation that moves with the wind, letting you read wind speed and direction through the shimmer. Includes depth-of-field blur based on focus distance. Refocus active scope with `F` key or right-click (desktop) or long-press (mobile).
- **Audio Feedback** - Shot sounds play immediately; impact sounds (ping) play with distance-based delay and volume attenuation.

### 🖨️ Target Generator
- **Competition Presets** - 14 standard competition target configurations (SR, MR, LR, F-Class) with correct ring diameters
- **Ring Editor** - Customize ring labels, diameters, fill colors, and line colors; add or remove rings for fully custom targets
- **Tiling Layouts** - Print 1, 2, 4, or 6 targets per page with automatic centering and clipping
- **1:1 Scale** - Rings are generated at their actual physical dimensions and print true-to-size at 100% (Actual Size); uses browser print with 300 DPI rendering. Verify with a ruler before use
- **Print Options** - Paper size (Letter, Legal, Tabloid, A4, A3, custom), orientation, margins, ring labels, target info, label colors, ring line thickness

## Quick Start

### Ballistic Calculator
Visit the [Ballistic Calculator](https://www.ballisticstoolkit.com/ballistic-calc/ballistic-calc.html) and enter your:

1. **Bullet specs** - Weight (grains), diameter (inches), length (inches), BC, drag function, twist rate (inches per turn)
2. **Conditions** - Temperature, humidity, altitude (pressure derived)  
3. **Wind** - Speed and direction using 12-hour clock (wind coming from the clock direction, target at 12). 12=headwind, 6=tailwind, 3=from right, 9=from left
4. **Shot data** - Muzzle velocity, zero range, scope height

Results display drop and drift corrections (including spin drift) in your choice of milliradians or MOA.

### Load Comparison
Visit the [Load Comparison](https://www.ballisticstoolkit.com/load-comp/load-comp.html) to compare two loads:

1. **Bullet 1** - Weight, BC, drag model (G1/G7), muzzle velocity
2. **Bullet 2** - Weight, BC, drag model (G1/G7), muzzle velocity
3. **Settings** - Max range, display units (MOA/MRAD/inches)

Results show drop, velocity, energy, wind drift, and flight time for each bullet at 100-yard intervals, with percentage advantage highlighting which load performs better.

### Performance Matrix
Visit the [Performance Matrix](https://www.ballisticstoolkit.com/perf-matrix/perf-matrix.html) to analyze BC/MV performance:

1. **Simulation Settings** - Range, drag model (G1/G7), display units (MOA/MRAD/inches)
2. **Atmosphere** - Temperature, altitude, humidity
3. **BC Range** - Start, end, and increment for ballistic coefficients
4. **MV Range** - Start (100-6000 fps), end, and increment for muzzle velocities

Results display five color-coded grids: wind drift (10 mph crosswind), drop, final velocity, final energy, and MV sensitivity (drop difference at ±0.5% velocity). Green indicates best performance, red indicates worst. Use this to identify optimal BC/MV combinations and evaluate how sensitive a load is to velocity variations.

### Target Simulator
Navigate to the [Target Simulator](https://www.ballisticstoolkit.com/target-sim/target-sim.html) for match simulation:

1. **Bullet Parameters** - Weight (grains), length (inches), diameter (inches), BC, muzzle velocity, twist rate (inches per turn), drag function
2. **Match Setup** - Target selection, range, shots per match, number of matches
3. **Variability** - MV standard deviation, wind variability, rifle accuracy
4. **Environment** - Altitude, temperature, humidity (pressure derived)

Watch realistic shot impacts on competitive targets with detailed logging and statistical analysis. Trajectories include crosswind jump effects.

### Hit Simulator
Visit the [Hit Simulator](https://www.ballisticstoolkit.com/hit-prob/hit-prob.html) for dispersion analysis:

1. **Bullet Parameters** - BC, drag function (G1/G7), muzzle velocity, weight, diameter, length, twist rate
2. **Target Shape** - Circle (diameter in inches) or rectangle (width/height in inches)
3. **Range & Variability** - Target range, MV σ, wind σ (cross/head-tail/vertical), rifle accuracy (MOA)
4. **Environment** - Altitude, temperature, humidity

Run the Monte Carlo simulation and view hit probability, group spreads, extreme spread, mean radius, CEP, and radial standard deviation with a visual impact plot.

### F-Class Simulator
Visit the [F-Class Simulator](https://www.ballisticstoolkit.com/fclass-sim/fclass-sim.html) for an interactive match experience:

1. **Match Setup** - Select distance (300–1000 yds) and wind preset
2. **Bullet Parameters** - BC (G7 recommended), muzzle velocity, diameter (inches), weight (grains), length (inches), twist rate (inches per turn), rifle accuracy
3. **Controls** - Spotting scope: WASD/EQ keys; rifle scope: arrow keys/±; shoot with spacebar
4. **Match Mode** - String Fire or Pair Fire (set in the parameter bar)
5. **String Fire Format** - Configurable matches / shots / minutes (default three 20-minute matches, 20 shots each, scored as an aggregate); Match 1: unlimited sighters until "Go For Record"; later matches: 2 sighters each
6. **Pair Fire Format** - Two players alternate on one rifle/target; each gets 2 sighters then configurable record shots (default 10) under a per-turn timer (or unlimited); ties broken by X-count then sudden death
7. **Remote Play (Beta)** - Check **Host Remote Play** before starting to stream the match to another player. It generates one invite link &mdash; send it to them and they open it to start playing (no codes to copy back). The same link reconnects them if they drop. The viewer mirrors the host (live view + audio, scorecard, controls); in Pair Fire the host plays Player 1 and the remote player Player 2, with controls limited to whoever's turn it is. Best on ordinary home/office networks &mdash; may fail over cellular or VPN

Experience authentic F-Class matches with wind reading (heat mirage and reactive flags), realistic wind simulation, and detailed scoring. Spin drift and crosswind jump are automatically included in trajectory calculations. Use mirage and flags together—mirage leans with crosswind and increases with zoom.

### Steel Target Simulator
Visit the [Steel Target Simulator](https://www.ballisticstoolkit.com/steel-sim/steel-sim.html) for interactive steel shooting:

1. **Bullet Setup** - BC, muzzle velocity, diameter, weight, twist rate, MV variation, rifle accuracy
2. **Environment** - Wind preset selection, optional mirage effects
3. **Controls** - Click scope to enter, mouse to aim, click to fire, Tab to switch scopes, Esc to exit
4. **Targets** - Steel plates from 100 to 1760 yards with reactive physics and impact feedback

Shoot reactive steel targets with physics-based ballistics, dust effects, and audio feedback. Optional hunting mode adds prairie dogs and boars.

### 🖨️ Target Generator
Visit the [Target Generator](https://www.ballisticstoolkit.com/target-gen/target-gen.html) to create printable targets:

1. **Target Selection** - 14 competition target presets (SR, MR, LR, F-Class) or fully custom ring definitions
2. **Ring Editor** - Edit ring diameters, fill colors, and line colors; add or remove rings
3. **Print Settings** - Paper size (Letter, Legal, Tabloid, A4, A3, custom), orientation, margins, tiling layouts (1-up, 2-up, 4-up, 6-up)
4. **Display Options** - Ring labels, target info text, label/info colors, ring line thickness, custom target label

Generate targets at 1:1 physical scale using browser print (print at 100% / Actual Size to preserve true dimensions; verify with a ruler). Targets larger than the paper are clipped at the page edge. Tiled layouts place multiple targets per page for smaller targets.

## Building from Source

Requires Emscripten SDK, CMake ≥ 3.16, and Python 3 (Web Server).

```bash
# Install Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

# Build (from repository root)
./build_web.sh

# Serve locally for testing
./build_web.sh -s
```

The `-s` flag starts a local server at http://localhost:8001

## Technical Details

- **Engine**: Trajectory simulation with 2nd‑order Runge‑Kutta (RK2) midpoint method
- **Language**: C++17 compiled to WebAssembly with Emscripten
- **Frontend**: Vanilla JavaScript with modern CSS
- **Performance**: Optimized C++ core with WebGL graphics
- **Spin Aerodynamics**: 4DOF trajectory with simplified, empirically tuned spin effects; spin rate from twist and muzzle velocity
- **Wind Module**: 2D curl‑noise wind field with presets; procedural, evolving patterns
- **Match Scoring**: Competitive scoring system with statistics
- **Deployment**: GitHub Actions auto‑deploys to GitHub Pages
- **Architecture**: Client‑side only, no server required

## Contributing

Pull requests are welcome. For guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Disclaimer

These tools are for educational and entertainment purposes. The calculators and simulators use physics-based models with approximations and may not accurately predict real-world results. Do not rely on these tools for any purpose where incorrect data could be hazardous. See the [Terms of Service](https://www.ballisticstoolkit.com/terms.html) for full details.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
