import { ShaderMaterial, Vector3, type Material, type Object3D } from 'three'

/** How much light a body's dark side still gets: enough to see its edge, no more. */
const NIGHT = 0.04
/** A fully lit body's brightness against its colour; kept under its star's. */
const DAY = 0.85

/**
 * A body lit by its own star and nothing else: bright on the side that faces
 * `uStar`, dark on the far side. No scene lights are involved, so every
 * system in the sky is lit by its star at no extra cost, however many are
 * drawn. Colour comes per instance (`setColorAt`), or from `uColor` for a
 * mesh drawn once. `uOpacity` fades the body with its system.
 */
export function starLitMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    uniforms: {
      uStar: { value: new Vector3() },
      uColor: { value: new Vector3(1, 1, 1) },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uStar;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vToStar;
      varying vec3 vColor;
      void main() {
        mat4 model = modelMatrix;
        #ifdef USE_INSTANCING
          model = model * instanceMatrix;
        #endif
        vec4 world = model * vec4(position, 1.0);
        // Bodies are scaled evenly, so the model matrix turns normals true.
        vNormal = mat3(model) * normal;
        vToStar = uStar - world.xyz;
        vColor = uColor;
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vToStar;
      varying vec3 vColor;
      void main() {
        float day = max(dot(normalize(vNormal), normalize(vToStar)), 0.0);
        gl_FragColor = vec4(vColor * (${NIGHT.toFixed(3)} + ${DAY.toFixed(3)} * day), uOpacity);
      }
    `,
  })
}

const at = new Vector3()

/**
 * Points every star-lit body under `root` at the star at `root`'s own
 * origin, where a system's star sits. Called each frame, as systems move
 * with the galaxy.
 */
export function lightFrom(root: Object3D): void {
  root.getWorldPosition(at)
  root.traverse((o) => {
    const m = (o as { material?: Material }).material
    if (m instanceof ShaderMaterial && m.uniforms.uStar)
      (m.uniforms.uStar.value as Vector3).copy(at)
  })
}
