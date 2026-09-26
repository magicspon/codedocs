import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  ShaderMaterial,
} from 'three'

/** A disc's inner edge, a bright orange past the bloom threshold, and its deep red rim. */
const HOT = new Color(2.2, 1.15, 0.3)
const COOL = new Color(0.8, 0.14, 0.02)
/** How much of a body's kind colour shows through the heat. */
const KIND = 0.12

/**
 * The material a black hole's disc bodies glow with: lit by their own heat,
 * not by a star, and added to what is behind them like the rest of the sky.
 * Colour comes per instance, from `heatColor`.
 */
export function discGlowMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

/**
 * How a disc body glows: bright orange at `heat` `0`, the inner edge,
 * cooling to deep red at `1`, the rim, with a little of its `kind` colour so the rings
 * still tell kinds apart. `flicker`, from `0` to `1`, varies one body from
 * the next.
 */
export function heatColor(kind: Color, heat: number, flicker: number): Color {
  return new Color()
    .lerpColors(HOT, COOL, heat)
    .lerp(kind, KIND)
    .multiplyScalar(0.6 + 0.6 * flicker)
}

/**
 * The light the hole's edge throws into its disc: a flat sheet from `inner`
 * to `outer`, blazing where it meets the dark and fading outward, so the
 * inner edge seems drawn out across the disc. `uOpacity` fades it with its
 * system. The sheet is a `RingGeometry`, so radius is read off its plane.
 */
export function edgeGlowMaterial(inner: number, outer: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: { uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying float vOut;
      void main() {
        // 0 at the dark's edge, 1 at the rim.
        vOut = (length(position.xy) - ${inner.toFixed(4)}) / ${(outer - inner).toFixed(4)};
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vOut;
      void main() {
        float out_ = clamp(vOut, 0.0, 1.0);
        // A sharp blaze at the edge over a long, soft tail.
        float glow = exp(-out_ * 9.0) * 1.4 + pow(1.0 - out_, 3.0) * 0.25;
        vec3 colour = mix(vec3(0.9, 0.2, 0.03), vec3(2.0, 1.2, 0.4), exp(-out_ * 5.0));
        gl_FragColor = vec4(colour * glow * uOpacity, 1.0);
      }
    `,
  })
}
