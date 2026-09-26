import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import { Object3D, Vector3, type InstancedMesh } from 'three'
import { glimpsesOf } from '../lib/glimpses.ts'
import type { Ring, System } from '../lib/orbits.ts'
import { KIND_COLORS } from '../lib/palette.ts'
import { starLitMaterial } from '../lib/star-lit.ts'
import { bodyAt, placeOf } from './place.ts'
import { MOON_SPHERE } from './spheres.ts'

const dummy = new Object3D()
const at = new Vector3()

/** Whether `o` and everything above it is drawn: a hidden branch need not be posed. */
function drawn(o: Object3D): boolean {
  for (let at: Object3D | null = o; at; at = at.parent)
    if (!at.visible) return false
  return true
}

/** The moons of the body of radius `size` naming `symbol`. */
export type MoonsFor = (symbol: number, size: number) => System

/** A glimpsed moon: the index of the planet it circles, where that planet sits, and its own orbit. */
interface Moon {
  readonly k: number
  readonly base: readonly [number, number, number]
  readonly g: ReturnType<typeof glimpsesOf>[number]
}

/** Poses every moon in `m` at `time`, hiding those round planet `skip`. */
function poseMoons(
  m: InstancedMesh,
  moons: readonly Moon[],
  skip: number,
  time: number,
): void {
  for (let i = 0; i < moons.length; i++) {
    const { k, g, base } = moons[i]!
    dummy.position.set(base[0], base[1], base[2])
    dummy.position.add(bodyAt(g.ring, g.planet, time, at))
    dummy.scale.setScalar(k === skip ? 0 : g.ring.size)
    dummy.updateMatrix()
    m.setMatrixAt(i, dummy.matrix)
  }
  m.instanceMatrix.needsUpdate = true
}

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
  // Flattened: each moon with the index of the planet it circles, and where
  // that planet sits, which never changes inside the ring's spin.
  const moons = useMemo<Moon[]>(
    () =>
      ring.planets.flatMap((p, k) =>
        p.symbol < 0
          ? []
          : glimpsesOf(moonsFor(p.symbol, ring.size), k === full).map((g) => ({
              k,
              g,
              base: placeOf(ring, p),
            })),
      ),
    [ring, moonsFor, full],
  )
  // The layout last posed; a new one is posed at once, even out of sight.
  const posed = useRef<readonly Moon[] | null>(null)

  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    // Out of sight, the moons wait; each layout is posed once first, so they never show unplaced.
    if (posed.current === moons && !drawn(m)) return
    posed.current = moons
    poseMoons(m, moons, skip, clock.elapsedTime)
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
      args={[MOON_SPHERE, lit, moons.length]}
      // Too small to aim at; clicks fall through to the planet.
      raycast={() => null}
      // The moons move every frame, so no bounding sphere holds them.
      frustumCulled={false}
    />
  )
}
