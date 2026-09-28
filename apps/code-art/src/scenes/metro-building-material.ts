import { ShaderMaterial, Vector4 } from 'three'
import { KIND_COLORS } from '../lib/palette.ts'
import { METRO_GLSL, type MetroUniforms } from './metro-glsl.ts'

/**
 * The buildings' shader. There are no lights in the metro: every building is
 * a dark shell lit from within. Windows are a grid painted from each
 * fragment's place on the facade, each one on or off by a hash, so a million
 * windows cost nothing but pixels. Far off, where the grid would shimmer, it
 * melts into the average glow it would make.
 *
 * Neon runs round each tier's top edge and along the street, in the
 * district's colour. Taller buildings carry a vertical sign of glyphs in the
 * colour of the file's main kind of symbol. fallow's readings turn up as
 * trouble: hotspots burn red and strobe, worn files grime their windows,
 * dead files go dark, blind spots make the neon stutter. Generated files
 * are holograms: scan lines with nothing behind them.
 */

/** Per-instance attributes the buildings carry. */
const VERTEX = /* glsl */ `
  attribute vec3 aTint;
  attribute vec4 aInfo;
  attribute vec4 aHealth;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vSize;
  varying vec3 vTint;
  varying vec4 vInfo;
  varying vec4 vHealth;
  varying float vDepth;
  void main() {
    // The matrix's columns are the axes times the size, so the size is their length.
    vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vLocal = position * vSize;
    vNormal = normal;
    vTint = aTint;
    vInfo = aInfo;
    vHealth = aHealth;
    vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT = /* glsl */ `
  ${METRO_GLSL}
  uniform vec3 uKinds[8];
  uniform vec4 uTiers;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vSize;
  varying vec3 vTint;
  varying vec4 vInfo;
  varying vec4 vHealth;
  varying float vDepth;

  // Glyphs on a sign: a grid of small cells, each lit or not, rolling slowly upward.
  float glyphs(vec2 at, float seed) {
    vec2 cell = floor(at / vec2(0.34, 0.42));
    vec2 f = fract(at / vec2(0.34, 0.42));
    float stroke = step(0.18, f.x) * step(f.x, 0.82) * step(0.15, f.y) * step(f.y, 0.85);
    float row = floor(cell.y / 3.0);
    return stroke * step(0.5, hash21(vec2(cell.x + seed * 31.0, cell.y + floor(uClock * 0.7 + seed * 9.0) * 3.0 + row)));
  }

  void main() {
    float lights = vInfo.x;
    float seed = vInfo.y;
    float flags = vInfo.w;
    float heat = vHealth.x;
    float wear = vHealth.y;
    float dead = vHealth.z;
    float glitch = vHealth.w;
    float H = vSize.y;
    float y = vLocal.y;
    vec3 n = normalize(vNormal);
    bool hologram = mod(flags, 2.0) >= 1.0;
    if (hologram && fract(y * 1.2 - uClock * 0.6) < 0.5) discard;

    // A blind file's neon stutters; a hotspot's pulses red.
    float stutter = step(1.0 - glitch * 0.6, hash11(floor(uClock * 14.0) + seed * 97.0));
    vec3 neon = vTint * (1.0 - dead * 0.9) * (1.0 - stutter * 0.85);
    neon = mix(neon, vec3(1.6, 0.18, 0.1), heat * (0.55 + 0.45 * sin(uClock * 5.0 + seed * 20.0)));

    // A dark shell, a touch lighter up high where the sky's glow reaches it.
    vec3 color = vec3(0.003, 0.003, 0.006) + vTint * 0.004 + vec3(0.006, 0.003, 0.01) * smoothstep(0.0, H, y);
    if (n.y > 0.6) {
      // The roof: a neon rim, and a red light blinking on the tall ones.
      vec2 edge = vSize.xz * 0.5 - abs(vLocal.xz);
      float rim = 1.0 - smoothstep(0.0, 0.3, min(edge.x, edge.y));
      color += neon * rim * 0.9;
      float blink = step(length(vLocal.xz), 0.4) * step(28.0, H) * step(0.55, fract(uClock * 0.6 + seed));
      color += vec3(2.5, 0.15, 0.1) * blink;
    } else {
      vec2 facing = normalize(n.xz + 1e-5);
      // Across the facade, whichever way it faces.
      float u = dot(vLocal.xz, vec2(-facing.y, facing.x));
      float face = floor(atan(facing.y, facing.x) * 1.27 + 0.5);
      // Three facades, by the building's seed: a grid of windows, bands of
      // glass floor by floor, or tall slits.
      float style = floor(fract(seed * 13.7) * 3.0);
      vec2 size = vec2(0.9 + seed * 0.5, 1.5 + fract(seed * 7.0) * 0.6);
      vec4 frame = vec4(0.2, 0.8, 0.3, 0.8);
      if (style == 1.0) { size.x *= 4.0; frame = vec4(0.02, 0.98, 0.35, 0.75); }
      if (style == 2.0) { size.y *= 3.0; frame = vec4(0.35, 0.65, 0.06, 0.94); }
      vec2 g = vec2(u, y) / size;
      vec2 cell = floor(g);
      vec2 f = fract(g);
      float pane = step(frame.x, f.x) * step(f.x, frame.y) * step(frame.z, f.y) * step(f.y, frame.w);
      float on = step(hash21(cell + vec2(face * 13.0, seed * 71.0)), lights * (1.0 - dead)) * step(1.2, y);
      vec3 warm = mix(vec3(1.0, 0.62, 0.3), vec3(0.35, 0.75, 1.0), step(0.6, hash21(cell.yx + seed)));
      warm = mix(warm, vec3(1.0, 0.25, 0.12), heat);
      float grime = 1.0 - wear * 0.75 * hash21(floor(g * 0.5) + 3.0);
      // Up close, a window is brighter at the top, and some have their blinds down.
      float blinds = mix(1.0, 0.35 + 0.65 * step(0.45, fract(f.y * 9.0)), step(0.7, hash21(cell + 5.3)));
      vec3 lit = warm * on * pane * grime * blinds * (0.3 + 0.5 * hash21(cell + 1.7)) * (0.75 + 0.35 * f.y);
      vec3 glow = warm * lights * (1.0 - dead) * grime * 0.16;
      // Past a few pixels a window, the grid gives way to its glow.
      float far = clamp(max(fwidth(g.x), fwidth(g.y)) * 2.0 - 0.5, 0.0, 1.0);
      color += mix(lit, glow, far);

      // Neon under each tier's top edge, and a strip at street level.
      for (int k = 0; k < 4; k++) {
        float level = uTiers[k];
        if (level < 0.0) continue;
        float d = abs(y - (level * H - 0.45));
        color += neon * (1.0 - smoothstep(0.08, 0.2, d)) * 1.5;
      }
      color += neon * (1.0 - smoothstep(0.04, 0.12, abs(y - 0.7))) * 0.9;

      // A tall building's sign, down one face.
      if (H > 16.0 && seed > 0.3 && face == 0.0 && abs(u) < 0.9 && y > H * 0.3 && y < H * 0.85) {
        vec3 ink = uKinds[int(vInfo.z)] * 1.8 * (1.0 - dead) * (1.0 - stutter);
        color = vec3(0.02) + ink * (0.12 + glyphs(vec2(u + 0.9, y), seed));
      }
    }
    if (hologram) color = vTint * 0.9 + vec3(0.3, 0.2, 0.6) * 0.4;
    gl_FragColor = vec4(mix(color, uFog, hazeOf(vDepth)), 1.0);
  }
`

/** Tier tops as shares of the height, per shape, up to four; `-1` for none. */
export const TIERS: readonly Vector4[] = [
  new Vector4(1, -1, -1, -1), // block
  new Vector4(1, 0.5, -1, -1), // tower
  new Vector4(1, 0.8, 0.55, -1), // setback
  new Vector4(1, -1, -1, -1), // spire
  new Vector4(1, 0.75, 0.5, 0.25), // stepped
  new Vector4(1, -1, -1, -1), // pod
]

/** The buildings' material for one shape, sharing the metro's haze and clock. */
export function buildingMaterial(
  shared: MetroUniforms,
  tiers: Vector4,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      uKinds: { value: KIND_COLORS },
      uTiers: { value: tiers },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  })
}
