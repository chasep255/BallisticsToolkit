# Third-Party Notices

This project includes or references third‑party software. The following notices are provided for attribution and license compliance.

## Three.js
- Project: three.js (used via unpkg CDN)
- Version: 0.160.0 (wind-gen, fclass-sim) and 0.180.0 (steel-sim)
- License: MIT
- Website: https://threejs.org/
- Source: https://github.com/mrdoob/three.js
- CDN: https://unpkg.com/three@0.160.0/ and https://unpkg.com/three@0.180.0/

## PeerJS
- Project: PeerJS (WebRTC peer-to-peer connections; used for F-Class Remote Play)
- Version: 1.5.4
- License: MIT
- Website: https://peerjs.com/
- Source: https://github.com/peers/peerjs
- CDN: https://esm.sh/peerjs@1.5.4

## KaTeX
- Project: KaTeX (math typesetting; used on the How It Works page)
- Version: 0.16.9
- License: MIT
- Website: https://katex.org/
- Source: https://github.com/KaTeX/KaTeX
- CDN: https://cdn.jsdelivr.net/npm/katex@0.16.9/

## Referenced network services (Remote Play)
- PeerJS broker (signaling): the PeerJS library's default PeerServer Cloud is used to negotiate peer connections. Operated by the PeerJS project; not bundled with this software.
- Google public STUN servers (NAT traversal): stun:stun.l.google.com:19302 and stun1–stun3.l.google.com:19302. Operated by Google; referenced for connectivity only.
- WebRTC media/data transport is provided by the user's browser (a W3C/IETF standard); no third-party software is bundled for it.

## WebGL Noise (Simplex/Perlin)
- Authors: Stefan Gustavson; Ashima Arts (Ian McEwan et al.)
- License: MIT
- Source: https://github.com/stegu/webgl-noise and https://github.com/ashima/webgl-noise
- Usage: GLSL simplex noise functions used in shaders.

## Emscripten / LLVM Toolchain
- Project: Emscripten SDK (build toolchain)
- Licenses: Various (MIT/LLVM)
- Website: https://emscripten.org/

If you believe an attribution is missing or incorrect, please open an issue in the repository.
