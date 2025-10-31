#pragma once

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <random>

namespace btk::math
{
  // Global random number generator shared across the library
  // All methods are static - no need to instantiate
  class Random
  {
    public:
    // Initialize with current time (call once at startup, or let it auto-initialize)
    static void seed()
    {
      auto now = std::chrono::high_resolution_clock::now();
      auto nanos = std::chrono::duration_cast<std::chrono::nanoseconds>(now.time_since_epoch()).count();
      rng().seed(static_cast<uint32_t>(nanos));
    }

    // Seed with a specific value
    static void seed(uint32_t value) { rng().seed(value); }

    // Get a random uint32_t
    static uint32_t next() { return rng()(); }

    // Get a random float in [0, 1)
    static float nextFloat()
    {
      std::uniform_real_distribution<float> dist(0.0f, 1.0f);
      return dist(rng());
    }

    // Get a random float in [min, max)
    static float uniform(float min, float max)
    {
      std::uniform_real_distribution<float> dist(min, max);
      return dist(rng());
    }

    // Get a random int in [min, max]
    static int uniformInt(int min, int max)
    {
      std::uniform_int_distribution<int> dist(min, max);
      return dist(rng());
    }

    // Get a random value from normal distribution
    static float normal(float mean = 0.0f, float stddev = 1.0f)
    {
      std::normal_distribution<float> dist(mean, stddev);
      return dist(rng());
    }

    // Shuffle a container
    template <typename Iterator>
    static void shuffle(Iterator first, Iterator last)
    {
      std::shuffle(first, last, rng());
    }

    private:
    // Get the global random generator (initialized on first use)
    static std::mt19937& rng()
    {
      static std::mt19937 generator(initSeed());
      return generator;
    }

    // Initialize seed with current time
    static uint32_t initSeed()
    {
      auto now = std::chrono::high_resolution_clock::now();
      auto nanos = std::chrono::duration_cast<std::chrono::nanoseconds>(now.time_since_epoch()).count();
      return static_cast<uint32_t>(nanos);
    }
  };
} // namespace btk::math
