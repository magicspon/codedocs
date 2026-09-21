import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type RefObject,
} from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Object3D,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three'
import { useNames } from '../hooks.ts'
import { KINDS, type FileDatum } from '../lib/atlas.ts'
import { orbitsOf, type Planet, type Ring } from '../lib/orbits.ts'
import { KIND_COLORS } from '../lib/palette.ts'

const dummy = new Object3D()

/** A unit circle in the ring's plane, for its orbit line. */
const CIRCLE = new BufferGeometry().setFromPoints(
  Array.from({ length: 128 }, (_, k) => {
    const a = (k / 128) * Math.PI * 2
    return new Vector3(Math.cos(a), 0, Math.sin(a))
  }),
)

/** Where planet `p` sits on `ring`, before the ring turns. */
function placeOf(ring: Ring, p: Planet): [number, number, number] {
  const r = ring.radius + p.drift
  return [Math.cos(p.phase) * r, p.lift, Math.sin(p.phase) * r]
}

/** The hovered planet's name and kind; just the kind while names load, or where none were exported. */
function PlanetLabel(props: {
  ring: Ring
  index: number
  name: string | undefined
}): JSX.Element {
  const kind = KINDS[props.ring.kind]
  return (
    <Html
      position={placeOf(props.ring, props.ring.planets[props.index]!)}
      center
      zIndexRange={[20, 10]}
      style={{ pointerEvents: 'none' }}
    >
      <span className="trace-label planet-label">
        {props.name ?? kind} {props.name && <i>{kind}</i>}
      </span>
    </Html>
  )
}

/** One orbit: its faint line, and its planets turning on it. */
function Orbit({
  ring,
  names,
}: {
  ring: Ring
  /** This kind's names, in source order: planet `k` is symbol `k`. */
  names: readonly string[] | undefined
}): JSX.Element {
  const spin = useRef<Group>(null)
  const mesh = useRef<InstancedMesh>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const color = KIND_COLORS[ring.kind]!

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    ring.planets.forEach((p, k) => {
      dummy.position.set(...placeOf(ring, p))
      dummy.scale.setScalar(ring.size)
      dummy.updateMatrix()
      m.setMatrixAt(k, dummy.matrix)
      m.setColorAt(k, color)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [ring, color])

  // The whole ring turns as one: its planets never pass each other, so one
  // rotation per ring stands in for hundreds of per-planet updates.
  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y -= ring.speed * delta
  })

  return (
    <group rotation-y={ring.node}>
      <group rotation-x={ring.tilt}>
        <lineLoop geometry={CIRCLE} scale={ring.radius}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={0.22}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </lineLoop>
        <group ref={spin}>
          <instancedMesh
            ref={mesh}
            args={[undefined, undefined, ring.planets.length]}
            // A planet names itself; the star behind it keeps the file's panel.
            onPointerMove={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              setHovered(e.instanceId ?? null)
            }}
            onPointerOut={() => setHovered(null)}
          >
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial
              roughness={0.7}
              emissive={color}
              emissiveIntensity={0.12}
            />
          </instancedMesh>
          {hovered !== null && (
            <PlanetLabel ring={ring} index={hovered} name={names?.[hovered]} />
          )}
        </group>
      </group>
    </group>
  )
}

/** A picked file, and where its star sits in the galaxy. */
export interface Pick {
  readonly file: FileDatum
  readonly at: readonly [number, number, number]
}

/**
 * Eases `grow` towards `open` and scales `system` to match. Slower than the
 * lens: the planets should still be unfurling as the camera lands.
 */
function useUnfold(
  open: boolean,
  grow: { current: number },
  system: RefObject<Group | null>,
): void {
  useFrame((_, delta) => {
    const target = open ? 1 : 0
    const next =
      grow.current + (target - grow.current) * Math.min(1, delta * 2.2)
    grow.current = Math.abs(target - next) < 0.002 ? target : next
    const g = system.current
    if (!g) return
    // An ease-out on the scale, so they fly out fast and settle into orbit.
    g.scale.setScalar(Math.max(1 - (1 - grow.current) ** 3, 1e-4))
    g.visible = grow.current > 0
  })
}

/** One file's system, drawn at its star. */
function System(props: {
  repo: string
  shown: Pick
  system: RefObject<Group | null>
}): JSX.Element {
  const { file, at } = props.shown
  const orbits = useMemo(() => orbitsOf(file), [file])
  // Read on the first pick, not before: names can outweigh the dataset.
  const names = useNames(props.repo, file.path)
  return (
    <group ref={props.system} position={at} visible={false}>
      {/* The star lights its own planets; nothing else in the galaxy is lit. */}
      <pointLight intensity={4} decay={0} distance={orbits.reach * 3} />
      <ambientLight intensity={0.12} />
      {orbits.rings.map((ring) => (
        <Orbit
          key={`${file.path}:${ring.kind}`}
          ring={ring}
          names={names?.[ring.kind]}
        />
      ))}
    </group>
  )
}

/**
 * A picked file's symbols as planets round its star, one orbit per kind. They
 * swing out from the star when the file is picked and fold back into it when
 * the pick is cleared. `grow` reports how far out they are, `0` to `1`, so the
 * galaxy can hand the file's own star cloud over to its planets. Hovering a
 * planet names its symbol.
 */
export function Planets(props: {
  /** The repository's name, which its symbol names are filed under. */
  repo: string
  pick: Pick | null
  grow: { current: number }
}): JSX.Element | null {
  const system = useRef<Group>(null)
  // The last pick stays drawn while its planets fold away.
  const last = useRef(props.pick)
  last.current = props.pick ?? last.current
  useUnfold(props.pick !== null, props.grow, system)
  if (!last.current) return null
  return <System repo={props.repo} shown={last.current} system={system} />
}
