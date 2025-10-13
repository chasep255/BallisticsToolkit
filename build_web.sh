#!/bin/bash

# Build WebAssembly version and start web server for testing
set -e

echo "🧹 Cleaning previous build..."
rm -rf build-wasm

echo "🔨 Building WebAssembly..."
mkdir build-wasm
cd build-wasm
emcmake cmake ..
emmake make -j$(nproc)

echo "📁 Web files ready in build-wasm/web/"
echo "🌐 Starting web server on port 8001..."
echo "Open http://localhost:8001/index.html in your browser"
cd web
python3 -m http.server 8001
