export function tryCreateWebGL2Context() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false
  });
  return { canvas, gl };
}


