import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import { Object3D, Vector3, type InstancedMesh } from 'three'
import { glimpsesOf } from '../lib/glimpses.ts'
import type { Ring, System } from '../lib/orbits.ts'
import { KIND_COLORS } from '../lib/palette.ts'
import { starLitMaterial } from '../lib/star-lit.ts'
import { bodyAt, placeOf } from './place.ts'

const dummy = new Object3D()
const at = new Vector3()

/** The moons of the body of radius `size` naming `symbol`. */
export type MoonsFor = (symbol: number, size: number) => System

/**
 * A few moons round each of a ring's bodies, so a reader can see which
 * planets hold anything before zooming in. Drawn inside the ring's spin, so
 * they ride with their planets; the focused body is skipped, since it shows
 * all its moons instead. The body picked out shows all of its moons too.
 */
export function Glimpses(props: {
  ring: Ring
  moonsFor: MoonsFor
  /** The index on the ring of the focused body, or `-1`. */
  skip: number
  /** The index on the ring of the body picked out, which shows every moon, or `-1`. */
  full: number
}): JSX.Element | null {
  const { ring, moonsFor, skip, full } = props
  const mesh = useRef<InstancedMesh>(null)
  // Lit by the system's star, as the planets are.
  const lit = useMemo(() => starLitMaterial(), [])
  useEffect(() => () => lit.dispose(), [lit])
  // Flattened: each moon with the index of the planet it circles.
  const moons = useMemo(
    () =>
      ring.planets.flatMap((p, k) =>
        p.symbol < 0
          ? []
          : glimpsesOf(moonsFor(p.symbol, ring.size), k === full).map((g) => ({
              k,
              g,
            })),
      ),
    [ring, moonsFor, full],
  )

  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const time = clock.elapsedTime
    moons.forEach(({ k, g }, i) => {
      dummy.position.set(...placeOf(ring, ring.planets[k]!))
      dummy.position.add(bodyAt(g.ring, g.planet, time, at))
      dummy.scale.setScalar(k === skip ? 0 : g.ring.size)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })

  // Colours only change with the layout, not every frame.
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    moons.forEach(({ g }, i) => m.setColorAt(i, KIND_COLORS[g.ring.kind]!))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [moons])

  if (moons.length === 0) return null
  return (
    <instancedMesh
      // Keyed on the count, so a new layout gets a buffer of the right size.
      key={moons.length}
      ref={mesh}
      args={[undefined, lit, moons.length]}
      // Too small to aim at; clicks fall through to the planet.
      raycast={() => null}
      // The moons move every frame, so no bounding sphere holds them.
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 12, 8]} />
    </instancedMesh>
  )
}
