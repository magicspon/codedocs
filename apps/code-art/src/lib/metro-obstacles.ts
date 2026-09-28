import { Vector3 } from 'three'
import type { Obstacles } from './buggy.ts'
import type { Frames } from './metro-frames.ts'
import type { MetroLayout } from './metro-layout.ts'

/**
 * The buildings as boxes for the buggy to bump into: every building near a
 * point, with its own axes and half its width and depth. One box is reused
 * and refilled for each, since this runs every frame.
 */
export function obstaclesOf(layout: MetroLayout, frames: Frames): Obstacles {
  const { blocks, place, near, widest } = layout
  const box = {
    middle: new Vector3(),
    x: new Vector3(),
    z: new Vector3(),
    halfX: 0,
    halfZ: 0,
  }
  const reach = widest + 2
  return (at, visit) =>
    near.near(at.x, at.y, at.z, (i) => {
      const k = i * 3
      box.middle.set(place.foot[k]!, place.foot[k + 1]!, place.foot[k + 2]!)
      if (box.middle.distanceToSquared(at) > reach * reach) return
      box.x.set(frames.x[k]!, frames.x[k + 1]!, frames.x[k + 2]!)
      box.z.set(frames.z[k]!, frames.z[k + 1]!, frames.z[k + 2]!)
      box.halfX = blocks.width[i]! / 2
      box.halfZ = blocks.depth[i]! / 2
      visit(box)
    })
}
