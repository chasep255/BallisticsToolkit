cmake_minimum_required(VERSION 3.10)
project(BallisticsToolkitTools)

# C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build type and optimization
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler options
add_compile_options(-Wall -Wextra -Wpedantic)

# Optimization flags for Release builds
if(CMAKE_BUILD_TYPE STREQUAL "Release")
  add_compile_options(-O3 -march=native -ffast-math)
endif()

# Collect all source files from src/ (excluding bindings.cpp which has emscripten)
file(GLOB_RECURSE BALLISTICS_SOURCES "../src/*.cpp")
list(FILTER BALLISTICS_SOURCES EXCLUDE REGEX ".*bindings\\.cpp$")

# Create a static library from the ballistics sources
add_library(ballistics_native STATIC ${BALLISTICS_SOURCES})
target_include_directories(ballistics_native PUBLIC ../include)

# Add the fitting tool executable
add_executable(fit_aero_params fit_aero_params.cpp)
target_link_libraries(fit_aero_params PRIVATE ballistics_native)
target_include_directories(fit_aero_params PRIVATE ../include)
