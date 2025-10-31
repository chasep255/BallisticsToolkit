// BTK WebAssembly module loader
// This module handles loading and exposing the BTK WebAssembly module

let btk = null;

export async function waitForBTK()
{
  if (btk)
  {
    return btk;
  }

  // Wait for BTK to be available on window
  return new Promise((resolve) =>
  {
    const checkBTK = () =>
    {
      if (window.btk)
      {
        btk = window.btk;
        resolve(btk);
      }
      else
      {
        setTimeout(checkBTK, 100);
      }
    };
    checkBTK();
  });
}

export
{
  btk
};