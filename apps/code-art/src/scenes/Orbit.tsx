import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
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
import { KINDS, type FileSymbols } from '../lib/atlas.ts'
import type { Planet, Ring } from '../lib/orbits.ts'
import { KIND_COLORS } from '../lib/palette.ts'
import { starLitMaterial } from '../lib/star-lit.ts'
import { Glimpses, type MoonsFor } from './Glimpses.tsx'
import { placeOf } from './place.ts'

const dummy = new Object3D()

/** A unit circle in the ring's plane, for its orbit line. */
const CIRCLE = new BufferGeometry().setFromPoints(
  Array.from({ length: 128 }, (_, k) => {
    const a = (k / 128) * Math.PI * 2
    return new Vector3(Math.cos(a), 0, Math.sin(a))
  }),
)

/** A planet's name and kind; just the kind while names load, or where none were exported. */
function PlanetLabel(props: {
  ring: Ring
  index: number
  symbols: FileSymbols | null
}): JSX.Element {
  const kind = KINDS[props.ring.kind]
  const planet = props.ring.planets[props.index]!
  const name = props.symbols?.names[planet.symbol]
  return (
    <Html
      position={placeOf(props.ring, planet)}
      center
      zIndexRange={[20, 10]}
      style={{ pointerEvents: 'none' }}
    >
      <span className="trace-label planet-label">
        {name ?? kind} {name && <i>{kind}</i>}
      </span>
    </Html>
  )
}

/** A faint shell round the body picked out by keyboard, so it can be found in a belt. */
function Marker(props: { ring: Ring; planet: Planet }): JSX.Element {
  return (
    <mesh
      position={placeOf(props.ring, props.planet)}
      scale={props.ring.size * 2.2}
      raycast={() => null}
    >
      <sphereGeometry args={[1, 16, 12]} />
      <meshBasicMaterial
        color="#ffffff"
        wireframe
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </mesh>
  )
}

/** What an orbit carries at its focused planet, when one of its planets is focused. */
export interface Focused {
  /** The focused planet's symbol. */
  readonly symbol: number
  /** Drawn at the planet and carried round with it: its moons. */
  readonly moons: ReactNode
  /** Set to the planet's anchor when the camera follows this planet. */
  readonly anchor: RefObject<Group | null> | null
}

/** The index on `ring` of `symbol`, or `-1` when it is not there. */
const indexOf = (ring: Ring, symbol: number | undefined): number =>
  symbol === undefined ? -1 : ring.planets.findIndex((p) => p.symbol === symbol)

/**
 * Which of a ring's bodies are marked, by index: the focused one, the one
 * picked out by keyboard, and the one named. The pointer's body is named
 * first, then the picked-out one, then the one the camera rides with.
 */
function marksOf(
  ring: Ring,
  focused: Focused | null,
  highlight: number | null,
  hovered: number | null,
): { focus: number; picked: number; named: number | null } {
  const focus = indexOf(ring, focused?.symbol)
  const picked = indexOf(ring, highlight ?? undefined)
  const riding = focused?.anchor && focus >= 0 ? focus : null
  return { focus, picked, named: hovered ?? (picked >= 0 ? picked : riding) }
}

/**
 * One orbit: its faint line, and its bodies turning on it. Clicking a body
 * names its symbol to `onSelect`; a focused body carries its moons round.
 */
export function Orbit({
  ring,
  symbols,
  focused,
  moonsFor,
  highlight,
  onSelect,
}: {
  ring: Ring
  symbols: FileSymbols | null
  focused: Focused | null
  /** Each body's moons, for the few it shows unfocused; `null` without names. */
  moonsFor: MoonsFor | null
  /** The symbol picked out by keyboard, if it is on this ring. */
  highlight: number | null
  onSelect: (symbol: number) => void
}): JSX.Element {
  const spin = useRef<Group>(null)
  const mesh = useRef<InstancedMesh>(null)
  // Lit by the system's star alone; whoever draws the system aims it there.
  const lit = useMemo(() => starLitMaterial(), [])
  useEffect(() => () => lit.dispose(), [lit])
  const [hovered, setHovered] = useState<number | null>(null)
  const color = KIND_COLORS[ring.kind]!
  const { focus, picked, named } = marksOf(ring, focused, highlight, hovered)

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
  // rotation per ring stands in for hundreds of per-planet updates. Read off
  // the clock, not summed, so a moon glimpsed unfocused is where it was once
  // its body is focused and its whole system drawn.
  useFrame(({ clock }) => {
    if (spin.current) spin.current.rotation.y = -ring.speed * clock.elapsedTime
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
            args={[undefined, lit, ring.planets.length]}
            // A planet names itself; the star behind it keeps the file's panel.
            onPointerMove={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              setHovered(e.instanceId ?? null)
            }}
            onPointerOut={() => setHovered(null)}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              const symbol = ring.planets[e.instanceId ?? -1]?.symbol ?? -1
              // Without names there is no tree, so nothing to zoom into.
              if (symbol >= 0) onSelect(symbol)
            }}
          >
            <sphereGeometry args={[1, 16, 12]} />
          </instancedMesh>
          {moonsFor && (
            <Glimpses
              ring={ring}
              moonsFor={moonsFor}
              skip={focus}
              full={picked}
            />
          )}
          {focused && focus >= 0 && (
            <group
              ref={focused.anchor}
              position={placeOf(ring, ring.planets[focus]!)}
            >
              {focused.moons}
            </group>
          )}
          {picked >= 0 && <Marker ring={ring} planet={ring.planets[picked]!} />}
          {named !== null && (
            <PlanetLabel ring={ring} index={named} symbols={symbols} />
          )}
        </group>
      </group>
    </group>
  )
}
