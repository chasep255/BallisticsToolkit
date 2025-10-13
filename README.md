# BallisticsToolkit

Professional web-based ballistics calculator and match simulation suite for long-range shooting. Fast, accurate trajectory calculations with atmospheric and wind compensation, plus Monte Carlo match simulation with NRA targets.

**Live Demo:** https://chasep255.github.io/BallisticsToolkit/

## Features

### 🎯 Ballistic Calculator
- **G1/G7 Drag Models** - Industry standard ballistic coefficients
- **Environmental Compensation** - Temperature, pressure, humidity, altitude
- **Wind Correction** - Full 3D wind modeling with intuitive clock-based direction
- **Client-Side Performance** - WebAssembly for fast calculations, no server needed
- **Comprehensive Output** - Drop, drift, velocity, energy, and time of flight
- **Interactive Tooltips** - Helpful hover descriptions for all parameters
- **Flexible Units** - Display angles in milliradians or MOA

### 🎲 Target Simulator
- **Monte Carlo Simulation** - Statistical analysis of shooting precision
- **NRA Target Library** - All 12 standard targets (SR, MR, LR, F-Class)
- **Realistic Variability** - Muzzle velocity, wind, and rifle accuracy modeling
- **Interactive Visualization** - Zoom, pan, and detailed shot impact display
- **Match Scoring** - Complete NRA scoring with X-counts and group size analysis
- **Professional Logging** - Terminal-style log with detailed shot data

## Quick Start

### Ballistic Calculator
Visit the [Ballistic Calculator](https://chasep255.github.io/BallisticsToolkit/ballistic-calc/ballistic-calc.html) and enter your:

1. **Bullet specs** - Weight, diameter, BC, drag function
2. **Conditions** - Temperature, pressure, humidity, altitude  
3. **Wind** - Speed and direction (12=pushes forward, 3=pushes right, 6=pushes backward, 9=pushes left)
4. **Shot data** - Muzzle velocity, zero range, scope height

Results display drop and drift corrections in your choice of milliradians or MOA for precise long-range adjustments.

### Target Simulator
Navigate to the [Target Simulator](https://chasep255.github.io/BallisticsToolkit/target-sim/target-sim.html) for match simulation:

1. **Bullet Parameters** - BC, muzzle velocity, diameter, drag function
2. **Match Setup** - Target selection, range, shots per match, number of matches
3. **Variability** - MV standard deviation, wind variability, rifle accuracy
4. **Environment** - Altitude, temperature, humidity, pressure

Watch realistic shot impacts on NRA targets with detailed logging and statistical analysis.

## Building from Source

Requires Emscripten SDK, CMake ≥ 3.16, and Python 3.

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

- **Engine**: 3DOF ballistics simulation with Runge-Kutta integration
- **Language**: C++17 compiled to WebAssembly with Emscripten
- **Frontend**: Vanilla JavaScript with modern CSS, no frameworks
- **Match Scoring**: Complete NRA scoring system with statistical analysis
- **Deployment**: GitHub Actions auto-deploys to GitHub Pages
- **Architecture**: Client-side only, no server required

## License

MIT License - see [LICENSE](LICENSE) file for details.
