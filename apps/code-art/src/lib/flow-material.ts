import { AdditiveBlending, ShaderMaterial, type IUniform } from 'three'
import { VISIBILITY_GLSL } from './series.ts'

/**
 * The trace overlay's three materials. They share one set of uniforms, so the
 * arcs, their packets and the markers keep one clock and fade as one.
 */

/** What the overlay drives every frame. */
export interface FlowUniforms {
  [name: string]: IUniform<number>
  /** Wall-clock seconds; the flow runs while the timeline is paused. */
  uClock: IUniform<number>
  /** Slots per loop, rest beat included. */
  uLoop: IUniform<number>
  /** The timeline playhead, for births and deaths. */
  uHistory: IUniform<number>
  /** How far the overlay has faded in. */
  uOpacity: IUniform<number>
  /** Point size per unit of `size` at unit depth. */
  uScale: IUniform<number>
}

/** Slots per second: one hop takes a little over a second, slow enough to follow. */
const SPEED = '0.85'

/** Where in the loop the flow is, in slots. */
const CYCLE = /* glsl */ `
  uniform float uClock;
  uniform float uLoop;
  uniform float uHistory;
  uniform float uOpacity;
  float cycle() { return mod(uClock * ${SPEED}, uLoop); }
  ${VISIBILITY_GLSL}
`

/** A soft round sprite. */
const SPRITE = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(vColor, a * a);
  }
`

function additive(
  uniforms: FlowUniforms,
  vertexShader: string,
  fragmentShader: string,
): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: true,
    uniforms,
    vertexShader,
    fragmentShader,
  })
}

/** Arcs: a faint wire always, and a bright stretch following each packet as it passes. */
function lineMaterial(uniforms: FlowUniforms): ShaderMaterial {
  return additive(
    uniforms,
    /* glsl */ `
      attribute float progress;
      attribute float slot;
      attribute float birth;
      attribute float death;
      ${CYCLE}
      varying vec3 vColor;
      varying float vProgress;
      varying float vHead;
      void main() {
        vColor = color * visibility(birth, death, uHistory) * uOpacity;
        vProgress = progress;
        vHead = cycle() - slot;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      varying vec3 vColor;
      varying float vProgress;
      varying float vHead;
      void main() {
        // The wire behind a packet stays lit a moment, like a trail.
        float behind = vHead - vProgress;
        float trail = step(0.0, behind) * exp(-behind * 3.0) * step(vHead, 1.6);
        float head = smoothstep(0.12, 0.0, abs(behind));
        gl_FragColor = vec4(vColor * (0.09 + trail * 0.45 + head * 0.8), 1.0);
      }
    `,
  )
}

/** Packets riding the arcs, placed on their Bézier on the GPU. */
function particleMaterial(uniforms: FlowUniforms): ShaderMaterial {
  return additive(
    uniforms,
    /* glsl */ `
      attribute vec3 start;
      attribute vec3 ctrl;
      attribute vec3 end;
      attribute float slot;
      attribute float offset;
      attribute float mode;
      attribute float size;
      attribute float birth;
      attribute float death;
      uniform float uScale;
      ${CYCLE}
      varying vec3 vColor;
      void main() {
        float wave = cycle() - slot - offset;
        float drift = fract(uClock * 0.11 + offset);
        float t = mix(wave, drift, mode);
        // A wave particle shows only on its own run; a drift one always, faintly.
        float shown = mix(step(0.0, t) * step(t, 1.0), 0.3, mode);
        t = clamp(t, 0.0, 1.0);
        float u = 1.0 - t;
        vec3 p = u * u * start + 2.0 * u * t * ctrl + t * t * end;
        float life = visibility(birth, death, uHistory) * uOpacity;
        vColor = color * shown * life * 1.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * shown * life * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    SPRITE,
  )
}

/**
 * Markers: a searched file wears a slow ripple; a reached one a dot that
 * flashes as light lands on it.
 */
function markerMaterial(uniforms: FlowUniforms): ShaderMaterial {
  return additive(
    uniforms,
    /* glsl */ `
      attribute float size;
      attribute float root;
      attribute float arrival;
      attribute float birth;
      attribute float death;
      uniform float uScale;
      ${CYCLE}
      varying vec3 vColor;
      varying float vRoot;
      varying float vFlash;
      void main() {
        float since = mod(cycle() - arrival, uLoop);
        vFlash = exp(-since * 2.5);
        vRoot = root;
        float life = visibility(birth, death, uHistory) * uOpacity;
        vColor = color * life;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (1.0 + vFlash * (1.0 - root) * 0.8) * life * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    /* glsl */ `
      uniform float uClock;
      varying vec3 vColor;
      varying float vRoot;
      varying float vFlash;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float spot = pow(smoothstep(1.0, 0.0, d), 3.0) * (0.35 + vFlash * 1.4);
        // Two ripples a beat apart, each spreading and fading as it goes.
        float r1 = fract(uClock * 0.45);
        float r2 = fract(uClock * 0.45 + 0.5);
        float ring =
          smoothstep(0.06, 0.0, abs(d - r1)) * (1.0 - r1) +
          smoothstep(0.06, 0.0, abs(d - r2)) * (1.0 - r2);
        float core = pow(smoothstep(0.3, 0.0, d), 2.0) * (0.9 + vFlash);
        float a = mix(spot, ring * 0.9 + core, vRoot);
        gl_FragColor = vec4(vColor * a, 1.0);
      }
    `,
  )
}

/** The overlay's materials and the uniforms they share. */
export interface FlowMaterials {
  readonly lines: ShaderMaterial
  readonly particles: ShaderMaterial
  readonly markers: ShaderMaterial
  readonly uniforms: FlowUniforms
}

/** Builds the overlay's materials; `scale` sizes points as the scene's own glows do. */
export function flowMaterials(scale: number): FlowMaterials {
  const uniforms: FlowUniforms = {
    uClock: { value: 0 },
    uLoop: { value: 1 },
    uHistory: { value: 0 },
    uOpacity: { value: 0 },
    uScale: { value: scale },
  }
  return {
    lines: lineMaterial(uniforms),
    particles: particleMaterial(uniforms),
    markers: markerMaterial(uniforms),
    uniforms,
  }
}
