cmake_minimum_required(VERSION 3.16)
project(BallisticsToolkit VERSION 1.0.0 LANGUAGES CXX)

# C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler options
add_compile_options(-Wall -Wextra -Wpedantic -Werror -O3 -ffast-math)

# WebAssembly linker flags for embind
set(CMAKE_EXECUTABLE_SUFFIX ".js")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue','stackAlloc','stackSave','stackRestore']")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORTED_FUNCTIONS=['_malloc','_free']")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s ALLOW_MEMORY_GROWTH=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s MODULARIZE=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORT_NAME='BallisticsToolkit'")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORT_ES6=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s SINGLE_FILE=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s DISABLE_EXCEPTION_CATCHING=0")
# WebGL support - using OpenGL ES 3.0 via Emscripten
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s USE_WEBGL2=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s FULL_ES3=1")

# WebAssembly executable with embind
file(GLOB_RECURSE SOURCES "src/*.cpp")
add_executable(ballistics_toolkit_wasm ${SOURCES})

# Link embind library
target_link_libraries(ballistics_toolkit_wasm embind)

# Include directories
target_include_directories(ballistics_toolkit_wasm PRIVATE 
  include
)


# Copy web files to build/web directory
# Create a custom target for web files that always runs
add_custom_target(copy_web_files ALL
    COMMAND ${CMAKE_COMMAND} -E copy_directory ${CMAKE_CURRENT_SOURCE_DIR}/web ${CMAKE_BINARY_DIR}/web
    COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:ballistics_toolkit_wasm> ${CMAKE_BINARY_DIR}/web/
    COMMENT "Copying web files and WebAssembly"
    DEPENDS ballistics_toolkit_wasm
)
