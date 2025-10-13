# PrecisionSim

A high-performance ballistic simulation library and calculator written in C++ with WebAssembly support.

## Features

- **High-Performance**: Compile-time optimized units system with no virtual functions or dynamic dispatch
- **WebAssembly Support**: Run ballistic calculations directly in web browsers
- **Multiple Interfaces**: CLI calculator, C++ library, and web interface
- **Accurate Physics**: 3DOF ballistics with G1/G7 drag models and atmospheric effects
- **Modern C++**: C++17 with constexpr, CRTP, and template metaprogramming

## Project Structure

```
PrecisionSim/
├── libballistics/          # Core ballistics library
│   ├── include/            # Header files
│   └── src/               # Implementation files
├── ballistic-calc/         # CLI calculator
│   ├── include/
│   └── src/
├── web-ui/                # WebAssembly web interface
│   ├── include/
│   ├── src/
│   └── web/               # HTML/JS interface files
└── build-*/               # Build directories
```

## Building

### Prerequisites

- **C++17 compatible compiler** (GCC 7+, Clang 5+, MSVC 2017+)
- **CMake 3.16+**
- **Emscripten** (for WebAssembly builds)

### Install Emscripten (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install emscripten
```

### Native Build

```bash
# Create build directory
mkdir build-native && cd build-native

# Configure and build
cmake ..
make -j$(nproc)

# Run CLI calculator
./ballistic-calc/ballistic-calc --help
```

### WebAssembly Build

```bash
# Create build directory
mkdir build-wasm && cd build-wasm

# Configure with Emscripten
emcmake cmake ..

# Build and install WebAssembly modules
emmake make -j$(nproc)
emmake make install

# Test web interface (web files are in build-wasm/web/)
cd web
python3 -m http.server 8000
# Open http://localhost:8000 in your browser
```

## Usage

### CLI Calculator

```bash
# Basic trajectory calculation
./ballistic-calc/ballistic-calc \
  --weight 85.5 \
  --drag G7 \
  --zero 100 \
  --scope 2 \
  --bc 0.268 \
  --mv 2750 \
  --step 50 \
  --max-range 1000

# With atmospheric conditions
./ballistic-calc/ballistic-calc \
  --weight 85.5 \
  --drag G7 \
  --zero 100 \
  --scope 2 \
  --bc 0.268 \
  --mv 2750 \
  --temp 59 \
  --pressure 29.92 \
  --humidity 50 \
  --altitude 0 \
  --wind-speed 5 \
  --wind-direction 90
```

### Web Interface

The web interface includes:
- **Web UI WebAssembly module** (`web_ui_wasm.js`, `web_ui_wasm.wasm`)
- **HTML interface** (`index.html`, `test.html`)
- **JavaScript wrapper** (`target_sim.js`)

1. Build the WebAssembly version (see above)
2. Serve the `build-wasm/web/` directory with any HTTP server:

```bash
# Using Python
cd build-wasm/web
python3 -m http.server 8000

# Using Node.js
npx serve build-wasm/web

# Using any web server
# Copy build-wasm/web/ to your web server directory
```

3. Open `http://localhost:8000` in your browser

### C++ Library

```cpp
#include "ballistics.h"

using namespace psim::ballistics;

// Create bullet
Bullet bullet(Weight::grains(85.5), Distance::inches(0.308), 
             Distance::inches(1.2), 0.268, DragFunction::G7);

// Set up atmosphere
Atmosphere atmosphere(Temperature::fahrenheit(59), 
                     Distance::feet(0), 0.5);

// Calculate trajectory
Velocity mv = Velocity::fps(2750);
Distance zero_range = Distance::yards(100);
Distance scope_height = Distance::inches(2);
Time timestep = Time::seconds(0.001);

auto zeroing_result = Simulator::computeZeroedInitialState(
    bullet, mv, scope_height, zero_range, atmosphere, 
    Wind::calm(), timestep);

Trajectory trajectory = Simulator::simulateToDistance(
    zeroing_result.initial_state, Distance::yards(1000), 
    Wind::calm(), atmosphere, timestep);
```

## API Reference

### Core Classes

- **`Bullet`**: Represents bullet physical properties
- **`FlyingBullet`**: Bullet with position, velocity, and spin
- **`Atmosphere`**: Atmospheric conditions (temperature, pressure, humidity, altitude)
- **`Wind`**: Wind conditions with 3D components
- **`Trajectory`**: Collection of trajectory points with interpolation
- **`Simulator`**: Static methods for ballistic calculations

### Units System

The library uses a compile-time optimized units system:

```cpp
// Distance
Distance d = Distance::yards(100);
double yards = d.yards();
double meters = d.meters();

// Velocity
Velocity v = Velocity::fps(2750);
double fps = v.fps();
double mps = v.mps();

// Temperature
Temperature t = Temperature::fahrenheit(59);
double f = t.fahrenheit();
double c = t.celsius();

// And many more: Weight, Pressure, Angle, Time, etc.
```

### Vector3D Types

Generic 3D vectors for any unit type:

```cpp
Position3D pos = Position3D(Distance::yards(100), Distance::yards(0), Distance::yards(0));
Velocity3D vel = Velocity3D(Velocity::fps(2750), Velocity::fps(0), Velocity::fps(0));

// Vector operations
double magnitude = vel.magnitude();
Velocity3D normalized = vel.normalized();
double dot_product = pos.dot(vel);
```

## Performance

- **Compile-time optimization**: All unit conversions are resolved at compile time
- **No virtual functions**: Zero runtime overhead
- **constexpr**: Many calculations can be done at compile time
- **Template metaprogramming**: Type-safe operations with zero runtime cost
- **WebAssembly**: Near-native performance in web browsers

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run the build and tests
5. Submit a pull request

### Code Style

The project uses `clang-format` with custom style rules:

```bash
# Format all files
./format.sh .

# Format specific file
./format.sh src/ballistics.cpp
```

### Building and Testing

```bash
# Native build and test
mkdir build && cd build
cmake ..
make -j$(nproc)
./ballistic-calc/ballistic-calc --help

# WebAssembly build
mkdir build-wasm && cd build-wasm
emcmake cmake ..
emmake make -j$(nproc)
emmake make install DESTDIR=../web-ui
```

## License

[Add your license here]

## Acknowledgments

- Based on the original Python Target-Simulator project
- Uses standard ballistic formulas and drag models
- WebAssembly compilation via Emscripten