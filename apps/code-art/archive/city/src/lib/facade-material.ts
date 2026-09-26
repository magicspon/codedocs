import { MeshStandardMaterial, type IUniform, type Texture } from 'three'
import { FOCUS_GLSL } from './focus-texture.ts'

/**
 * The material every building is drawn with: a standard lit surface whose
 * emissive channel is the building's own lamp, on or off, with the health
 * lens folded in. A building is one symbol now, small enough to just *be* a
 * window -- no grid to burn into its face -- so this is far smaller than the
 * tower-facade shader it replaces.
 *
 * On the GPU rather than the CPU because the lens fade, the alarm strobe, the
 * scan and the search focus all move every frame without touching hundreds
 * of thousands of instance colours. Each building supplies its lamp colour,
 * whether it is normally lit, and its file's health through instanced
 * attributes.
 */

/** What a hard-to-change building's shell weathers towards. */
const RUST = 'vec3(0.478, 0.322, 0.212)'
/** What an unreachable building's shell cools to: lightless concrete. */
const ABANDONED = 'vec3(0.045, 0.050, 0.070)'
/** The cool light a searched building gives off. */
const FOUND = 'vec3(0.55, 0.8, 1.0)'
/** The red a hotspot's windows flush. */
const ALARM = 'vec3(1.0, 0.13, 0.05)'

const DECLARE = /* glsl */ `
  uniform float uFocus;
  ${FOCUS_GLSL}
  attribute float aFile;
  varying float vFocus;
  attribute float aLit;
  attribute float aSeed;
  attribute vec3 aLamp;
  attribute vec4 aHealth;
  varying vec3 vSize;
  varying vec3 vLamp;
  varying vec4 vHealth;
  varying float vBase;
  varying float vSeed;
  varying float vLit;
`

/**
 * Reads each instance's world size and base height off the instance matrix,
 * so the fragment shader knows where its roof sits without a grid to measure.
 */
const MEASURE = /* glsl */ `
  vSize = vec3(
    length(instanceMatrix[0].xyz),
    length(instanceMatrix[1].xyz),
    length(instanceMatrix[2].xyz)
  );
  vBase = instanceMatrix[3].y - vSize.y * 0.5;
  vLit = aLit;
  vSeed = aSeed;
  vLamp = aLamp;
  vHealth = aHealth;
  vFocus = focusOf(aFile);
`

const HELPERS = /* glsl */ `
  uniform float uLens;
  uniform float uClock;
  uniform float uFocus;
  uniform float uScan;
  uniform float uScanY;
  varying float vFocus;
  varying vec3 vSize;
  varying vec3 vLamp;
  varying vec4 vHealth;
  varying float vBase;
  varying float vSeed;
  varying float vLit;
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
  // Under a search, buildings the trace never reaches recede into the dark.
  diffuseColor.rgb *= mix(1.0, 0.12, uFocus * (1.0 - vFocus));
  }
`

/**
 * The lights: a building glows if it is normally lit, red and strobing where
 * its file is a hotspot. A picked settlement's buildings switch on floor by
 * floor as the scan passes their roof, shortest first.
 */
const LIGHTS = /* glsl */ `
  {
  vec3 read = lensRead();
  float top = vBase + vSize.y;
  float scanned = uScan * step(0.99, vFocus) * step(top, uScanY);
  // Nobody is home in a file no entry point reaches.
  float on = max(vLit, scanned) * (1.0 - read.y);
  float beat = alarmBeat();
  // The flush is a hint that the pillar overhead is the real reading, so it
  // stops short of painting a merely warm file the same red as the worst one.
  vec3 lamp = mix(vLamp, ${ALARM}, min(1.0, read.x * 0.9));
  vec3 glow = lamp * on * (1.15 + 1.6 * read.x * beat);
  // A hotspot with few lit buildings still shows: alarm light washes the shell.
  glow += ${ALARM} * read.x * 0.16 * beat;
  // Under a search: the rest go dark, the reached burn a little brighter, and
  // the searched settlements glow from within.
  float away = uFocus * (1.0 - vFocus);
  float found = uFocus * step(0.99, vFocus);
  glow *= mix(1.0, 0.035, away) * (1.0 + uFocus * vFocus * 0.6);
  glow += ${FOUND} * found * (0.1 + 0.05 * sin(uClock * 3.0));
  totalEmissiveRadiance += glow;
  }
`

/** The uniforms a city drives every frame. */
export interface FacadeUniforms {
  /** How far the health lens is open, `0` to `1`. */
  readonly uLens: IUniform<number>
  /** Wall-clock seconds, for the alarm strobe. */
  readonly uClock: IUniform<number>
  /** How far a search's dimming has eased in, `0` to `1`. */
  readonly uFocus: IUniform<number>
  /** Every file's focus, from `focusTexture`. */
  readonly uFocusMap: IUniform<Texture | null>
  readonly uFocusRows: IUniform<number>
  /** How strongly a picked settlement is lit by its scan, `0` to `1`. */
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
 * Builds the facade material, shared across every building: the geometry
 * differs, the surface does not.
 */
export function facadeMaterial(): Facades {
  const uniforms: FacadeUniforms = {
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
