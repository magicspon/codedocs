import type { MetroLayout } from './metro-layout.ts'
import type { Vec3 } from './metro-sphere.ts'

/**
 * Where to stop to see landmark `n` (a beacon, one of the files the rest of
 * the code calls most): on the road point that stands back far enough to
 * take in the whole tower and the sign on its roof, facing it. `null` when
 * there are no landmarks. Counts round, so `n` can keep growing. Scans every
 * road point, which is fine for a key press but not for a frame.
 */
export function hopTo(
  layout: MetroLayout,
  n: number,
): { at: Vec3; facing: Vec3; file: number } | null {
  const { spots, files } = layout.beacons
  if (files.length === 0) return null
  const b = ((n % files.length) + files.length) % files.length
  const file = files[b]!
  const foot: Vec3 = [spots[b * 4]!, spots[b * 4 + 1]!, spots[b * 4 + 2]!]
  // Far enough back to look up at the roof without craning.
  const want = Math.min(
    80,
    layout.blocks.reach[file]! + spots[b * 4 + 3]! * 0.9 + 6,
  )
  const { points } = layout.roadIndex
  let best = -1
  let miss = Infinity
  for (let k = 0; k < points.length / 3; k++) {
    const d = Math.hypot(
      points[k * 3]! - foot[0],
      points[k * 3 + 1]! - foot[1],
      points[k * 3 + 2]! - foot[2],
    )
    if (Math.abs(d - want) < miss) {
      miss = Math.abs(d - want)
      best = k
    }
  }
  const at: Vec3 =
    best === -1
      ? [foot[0], foot[1] + want, foot[2]]
      : [points[best * 3]!, points[best * 3 + 1]!, points[best * 3 + 2]!]
  return {
    at,
    facing: [foot[0] - at[0], foot[1] - at[1], foot[2] - at[2]],
    file,
  }
}
