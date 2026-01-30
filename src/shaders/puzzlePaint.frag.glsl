precision highp float;

uniform sampler2D tMask;
uniform vec2 uResolution;
uniform float uTime;
uniform float uThreshold;

in vec2 vUv;
out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  float n = hash12(p);
  return vec2(n, hash12(p + 17.31));
}

mat2 rot(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float stroke(float d, float w) {
  return 1.0 - smoothstep(w, w + 0.002, d);
}

int bitsFromMask(vec3 m) {
  int b = 0;
  if (m.r > uThreshold) b |= 1;
  if (m.g > uThreshold) b |= 2;
  if (m.b > uThreshold) b |= 4;
  return b;
}

// Простые "символы" (руны) из сегментов/круга
float runeSymbol(int id, vec2 p) {
  float w = 0.045;
  float d = 1e6;
  if (id == 0) {
    d = min(d, sdSegment(p, vec2(-0.35, -0.35), vec2(0.35, 0.35)));
    d = min(d, sdSegment(p, vec2(-0.35, 0.35), vec2(0.35, -0.35)));
  } else if (id == 1) {
    d = min(d, sdSegment(p, vec2(0.0, -0.45), vec2(0.0, 0.45)));
    d = min(d, sdSegment(p, vec2(-0.38, 0.0), vec2(0.38, 0.0)));
  } else if (id == 2) {
    d = min(d, abs(sdCircle(p, 0.34)));
    d = min(d, sdSegment(p, vec2(-0.15, -0.35), vec2(0.35, 0.15)));
  } else {
    d = min(d, sdSegment(p, vec2(-0.40, -0.10), vec2(0.40, -0.10)));
    d = min(d, sdSegment(p, vec2(-0.25, 0.25), vec2(0.25, 0.25)));
    d = min(d, sdSegment(p, vec2(-0.25, 0.25), vec2(0.0, -0.10)));
    d = min(d, sdSegment(p, vec2(0.25, 0.25), vec2(0.0, -0.10)));
  }
  return stroke(d, w);
}

vec3 neon(vec3 c, float glow) {
  return c * (0.65 + 1.65 * glow);
}

vec3 paletteBits(int bits) {
  // (оставлено для совместимости; используем bg+акценты ниже)
  return vec3(1.0);
}

vec3 bgBits(int bits) {
  // Твои основные 5 + 2 дополнительных:
  // 1..7 -> 7 отдельных задников, чтобы не сливались с общим фоном.
  if (bits == 1) return vec3(0.0, 53.0, 71.0) / 255.0;   // #003547
  if (bits == 2) return vec3(0.0, 94.0, 84.0) / 255.0;   // #005E54
  if (bits == 3) return vec3(194.0, 187.0, 0.0) / 255.0; // #C2BB00
  if (bits == 4) return vec3(225.0, 82.0, 61.0) / 255.0; // #E1523D
  if (bits == 5) return vec3(237.0, 139.0, 22.0) / 255.0; // #ED8B16
  if (bits == 6) return vec3(61.0, 52.0, 139.0) / 255.0; // #3D348B (доп.)
  return vec3(0.0, 180.0, 216.0) / 255.0;                // #00B4D8 (доп.)
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 accentFromBg(vec3 bg) {
  // На тёмном фоне — светлый неон, на светлом — более тёмный контрастный.
  float lum = luma(bg);
  vec3 light = mix(bg, vec3(1.0), 0.78);
  vec3 dark = mix(bg, vec3(0.02, 0.06, 0.10), 0.72);
  return mix(light, dark, step(0.55, lum));
}

vec3 highlightFromBg(vec3 bg) {
  float lum = luma(bg);
  vec3 hiLight = mix(bg, vec3(1.0), 0.92);
  vec3 hiDark = mix(bg, vec3(0.0), 0.85);
  return mix(hiLight, hiDark, step(0.70, lum));
}

// 7 разных "живых" фонов: символы летят по‑разному
vec3 effectForBits(int bits, vec2 uvN, float t) {
  vec3 bgBase = bgBits(bits);
  vec3 base = accentFromBg(bgBase);
  vec3 hi = highlightFromBg(bgBase);

  // Нормализованный uv (0..1), но "центрируем" для некоторых эффектов
  vec2 uv = uvN;

  // common subtle background shimmer
  float sh = 0.15 + 0.15 * sin(6.28318 * (uv.x * 0.7 + uv.y * 0.9) + t * 0.7);
  vec3 bg = bgBase * (0.78 + 0.12 * sh);

  if (bits == 1) {
    // Диагональный "дождь" рун
    float s = 10.0;
    vec2 gv = fract(uv * s + vec2(t * 0.12, -t * 0.18)) - 0.5;
    vec2 id = floor(uv * s);
    float rnd = hash12(id);
    gv *= rot(6.28318 * rnd + t * 0.25);
    float r = runeSymbol(int(floor(rnd * 4.0)), gv);
    float glow = smoothstep(0.0, 1.0, r);
    return bg + neon(mix(base, hi, 0.35), 0.9 * glow) * r;
  }

  if (bits == 2) {
    // Пузырьки/кольца, всплывают вверх
    float acc = 0.0;
    for (int i = 0; i < 3; i++) {
      vec2 cid = vec2(float(i), 0.0);
      vec2 h = hash22(cid + floor(uv * 6.0));
      vec2 p = fract(uv * 6.0 + vec2(h.x * 2.0, t * (0.10 + 0.07 * h.y))) - 0.5;
      p.x += 0.12 * sin(t * (1.2 + h.x * 2.0) + 6.28318 * h.y);
      float ring = stroke(abs(sdCircle(p, 0.22 + 0.12 * h.x)), 0.02);
      acc += ring;
    }
    float glow = clamp(acc, 0.0, 1.0);
    return bg + neon(mix(base, hi, 0.25), 1.2 * glow) * glow;
  }

  if (bits == 3) {
    // "Matrix" полоски символов, вертикальный скролл
    vec2 uv2 = uv;
    uv2.x *= 1.6;
    float colId = floor(uv2.x * 20.0);
    float rnd = hash12(vec2(colId, 1.0));
    float speed = 0.15 + 0.55 * rnd;
    float y = fract(uv2.y * 2.0 + t * speed + rnd);
    float head = smoothstep(0.0, 0.15, y) * (1.0 - smoothstep(0.15, 0.35, y));
    float tail = smoothstep(0.15, 1.0, y);
    float cell = floor(uv2.y * 18.0 + t * speed * 18.0);
    float sym = step(0.55, hash12(vec2(colId, cell)));
    float stripe = sym * (0.25 * tail + 0.95 * head);
    return bg + neon(mix(base, hi, 0.15), stripe) * stripe;
  }

  if (bits == 4) {
    // Орбиты: крестики вращаются вокруг "точек"
    float s = 7.0;
    vec2 id = floor(uv * s);
    vec2 gv = fract(uv * s) - 0.5;
    vec2 h = hash22(id);
    float a = t * (0.8 + 1.8 * h.x);
    gv += 0.18 * vec2(cos(a + 6.28318 * h.y), sin(a + 6.28318 * h.y));
    gv *= rot(a * 0.7);
    float r = runeSymbol(1, gv); // plus
    float glow = r * (0.6 + 0.4 * sin(t * 1.7 + 6.28318 * h.x));
    return bg + neon(mix(base, hi, 0.25), 1.1 * glow) * r;
  }

  if (bits == 5) {
    // "Ноты": кружок + ножка, летят волной
    float s = 8.0;
    vec2 id = floor(uv * s);
    vec2 gv = fract(uv * s + vec2(0.0, t * 0.22)) - 0.5;
    vec2 h = hash22(id);
    gv.x += 0.25 * sin(t * (0.9 + h.x * 2.0) + 6.28318 * h.y);
    gv *= rot(0.6 * sin(t * 0.6 + h.x * 6.0));
    float head = stroke(abs(sdCircle(gv + vec2(-0.10, 0.10), 0.18)), 0.02);
    float stem = stroke(sdSegment(gv, vec2(0.10, 0.32), vec2(0.10, -0.35)), 0.04);
    float note = clamp(head + stem, 0.0, 1.0);
    float glow = note * (0.75 + 0.25 * sin(t * 2.0 + h.x * 10.0));
    return bg + neon(mix(base, hi, 0.28), 1.0 * glow) * note;
  }

  if (bits == 6) {
    // "Созвездия": точки и иногда линии
    float s = 6.0;
    vec2 id = floor(uv * s);
    vec2 gv = fract(uv * s) - 0.5;
    vec2 h = hash22(id);
    vec2 p = (h - 0.5) * 0.7;
    p += 0.12 * vec2(sin(t * (0.7 + h.x)), cos(t * (0.9 + h.y)));
    float star = stroke(abs(sdCircle(gv - p, 0.06 + 0.03 * h.x)), 0.01);
    float line = 0.0;
    if (h.x > 0.55) {
      vec2 p2 = (hash22(id + 3.7) - 0.5) * 0.7;
      line = stroke(sdSegment(gv, p, p2), 0.02);
    }
    float acc = clamp(star + 0.55 * line, 0.0, 1.0);
    return bg + neon(mix(base, hi, 0.35), 1.35 * acc) * acc;
  }

  // bits == 7
  {
    // "Спиральные руны": вращающиеся кресты/иксы в вихре
    vec2 c = uv - 0.5;
    float r = length(c);
    float ang = atan(c.y, c.x);
    float swirl = ang + 2.4 * r - t * 0.9;
    vec2 uvS = vec2(cos(swirl), sin(swirl)) * (0.6 + 1.2 * r) + 0.5;
    float s = 9.0;
    vec2 id = floor(uvS * s);
    vec2 gv = fract(uvS * s) - 0.5;
    float rnd = hash12(id);
    gv *= rot(t * (0.6 + 1.2 * rnd) + 6.28318 * rnd);
    float sym = runeSymbol(rnd > 0.5 ? 0 : 1, gv);
    float fog = smoothstep(0.9, 0.2, r);
    float acc = sym * fog;
    return bg + neon(mix(base, hi, 0.35), 1.6 * acc) * acc;
  }
}

void main() {
  vec2 uvMask = gl_FragCoord.xy / uResolution;
  vec3 m = texture(tMask, uvMask).rgb;
  float a = clamp(max(m.r, max(m.g, m.b)), 0.0, 1.0);
  int bits = bitsFromMask(m);
  if (bits == 0 || a <= 0.0005) {
    outColor = vec4(0.0);
    return;
  }

  vec2 uvN = gl_FragCoord.xy / uResolution;
  vec3 col = effectForBits(bits, uvN, uTime);
  outColor = vec4(col, a);
}


