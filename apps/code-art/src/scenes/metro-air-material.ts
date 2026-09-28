import {
  AdditiveBlending,
  BackSide,
  DoubleSide,
  ShaderMaterial,
  Vector3,
  type Color,
} from 'three'
import { METRO_GLSL, type MetroUniforms } from './metro-glsl.ts'

/**
 * Everything above the rooftops: the sky, the flying traffic, and the beams
 * over the most-called files. All of it glows additively, so it layers over
 * the city without hiding it.
 */

/** The sky round the driver: haze at the horizon, dark overhead, and stars. */
export function skyMaterial(
  shared: MetroUniforms,
  glow: Color,
): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      ...shared,
      uUp: { value: new Vector3(0, 1, 0) },
      uGlow: { value: glow },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${METRO_GLSL}
      uniform vec3 uUp;
      uniform vec3 uGlow;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float up = dot(dir, uUp);
        // Haze thickest at the horizon, the city's glow on its underside.
        vec3 color = mix(uFog, vec3(0.004, 0.003, 0.012), smoothstep(-0.05, 0.55, up));
        color += uGlow * exp(-abs(up - 0.02) * 10.0) * 0.3;
        // Stars, sparse and faint, only well above the haze.
        vec3 cell = floor(dir * 180.0);
        float star = step(0.9975, hash21(cell.xy + cell.z * 17.0));
        color += vec3(0.7, 0.8, 1.0) * star * smoothstep(0.15, 0.5, up) * (0.5 + 0.5 * sin(uClock * 2.0 + cell.x));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
}

/** Flying traffic: pulses of light running roof to roof along each lane. */
export function laneMaterial(shared: MetroUniforms): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      attribute float along;
      attribute float weight;
      varying float vAlong;
      varying float vWeight;
      varying float vDepth;
      void main() {
        vAlong = along;
        vWeight = weight;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${METRO_GLSL}
      varying float vAlong;
      varying float vWeight;
      varying float vDepth;
      void main() {
        // A faint lane, and cars along it, closer together on heavier lanes.
        float spacing = mix(40.0, 12.0, vWeight);
        float car = pow(fract((vAlong - uClock * 20.0) / spacing), 8.0);
        vec3 color = vec3(0.3, 0.85, 1.0);
        float light = 0.006 + 0.012 * vWeight + car * (0.8 + vWeight);
        // The haze dims the sky lanes only half as much: they are what a driver steers by.
        gl_FragColor = vec4(color * light * (1.0 - hazeOf(vDepth) * 0.5), 1.0);
      }
    `,
  })
}

/** A beam of light rising from a busy file's roof, fading as it climbs. */
export function beamMaterial(shared: MetroUniforms): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      attribute vec2 beam;
      attribute float share;
      varying vec2 vBeam;
      varying float vShare;
      void main() {
        vBeam = beam;
        vShare = share;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${METRO_GLSL}
      varying vec2 vBeam;
      varying float vShare;
      void main() {
        // Across the beam, bright in the middle; up it, fading out.
        float core = pow(1.0 - abs(vBeam.x), 3.0);
        float rise = 1.0 - vBeam.y;
        float pulse = 0.75 + 0.25 * sin(uClock * 2.0 - vBeam.y * 30.0);
        vec3 color = vec3(1.0, 0.72, 0.35) * core * rise * rise * pulse * (0.35 + 0.65 * vShare);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
}
