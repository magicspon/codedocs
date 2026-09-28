import { DoubleSide, ShaderMaterial } from 'three'
import { METRO_GLSL, type MetroUniforms } from './metro-glsl.ts'

/**
 * The ground and the roads. The ground is wet black tarmac with a faint
 * hexagonal paving that catches the sky. The roads carry the calls as
 * traffic: one lane runs towards the root with white headlights, the other
 * away from it with red tail lights, as busy as the calls on that stretch of
 * the folder tree. A lane no call uses stands empty.
 */

/** Passes the world position and depth to the fragment shader. */
const GROUND_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

/** The planet's ground, from any side of it. */
export function groundMaterial(shared: MetroUniforms): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: GROUND_VERTEX,
    fragmentShader: /* glsl */ `
      ${METRO_GLSL}
      varying vec3 vWorld;
      varying float vDepth;
      // Distance to the nearest hexagon edge, for paving 3 units across.
      float hexEdge(vec2 p) {
        p /= 3.0;
        vec2 r = vec2(1.0, 1.732);
        vec2 h = r * 0.5;
        vec2 a = mod(p, r) - h;
        vec2 b = mod(p - h, r) - h;
        vec2 g = dot(a, a) < dot(b, b) ? a : b;
        g = abs(g);
        return 0.5 - max(dot(g, normalize(r)), g.x);
      }
      void main() {
        // Paving laid in the two planes the ground is least steep to, so it never smears.
        vec3 n = abs(normalize(vWorld));
        vec2 p = n.y > max(n.x, n.z) ? vWorld.xz : (n.x > n.z ? vWorld.yz : vWorld.xy);
        float edge = hexEdge(p);
        float seam = 1.0 - smoothstep(0.0, 0.04 + fwidth(edge) * 1.5, edge);
        // Puddles: patches where the paving shines.
        float wet = smoothstep(0.55, 0.8, hash21(floor(p / 9.0)));
        vec3 color = vec3(0.004, 0.004, 0.008) + vec3(0.012, 0.008, 0.03) * seam * (0.4 + wet);
        gl_FragColor = vec4(mix(color, uFog, hazeOf(vDepth)), 1.0);
      }
    `,
  })
}

/** The roads: kerbs of neon, dashes down the middle, and traffic. */
export function roadMaterial(shared: MetroUniforms): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      attribute vec4 info;
      attribute vec3 tint;
      attribute vec3 jam;
      varying vec2 vUv;
      varying vec4 vInfo;
      varying vec3 vJam;
      varying vec3 vTint;
      varying float vDepth;
      void main() {
        vUv = uv;
        vInfo = info;
        vJam = jam;
        vTint = tint;
        vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${METRO_GLSL}
      varying vec2 vUv;
      varying vec4 vInfo;
      varying vec3 vJam;
      varying vec3 vTint;
      varying float vDepth;
      // One lane's cars, as many as \`busy\` asks for: each a pair of lamps
      // with a faint glow and a light trail behind. \`side\` is how far across
      // the lane's middle this point is; \`toEnd\` how far the lane still has to
      // drive to the junction it heads for, where it queues as hard as \`jam\`.
      //
      // The queue is a squeeze of the traffic's own pattern near the junction:
      // cars packed closer there also move slower, as the flow along a lane
      // must stay the same. Queued cars show their brake lights.
      float cars(float toEnd, float side, float busy, float jam, float seed, out float brake) {
        brake = 0.0;
        if (busy <= 0.0) return 0.0;
        float pace = 0.35 + 0.65 * busy;
        float spacing = mix(18.0, 5.0, pace);
        const float QUEUE = 14.0;
        float near = exp(-toEnd / QUEUE);
        float squeeze = 1.0 + jam * near;
        float warped = toEnd + jam * QUEUE * (1.0 - near);
        float at = (warped + uClock * 13.0) / spacing;
        float slot = floor(at);
        float here = step(hash21(vec2(slot, seed * 53.0)), 0.35 + pace * 0.6);
        // Along the lane from the car's middle, in world units; positive is behind it.
        float u = (fract(at) - 0.5) * spacing / squeeze;
        float lamps = 1.0 - smoothstep(0.09, 0.18, length(vec2(abs(side) - 0.4, u)));
        float body = (1.0 - smoothstep(0.6, 0.9, abs(u))) * (1.0 - smoothstep(0.45, 0.7, abs(side))) * 0.1;
        // Moving cars trail light; queued ones barely move, so barely trail.
        float trail = step(0.0, u) * exp(-u / 3.5) * (1.0 - smoothstep(0.12, 0.4, abs(side))) * 0.4 / squeeze;
        brake = here * (1.0 - smoothstep(0.09, 0.2, length(vec2(abs(side) - 0.4, u - 0.8)))) * min(1.0, jam * near);
        return here * (lamps * 2.0 + body + trail);
      }
      void main() {
        float width = vInfo.x;
        float x = vUv.y * width * 0.5;
        float along = vUv.x;
        vec3 color = vec3(0.006, 0.006, 0.011);
        // Kerbs.
        float kerb = 1.0 - smoothstep(0.03, 0.12, width * 0.5 - abs(x));
        color += vTint * kerb * 0.8;
        // Dashes down the middle.
        float dash = (1.0 - smoothstep(0.05, 0.1, abs(x))) * step(0.55, fract(along / 5.0));
        color += vec3(0.9, 0.75, 0.45) * dash * 0.3;
        // Traffic, down the middle of each lane: towards the root on the right.
        float side = abs(x) - width * 0.25;
        // The lane to the root drives to the road's start; the other to its end.
        float brakeTo;
        float brakeFrom;
        float toRoot = cars(along, side, vInfo.y, vJam.y, vInfo.w, brakeTo) * step(0.0, x);
        float fromRoot = cars(vJam.x - along, side, vInfo.z, vJam.z, vInfo.w + 0.5, brakeFrom) * step(x, 0.0);
        vec3 traffic = vec3(1.3, 1.25, 1.1) * toRoot + vec3(1.7, 0.14, 0.2) * fromRoot
          + vec3(2.2, 0.1, 0.12) * (brakeTo * step(0.0, x) + brakeFrom * step(x, 0.0));
        // The haze dims the traffic only half as much: it is what makes the roads read.
        float haze = hazeOf(vDepth);
        gl_FragColor = vec4(mix(color, uFog, haze) + traffic * (1.0 - haze * 0.5), 1.0);
      }
    `,
  })
}
