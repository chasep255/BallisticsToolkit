#pragma once

#include "math/random.h"
#include <algorithm>
#include <array>
#include <cmath>

namespace btk::math
{
  class SimplexNoise
  {
    public:
    SimplexNoise()
    {
      std::array<int, 256> p{};
      for(int i = 0; i < 256; ++i)
        p[i] = i;
      Random::shuffle(p.begin(), p.end());
      for(int i = 0; i < 256; ++i)
      {
        perm_[i] = p[i];
        perm_[i + 256] = p[i];
      }

      // Generate random offsets to avoid zeros at integer coordinates
      offset_x_ = Random::uniform(0.0f, 1000.0f);
      offset_y_ = Random::uniform(0.0f, 1000.0f);
      offset_z_ = Random::uniform(0.0f, 1000.0f);
      offset_w_ = Random::uniform(0.0f, 1000.0f);
    }

    // Core noise functions (return ~[-1, 1])
    inline float noise1D(float x) const noexcept
    {
      x += offset_x_;
      int i0 = fastfloor(x);
      float x0 = x - i0;
      float x1 = x0 - 1.0f;

      i0 &= 255;
      int i1 = (i0 + 1) & 255;

      float t0 = 1.0f - x0 * x0;
      float n0 = 0.0f;
      if(t0 >= 0.0f)
      {
        t0 *= t0;
        n0 = t0 * t0 * dot1(grad1_[perm_[i0] & 1], x0);
      }

      float t1 = 1.0f - x1 * x1;
      float n1 = 0.0f;
      if(t1 >= 0.0f)
      {
        t1 *= t1;
        n1 = t1 * t1 * dot1(grad1_[perm_[i1] & 1], x1);
      }

      return 0.395f * (n0 + n1);
    }

    inline float noise2D(float x, float y) const noexcept
    {
      x += offset_x_;
      y += offset_y_;
      const float F2 = 0.5f * (std::sqrt(3.0f) - 1.0f);
      const float G2 = (3.0f - std::sqrt(3.0f)) / 6.0f;

      float s = (x + y) * F2;
      int i = fastfloor(x + s);
      int j = fastfloor(y + s);

      float t = (i + j) * G2;
      float x0 = x - (i - t);
      float y0 = y - (j - t);

      int i1, j1;
      if(x0 > y0)
      {
        i1 = 1;
        j1 = 0;
      }
      else
      {
        i1 = 0;
        j1 = 1;
      }

      float x1 = x0 - i1 + G2;
      float y1 = y0 - j1 + G2;
      float x2 = x0 - 1.0f + 2.0f * G2;
      float y2 = y0 - 1.0f + 2.0f * G2;

      i &= 255;
      j &= 255;

      int gi0 = perm_[i + perm_[j]] % 8;
      int gi1 = perm_[i + i1 + perm_[j + j1]] % 8;
      int gi2 = perm_[i + 1 + perm_[j + 1]] % 8;

      float t0 = 0.5f - x0 * x0 - y0 * y0;
      float n0 = 0.0f;
      if(t0 >= 0.0f)
      {
        t0 *= t0;
        n0 = t0 * t0 * dot2(grad2_[gi0], x0, y0);
      }

      float t1 = 0.5f - x1 * x1 - y1 * y1;
      float n1 = 0.0f;
      if(t1 >= 0.0f)
      {
        t1 *= t1;
        n1 = t1 * t1 * dot2(grad2_[gi1], x1, y1);
      }

      float t2 = 0.5f - x2 * x2 - y2 * y2;
      float n2 = 0.0f;
      if(t2 >= 0.0f)
      {
        t2 *= t2;
        n2 = t2 * t2 * dot2(grad2_[gi2], x2, y2);
      }

      return 70.0f * (n0 + n1 + n2);
    }

    inline float noise3D(float x, float y, float z) const noexcept
    {
      x += offset_x_;
      y += offset_y_;
      z += offset_z_;
      const float F3 = 1.0f / 3.0f;
      const float G3 = 1.0f / 6.0f;

      float s = (x + y + z) * F3;
      int i = fastfloor(x + s);
      int j = fastfloor(y + s);
      int k = fastfloor(z + s);

      float t = (i + j + k) * G3;
      float x0 = x - (i - t);
      float y0 = y - (j - t);
      float z0 = z - (k - t);

      int i1, j1, k1;
      int i2, j2, k2;

      if(x0 >= y0)
      {
        if(y0 >= z0)
        {
          i1 = 1;
          j1 = 0;
          k1 = 0;
          i2 = 1;
          j2 = 1;
          k2 = 0;
        }
        else if(x0 >= z0)
        {
          i1 = 1;
          j1 = 0;
          k1 = 0;
          i2 = 1;
          j2 = 0;
          k2 = 1;
        }
        else
        {
          i1 = 0;
          j1 = 0;
          k1 = 1;
          i2 = 1;
          j2 = 0;
          k2 = 1;
        }
      }
      else
      {
        if(y0 < z0)
        {
          i1 = 0;
          j1 = 0;
          k1 = 1;
          i2 = 0;
          j2 = 1;
          k2 = 1;
        }
        else if(x0 < z0)
        {
          i1 = 0;
          j1 = 1;
          k1 = 0;
          i2 = 0;
          j2 = 1;
          k2 = 1;
        }
        else
        {
          i1 = 0;
          j1 = 1;
          k1 = 0;
          i2 = 1;
          j2 = 1;
          k2 = 0;
        }
      }

      float x1 = x0 - i1 + G3;
      float y1 = y0 - j1 + G3;
      float z1 = z0 - k1 + G3;
      float x2 = x0 - i2 + 2.0f * G3;
      float y2 = y0 - j2 + 2.0f * G3;
      float z2 = z0 - k2 + 2.0f * G3;
      float x3 = x0 - 1.0f + 3.0f * G3;
      float y3 = y0 - 1.0f + 3.0f * G3;
      float z3 = z0 - 1.0f + 3.0f * G3;

      i &= 255;
      j &= 255;
      k &= 255;

      int gi0 = perm_[i + perm_[j + perm_[k]]] % 12;
      int gi1 = perm_[i + i1 + perm_[j + j1 + perm_[k + k1]]] % 12;
      int gi2 = perm_[i + i2 + perm_[j + j2 + perm_[k + k2]]] % 12;
      int gi3 = perm_[i + 1 + perm_[j + 1 + perm_[k + 1]]] % 12;

      float t0 = 0.6f - x0 * x0 - y0 * y0 - z0 * z0;
      float n0 = 0.0f;
      if(t0 >= 0.0f)
      {
        t0 *= t0;
        n0 = t0 * t0 * dot3(grad3_[gi0], x0, y0, z0);
      }

      float t1 = 0.6f - x1 * x1 - y1 * y1 - z1 * z1;
      float n1 = 0.0f;
      if(t1 >= 0.0f)
      {
        t1 *= t1;
        n1 = t1 * t1 * dot3(grad3_[gi1], x1, y1, z1);
      }

      float t2 = 0.6f - x2 * x2 - y2 * y2 - z2 * z2;
      float n2 = 0.0f;
      if(t2 >= 0.0f)
      {
        t2 *= t2;
        n2 = t2 * t2 * dot3(grad3_[gi2], x2, y2, z2);
      }

      float t3 = 0.6f - x3 * x3 - y3 * y3 - z3 * z3;
      float n3 = 0.0f;
      if(t3 >= 0.0f)
      {
        t3 *= t3;
        n3 = t3 * t3 * dot3(grad3_[gi3], x3, y3, z3);
      }

      return 32.0f * (n0 + n1 + n2 + n3);
    }

    inline float noise4D(float x, float y, float z, float w) const noexcept
    {
      x += offset_x_;
      y += offset_y_;
      z += offset_z_;
      w += offset_w_;
      const float F4 = (std::sqrt(5.0f) - 1.0f) / 4.0f;
      const float G4 = (5.0f - std::sqrt(5.0f)) / 20.0f;

      float s = (x + y + z + w) * F4;
      int i = fastfloor(x + s);
      int j = fastfloor(y + s);
      int k = fastfloor(z + s);
      int l = fastfloor(w + s);

      float t = (i + j + k + l) * G4;
      float x0 = x - (i - t);
      float y0 = y - (j - t);
      float z0 = z - (k - t);
      float w0 = w - (l - t);

      int c = (x0 > y0) ? 32 : 0;
      c += (x0 > z0) ? 16 : 0;
      c += (y0 > z0) ? 8 : 0;
      c += (x0 > w0) ? 4 : 0;
      c += (y0 > w0) ? 2 : 0;
      c += (z0 > w0) ? 1 : 0;

      int i1, j1, k1, l1;
      int i2, j2, k2, l2;
      int i3, j3, k3, l3;

      if(simplex[c][0] >= 3)
        i1 = 1;
      else
        i1 = 0;
      if(simplex[c][1] >= 3)
        j1 = 1;
      else
        j1 = 0;
      if(simplex[c][2] >= 3)
        k1 = 1;
      else
        k1 = 0;
      if(simplex[c][3] >= 3)
        l1 = 1;
      else
        l1 = 0;

      if(simplex[c][0] >= 2)
        i2 = 1;
      else
        i2 = 0;
      if(simplex[c][1] >= 2)
        j2 = 1;
      else
        j2 = 0;
      if(simplex[c][2] >= 2)
        k2 = 1;
      else
        k2 = 0;
      if(simplex[c][3] >= 2)
        l2 = 1;
      else
        l2 = 0;

      if(simplex[c][0] >= 1)
        i3 = 1;
      else
        i3 = 0;
      if(simplex[c][1] >= 1)
        j3 = 1;
      else
        j3 = 0;
      if(simplex[c][2] >= 1)
        k3 = 1;
      else
        k3 = 0;
      if(simplex[c][3] >= 1)
        l3 = 1;
      else
        l3 = 0;

      float x1 = x0 - i1 + G4;
      float y1 = y0 - j1 + G4;
      float z1 = z0 - k1 + G4;
      float w1 = w0 - l1 + G4;
      float x2 = x0 - i2 + 2.0f * G4;
      float y2 = y0 - j2 + 2.0f * G4;
      float z2 = z0 - k2 + 2.0f * G4;
      float w2 = w0 - l2 + 2.0f * G4;
      float x3 = x0 - i3 + 3.0f * G4;
      float y3 = y0 - j3 + 3.0f * G4;
      float z3 = z0 - k3 + 3.0f * G4;
      float w3 = w0 - l3 + 3.0f * G4;
      float x4 = x0 - 1.0f + 4.0f * G4;
      float y4 = y0 - 1.0f + 4.0f * G4;
      float z4 = z0 - 1.0f + 4.0f * G4;
      float w4 = w0 - 1.0f + 4.0f * G4;

      i &= 255;
      j &= 255;
      k &= 255;
      l &= 255;

      int gi0 = perm_[i + perm_[j + perm_[k + perm_[l]]]] % 32;
      int gi1 = perm_[i + i1 + perm_[j + j1 + perm_[k + k1 + perm_[l + l1]]]] % 32;
      int gi2 = perm_[i + i2 + perm_[j + j2 + perm_[k + k2 + perm_[l + l2]]]] % 32;
      int gi3 = perm_[i + i3 + perm_[j + j3 + perm_[k + k3 + perm_[l + l3]]]] % 32;
      int gi4 = perm_[i + 1 + perm_[j + 1 + perm_[k + 1 + perm_[l + 1]]]] % 32;

      float t0 = 0.6f - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
      float n0 = 0.0f;
      if(t0 >= 0.0f)
      {
        t0 *= t0;
        n0 = t0 * t0 * dot4(grad4_[gi0], x0, y0, z0, w0);
      }

      float t1 = 0.6f - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
      float n1 = 0.0f;
      if(t1 >= 0.0f)
      {
        t1 *= t1;
        n1 = t1 * t1 * dot4(grad4_[gi1], x1, y1, z1, w1);
      }

      float t2 = 0.6f - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
      float n2 = 0.0f;
      if(t2 >= 0.0f)
      {
        t2 *= t2;
        n2 = t2 * t2 * dot4(grad4_[gi2], x2, y2, z2, w2);
      }

      float t3 = 0.6f - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
      float n3 = 0.0f;
      if(t3 >= 0.0f)
      {
        t3 *= t3;
        n3 = t3 * t3 * dot4(grad4_[gi3], x3, y3, z3, w3);
      }

      float t4 = 0.6f - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
      float n4 = 0.0f;
      if(t4 >= 0.0f)
      {
        t4 *= t4;
        n4 = t4 * t4 * dot4(grad4_[gi4], x4, y4, z4, w4);
      }

      return 27.0f * (n0 + n1 + n2 + n3 + n4);
    }

    private:
    std::array<int, 512> perm_;

    // Random offsets to avoid zeros at integer coordinates
    float offset_x_ = 0.0f;
    float offset_y_ = 0.0f;
    float offset_z_ = 0.0f;
    float offset_w_ = 0.0f;

    // Simplex gradient tables - each dimension has its own optimized table

    // 1D: Simple ±1 gradients
    static constexpr int grad1_[2] = {-1, 1};

    // 2D: 8 gradients pointing to midpoints of square edges
    static constexpr int grad2_[8][2] = {{1, 1}, {-1, 1}, {1, -1}, {-1, -1}, {1, 0}, {-1, 0}, {0, 1}, {0, -1}};

    // 3D: 12 gradients pointing to midpoints of cube edges
    static constexpr int grad3_[12][3] = {{1, 1, 0}, {-1, 1, 0}, {1, -1, 0}, {-1, -1, 0}, {1, 0, 1}, {-1, 0, 1}, {1, 0, -1}, {-1, 0, -1}, {0, 1, 1}, {0, -1, 1}, {0, 1, -1}, {0, -1, -1}};

    // 4D: 32 gradients pointing to midpoints of 4-cube edges
    static constexpr int grad4_[32][4] = {{0, 1, 1, 1}, {0, 1, 1, -1}, {0, 1, -1, 1}, {0, 1, -1, -1}, {0, -1, 1, 1}, {0, -1, 1, -1}, {0, -1, -1, 1}, {0, -1, -1, -1},
                                          {1, 0, 1, 1}, {1, 0, 1, -1}, {1, 0, -1, 1}, {1, 0, -1, -1}, {-1, 0, 1, 1}, {-1, 0, 1, -1}, {-1, 0, -1, 1}, {-1, 0, -1, -1},
                                          {1, 1, 0, 1}, {1, 1, 0, -1}, {1, -1, 0, 1}, {1, -1, 0, -1}, {-1, 1, 0, 1}, {-1, 1, 0, -1}, {-1, -1, 0, 1}, {-1, -1, 0, -1},
                                          {1, 1, 1, 0}, {1, 1, -1, 0}, {1, -1, 1, 0}, {1, -1, -1, 0}, {-1, 1, 1, 0}, {-1, 1, -1, 0}, {-1, -1, 1, 0}, {-1, -1, -1, 0}};

    // 4D simplex lookup table - defines vertex traversal order for each of 64 possible orderings
    static constexpr int simplex[64][4] = {{0, 1, 2, 3}, {0, 1, 3, 2}, {0, 0, 0, 0}, {0, 2, 3, 1}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {1, 2, 3, 0}, {0, 2, 1, 3}, {0, 0, 0, 0}, {0, 3, 1, 2},
                                           {0, 3, 2, 1}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {1, 3, 2, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0},
                                           {0, 0, 0, 0}, {0, 0, 0, 0}, {1, 2, 0, 3}, {0, 0, 0, 0}, {1, 3, 0, 2}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {2, 3, 0, 1}, {2, 3, 1, 0}, {1, 0, 2, 3},
                                           {1, 0, 3, 2}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {2, 0, 3, 1}, {0, 0, 0, 0}, {2, 1, 3, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0},
                                           {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {2, 0, 1, 3}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {3, 0, 1, 2}, {3, 0, 2, 1}, {0, 0, 0, 0},
                                           {3, 1, 2, 0}, {2, 1, 0, 3}, {0, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}, {3, 1, 0, 2}, {0, 0, 0, 0}, {3, 2, 0, 1}, {3, 2, 1, 0}};

    static inline int fastfloor(float x) noexcept { return x > 0 ? static_cast<int>(x) : static_cast<int>(x) - 1; }

    static inline float dot1(int g, float x) noexcept { return g * x; }

    static inline float dot2(const int* g, float x, float y) noexcept { return g[0] * x + g[1] * y; }

    static inline float dot3(const int* g, float x, float y, float z) noexcept { return g[0] * x + g[1] * y + g[2] * z; }

    static inline float dot4(const int* g, float x, float y, float z, float w) noexcept { return g[0] * x + g[1] * y + g[2] * z + g[3] * w; }
  };
} // namespace btk::math
