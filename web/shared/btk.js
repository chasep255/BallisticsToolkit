// Canonical BallisticsToolkit (BTK) WebAssembly loader, shared across apps.
//
// Loading starts eagerly at import time and is non-blocking. Consumers either
// `await waitForBTK()` before using BTK, or call `getBTK()` and null-check it.
// The module is also published on `window.btk` for code that reaches it via the
// global (e.g. steel-sim's target modules).
import BallisticsToolkit from '../ballistics_toolkit_wasm.js';

let btk = null;
const btkPromise = BallisticsToolkit().then(module =>
{
  btk = module;
  if (typeof window !== 'undefined')
  {
    window.btk = btk;
  }
  return module;
});

// Resolve once the WASM module is ready.
export async function waitForBTK()
{
  await btkPromise;
  return btk;
}

// Return the module synchronously (null until loading completes).
export function getBTK()
{
  return btk;
}
