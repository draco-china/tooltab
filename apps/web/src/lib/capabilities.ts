/** Called after hydration only; importing this module is safe during SSR. */
export function browserCapabilities() {
  if (typeof document === "undefined")
    return {
      canvas: false,
      worker: false,
      wasm: false,
      camera: false,
      eyeDropper: false,
    };
  let canvas = false;
  try {
    canvas = !!document.createElement("canvas").getContext("2d");
  } catch {
    // Some restricted browser environments throw instead of returning null.
  }
  return {
    canvas,
    worker: typeof Worker !== "undefined",
    wasm: typeof WebAssembly !== "undefined",
    camera: !!navigator.mediaDevices?.getUserMedia,
    eyeDropper: "EyeDropper" in window,
  };
}
