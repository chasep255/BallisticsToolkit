#!/bin/bash

# Build WebAssembly version and optionally start web server for testing
set -e

# Check if Emscripten is available, if not try to source it
if ! command -v emcc &> /dev/null; then
    echo "🔧 Emscripten not found in PATH, attempting to source emsdk_env.sh..."
    # Try common Emscripten installation paths
    EMSDK_PATHS=(
        "$HOME/emsdk/emsdk_env.sh"
        "/opt/emsdk/emsdk_env.sh"
        "/usr/local/emsdk/emsdk_env.sh"
        "./emsdk/emsdk_env.sh"
    )
    
    EMSDK_FOUND=false
    for path in "${EMSDK_PATHS[@]}"; do
        if [ -f "$path" ]; then
            source "$path"
            echo "✅ Emscripten environment sourced from $path"
            EMSDK_FOUND=true
            break
        fi
    done
    
    if [ "$EMSDK_FOUND" = false ]; then
        echo "❌ Emscripten not found. Please:"
        echo "   1. Install Emscripten SDK, or"
        echo "   2. Set up your environment manually, or"
        echo "   3. Set EMSDK environment variable to point to your emsdk directory"
        exit 1
    fi
fi

echo "🔨 Building WebAssembly..."
mkdir -p build-wasm
cd build-wasm

# Use Emscripten's cmake and make wrappers
emcmake cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON ..
emmake make VERBOSE=1 -j$(nproc)

echo ""
echo "✅ Build complete!"
echo "📁 Web files in build-wasm/web/"

# Check if -s flag is provided to start web server
if [[ "$1" == "-s" ]]; then
  echo ""
  echo "🌐 Starting web server on http://localhost:8001"
  cd web
  python3 -m http.server 8001
else
  echo ""
  echo "💡 To start web server, run: $0 -s"
fi
