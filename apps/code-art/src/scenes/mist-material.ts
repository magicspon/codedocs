import { AdditiveBlending, ShaderMaterial } from 'three'

/**
 * Mist: soft puffs that drift slowly round where they were placed and
 * breathe in and out, so the haze over a blind spot never sits still.
 * Rose red, like the galaxy's haze over the same files. Faint on purpose:
 * the puffs overlap and add up.
 */
export function mistMaterial(radius: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uClock: { value: 0 },
      // Point size at one unit away, in pixels, before perspective.
      uScale: { value: 2400 },
      uFogNear: { value: radius * 1.2 },
      uFogFar: { value: radius * 4 },
      uDrift: { value: radius * 0.012 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float seed;
      uniform float uClock;
      uniform float uScale;
      uniform float uDrift;
      varying float vGlow;
      varying float vDepth;
      void main() {
        float t = uClock * 0.15 + seed;
        vec3 p = position + vec3(sin(t * 1.3), sin(t * 0.7) * 0.3, cos(t)) * uDrift * (1.0 + size);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDepth = -mv.z;
        vGlow = 0.6 + 0.4 * sin(uClock * 0.4 + seed * 3.0);
        gl_PointSize = size * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFogNear;
      uniform float uFogFar;
      varying float vGlow;
      varying float vDepth;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(1.0 - smoothstep(0.0, 1.0, d), 2.0);
        float fog = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
        gl_FragColor = vec4(vec3(1.0, 0.33, 0.45) * a * vGlow * 0.07 * fog, 1.0);
      }
    `,
  })
}
