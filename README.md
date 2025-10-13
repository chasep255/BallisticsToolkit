# BallisticsToolkit

Web-based ballistics calculator for long-range shooting. Fast, accurate trajectory calculations with atmospheric and wind compensation.

**Live Demo:** https://chasep255.github.io/BallisticsToolkit/

## Features

- **G1/G7 Drag Models** - Industry standard ballistic coefficients
- **Environmental Compensation** - Temperature, pressure, humidity, altitude
- **Wind Correction** - Full 3D wind modeling
- **Client-Side Performance** - WebAssembly for fast calculations, no server needed
- **Comprehensive Output** - Drop, drift, velocity, energy, and time of flight

## Quick Start

Visit the [live calculator](https://chasep255.github.io/BallisticsToolkit/) and enter your:

1. **Bullet specs** - Weight, diameter, BC, drag function
2. **Conditions** - Temperature, pressure, humidity, altitude  
3. **Wind** - Speed and direction
4. **Shot data** - Muzzle velocity, zero range, scope height

Results display drop and drift corrections in milliradians for precise long-range adjustments.

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
- **Language**: C++17 compiled to WebAssembly
- **Frontend**: Vanilla JavaScript, no frameworks
- **Deployment**: GitHub Actions auto-deploys to GitHub Pages

## License

MIT License - see [LICENSE](LICENSE) file for details.
