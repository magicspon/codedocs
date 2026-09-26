import { AdditiveBlending, ShaderMaterial } from 'three'
import { FOCUS_GLSL } from './focus-texture.ts'
import { HEALTH_GLSL } from './health-texture.ts'
import { VISIBILITY_GLSL } from './series.ts'

/** A soft round sprite, brightest at its centre. */
const POINT_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(vColor, a * a);
  }
`

/**
 * Soft round points with a size and colour per vertex. `PointsMaterial` draws
 * square sprites of one size, and a galaxy is nothing but points of many sizes.
 *
 * `birth` and `death` attributes against `uTime` fade each point in and out,
 * which is the whole of timeline playback for the galaxy. `uDim` darkens the
 * lot, for when a search draws the eye elsewhere.
 */
export function glowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uScale: { value: 300 },
      uTime: { value: 0 },
      uDim: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float birth;
      attribute float death;
      varying vec3 vColor;
      uniform float uScale;
      uniform float uTime;
      uniform float uDim;
      ${VISIBILITY_GLSL}
      void main() {
        vColor = color * uDim;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * visibility(birth, death, uTime) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: POINT_FRAGMENT,
    vertexColors: true,
  })
}

/**
 * `glowMaterial` that also reads each point's file health, for the health lens.
 * Points need a `file` attribute. `uLens` fades the lens in from `0` to `1`;
 * `flare` is how far a hotspot swells, so a file's core can blaze while its
 * stars only warm. `uClock` is wall-clock seconds, for the pulse of a hotspot
 * that is heating up; `uTime` is the playhead and stands still when paused.
 * `uFocus` fades in a search: files the trace never touches sink to embers,
 * and the searched ones burn brighter. `uAbsorb` shrinks a searched file's
 * points away, for when its planets take over from its star cloud.
 * `uIsolate` shrinks the files the trace never touches to nothing.
 */
export function healthGlowMaterial(flare: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uScale: { value: 300 },
      uTime: { value: 0 },
      uClock: { value: 0 },
      uLens: { value: 0 },
      uFlare: { value: flare },
      uHealth: { value: null },
      uHealthRows: { value: 1 },
      uFocus: { value: 0 },
      uFocusMap: { value: null },
      uFocusRows: { value: 1 },
      uAbsorb: { value: 0 },
      uIsolate: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float birth;
      attribute float death;
      attribute float file;
      varying vec3 vColor;
      uniform float uScale;
      uniform float uTime;
      uniform float uClock;
      uniform float uLens;
      uniform float uFlare;
      uniform float uFocus;
      uniform float uAbsorb;
      uniform float uIsolate;
      ${VISIBILITY_GLSL}
      ${HEALTH_GLSL}
      ${FOCUS_GLSL}
      void main() {
        vec4 health = healthOf(file) * uLens;
        // Unused code fades to a dim grey: present, but nothing reaches it.
        float grey = dot(color, vec3(0.3, 0.59, 0.11));
        vec3 c = mix(color, vec3(grey * 0.3), health.g);
        // Hotspots burn from orange towards white as they heat.
        vec3 fire = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.85, 0.6), health.r);
        // A cooling hotspot sinks to a dull red ember.
        float cooling = max(-health.a, 0.0);
        fire = mix(fire, vec3(0.5, 0.07, 0.03), cooling * 0.8);
        // One heating up throbs; the file index staggers the beats so they do not march.
        float beat = 0.5 + 0.5 * sin(uClock * 4.0 + file * 1.7);
        float pulse = 1.0 + max(health.a, 0.0) * beat * 0.6;
        c = mix(c, fire * (0.6 + 1.6 * health.r) * pulse, min(1.0, health.r * 2.0) * min(1.0, uFlare));
        float away = uFocus * (1.0 - focusOf(file));
        float found = uFocus * step(0.99, focusOf(file));
        vColor = c * mix(1.0, 0.06, away) * (1.0 + found * 0.9);
        float swell = (1.0 + health.r * uFlare * 2.5 * pulse) * mix(1.0, 0.6, away) *
          (1.0 - found * uAbsorb) * (1.0 - uIsolate * step(focusOf(file), 0.0));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Capped, so a craft flying past a star is not blinded by one point.
        gl_PointSize = min(size * swell * visibility(birth, death, uTime) * uScale / -mv.z, 120.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: POINT_FRAGMENT,
    vertexColors: true,
  })
}

/**
 * Lines whose segments fade by `birth` and `death` against `uTime`, and all
 * together by `uOpacity`, so a set of lines can be switched on gently.
 */
export function lifeLineMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: true,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float birth;
      attribute float death;
      varying vec3 vColor;
      uniform float uTime;
      uniform float uOpacity;
      ${VISIBILITY_GLSL}
      void main() {
        vColor = color * visibility(birth, death, uTime) * uOpacity;
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
