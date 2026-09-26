import type { JSX } from 'react'
import { SUN_SPHERE } from './spheres.ts'

/** The sun's radius, against a system's first ring 1.1 from it. */
const RADIUS = 0.16

/**
 * A system's star, drawn as a small sun at its centre: bright past the bloom
 * threshold, so it always outshines the planets it lights.
 */
export function Sun(): JSX.Element {
  return (
    <mesh geometry={SUN_SPHERE} scale={RADIUS} raycast={() => null}>
      <meshBasicMaterial color={[2.6, 2.3, 1.9]} toneMapped={false} />
    </mesh>
  )
}
