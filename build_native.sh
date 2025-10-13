#!/bin/bash

# Build native version
set -e

echo "🧹 Cleaning previous build..."
rm -rf build-native

echo "🔨 Building native version..."
mkdir build-native
cd build-native
cmake ..
make -j$(nproc)

echo "📦 Installing..."
make install DESTDIR=.

echo "✅ Native build complete!"
echo "Executable installed to: ./usr/local/bin/ballistic_calc"
