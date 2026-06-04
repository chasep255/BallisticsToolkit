// range-constants.js - Shared range geometry (yards).
//
// Single source of truth for dimensions that were previously duplicated across
// simulator.js, rendering/flags.js, rendering/windsocks.js and
// rendering/targets.js. Keeping one copy avoids the kind of drift that left a
// stale POLE_THICKNESS (0.15) in the simulator that no longer matched the 0.1
// the flag/sock poles actually render at.

// Flag / windsock poles
export const POLE_HEIGHT = 12; // yards
export const POLE_THICKNESS = 0.1; // yards

// Target frames
export const TARGET_SIZE = 2; // yards - size of target frames
export const TARGET_GAP_ABOVE_PITS = 0.2; // gap between target bottom and pit top when raised
