/**
 * BallisticsToolkit WebAssembly Module Loader
 * 
 * This script dynamically loads the ballistics_wasm.js module and initializes
 * the WebAssembly module, exposing it as window.btk for use by tool pages.
 */

(async function() {
  try {
    // Dynamically import the ES6 module
    const module = await import('./ballistics_toolkit_wasm.js');
    
    // Initialize the WASM module
    const btk = await module.default();
    window.btk = btk;
    console.log('BallisticsToolkit WASM module ready');
    document.dispatchEvent(new Event('btk-ready'));
  } catch (error) {
    console.error('Failed to load BallisticsToolkit WASM module:', error);
    document.dispatchEvent(new Event('btk-error'));
  }
})();
