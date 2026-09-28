import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type JSX, type Ref } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  EdgesGeometry,
  ShaderMaterial,
  type Color,
  type Group,
} from 'three'

/**
 * The buggy as drawn: a low dark wedge outlined in neon, four fat wheels, a
 * roll cage, and a glow on the road beneath. Built facing `-z` with `y` up,
 * as a camera is, so the scene can set it from the driver's own axes. From
 * the driver's seat only the nose and the cage's front hoop are in view.
 */

/** Where the wheels sit, `[x, z]`, and how big they are. */
const WHEELS = [
  [-0.95, -1.05],
  [0.95, -1.05],
  [-0.95, 1.05],
  [0.95, 1.05],
] as const
export const WHEEL_RADIUS = 0.42

/** One wheel: a squat drum with a bright hub, spun by `spin` radians. */
function Wheel(props: {
  at: readonly [number, number]
  spin: { current: number }
  neon: Color
}): JSX.Element {
  const wheel = useRef<Group>(null)
  useFrame(() => {
    if (wheel.current) wheel.current.rotation.x = -props.spin.current
  })
  return (
    <group position={[props.at[0], WHEEL_RADIUS, props.at[1]]}>
      <group ref={wheel}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.36, 12]} />
          <meshBasicMaterial color="#050508" />
        </mesh>
        <mesh
          rotation={[0, 0, Math.PI / 2]}
          position={[Math.sign(props.at[0]) * 0.19, 0, 0]}
        >
          <torusGeometry args={[WHEEL_RADIUS * 0.6, 0.03, 4, 12]} />
          <meshBasicMaterial color={props.neon} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

/** A soft pool of light, brightest under the middle and gone by the edges. */
function glowBeneath(neon: Color): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: neon } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float d = length((vUv - 0.5) * 2.0);
        gl_FragColor = vec4(uColor * pow(max(1.0 - d, 0.0), 2.0) * 0.35, 1.0);
      }
    `,
  })
}

/** The buggy, posed by its parent every frame; `spin` turns the wheels. */
export function BuggyBody(props: {
  neon: Color
  spin: { current: number }
  ref: Ref<Group>
}): JSX.Element {
  const { neon, spin, ref } = props
  const glow = useMemo(() => glowBeneath(neon), [neon])
  const edges = useMemo(
    () => ({
      body: new EdgesGeometry(new BoxGeometry(1.7, 0.36, 2.9)),
      nose: new EdgesGeometry(new BoxGeometry(1.3, 0.12, 0.9)),
    }),
    [],
  )
  useEffect(
    () => () => {
      glow.dispose()
      edges.body.dispose()
      edges.nose.dispose()
    },
    [glow, edges],
  )
  return (
    <group ref={ref}>
      {/* The tub and its neon outline. */}
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[1.7, 0.36, 2.9]} />
        <meshBasicMaterial color="#07070c" />
      </mesh>
      <lineSegments geometry={edges.body} position={[0, 0.62, 0]}>
        <lineBasicMaterial color={neon} toneMapped={false} />
      </lineSegments>
      {/* The nose, raised so it shows below the driver's eye. */}
      <mesh position={[0, 0.84, -0.98]}>
        <boxGeometry args={[1.3, 0.12, 0.9]} />
        <meshBasicMaterial color="#0b0b14" />
      </mesh>
      <lineSegments geometry={edges.nose} position={[0, 0.84, -0.98]}>
        <lineBasicMaterial color={neon} toneMapped={false} />
      </lineSegments>
      {/* Headlamps. */}
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.66, -1.46]}>
          <boxGeometry args={[0.36, 0.1, 0.04]} />
          <meshBasicMaterial color="#fff6e0" toneMapped={false} />
        </mesh>
      ))}
      {/* Tail lamps. */}
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.66, 1.46]}>
          <boxGeometry args={[0.4, 0.08, 0.04]} />
          <meshBasicMaterial color="#ff2040" toneMapped={false} />
        </mesh>
      ))}
      {/* The roll cage's hoop, over the driver. */}
      <mesh position={[0, 1.55, 0.35]}>
        <torusGeometry args={[0.8, 0.035, 4, 16, Math.PI]} />
        <meshBasicMaterial color={neon} toneMapped={false} />
      </mesh>
      {/* Glow on the road beneath. */}
      <mesh
        position={[0, 0.05, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={glow}
      >
        <planeGeometry args={[3.4, 4.6]} />
      </mesh>
      {WHEELS.map((at) => (
        <Wheel key={`${at[0]}:${at[1]}`} at={at} spin={spin} neon={neon} />
      ))}
    </group>
  )
}
