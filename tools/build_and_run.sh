#!/bin/bash

# Build the native fitting tool
cd "$(dirname "$0")"

# Create build directory
mkdir -p build
cd build

# Configure and build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build .

echo ""
echo "Running fit_aero_params..."
./fit_aero_params
