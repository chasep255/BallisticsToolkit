cmake_minimum_required(VERSION 3.16)
project(web_ui VERSION 1.0.0 LANGUAGES CXX)

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
    
    # Emscripten specific options (linker flags)
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue','stackAlloc','stackSave','stackRestore']")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORTED_FUNCTIONS=['_malloc','_free','_createSimulator','_destroySimulator','_setBullet','_setAtmosphere','_setWind','_calculateTrajectory','_freeTrajectory','_getTrajectoryPoint','_getTrajectoryPointCount']")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s ALLOW_MEMORY_GROWTH=1")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s MODULARIZE=1")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORT_NAME='WebUI'")
    
    # Enable exception handling for WebAssembly
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s DISABLE_EXCEPTION_CATCHING=0")
endif()

# Only build for WebAssembly
if(EMSCRIPTEN)
    # Create WebAssembly executable
    add_executable(web_ui_wasm src/web_ui.cpp)
    target_link_libraries(web_ui_wasm ballistics)
    
    # Copy all files to a clean web directory after build
    add_custom_command(TARGET web_ui_wasm POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_BINARY_DIR}/web
        COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:web_ui_wasm> ${CMAKE_BINARY_DIR}/web/
        COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_CURRENT_BINARY_DIR}/web_ui_wasm.wasm ${CMAKE_BINARY_DIR}/web/
        COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_CURRENT_SOURCE_DIR}/web/index.html ${CMAKE_BINARY_DIR}/web/
        COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_CURRENT_SOURCE_DIR}/web/target_sim.js ${CMAKE_BINARY_DIR}/web/
        COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_CURRENT_SOURCE_DIR}/web/test.html ${CMAKE_BINARY_DIR}/web/
        COMMENT "Copying WebAssembly files to web directory"
    )
endif()
