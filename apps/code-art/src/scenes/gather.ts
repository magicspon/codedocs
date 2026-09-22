import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import type { Points } from 'three'
import type { PointCloud } from '../lib/galaxy-layout.ts'

/** One cloud whose points follow their files when isolation gathers them. */
export interface Gathered {
  readonly cloud: PointCloud
  readonly points: RefObject<Points | null>
  /** Whether its bounds must follow too: only a cloud that answers the pointer needs them. */
  readonly bounds: boolean
}

/** How fast each file eases to its place: a little slower than the lens, so the move reads. */
const PACE = 5

/**
 * Moves every point of `clouds` by its file's offset in `target` (three
 * floats per file), easing each file there over about half a second; `null`
 * eases them all home. The positions are rewritten on the CPU, not offset in
 * the shader, so the pointer still finds a star where it is drawn. Once every
 * file has arrived, nothing is written.
 */
export function useGather(
  target: Float32Array | null,
  files: number,
  clouds: readonly Gathered[],
): void {
  // The layout's own positions, before any gather wrote over them. `clouds`
  // must be memoised by the caller, or the homes would be retaken mid-move.
  const homes = useMemo(
    () => clouds.map((c) => c.cloud.positions.slice()),
    [clouds],
  )
  const now = useRef(new Float32Array(files * 3))

  useFrame((_, delta) => {
    const shift = now.current
    const k = Math.min(1, delta * PACE)
    let moved = false
    for (let i = 0; i < shift.length; i++) {
      const goal = target?.[i] ?? 0
      const gap = goal - shift[i]!
      if (gap === 0) continue
      // Snap the tail so a settled gather stops rewriting buffers.
      shift[i] = Math.abs(gap) < 1e-3 ? goal : shift[i]! + gap * k
      moved = true
    }
    if (!moved) return
    clouds.forEach(({ cloud, points, bounds }, c) => {
      const home = homes[c]!
      const { positions, files: owners } = cloud
      for (let p = 0; p < owners.length; p++) {
        const f = owners[p]! * 3
        positions[p * 3] = home[p * 3]! + shift[f]!
        positions[p * 3 + 1] = home[p * 3 + 1]! + shift[f + 1]!
        positions[p * 3 + 2] = home[p * 3 + 2]! + shift[f + 2]!
      }
      const geometry = points.current?.geometry
      if (!geometry) return
      geometry.attributes.position!.needsUpdate = true
      if (bounds) geometry.computeBoundingSphere()
    })
  })
}
