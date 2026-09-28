import { Color } from 'three'

/**
 * GLSL every metro shader shares: the haze and a cheap hash. The haze is
 * thick on purpose. The planet is small, so the horizon is near anyway, and
 * what lies past the haze is a glow of windows rather than a hard edge.
 */
export const METRO_GLSL = /* glsl */ `
  uniform vec3 uFog;
  uniform float uFogDensity;
  uniform float uClock;
  // How much of the haze lies between the eye and something \`depth\` away.
  float hazeOf(float depth) {
    float d = depth * uFogDensity;
    return 1.0 - exp(-d * d);
  }
  float hash11(float p) {
    return fract(sin(p * 127.1) * 43758.5453);
  }
  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
`

/** Uniforms `METRO_GLSL` reads; one set is shared, so the haze changes everywhere at once. */
export interface MetroUniforms {
  readonly uFog: { value: Color }
  readonly uFogDensity: { value: number }
  readonly uClock: { value: number }
}

/** The shared uniforms, hazed in `fog`, thick enough to hide most of a planet of `radius`. */
export function metroUniforms(fog: Color, radius: number): MetroUniforms {
  return {
    uFog: { value: fog },
    uFogDensity: { value: 1 / Math.min(220, radius * 0.9) },
    uClock: { value: 0 },
  }
}
