cmake_minimum_required(VERSION 3.16)
project(target_sim VERSION 1.0.0 LANGUAGES CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Compiler options
add_compile_options(-Wall -Wextra -Wpedantic -Werror)

# Include directories
include_directories(include)
include_directories(../libballistics/include)

# WebAssembly specific settings
if(EMSCRIPTEN)
    # WebAssembly build
    set(CMAKE_EXECUTABLE_SUFFIX ".js")
    
    # Emscripten specific options
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s EXPORTED_FUNCTIONS=['_malloc','_free']")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s ALLOW_MEMORY_GROWTH=1")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s MODULARIZE=1")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s EXPORT_NAME='TargetSim'")
    
    # Enable exception handling for WebAssembly
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s DISABLE_EXCEPTION_CATCHING=0")
    
    # Create the WebAssembly module
    add_executable(target_sim_wasm src/target_sim.cpp)
    target_link_libraries(target_sim_wasm ballistics)
    
    # Set output name
    set_target_properties(target_sim_wasm PROPERTIES OUTPUT_NAME "target_sim")
    
    # Install WebAssembly target
    install(TARGETS target_sim_wasm DESTINATION bin)
    
else()
    # Native build for testing
    add_executable(target_sim_native src/target_sim.cpp)
    target_link_libraries(target_sim_native ballistics)
    
    # Install native target
    install(TARGETS target_sim_native DESTINATION bin)
endif()
