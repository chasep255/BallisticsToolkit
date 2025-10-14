#!/bin/bash

# Build WebAssembly version and start web server for testing
set -e

echo "🔨 Building WebAssembly..."
mkdir -p build-wasm
cd build-wasm
emcmake cmake ..
emmake make -j$(nproc)

echo ""
echo "✅ Build complete!"
echo "📁 Web files in build-wasm/web/"
echo ""
echo "🌐 Starting web server on http://localhost:8001"
cd web
python3 -m http.server 8001
