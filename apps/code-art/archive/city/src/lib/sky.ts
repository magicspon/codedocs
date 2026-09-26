import { BackSide, Color, ShaderMaterial } from 'three'

/**
 * The night sky over the city, and its weather. Clear air is deep blue with
 * stars; as the health lens opens, the air thickens towards sodium-lit smog in
 * proportion to how much trouble the whole repository is in, and the stars go
 * out. The reading is the city's, not any one building's, so the weather says
 * at a glance what the alarm pillars say file by file.
 *
 * The colours live here in TypeScript and reach the shader as uniforms, so the
 * fog and the background can share the very same horizon colour.
 */

/** A sound repository's night: blue, with the city's own glow on the horizon. */
const CLEAR = {
  zenith: new Color('#04050c'),
  horizon: new Color('#0e1730'),
  glow: new Color('#24365e'),
}

/** A repository in trouble: the air goes brown and sodium-lit. */
const SMOG = {
  zenith: new Color('#171009'),
  horizon: new Color('#3a2410'),
  glow: new Color('#8a4c17'),
}

/** A sky dome and the handle that changes its weather. */
export interface Sky {
  readonly material: ShaderMaterial
  /**
   * The colour of the sky right at the horizon, glow included, kept current.
   * The scene hands this very object to the fog, so the ground haze fades into
   * exactly the sky behind it and leaves no seam along the horizon.
   */
  readonly horizon: Color
  /** Sets how choked the air is, from `0` (clear) to `1`. */
  readonly setSmog: (smog: number) => void
}

/** Builds the sky dome. Draw it on a large sphere with the camera inside. */
export function skyMaterial(): Sky {
  /** What the shader mixes towards at the horizon, before the glow. */
  const base = CLEAR.horizon.clone()
  const glow = CLEAR.glow.clone()
  const horizon = new Color()
  const uniforms = {
    uZenith: { value: CLEAR.zenith.clone() },
    uHorizon: { value: base },
    uGlow: { value: glow },
    uStars: { value: 1 },
  }
  /** The shader's `GLOW`, so the fog colour is the sky's own. */
  const GLOW = 0.6
  const material = new ShaderMaterial({
    // The camera sits inside the dome, and the sky is behind everything.
    side: BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform float uStars;
      varying vec3 vDir;

      /** How much of the city's glow reaches the sky right above the roofs. */
      const float GLOW = 0.6;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      /**
       * One star per cell of the sky, in a fixed place: the art is a function
       * of the data, and a sky that reshuffled on every reload would not be.
       */
      float starField(vec3 dir) {
        vec2 sphere = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
        vec2 grid = sphere * 90.0;
        vec2 cell = floor(grid);
        vec2 offset = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
        float near = length(fract(grid) - 0.5 - offset * 0.7);
        return step(0.982, hash21(cell)) * smoothstep(0.16, 0.0, near);
      }

      void main() {
        vec3 dir = normalize(vDir);
        // 1 at the zenith, 0 from about 45 degrees down.
        float up = clamp(dir.y * 1.4, 0.0, 1.0);
        vec3 sky = mix(uHorizon, uZenith, up);
        // The city throws its own light back off the air just above the roofs.
        // The horizon colour in TypeScript carries the same sum, so fog matches.
        sky += uGlow * pow(1.0 - up, 9.0) * GLOW;
        // Smog puts the stars out, and none show below the horizon.
        sky += vec3(0.75) * starField(dir) * uStars * step(0.015, dir.y);
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  })
  const sky = {
    material,
    horizon,
    setSmog(smog: number) {
      uniforms.uZenith.value.copy(CLEAR.zenith).lerp(SMOG.zenith, smog)
      base.copy(CLEAR.horizon).lerp(SMOG.horizon, smog)
      glow.copy(CLEAR.glow).lerp(SMOG.glow, smog)
      horizon.setRGB(
        base.r + glow.r * GLOW,
        base.g + glow.g * GLOW,
        base.b + glow.b * GLOW,
      )
      // Stars drown in the glow well before the air is fully choked.
      uniforms.uStars.value = Math.max(0, 1 - smog * 1.8)
    },
  }
  // Start the sky clear, so the horizon colour is right before the first frame.
  sky.setSmog(0)
  return sky
}
