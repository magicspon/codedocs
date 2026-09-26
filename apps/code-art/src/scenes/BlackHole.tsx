import { Billboard } from '@react-three/drei'
import { useEffect, useMemo, type JSX } from 'react'
import { AdditiveBlending } from 'three'
import { edgeGlowMaterial } from '../lib/disc-glow.ts'
import { FIRST_RING } from '../lib/kepler.ts'
import type { Ring } from '../lib/orbits.ts'
import { Orbit } from './Orbit.tsx'

/** The dark's radius, against a disc whose inner edge lies about 1 out. */
const RADIUS = 0.55
/** Where the lensed image of the disc's inner edge sits, and how far it spreads. */
const LENS_EDGE = RADIUS * 1.15
const LENS_SQUEEZE = 0.45

const nothing = (): void => {}

/**
 * The disc as the hole bends its light: every ring stood upright, facing the
 * camera and squeezed in against the dark. The far side of a real disc shows
 * over the top of the hole and under it; this draws that halo from any angle.
 */
function lensed(ring: Ring): Ring {
  return {
    ...ring,
    tilt: Math.PI / 2,
    node: 0,
    radius: LENS_EDGE + (ring.radius - FIRST_RING) * LENS_SQUEEZE,
  }
}

/**
 * The edge's light spread into a sheet from `inner` to `outer`, in the plane
 * a `RingGeometry` lies in: face on to the camera inside a `Billboard`.
 */
function EdgeGlow(props: { inner: number; outer: number }): JSX.Element {
  const { inner, outer } = props
  const glow = useMemo(() => edgeGlowMaterial(inner, outer), [inner, outer])
  useEffect(() => () => glow.dispose(), [glow])
  return (
    <mesh material={glow} raycast={() => null}>
      <ringGeometry args={[inner, outer, 128, 8]} />
    </mesh>
  )
}

/**
 * A test file's star: a black hole. A dark sphere hides whatever is behind
 * it, and a thin photon ring hugs its edge, its light spilling out across
 * the disc and its halo. Its accretion disc is its own
 * symbols, which `orbitsOf` lays into one glowing sheet round it; `rings`
 * are that disc, drawn again here as its lensed halo. Empty while names load.
 */
export function BlackHole(props: { rings: readonly Ring[] }): JSX.Element {
  const halo = useMemo(() => props.rings.map(lensed), [props.rings])
  // Every ring of a disc shares its plane, so the first ring's tilt is the disc's.
  const plane = props.rings[0]
  const rim = (rings: readonly Ring[]): number =>
    (rings.at(-1)?.radius ?? 0) + 0.3
  return (
    <>
      {/* Drawn first, so what lies behind the dark is hidden. */}
      <mesh scale={RADIUS} renderOrder={-1} raycast={() => null}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshBasicMaterial color="black" />
      </mesh>
      {plane && (
        <group rotation-y={plane.node}>
          <group rotation-x={plane.tilt}>
            {/* A ring geometry lies across y; the disc lies across its orbits' xz. */}
            <group rotation-x={-Math.PI / 2}>
              <EdgeGlow inner={RADIUS * 1.02} outer={rim(props.rings)} />
            </group>
          </group>
        </group>
      )}
      <Billboard>
        {plane && <EdgeGlow inner={RADIUS * 1.04} outer={rim(halo)} />}
        <mesh raycast={() => null}>
          <ringGeometry args={[RADIUS * 1.01, RADIUS * 1.04, 96, 1]} />
          <meshBasicMaterial
            color={[2.2, 1.3, 0.5]}
            toneMapped={false}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
        {halo.map((ring) => (
          <Orbit
            key={ring.kind}
            ring={ring}
            symbols={null}
            focused={null}
            moonsFor={null}
            highlight={null}
            onSelect={nothing}
            ghost
          />
        ))}
      </Billboard>
    </>
  )
}
