cmake_minimum_required(VERSION 3.20)

project(PrecisionSim
    VERSION 1.0.0
    DESCRIPTION "A precision ballistics simulation engine with Qt WebAssembly support"
    LANGUAGES CXX
)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Set default build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler-specific options
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    add_compile_options(-Wall -Wextra -Wpedantic -Werror)
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        add_compile_options(-g -O0)
    else()
        add_compile_options(-O3 -DNDEBUG)
    endif()
endif()

# No Qt for now - just pure C++

# Add subdirectories
add_subdirectory(libballistics)

# Add CLI calculator (native builds only)
if(NOT EMSCRIPTEN)
    add_subdirectory(ballistic-calc)
endif()

# Add web interface (WebAssembly builds only)
if(EMSCRIPTEN)
    add_subdirectory(web-ui)
endif()

# Installation
# Install targets (conditional based on build type)
if(NOT EMSCRIPTEN)
    install(TARGETS ballistic-calc
        RUNTIME DESTINATION bin
    )
endif()
