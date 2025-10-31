#pragma once

#include "match/target.h"
#include <map>
#include <string>
#include <vector>

namespace btk::match
{

  /**
   * @brief Standard targets for competitive shooting
   *
   * Contains all standard competitive targets with exact ring diameters.
   */
  class Targets
  {
    public:
    /**
     * @brief Get a specific target by name
     *
     * @param name Target name (e.g., "SR", "MR-1", "LR-1")
     * @return Target object
     * @throws std::invalid_argument if target not found
     */
    static btk::match::Target getTarget(const std::string& name);

    /**
     * @brief List all available target names
     *
     * @return Vector of target names
     */
    static std::vector<std::string> listTargets();

    /**
     * @brief Check if a target exists
     *
     * @param name Target name
     * @return True if target exists
     */
    static bool hasTarget(const std::string& name);

    private:
    static std::map<std::string, btk::match::Target> targets_;
    static void initializeTargets();
  };

} // namespace btk::match
