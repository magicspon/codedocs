import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, type JSX } from 'react'
import { AdditiveBlending, ShaderMaterial, Vector3 } from 'three'
import { rng } from '../lib/rng.ts'
import { tangents, type Vec3 } from '../lib/metro-sphere.ts'

/** How many drops fall at once, and the box round the camera they fall in. */
const DROPS = 2400
const BOX = 36

/**
 * Rain, in a box that travels with the camera. Each drop's place is the
 * camera's own position wrapped into the box, so drops stay put in the world
 * as the buggy drives through them rather than riding along with it. Pure
 * atmosphere: it stands for nothing in the data.
 */
function rainMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uClock: { value: 0 },
      uCamera: { value: new Vector3() },
      uUp: { value: new Vector3(0, 1, 0) },
      uEast: { value: new Vector3(1, 0, 0) },
      uNorth: { value: new Vector3(0, 0, 1) },
    },
    vertexShader: /* glsl */ `
      attribute float tail;
      uniform float uClock;
      uniform vec3 uCamera;
      uniform vec3 uUp;
      uniform vec3 uEast;
      uniform vec3 uNorth;
      varying float vNear;
      void main() {
        // The camera in the ground's own frame, so drops wrap round it.
        vec3 here = vec3(dot(uCamera, uEast), dot(uCamera, uUp) - uClock * 22.0, dot(uCamera, uNorth));
        vec3 local = (fract(position - here / ${BOX}.0) - 0.5) * ${BOX}.0;
        vec3 world = uCamera + uEast * (local.x - tail * 0.25) + uUp * (local.y + tail * 1.1) + uNorth * local.z;
        vNear = 1.0 - smoothstep(4.0, ${BOX / 2}.0, length(local));
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vNear;
      void main() {
        gl_FragColor = vec4(vec3(0.35, 0.45, 0.6) * 0.22 * vNear, 1.0);
      }
    `,
  })
}

const up = new Vector3()

/** The rain round the camera. */
export function MetroRain(): JSX.Element {
  const material = useMemo(rainMaterial, [])
  const drops = useMemo(() => {
    const random = rng(7)
    const positions = new Float32Array(DROPS * 6)
    const tail = new Float32Array(DROPS * 2)
    for (let i = 0; i < DROPS; i++) {
      const p = [random(), random(), random()]
      positions.set([...p, ...p], i * 6)
      tail.set([0, 1], i * 2)
    }
    return { positions, tail }
  }, [])
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ camera, clock }) => {
    const u = material.uniforms
    u.uClock!.value = clock.elapsedTime
    ;(u.uCamera!.value as Vector3).copy(camera.position)
    up.copy(camera.position).normalize()
    const [east, north] = tangents(up.toArray() as Vec3)
    ;(u.uUp!.value as Vector3).copy(up)
    ;(u.uEast!.value as Vector3).fromArray(east)
    ;(u.uNorth!.value as Vector3).fromArray(north)
  })
  return (
    <lineSegments material={material} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[drops.positions, 3]}
        />
        <bufferAttribute attach="attributes-tail" args={[drops.tail, 1]} />
      </bufferGeometry>
    </lineSegments>
  )
}
