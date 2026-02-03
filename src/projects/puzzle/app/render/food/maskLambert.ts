import * as THREE from "three";

export function patchLambertForMask(opts: {
  material: THREE.MeshLambertMaterial;
  tMask: THREE.Texture;
  bits: number;
  threshold: number;
  uResolution: THREE.Vector2;
}): void {
  const mat = opts.material;
  mat.toneMapped = false;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tMask = { value: opts.tMask };
    shader.uniforms.uResolution = { value: opts.uResolution };
    shader.uniforms.uBits = { value: opts.bits };
    shader.uniforms.uThreshold = { value: opts.threshold };

    shader.fragmentShader =
      `
      uniform sampler2D tMask;
      uniform vec2 uResolution;
      uniform float uBits;
      uniform float uThreshold;
      #if __VERSION__ >= 300
        #define TEX texture
      #else
        #define TEX texture2D
      #endif
      float bitsFromMask(vec3 m) {
        float br = step(uThreshold, m.r);
        float bg = step(uThreshold, m.g);
        float bb = step(uThreshold, m.b);
        return br + 2.0 * bg + 4.0 * bb;
      }
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `
      void main() {
        vec2 uvMask = gl_FragCoord.xy / uResolution;
        vec3 m = TEX(tMask, uvMask).rgb;
        float bits = bitsFromMask(m);
        if (abs(bits - uBits) > 0.1) discard;
      `
    );
  };

  mat.needsUpdate = true;
}

