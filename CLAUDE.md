# Ballistics Toolkit — Project Guide

A client-side, long-range shooting calculator and simulation suite. A C++ physics
core is compiled to WebAssembly (Emscripten) via Embind and consumed by a set of
static, vanilla-JS web apps. No backend — everything runs in the browser, and the
site deploys to GitHub Pages.

## The apps (`web/<app>/`)

Each app is self-contained (its own HTML/JS/CSS) and shares the WASM core plus
`common.css`, `common.js`, and `shared/btk.js` (the canonical WASM loader). Apps
are kept separate even where they overlap — e.g. steel-sim is an evolved
fclass-sim; don't try to merge them.

- **ballistic-calc** — trajectory/drop/drift table calculator with atmosphere and stability.
- **load-comp** — compare multiple loads side by side.
- **perf-matrix** — Performance Matrix: trajectory metrics across a parameter grid.
- **target-sim** — Monte Carlo shot dispersion on competitive targets.
- **hit-sim** — animated shot impacts on targets with logging and statistics.
- **wind-sim** — visualizes the curl-noise wind field (vectors, smoke flow).
- **steel-sim** — 3D steel-target range (100–1760 yd): Three.js scene, dual scopes,
  mirage, reactive hanging steel, dust/impact effects.
- **fclass-sim** — F-Class match simulator (300–1000 yd): wind reading via mirage +
  flags, match scoring, and **Remote Play** (host streams the live view to a remote
  player over WebRTC/PeerJS; host-authoritative, no backend).
- **target-gen** — printable target generator (ring editor, print layout).

Top-level pages: `index.html`, `about.html`, `privacy.html`, `terms.html`,
`contact.html`.

## C++ core

- `src/` + `include/` (headers mirror sources; many methods are header-defined/constexpr):
  - `ballistics/` — `Simulator`, `Bullet`, `Trajectory` (trajectory integration).
  - `physics/` — `Atmosphere`, `WindGenerator` (curl-noise field).
  - `math/` — `Vector3D`, `Conversions`, `Quaternion`.
  - `rendering/` — steel-target physics, impact detection.
  - `match/` — match simulation / scoring.
- `src/bindings.cpp` — the Embind layer. **To expose a C++ method to JS, add it
  here.** Embind can't surface two methods under one JS name, so overloads need
  distinct binding names.
- `third_party/glm` — GLM, a git submodule (`git submodule update --init`).

The trajectory model itself: modified point-mass, RK2 integration, drag from the
G1/G7 ballistic coefficient (so diameter/weight don't change drag unless spin is
involved). Optional spin effects (drift + crosswind jump) are based on Litz's
empirical formulas driven by the corrected Miller stability factor. Wind comes
from a 2D curl-noise field (3D Simplex noise) in the sims; calc/target/hit use a
single uniform wind.

## Build, format, deploy

```bash
./build_web.sh        # build WASM core -> build-wasm/web/  (needs emsdk, CMake, Python 3)
./build_web.sh -s     # build, then serve build-wasm/web/ at http://localhost:8001
./format.sh           # format src/ include/ web/ (clang-format + prettier/js-beautify)
```

- **C++ changes require a rebuild** before they appear in the apps (they load the
  prebuilt `ballistics_toolkit_wasm.js`/`.wasm`).
- The compiler runs `-Werror -Wall -Wextra -Wpedantic -O3 -ffast-math` — no unused
  parameters, no warnings.
- **Deploy**: pushing to `master` triggers `.github/workflows/deploy.yml`, which
  builds the WASM (emsdk pinned to 4.0.17) and publishes to GitHub Pages.
- **No automated test suite** — verify behavior by building and exercising the apps.
- Don't commit build output (`build/`, `build-wasm/`), `compile_commands.json`, or
  editor configs (`.clangd`) — all gitignored.

## Conventions

- **SI base units internally**, documented in comments, not parameter-name suffixes:
  temperature K, pressure Pa, velocity m/s, distance m, mass kg, angles radians.
  Exception: barrel **twist is in inches** (`twist_inches_per_turn`) throughout the
  API. Use `math::Conversions` for unit work; don't hardcode conversion factors.
- **Coordinate system**: x = crossrange (+right), y = vertical (+up), z = downrange
  is **negative** (the muzzle fires toward −z).
- **C++ style** (enforced by `format.sh`'s embedded clang-format config): Allman
  braces, 2-space indent, 200-column limit, pointer-left, sorted includes. Web files
  go through prettier/js-beautify. Match the surrounding code's style and comment
  density.
- In the web layer, reference files with markdown links, not backticks.

## Notes

- Keep in-app help, README, about, and the legal pages in sync when features change;
  fix inaccurate docs on sight.
- The F-Class flag is an NRA-regulation shape/size/color — only enhance its
  motion/shading, never its dimensions.
