import { AdditiveBlending, ShaderMaterial, Vector3 } from 'three'
import { KIND_COLORS } from '../lib/palette.ts'
import { HUBS } from '../lib/terrain-layout.ts'

/**
 * The terrain's shaders. The ground is drawn as light, not as lit rock: fine
 * grid lines in each range's colour over a near-black fill, brighter up the
 * peaks, with the river beds glowing through. A ring of light sweeps out from
 * the root now and then, like a sonar ping, so the still picture breathes.
 */

/** Distance fog to the background, shared by every terrain shader. */
const FOG_GLSL = /* glsl */ `
  uniform float uFogNear;
  uniform float uFogFar;
  float fogOf(float depth) {
    return 1.0 - smoothstep(uFogNear, uFogFar, depth);
  }
`

/**
 * A thin anti-aliased line wherever `v` crosses a whole number. Where lines
 * crowd closer than a few pixels, as on a slope turned from the camera, they
 * fade: packed together under bloom they would read as a white sheet.
 */
const LINE_GLSL = /* glsl */ `
  float lineAt(float v, float width) {
    float w = max(fwidth(v), 1e-4);
    float d = abs(fract(v - 0.5) - 0.5) / w;
    float crowd = clamp(0.25 / w, 0.0, 1.0);
    return (1.0 - smoothstep(0.0, width, d)) * crowd;
  }
`

/** Uniforms every terrain shader takes. */
function shared(radius: number): Record<string, { value: unknown }> {
  return {
    uClock: { value: 0 },
    uFogNear: { value: radius * 1.2 },
    uFogFar: { value: radius * 4 },
  }
}

/**
 * The ground. Rows run along x every `cell`, with fainter cross lines every
 * third, and contour lines ring each peak. `uHover` lights the ground round
 * the file under the pointer; `uPeak` scales height to `0`–`1`. `uHubs`
 * holds up to `HUBS` most-called files as `[x, z, share]`, and amber rings
 * close in on each along the grid lines, as if the calls were flowing in.
 * The rock is banded by kind (`strataLow`, `strataHigh`, `rise`: see
 * `terrain-strata.ts`), in the galaxy's star colours.
 */
export function surfaceMaterial(
  radius: number,
  peak: number,
  cell: number,
): ShaderMaterial {
  return new ShaderMaterial({
    vertexColors: true,
    uniforms: {
      ...shared(radius),
      uPeak: { value: peak },
      uCell: { value: cell },
      uRadius: { value: radius },
      uHover: { value: new Vector3() },
      uHoverOn: { value: 0 },
      uHubs: { value: Array.from({ length: HUBS }, () => new Vector3()) },
      uHubCount: { value: 0 },
      uKinds: { value: KIND_COLORS },
    },
    vertexShader: /* glsl */ `
      attribute float wet;
      attribute vec4 strataLow;
      attribute vec4 strataHigh;
      attribute float rise;
      flat varying vec4 vLow;
      flat varying vec4 vHigh;
      varying float vRise;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying float vWet;
      varying float vDepth;
      void main() {
        vColor = color;
        vWet = wet;
        vLow = strataLow;
        vHigh = strataHigh;
        vRise = rise;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mv = viewMatrix * world;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uClock;
      uniform float uPeak;
      uniform float uCell;
      uniform float uRadius;
      uniform vec3 uHover;
      uniform float uHoverOn;
      uniform vec3 uHubs[${HUBS}];
      uniform int uHubCount;
      uniform vec3 uKinds[8];
      flat varying vec4 vLow;
      flat varying vec4 vHigh;
      varying float vRise;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying float vWet;
      varying float vDepth;
      ${FOG_GLSL}
      ${LINE_GLSL}
      // Rings closing in on each hub: the phase grows with distance plus
      // time, so a crest moves inwards. Busier hubs reach further and burn brighter.
      float ripplesAt(vec2 at) {
        float sum = 0.0;
        for (int i = 0; i < ${HUBS}; i++) {
          if (i >= uHubCount) break;
          vec3 hub = uHubs[i];
          float d = length(at - hub.xy);
          float reach = uRadius * (0.09 + 0.15 * hub.z);
          float wave = pow(0.5 + 0.5 * sin(d / (uRadius * 0.012) + uClock * 2.2 + float(i) * 1.7), 6.0);
          sum += wave * (1.0 - smoothstep(0.0, reach, d)) * (0.35 + 0.65 * hub.z);
        }
        return sum;
      }
      // The kind band at this height up the peak, and how near its top edge.
      // Empty kinds have no width, so the loop steps straight past them.
      vec4 strata(out float seam) {
        float bands[8] = float[8](vLow.x, vLow.y, vLow.z, vLow.w, vHigh.x, vHigh.y, vHigh.z, vHigh.w);
        seam = 0.0;
        for (int k = 0; k < 8; k++) {
          if (vRise <= bands[k]) {
            float edge = abs(vRise - bands[k]) / max(fwidth(vRise), 1e-4);
            // No seam at the summit: the last band ends at the top, not at a neighbour.
            seam = bands[k] < 0.999 ? 1.0 - smoothstep(0.0, 1.2, edge) : 0.0;
            return vec4(uKinds[k], 1.0);
          }
        }
        return vec4(0.0);
      }
      void main() {
        float up = clamp(vWorld.y / uPeak, -1.0, 1.5);
        float high = clamp(up, 0.0, 1.0);
        float rows = lineAt(vWorld.z / (uCell * 0.75), 0.9);
        float cross = lineAt(vWorld.x / (uCell * 3.0), 0.8) * 0.3;
        float contour = lineAt(vWorld.y / (uPeak * 0.08), 1.0) * 0.4 * smoothstep(0.05, 0.3, high);
        float lines = max(max(rows, cross), contour);
        // Low ground is dim, summits run towards white.
        // Strata tint the rock, not the open ground, and fade in up the slope.
        float seam;
        vec4 band = strata(seam);
        float layered = band.a * step(0.0, vRise) * smoothstep(0.03, 0.18, high);
        vec3 base = mix(vColor, band.rgb, layered * 0.85);
        vec3 ink = mix(base * (0.3 + 0.9 * high), vec3(1.0, 0.96, 0.92), high * high * 0.25);
        // Water below sea level: lakes of tests and the deepest river beds.
        float sea = smoothstep(0.0, -0.12, up);
        vec3 fill = vColor * 0.035 + vec3(0.02, 0.05, 0.09) * sea;
        // The river bed shimmers faintly, brighter where more calls run.
        vec3 river = vec3(0.3, 0.75, 1.0) * vWet * (0.16 + 0.05 * sin(uClock * 1.7 + vWorld.x * 0.4));
        // The ping: a ring every twelve seconds, out from the root.
        float r = length(vWorld.xz);
        float ring = mod(uClock * uRadius * 0.12, uRadius * 1.8);
        float ping = exp(-pow((r - ring) / (uRadius * 0.03), 2.0)) * (1.0 - ring / (uRadius * 1.8));
        float near = uHoverOn * exp(-pow(length(vWorld.xz - uHover.xz) / (uRadius * 0.05), 2.0));
        float ripple = ripplesAt(vWorld.xz);
        vec3 amber = vec3(1.0, 0.7, 0.32);
        vec3 color = fill + ink * lines * (0.42 + ping * 1.2 + near * 1.4) + river
          + amber * ripple * (lines * 1.8 + 0.07)
          // A thin bright seam where one kind's band meets the next.
          + band.rgb * (seam * 1.1 + 0.035) * layered;
        gl_FragColor = vec4(color * fogOf(vDepth), 1.0);
      }
    `,
  })
}

/**
 * River light: a faint steady line with bright pulses running down it the way
 * the calls run. Busier rivers are brighter and pulse faster.
 */
export function waterMaterial(radius: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: shared(radius),
    vertexShader: /* glsl */ `
      attribute float along;
      attribute float flow;
      varying float vAlong;
      varying float vFlow;
      varying float vDepth;
      void main() {
        vAlong = along;
        vFlow = flow;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uClock;
      varying float vAlong;
      varying float vFlow;
      varying float vDepth;
      ${FOG_GLSL}
      void main() {
        float pulse = pow(fract(vAlong * 0.12 - uClock * (0.25 + 0.5 * vFlow)), 10.0);
        vec3 deep = vec3(0.2, 0.55, 1.0);
        vec3 bright = vec3(0.75, 0.97, 1.0);
        // A dry bed is a faint vein; water brightens with its calls and pulses.
        float wet = step(0.001, vFlow);
        vec3 color = mix(deep, bright, vFlow) * (0.06 + wet * (0.12 + 0.8 * vFlow)) + bright * pulse * wet * (0.25 + vFlow);
        gl_FragColor = vec4(color * fogOf(vDepth), 1.0);
      }
    `,
  })
}
