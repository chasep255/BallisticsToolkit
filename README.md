# BallisticsToolkit

A high-performance WebAssembly ballistics calculator for long-range shooting. Provides accurate trajectory calculations with support for multiple drag models, atmospheric conditions, and wind effects.

## Features

- **3DOF Ballistics Simulation**: Accurate trajectory modeling with drag, gravity, and Coriolis effects
- **Multiple Drag Models**: G1 and G7 ballistic coefficients
- **Atmospheric Modeling**: Temperature, pressure, humidity, and altitude compensation
- **Wind Effects**: Full 3D wind modeling with adjustable speed and direction
- **WebAssembly Performance**: Fast, client-side calculations with no server required
- **Type-Safe Units System**: Compile-time unit checking prevents errors

## Project Structure

```
BallisticsToolkit/
├── include/          # C++ headers (ballistics engine, units, web interface)
├── src/              # C++ implementation files
├── web/              # HTML/JavaScript frontend
├── CMakeLists.txt    # Build configuration
└── build_web.sh      # Automated build script
```

## Prerequisites

- **Emscripten SDK** - WebAssembly compiler toolchain
- **CMake** ≥ 3.16
- **C++17** compiler
- **Python 3** (for local web server)

### Installing Emscripten

```bash
# Clone and install Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

Add `source /path/to/emsdk/emsdk_env.sh` to your `.bashrc` to persist the environment.

## Building

The project uses a simple build script that handles everything:

```bash
./build_web.sh
```

This will:
1. Clean previous build artifacts
2. Configure with CMake using Emscripten
3. Compile to WebAssembly
4. Copy all files to `build-wasm/web/`
5. Start a local web server on port 8001

Open http://localhost:8001 in your browser to use the calculator.

### Manual Build

```bash
# Clean build
rm -rf build-wasm
mkdir build-wasm
cd build-wasm

# Configure and build
emcmake cmake ..
emmake make -j$(nproc)

# Files will be in build-wasm/web/
cd web
python3 -m http.server 8001
```

## Usage

### Web Interface

The web interface provides a complete ballistics calculator:

1. **Bullet Parameters**: Weight, diameter, length, BC, and drag function
2. **Atmospheric Conditions**: Temperature, pressure, humidity, altitude
3. **Wind Conditions**: Speed and direction
4. **Shot Parameters**: Muzzle velocity, zero range, scope height, max range

Click "Calculate Trajectory" to generate a ballistics table with:
- Drop (milliradians)
- Drift (milliradians)
- Velocity (fps)
- Energy (ft-lbf)
- Time of flight (seconds)

### API

The WebAssembly module exposes a C++ ballistics engine to JavaScript:

```javascript
// Initialize
const sim = new TargetSim();
await sim.init();

// Configure bullet
sim.setBullet({
    weight: 140,           // grains
    diameter: 0.264,       // inches
    length: 1.2,           // inches
    bc: 0.585,            // ballistic coefficient
    dragFunction: 'G7'     // G1 or G7
});

// Set atmosphere
sim.setAtmosphere({
    temperature: 59,       // °F
    pressure: 29.92,       // inHg
    humidity: 50,          // %
    altitude: 0            // feet
});

// Set wind
sim.setWind({
    speed: 10,             // mph
    direction: 90          // degrees (90 = from the side)
});

// Calculate trajectory
const trajectory = sim.calculateTrajectory({
    muzzleVelocity: 2700,  // fps
    zeroRange: 100,        // yards
    scopeHeight: 2.0,      // inches
    maxRange: 1000,        // yards
    step: 50               // yards
});

// Use results
trajectory.forEach(point => {
    console.log(`${point.range}yd: ${point.drop.toFixed(2)} mrad drop`);
});
```

## Technical Details

### Ballistics Engine

- **3DOF**: 3 Degrees of Freedom (point mass model)
- **Drag Models**: Standard G1/G7 drag functions
- **Atmospheric Density**: Calculated from temperature, pressure, humidity, and altitude
- **Integration**: Runge-Kutta 4th order with adaptive timestep
- **Coordinate System**: Right-handed (X=downrange, Y=crossrange, Z=vertical)

### Units System

Type-safe units with zero runtime overhead:

```cpp
Distance range = Distance::yards(1000);
Velocity mv = Velocity::fps(2700);
Temperature temp = Temperature::fahrenheit(59);

// Compile-time type checking prevents errors
// Distance d = Velocity::fps(100);  // Won't compile!
```

### Performance

- **Compile-time optimized**: `constexpr` wherever possible
- **No virtual functions**: Zero dynamic dispatch overhead
- **Enum-based dispatch**: Fast drag function selection
- **WebAssembly**: Near-native performance in the browser

## Code Style

- **Namespaces**: `psim::ballistics`, `psim::web_ui`
- **Opening braces**: Next line (Allman style)
- **Access specifiers**: Inline with members
- **Standard**: C++17

Format code with:
```bash
./format.sh src/ include/
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `./build_web.sh` to test
5. Format code with `./format.sh`
6. Submit a pull request

## Deployment

### GitHub Pages

This project is configured to automatically deploy to GitHub Pages on every push to `master`.

**Setup (one-time):**
1. Go to your repository Settings → Pages
2. Under "Source", select "GitHub Actions"
3. Push to master - the site will build and deploy automatically

Your site will be available at: `https://chasep255.github.io/BallisticsToolkit/`

The `.github/workflows/deploy.yml` workflow:
- Installs Emscripten
- Builds the WebAssembly
- Deploys to GitHub Pages

No manual build or deployment needed - just push!

## License

This project is open source. See LICENSE for details.

## Acknowledgments

- G1/G7 drag models from U.S. Army ballistics tables
- Atmospheric model based on ICAO Standard Atmosphere
