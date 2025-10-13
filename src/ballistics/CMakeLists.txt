# Ballistics library
add_library(ballistics STATIC
    atmosphere.cpp
    trajectory.cpp
    simulator.cpp
)

target_include_directories(ballistics PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/../../include/ballistics
)

# No external dependencies for now

# Set target properties (inherits C++ standard from parent)
set_target_properties(ballistics PROPERTIES
    CXX_STANDARD_REQUIRED ON
)

# Install headers
install(DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../../include/ballistics/
    DESTINATION include/ballistics
    FILES_MATCHING PATTERN "*.h"
)
