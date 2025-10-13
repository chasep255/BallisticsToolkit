cmake_minimum_required(VERSION 3.16)
project(BallisticsToolkit VERSION 1.0.0 LANGUAGES CXX)

# C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Compiler options
add_compile_options(-Wall -Wextra -Wpedantic -Werror)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# WebAssembly linker flags
set(CMAKE_EXECUTABLE_SUFFIX ".js")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue','stackAlloc','stackSave','stackRestore']")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORTED_FUNCTIONS=['_malloc','_free','_ballistics_calc_create','_ballistics_calc_destroy','_ballistics_calc_set_bullet','_ballistics_calc_set_atmosphere','_ballistics_calc_set_wind','_ballistics_calc_calculate_trajectory','_ballistics_calc_free_trajectory','_ballistics_calc_get_trajectory_point','_ballistics_calc_get_trajectory_point_count']")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s ALLOW_MEMORY_GROWTH=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s MODULARIZE=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORT_NAME='WebUI'")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s DISABLE_EXCEPTION_CATCHING=0")

# WebAssembly executable
add_executable(ballistics_wasm
    src/atmosphere.cpp
    src/trajectory.cpp
    src/simulator.cpp
    src/ballistics_calc.cpp
)

target_include_directories(ballistics_wasm PRIVATE include)

# Copy web files to build/web directory
add_custom_command(TARGET ballistics_wasm POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory ${CMAKE_CURRENT_SOURCE_DIR}/web ${CMAKE_BINARY_DIR}/web
    COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:ballistics_wasm> ${CMAKE_BINARY_DIR}/web/
    COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_CURRENT_BINARY_DIR}/ballistics_wasm.wasm ${CMAKE_BINARY_DIR}/web/
    COMMENT "Copying web files and WebAssembly"
)
