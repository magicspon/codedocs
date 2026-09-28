import { CanvasTexture, DoubleSide, LinearFilter, ShaderMaterial } from 'three'
import { MAX_SIGNS } from '../lib/metro-signs.ts'
import { METRO_GLSL, type MetroUniforms } from './metro-glsl.ts'

/**
 * The billboards' look: each name lit in its file's kind colour on a dark
 * panel with a glowing rim, scan lines rolling down it, and a stutter now
 * and then, as cheap neon does. The names are drawn once into one texture
 * with the page's own canvas and local fonts; nothing is fetched.
 */

/** Slots in the names texture: columns across, rows down. */
const COLUMNS = 4
const ROWS = MAX_SIGNS / COLUMNS
const SLOT_WIDTH = 512
const SLOT_HEIGHT = 64

/** Every name, white on clear, one per slot, largest that fits. */
export function namesTexture(names: readonly string[]): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = COLUMNS * SLOT_WIDTH
  canvas.height = ROWS * SLOT_HEIGHT
  const g = canvas.getContext('2d')!
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  names.forEach((name, s) => {
    let size = 44
    const font = (): string => `600 ${size}px ui-monospace, Menlo, monospace`
    g.font = font()
    while (size > 16 && g.measureText(name).width > SLOT_WIDTH - 40) {
      size -= 2
      g.font = font()
    }
    const x = (s % COLUMNS) * SLOT_WIDTH + SLOT_WIDTH / 2
    const y = Math.floor(s / COLUMNS) * SLOT_HEIGHT + SLOT_HEIGHT / 2
    g.fillText(name, x, y)
  })
  const texture = new CanvasTexture(canvas)
  // No mipmaps: they would blur thin strokes away at a distance.
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  return texture
}

/** The billboards' material, reading names from `names`. */
export function signMaterial(
  shared: MetroUniforms,
  names: CanvasTexture,
): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: { ...shared, uNames: { value: names } },
    vertexShader: /* glsl */ `
      attribute float slot;
      attribute vec3 ink;
      attribute float seed;
      attribute vec3 upright;
      attribute vec2 corner;
      attribute vec2 size;
      attribute vec3 outward;
      attribute float blade;
      varying float vBlade;
      varying vec2 vUv;
      varying float vSlot;
      varying vec3 vInk;
      varying float vSeed;
      varying float vDepth;
      void main() {
        vUv = uv;
        vSlot = slot;
        vInk = ink;
        vSeed = seed;
        vBlade = blade;
        // A roof sign turns round its upright to face the camera, so it always
        // reads left to right; a blade stands fixed, out from its facade.
        vec3 across = blade > 0.5 ? outward : normalize(cross(upright, cameraPosition - position));
        vec3 world = position + (across * corner.x * size.x + upright * corner.y * size.y) * 0.5;
        vec4 mv = viewMatrix * vec4(world, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${METRO_GLSL}
      uniform sampler2D uNames;
      varying vec2 vUv;
      varying float vSlot;
      varying vec3 vInk;
      varying float vSeed;
      varying float vDepth;
      varying float vBlade;
      void main() {
        // A blade's name runs top to bottom, the right way round from either side.
        vec2 face = vec2(vBlade > 0.5 && !gl_FrontFacing ? 1.0 - vUv.x : vUv.x, vUv.y);
        vec2 uv = vBlade > 0.5 ? vec2(1.0 - face.y, face.x) : face;
        vec2 cell = vec2(mod(vSlot, ${COLUMNS}.0), floor(vSlot / ${COLUMNS}.0));
        vec2 at = vec2((cell.x + uv.x) / ${COLUMNS}.0, 1.0 - (cell.y + 1.0 - uv.y) / ${ROWS}.0);
        float text = texture2D(uNames, at).a;
        vec2 edge = min(uv, 1.0 - uv) * vec2(4.0, 1.0);
        float rim = 1.0 - smoothstep(0.0, 0.05, min(edge.x, edge.y));
        float scan = 0.8 + 0.2 * sin(uv.y * 40.0 - uClock * 6.0);
        float stutter = step(0.97, hash11(floor(uClock * 9.0) + vSeed * 50.0));
        vec3 color = vec3(0.01, 0.01, 0.02) + vInk * (text * 2.2 * scan + rim * 0.9) * (1.0 - stutter * 0.8);
        gl_FragColor = vec4(mix(color, uFog, hazeOf(vDepth) * 0.8), 1.0);
      }
    `,
  })
}
