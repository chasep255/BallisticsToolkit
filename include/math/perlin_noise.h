#pragma once

#include "math/random.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace btk::math
{

  class PerlinNoise
  {
    public:
    PerlinNoise()
    {
      // Build 256-permutation, duplicate to 512 for safe indexing.
      std::array<int, 256> p{};
      for(int i = 0; i < 256; ++i)
        p[i] = i;

      Random::shuffle(p.begin(), p.end());
      for(int i = 0; i < 256; ++i)
      {
        perm_[i] = p[i];
        perm_[i + 256] = p[i];
      }
    }

    // ------------------------------------------------------------
    // Core 1D/2D/3D/4D noise (single-octave, ~[-1,1])
    // ------------------------------------------------------------

    inline float noise1D(float x) const noexcept
    {
      int X = static_cast<int>(std::floor(x)) & 255;
      float xf = x - std::floor(x);
      float u = fade(xf);

      int A = perm_[X];
      int B = perm_[X + 1];

      float g0 = grad1(A, xf);
      float g1 = grad1(B, xf - 1.0f);

      return lerp(g0, g1, u);
    }

    inline float noise2D(float x, float y) const noexcept
    {
      int X = static_cast<int>(std::floor(x)) & 255;
      int Y = static_cast<int>(std::floor(y)) & 255;
      float xf = x - std::floor(x);
      float yf = y - std::floor(y);
      float u = fade(xf);
      float v = fade(yf);

      int A = perm_[X] + Y;
      int B = perm_[X + 1] + Y;

      float x1 = lerp(grad2(perm_[A], xf, yf), grad2(perm_[B], xf - 1, yf), u);
      float x2 = lerp(grad2(perm_[A + 1], xf, yf - 1), grad2(perm_[B + 1], xf - 1, yf - 1), u);
      return lerp(x1, x2, v);
    }

    inline float noise3D(float x, float y, float z) const noexcept
    {
      int X = static_cast<int>(std::floor(x)) & 255;
      int Y = static_cast<int>(std::floor(y)) & 255;
      int Z = static_cast<int>(std::floor(z)) & 255;
      float xf = x - std::floor(x);
      float yf = y - std::floor(y);
      float zf = z - std::floor(z);
      float u = fade(xf);
      float v = fade(yf);
      float w = fade(zf);

      int A = perm_[X] + Y;
      int B = perm_[X + 1] + Y;
      int AA = perm_[A] + Z;
      int AB = perm_[A + 1] + Z;
      int BA = perm_[B] + Z;
      int BB = perm_[B + 1] + Z;

      float x1 = lerp(grad3(perm_[AA], xf, yf, zf), grad3(perm_[BA], xf - 1, yf, zf), u);
      float x2 = lerp(grad3(perm_[AB], xf, yf - 1, zf), grad3(perm_[BB], xf - 1, yf - 1, zf), u);
      float y1 = lerp(x1, x2, v);

      float x3 = lerp(grad3(perm_[AA + 1], xf, yf, zf - 1), grad3(perm_[BA + 1], xf - 1, yf, zf - 1), u);
      float x4 = lerp(grad3(perm_[AB + 1], xf, yf - 1, zf - 1), grad3(perm_[BB + 1], xf - 1, yf - 1, zf - 1), u);
      float y2 = lerp(x3, x4, v);

      return lerp(y1, y2, w);
    }

    inline float noise4D(float x, float y, float z, float w) const noexcept
    {
      int X = static_cast<int>(std::floor(x)) & 255;
      int Y = static_cast<int>(std::floor(y)) & 255;
      int Z = static_cast<int>(std::floor(z)) & 255;
      int W = static_cast<int>(std::floor(w)) & 255;

      float xf = x - std::floor(x);
      float yf = y - std::floor(y);
      float zf = z - std::floor(z);
      float wf = w - std::floor(w);
      float u = fade(xf);
      float v = fade(yf);
      float s = fade(zf);
      float t = fade(wf);

      int A = perm_[X] + Y;
      int B = perm_[X + 1] + Y;
      int AA = perm_[A] + Z;
      int AB = perm_[A + 1] + Z;
      int BA = perm_[B] + Z;
      int BB = perm_[B + 1] + Z;
      int AAA = perm_[AA] + W;
      int AAB = perm_[AA + 1] + W;
      int ABA = perm_[AB] + W;
      int ABB = perm_[AB + 1] + W;
      int BAA = perm_[BA] + W;
      int BAB = perm_[BA + 1] + W;
      int BBA = perm_[BB] + W;
      int BBB = perm_[BB + 1] + W;

      float n0000 = grad4(perm_[AAA], xf, yf, zf, wf);
      float n1000 = grad4(perm_[BAA], xf - 1, yf, zf, wf);
      float n0100 = grad4(perm_[ABA], xf, yf - 1, zf, wf);
      float n1100 = grad4(perm_[BBA], xf - 1, yf - 1, zf, wf);
      float n0010 = grad4(perm_[AAB], xf, yf, zf - 1, wf);
      float n1010 = grad4(perm_[BAB], xf - 1, yf, zf - 1, wf);
      float n0110 = grad4(perm_[ABB], xf, yf - 1, zf - 1, wf);
      float n1110 = grad4(perm_[BBB], xf - 1, yf - 1, zf - 1, wf);

      float x1 = lerp(n0000, n1000, u);
      float x2 = lerp(n0100, n1100, u);
      float x3 = lerp(n0010, n1010, u);
      float x4 = lerp(n0110, n1110, u);
      float y1 = lerp(x1, x2, v);
      float y2 = lerp(x3, x4, v);

      // Time layer (w vs w-1)
      float n0001 = grad4(perm_[AAA + 1], xf, yf, zf, wf - 1);
      float n1001 = grad4(perm_[BAA + 1], xf - 1, yf, zf, wf - 1);
      float n0101 = grad4(perm_[ABA + 1], xf, yf - 1, zf, wf - 1);
      float n1101 = grad4(perm_[BBA + 1], xf - 1, yf - 1, zf, wf - 1);
      float n0011 = grad4(perm_[AAB + 1], xf, yf, zf - 1, wf - 1);
      float n1011 = grad4(perm_[BAB + 1], xf - 1, yf, zf - 1, wf - 1);
      float n0111 = grad4(perm_[ABB + 1], xf, yf - 1, zf - 1, wf - 1);
      float n1111 = grad4(perm_[BBB + 1], xf - 1, yf - 1, zf - 1, wf - 1);

      float x5 = lerp(n0001, n1001, u);
      float x6 = lerp(n0101, n1101, u);
      float x7 = lerp(n0011, n1011, u);
      float x8 = lerp(n0111, n1111, u);
      float y3 = lerp(x5, x6, v);
      float y4 = lerp(x7, x8, v);
      float z1 = lerp(y1, y3, s);
      float z2 = lerp(y2, y4, s);

      return lerp(z1, z2, t);
    }

    private:
    std::array<int, 512> perm_{};

    static inline float fade(float t) noexcept { return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f); }

    static inline float lerp(float a, float b, float t) noexcept { return a + (b - a) * t; }

    static inline float grad1(int h, float x) noexcept { return (h & 1) ? -x : x; }

    static inline float grad2(int h, float x, float y) noexcept
    {
      switch(h & 7)
      {
      case 0: return x + y;
      case 1: return x - y;
      case 2: return -x + y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
      }
    }

    static inline float grad3(int h, float x, float y, float z) noexcept
    {
      static constexpr int g[12][3] = {{1, 1, 0}, {-1, 1, 0}, {1, -1, 0}, {-1, -1, 0}, {1, 0, 1}, {-1, 0, 1}, {1, 0, -1}, {-1, 0, -1}, {0, 1, 1}, {0, -1, 1}, {0, 1, -1}, {0, -1, -1}};
      const int* v = g[h % 12];
      return v[0] * x + v[1] * y + v[2] * z;
    }

    static inline float grad4(int h, float x, float y, float z, float w) noexcept
    {
      static constexpr int g[32][4] = {{0, 1, 1, 1}, {0, 1, 1, -1}, {0, 1, -1, 1}, {0, 1, -1, -1}, {0, -1, 1, 1}, {0, -1, 1, -1}, {0, -1, -1, 1}, {0, -1, -1, -1},
                                       {1, 0, 1, 1}, {1, 0, 1, -1}, {1, 0, -1, 1}, {1, 0, -1, -1}, {-1, 0, 1, 1}, {-1, 0, 1, -1}, {-1, 0, -1, 1}, {-1, 0, -1, -1},
                                       {1, 1, 0, 1}, {1, 1, 0, -1}, {1, -1, 0, 1}, {1, -1, 0, -1}, {-1, 1, 0, 1}, {-1, 1, 0, -1}, {-1, -1, 0, 1}, {-1, -1, 0, -1},
                                       {1, 1, 1, 0}, {1, 1, -1, 0}, {1, -1, 1, 0}, {1, -1, -1, 0}, {-1, 1, 1, 0}, {-1, 1, -1, 0}, {-1, -1, 1, 0}, {-1, -1, -1, 0}};
      const int* v = g[h & 31];
      return v[0] * x + v[1] * y + v[2] * z + v[3] * w;
    }
  };

} // namespace btk::math
