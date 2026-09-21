import { MeshStandardMaterial, type IUniform, type Texture } from 'three'
import { FOCUS_GLSL } from './focus-texture.ts'

/**
 * The material every tower is drawn with: a standard lit surface with a window
 * grid burned into its emissive channel, and the health lens folded in.
 *
 * On the GPU rather than the CPU because a window grid is per pixel, and
 * because it lets the lens fade, the alarm strobe and the playhead all move
 * without touching 12,000 instance colours. Each building supplies its own
 * facade, lamp colour and health through instanced attributes.
 */

/** What a hard-to-change building's facade weathers towards. */
const RUST = 'vec3(0.478, 0.322, 0.212)'
/** What an unreachable building's shell cools to: lightless concrete. */
const ABANDONED = 'vec3(0.045, 0.050, 0.070)'
/** The cool light a searched tower gives off. */
const FOUND = 'vec3(0.55, 0.8, 1.0)'
/** The red a hotspot's windows flush. */
const ALARM = 'vec3(1.0, 0.13, 0.05)'

const DECLARE = /* glsl */ `
  uniform float uFocus;
  ${FOCUS_GLSL}
  attribute float aFile;
  varying float vFocus;
  attribute vec2 aFacade;
  attribute vec3 aLamp;
  attribute vec4 aHealth;
  varying vec3 vLocal;
  varying vec3 vSize;
  varying vec3 vNrm;
  varying vec3 vLamp;
  varying vec4 vHealth;
  varying float vBase;
  varying float vSeed;
  varying float vLit;
`

/**
 * Reads each instance's world size and its base height off the instance
 * matrix, so the fragment shader can lay out windows of a fixed real size and
 * line the floors of a setback up with the shaft beneath it.
 */
const MEASURE = /* glsl */ `
  vLocal = position;
  vNrm = normal;
  vSize = vec3(
    length(instanceMatrix[0].xyz),
    length(instanceMatrix[1].xyz),
    length(instanceMatrix[2].xyz)
  );
  vBase = instanceMatrix[3].y - vSize.y * 0.5;
  vLit = aFacade.x;
  vSeed = aFacade.y;
  vLamp = aLamp;
  vHealth = aHealth;
  vFocus = focusOf(aFile);
`

const HELPERS = /* glsl */ `
  uniform float uWindow;
  uniform float uLens;
  uniform float uClock;
  uniform float uFocus;
  uniform float uScan;
  uniform float uScanY;
  varying float vFocus;
  varying vec3 vLocal;
  varying vec3 vSize;
  varying vec3 vNrm;
  varying vec3 vLamp;
  varying vec4 vHealth;
  varying float vBase;
  varying float vSeed;
  varying float vLit;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  /** Where this pixel sits on the facade, in windows: across, then up. */
  vec2 facadeGrid() {
    float across = mix(vLocal.x * vSize.x, vLocal.z * vSize.z, step(0.5, abs(vNrm.x)));
    float up = vBase + (vLocal.y + 0.5) * vSize.y;
    return vec2(across, up) / uWindow;
  }
`

/**
 * How bright the wash is that replaces the grid once it is finer than the
 * pixels. Well under the grid's true average: seen from far enough away the
 * windows are also seen at a glance, and a whole district lit to its true
 * average reads as one glowing slab rather than as a city.
 */
const WASH = '0.12'

/**
 * One window, antialiased: `smoothstep` over a pixel's width blurs the grid
 * away as a tower recedes, and once the grid is finer than the pixels the
 * windows average into a wash, so a distant district still glows instead of
 * going dark.
 */
const WINDOWS = /* glsl */ `
  float roof = step(0.5, abs(vNrm.y));
  vec2 grid = facadeGrid();
  vec2 w = max(fwidth(grid), 1e-5);
  vec2 f = fract(grid);
  vec2 cell = floor(grid);
  float pane =
    smoothstep(0.18 - w.x, 0.18 + w.x, f.x) *
    smoothstep(0.82 + w.x, 0.82 - w.x, f.x) *
    smoothstep(0.24 - w.y, 0.24 + w.y, f.y) *
    smoothstep(0.78 + w.y, 0.78 - w.y, f.y);
  // The face goes into the hash so a tower's four walls are lit differently.
  vec2 wall = floor(vNrm.xz * 3.0 + 3.0);
  // A picked tower lights floor by floor below the scan as it climbs.
  float up = grid.y * uWindow;
  float scanned = uScan * step(0.99, vFocus) * step(up, uScanY);
  float lit = max(step(hash21(cell + wall * 17.0 + vSeed * 91.0), vLit), scanned);
  float bulb = 0.55 + 0.45 * hash21(cell.yx + vSeed * 13.0);
  float detail = clamp(1.6 - max(w.x, w.y) * 1.2, 0.0, 1.0);
  // Roofs have no windows.
  float glazed = mix(max(vLit, scanned) * ${WASH}, pane * lit * bulb, detail) * (1.0 - roof);
`

const LENS = /* glsl */ `
  /** Heat, abandonment and wear, each faded in as the lens opens. */
  vec3 lensRead() {
    return vHealth.xyz * uLens;
  }

  /**
   * How a hotspot's light beats: one heating up throbs, one cooling burns low.
   * The seed staggers the beats so a street of alarms does not flash as one.
   */
  float alarmBeat() {
    float beat = 0.5 + 0.5 * sin(uClock * 4.5 + vSeed * 40.0);
    return mix(1.0, 0.35 + 1.3 * beat, max(vHealth.w, 0.0)) *
      (1.0 - 0.5 * max(-vHealth.w, 0.0));
  }
`

/**
 * The shell: worn files rust, unreachable ones cool to bare concrete. Braced,
 * because three drops every injected chunk into the one `main`.
 */
const WEATHER = /* glsl */ `
  {
  vec3 read = lensRead();
  diffuseColor.rgb = mix(diffuseColor.rgb, ${RUST}, read.z * 0.75);
  diffuseColor.rgb = mix(diffuseColor.rgb, ${ABANDONED}, read.y);
  // Under a search, towers the trace never reaches recede into the dark.
  diffuseColor.rgb *= mix(1.0, 0.12, uFocus * (1.0 - vFocus));
  }
`

/** The lights: lit windows, red and strobing where the file is a hotspot. */
const LIGHTS = /* glsl */ `
  {
  vec3 read = lensRead();
  ${WINDOWS}
  // Nobody is home in a file no entry point reaches.
  float on = glazed * (1.0 - read.y);
  float beat = alarmBeat();
  // The flush is a hint that the pillar overhead is the real reading, so it
  // stops short of painting a merely warm file the same red as the worst one.
  vec3 lamp = mix(vLamp, ${ALARM}, min(1.0, read.x * 0.9));
  vec3 glow = lamp * on * (1.15 + 1.6 * read.x * beat);
  // A hotspot with few lit windows still shows: alarm light washes the walls.
  glow += ${ALARM} * read.x * 0.16 * beat * (1.0 - roof);
  // Under a search: the rest go dark, the reached burn a little brighter, and
  // the searched towers glow from within, their roofs brightest.
  float away = uFocus * (1.0 - vFocus);
  float found = uFocus * step(0.99, vFocus);
  glow *= mix(1.0, 0.035, away) * (1.0 + uFocus * vFocus * 0.6);
  glow += ${FOUND} * found * (0.1 + 0.05 * sin(uClock * 3.0) + roof * 0.35);
  // The scan itself: a bright band a few floors deep. Squared by hand, since
  // pow() of a negative is undefined and a NaN here blacks out the bloom.
  float band = (up - uScanY) / (uWindow * 1.6);
  glow += ${FOUND} * 2.5 * uScan * step(0.99, vFocus) * exp(-band * band) * (1.0 - roof);
  totalEmissiveRadiance += glow;
  }
`

/** The uniforms a city drives every frame. */
export interface FacadeUniforms {
  /** How wide one window is, in world units. */
  readonly uWindow: IUniform<number>
  /** How far the health lens is open, `0` to `1`. */
  readonly uLens: IUniform<number>
  /** Wall-clock seconds, for the alarm strobe. */
  readonly uClock: IUniform<number>
  /** How far a search's dimming has eased in, `0` to `1`. */
  readonly uFocus: IUniform<number>
  /** Every file's focus, from `focusTexture`. */
  readonly uFocusMap: IUniform<Texture | null>
  readonly uFocusRows: IUniform<number>
  /** How strongly a picked tower is lit by its scan, `0` to `1`. */
  readonly uScan: IUniform<number>
  /** The world height the scan has climbed to. */
  readonly uScanY: IUniform<number>
}

/** A facade material and the uniforms to drive it. */
export interface Facades {
  readonly material: MeshStandardMaterial
  readonly uniforms: FacadeUniforms
}

/**
 * Builds the facade material. `window` is how wide one window is in world
 * units; every tower uses the same size, so a tall building simply has more
 * floors. Share one material across the shafts and their setbacks: the
 * geometry differs, the surface does not.
 */
export function facadeMaterial(window: number): Facades {
  const uniforms: FacadeUniforms = {
    uWindow: { value: window },
    uLens: { value: 0 },
    uClock: { value: 0 },
    uFocus: { value: 0 },
    uFocusMap: { value: null },
    uFocusRows: { value: 1 },
    uScan: { value: 0 },
    uScanY: { value: 0 },
  }
  const material = new MeshStandardMaterial({
    roughness: 0.62,
    metalness: 0.2,
  })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECLARE}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${MEASURE}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HELPERS}\n${LENS}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${WEATHER}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n${LIGHTS}`,
      )
  }
  return { material, uniforms }
}
