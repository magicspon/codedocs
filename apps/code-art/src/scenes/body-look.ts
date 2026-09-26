import { useEffect, useMemo } from 'react'
import {
  SphereGeometry,
  type BufferGeometry,
  type Color,
  type Material,
  type Object3D,
} from 'three'
import { discGlowMaterial, heatColor } from '../lib/disc-glow.ts'
import type { Planet, Ring } from '../lib/orbits.ts'
import { starLitMaterial } from '../lib/star-lit.ts'
import { streakGeometry } from '../lib/streak.ts'
import { placeOf } from './place.ts'

/** How far a disc body is drawn out along its orbit, against its size. */
const STREAK = 12

/**
 * A belt or cloud body's size against its ring's, from its phase: rubble
 * comes in all sizes, while a planet on its own orbit is drawn true.
 */
function rubbleScale(ring: Ring, p: Planet): number {
  if (ring.form === 'orbit') return 1
  const t = Math.sin(p.phase * 91.7) * 43758.5453
  return 0.5 + (t - Math.floor(t))
}

/**
 * Poses `out` as planet `p` on `ring`, before the ring turns. A planet is a
 * round body; a black hole's disc body is a streak, whose own geometry
 * carries its size, turned so it lies along its orbit at its phase.
 */
export function poseBody(ring: Ring, p: Planet, out: Object3D): void {
  out.position.set(...placeOf(ring, p))
  if (ring.heat === null) {
    out.rotation.set(0, 0, 0)
    out.scale.setScalar(ring.size * rubbleScale(ring, p))
  } else {
    out.rotation.set(0, -p.phase, 0)
    out.scale.setScalar(1)
  }
  out.updateMatrix()
}

/**
 * The shape of a ring's bodies: a unit sphere for a planet, which its pose
 * sizes, or on a disc a streak bent round the ring, so the disc reads as
 * fine arcs of hot matter.
 */
function bodyGeometry(ring: Ring): BufferGeometry {
  return ring.heat === null
    ? new SphereGeometry(1, 16, 12)
    : streakGeometry(ring.radius, ring.size * STREAK, ring.size * 0.4)
}

/** Planet `p`'s colour: its `kind`'s, or on a disc, the heat of its ring. */
export function bodyColor(ring: Ring, p: Planet, kind: Color): Color {
  if (ring.heat === null) return kind
  // Varied by phase, so neighbouring streaks do not glow alike.
  return heatColor(kind, ring.heat, 0.5 + 0.5 * Math.sin(p.phase * 37))
}

/**
 * What a ring's bodies are drawn with: lit by the system's star alone, which
 * whoever draws the system aims there, or on a `hot` disc, which has no star
 * to light it, glowing with their own heat.
 */
function bodyMaterial(hot: boolean): Material {
  return hot ? discGlowMaterial() : starLitMaterial()
}

/** A ring's body material and shape, made once per ring and freed with it. */
export function useBodyLook(ring: Ring): {
  lit: Material
  shape: BufferGeometry
} {
  const hot = ring.heat !== null
  const lit = useMemo(() => bodyMaterial(hot), [hot])
  const shape = useMemo(() => bodyGeometry(ring), [ring])
  useEffect(() => () => shape.dispose(), [shape])
  useEffect(() => () => lit.dispose(), [lit])
  return { lit, shape }
}
