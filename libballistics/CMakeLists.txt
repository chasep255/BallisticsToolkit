# Ballistics library - internal component only
add_library(ballistics OBJECT
    src/atmosphere.cpp
    src/trajectory.cpp
    src/simulator.cpp
)

# Set include directories
target_include_directories(ballistics PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# Set target properties
set_target_properties(ballistics PROPERTIES
    CXX_STANDARD_REQUIRED ON
)

# No installation - this is an internal library only

