import { AdditiveBlending, ShaderMaterial } from 'three'
import { VISIBILITY_GLSL } from './series.ts'

/**
 * Soft round points with a size and colour per vertex. `PointsMaterial` draws
 * square sprites of one size, and a galaxy is nothing but points of many sizes.

 *
 * `birth` and `death` attributes against `uTime` fade each point in and out,
 * which is the whole of timeline playback for the galaxy.
 */
export function glowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uScale: { value: 300 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float birth;
      attribute float death;
      varying vec3 vColor;
      uniform float uScale;
      uniform float uTime;
      ${VISIBILITY_GLSL}
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * visibility(birth, death, uTime) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(vColor, a * a);
      }
    `,
    vertexColors: true,
  })
}

/** Lines whose segments fade by `birth` and `death` against `uTime`. */
export function lifeLineMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: true,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float birth;
      attribute float death;
      varying vec3 vColor;
      uniform float uTime;
      ${VISIBILITY_GLSL}
      void main() {
        vColor = color * visibility(birth, death, uTime);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        gl_FragColor = vec4(vColor, 1.0);
      }
    `,
  })
}
