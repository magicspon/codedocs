import { AdditiveBlending, DoubleSide, ShaderMaterial } from 'three'

/**
 * The alarm pillar: a column of warning light standing on a hotspot's roof,
 * as tall and as red as the file is hot. It replaces the fires the city used
 * to draw, which read as a building burning down rather than as a reading.
 *
 * Each instance carries `aAlarm`: heat in `[0, 1]`, trend in `[-1, 1]`, and a
 * seed that staggers the pulses. Heat gates everything, so a cold roof costs a
 * hidden instance and nothing else.
 */

/** A mild warning. */
const AMBER = 'vec3(1.0, 0.55, 0.12)'
/** A severe one. */
const RED = 'vec3(1.0, 0.15, 0.06)'
/** What a cooling hotspot's column greys down to. */
const ASH = 'vec3(0.42, 0.38, 0.40)'

/** Builds the pillar material. Instances supply `aAlarm`. */
export function alarmMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    // Light, not a solid: both walls of the column add up into a volume.
    side: DoubleSide,
    uniforms: { uClock: { value: 0 }, uLens: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 aAlarm;
      varying vec3 vAlarm;
      varying vec3 vNrm;
      varying vec3 vView;
      varying float vUp;
      void main() {
        vAlarm = aAlarm;
        // The geometry is a unit column centred on the origin.
        vUp = position.y + 0.5;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vNrm = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uClock;
      uniform float uLens;
      varying vec3 vAlarm;
      varying vec3 vNrm;
      varying vec3 vView;
      varying float vUp;
      void main() {
        float heat = vAlarm.x * uLens;
        float rising = max(vAlarm.y, 0.0);
        float cooling = max(-vAlarm.y, 0.0);
        // Brightest through the middle of the column and softest at its edges,
        // which is what makes a hollow tube read as a shaft of light.
        float depth = pow(abs(dot(normalize(vNrm), normalize(vView))), 2.0);
        // The light thins out as it rises. Clamped because a pow of a base a
        // hair below zero is a NaN, and one NaN pixel spreads over the whole
        // frame once the bloom pass blurs it.
        float fade = pow(max(1.0 - vUp, 0.0), 1.5);
        // A hotspot heating up sends a pulse climbing the column.
        float head = fract(uClock * 0.45 + vAlarm.z);
        float pulse = rising * smoothstep(0.22, 0.0, abs(vUp - head));
        // Even a modest hotspot reads as a warning, not as a street lamp.
        vec3 warn = mix(${AMBER}, ${RED}, min(1.0, heat * 2.2));
        // A cooling hotspot greys towards smoke, but keeps enough of its
        // colour to still read as a warning rather than as a chimney.
        warn = mix(warn, ${ASH}, cooling * 0.45);
        float body = fade * (0.5 + 1.1 * heat) * (1.0 - 0.4 * cooling);
        gl_FragColor = vec4(warn * (body + pulse * 1.6) * depth * heat * 2.6, 1.0);
      }
    `,
  })
}
