import type { JSX } from 'react'

/** The sun's radius, against a system's first ring 1.1 from it. */
const RADIUS = 0.16

/**
 * A system's star, drawn as a small sun at its centre: bright past the bloom
 * threshold, so it always outshines the planets it lights.
 */
export function Sun(): JSX.Element {
  return (
    <mesh scale={RADIUS} raycast={() => null}>
      <sphereGeometry args={[1, 24, 16]} />
      <meshBasicMaterial color={[2.6, 2.3, 1.9]} toneMapped={false} />
    </mesh>
  )
}
