import { DataTexture, FloatType, NearestFilter, RedFormat } from 'three'

/** Files per texture row, as for health: one row would pass WebGL's width limit. */
const FOCUS_WIDTH = 1024

/**
 * GLSL that reads file `file`'s focus: `1` searched, `0.6` reached by the
 * trace, `0` untouched. Expects `uFocusMap` and `uFocusRows` uniforms.
 */
export const FOCUS_GLSL: string = /* glsl */ `
  uniform sampler2D uFocusMap;
  uniform float uFocusRows;
  float focusOf(float file) {
    vec2 cell = vec2(mod(file, ${FOCUS_WIDTH}.0), floor(file / ${FOCUS_WIDTH}.0));
    return texture2D(uFocusMap, (cell + 0.5) / vec2(${FOCUS_WIDTH}.0, uFocusRows)).r;
  }
`

/**
 * Every file's focus as a texture a shader looks up by file index, so a new
 * search rewrites one small texture rather than every star or tower. Empty
 * when `focus` is `undefined`: with no search, nothing is dimmed anyway.
 */
export function focusTexture(
  files: number,
  focus: Float32Array | undefined,
): DataTexture {
  const rows = Math.max(1, Math.ceil(files / FOCUS_WIDTH))
  const data = new Float32Array(FOCUS_WIDTH * rows)
  if (focus) data.set(focus.subarray(0, files))
  const texture = new DataTexture(data, FOCUS_WIDTH, rows, RedFormat, FloatType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}
