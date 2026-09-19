import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three'
import { sampleHealth, type HealthSample, type HealthTracks } from './health.ts'

/**
 * Every file's health at the playhead, as a texture a shader looks up by file
 * index. Stars number in the hundreds of thousands, so they read their file's
 * health on the GPU instead of the CPU rewriting each star's colour.
 */
export interface HealthTexture {
  readonly texture: DataTexture
  /** Refills the texture for fractional frame `t`. */
  readonly update: (t: number) => void
  /**
   * Refills the texture for `t` only when the lens shows and the playhead has
   * moved since, so a lens that is off costs nothing during playback.
   */
  readonly follow: (t: number, lens: number) => void
}

/** Files per texture row; a single row would pass WebGL's width limit on large repos. */
const HEALTH_WIDTH = 1024

/**
 * GLSL that reads file `file`'s health: `r` heat, `g` unused, `b` wear.
 * Expects `uHealth` and `uHealthRows` uniforms.
 */
export const HEALTH_GLSL: string = /* glsl */ `
  uniform sampler2D uHealth;
  uniform float uHealthRows;
  vec4 healthOf(float file) {
    vec2 cell = vec2(mod(file, ${HEALTH_WIDTH}.0), floor(file / ${HEALTH_WIDTH}.0));
    return texture2D(uHealth, (cell + 0.5) / vec2(${HEALTH_WIDTH}.0, uHealthRows));
  }
`

/** Builds a texture for `tracks`, filled at frame 0. */
export function healthTexture(
  tracks: HealthTracks,
  files: number,
): HealthTexture {
  const rows = Math.max(1, Math.ceil(files / HEALTH_WIDTH))
  const data = new Float32Array(HEALTH_WIDTH * rows * 4)
  const texture = new DataTexture(
    data,
    HEALTH_WIDTH,
    rows,
    RGBAFormat,
    FloatType,
  )
  // Each texel is one file; blending neighbours would mix unrelated files.
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  const sample: HealthSample = { heat: 0, unused: 0, wear: 0 }
  const update = (t: number): void => {
    for (let i = 0; i < files; i++) {
      sampleHealth(tracks, i, t, sample)
      data[i * 4] = sample.heat
      data[i * 4 + 1] = sample.unused
      data[i * 4 + 2] = sample.wear
    }
    texture.needsUpdate = true
  }
  let sampled = 0
  update(sampled)
  const follow = (t: number, lens: number): void => {
    if (lens <= 0 || t === sampled) return
    update(t)
    sampled = t
  }
  return { texture, update, follow }
}
