# Ballistics Toolkit

Professional web-based ballistics calculator and match simulation suite for long-range shooting. Fast, accurate trajectory calculations with atmospheric and wind compensation, plus Monte Carlo match simulation with NRA targets.

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

### 🌬️ Wind Simulator (Beta)
- **Real-time Wind Visualization** - WebGL arrows show crosswind and head/tail components along the range
- **Engine-backed Presets** - Preset list loaded from C++ `WindPresets` (single source of truth)
- **Perlin Noise Wind Generation** - 2D Perlin noise for realistic wind patterns
- **Period/Wavelength Parameters** - Intuitive time and space scales for wind components
- **Multiple Wind Components** - Layered wind patterns with different temporal and spatial scales
- **Controls** - Distance, preset, seed, arrow density, and time speed (0.1x–20x)
- Note: This feature is experimental and evolving

### 🎮 F-Class Simulator
- **Real Match Flow** - 3× relays, 20 min each, 20 record shots; unlimited sighters (Relay 1), 2 sighters (Relays 2–3); “Go For Record” to end sighters early; relay-complete dialogs
- **Unified Scopes** - Spotting scope for wind reading (FOV-scaled movement), rifle scope for aiming with MOA-based adjustments; reticle fixed to target base height during pit cycles
- **Realistic Heat Mirage** - World-anchored shader effect that samples wind along line of sight; upward boil vs horizontal flow by wind; responds instantly to wind direction changes
- **Wind & Flags** - Reactive 3D wind flags at intervals and at target; presets loaded from C++ with Moderate as default (renamed from Typical)
- **Scoring & Animation** - Match-style target animation (lower/raise with scoring discs); per-shot scoring with X-count; scorecard modal with two rows of ten
- **3D HUD Overlay** - Per‑relay stats: sighters or shots, score, X, dropped points, last shot, MV, impact V, relay/timer, FPS
- **Procedural Environment** - Rolling terrain and range objects for visual reference
- **Audio** - Wind noise scales smoothly with wind speed (silent at 0 mph)

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

1. **Pick Distance** (300–1000 yds) and wind preset (default: Moderate)
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
- **Wind Module**: `WindGenerator` class (C++) with 2D Perlin noise-based wind generation and period/wavelength parameters; preset factory `WindPresets` mirrors `NRATargets`
- **Match Scoring**: Complete NRA scoring system with statistical analysis
- **Deployment**: GitHub Actions auto-deploys to GitHub Pages
- **Architecture**: Client-side only, no server required

## License

MIT License - see [LICENSE](LICENSE) file for details.
