import type { Anchor } from './flow.ts'
import type { Trace } from './trace.ts'

/**
 * Isolation: a traced search with everything else taken away. The files the
 * trace touches are drawn in close round the searched ones, one ring per hop,
 * so what is connected sits together instead of across the galaxy. A pure
 * function of the trace, so the scene only eases towards what this returns.
 */

/** Room each file takes on its ring, in scene units, so star clusters do not pile up. */
const GAP = 0.9
/** How far callers rise, and callees sink, in ring spacings: in from above, out below. */
const LIFT = 0.35

/** Every file the trace touches, searched or reached, in file order. */
export function isolatedFiles(trace: Trace): number[] {
  const out: number[] = []
  trace.focus.forEach((f, i) => f > 0 && out.push(i))
  return out
}

/** Hops from the searched files, whichever way is nearer: `0` searched, `-1` untouched. */
export function hopOf(trace: Trace, file: number): number {
  const hops = [trace.hopOut[file]!, trace.hopIn[file]!].filter((h) => h >= 0)
  return hops.length === 0 ? -1 : Math.min(...hops)
}

/** The radius a ring of `count` files needs so neighbours sit `GAP` apart. */
function roomFor(count: number): number {
  return count <= 1 ? 0 : (count * GAP) / (Math.PI * 2)
}

/**
 * Where each file moves under isolation, as an offset from `anchors` (three
 * floats per file). Untouched files do not move; the scene hides them. One
 * searched file stays where it is, so the camera and its planets stay put;
 * several are drawn into a ring of their own round their middle. Each hop out
 * is a wider ring, at least `spacing` beyond the last, with files keeping the
 * order of their bearings so the picture still reads like the galaxy it was.
 */
export function gather(
  trace: Trace,
  anchors: readonly Anchor[],
  spacing: number,
): Float32Array {
  const offsets = new Float32Array(anchors.length * 3)
  const centre = [0, 1, 2].map(
    (k) =>
      trace.roots.reduce((sum, r) => sum + anchors[r]![k]!, 0) /
      trace.roots.length,
  ) as [number, number, number]

  const rings: number[][] = []
  for (const file of isolatedFiles(trace)) {
    const hop = hopOf(trace, file)
    if (hop >= 0) (rings[hop] ??= []).push(file)
  }

  let radius = 0
  rings.forEach((ring, hop) => {
    radius = Math.max(hop === 0 ? 0 : radius + spacing, roomFor(ring.length))
    const bearing = (f: number): number =>
      Math.atan2(anchors[f]![2] - centre[2], anchors[f]![0] - centre[0])
    ring.sort((a, b) => bearing(a) - bearing(b))
    const start = bearing(ring[0]!)
    ring.forEach((file, k) => {
      const angle = start + (k / ring.length) * Math.PI * 2
      const lift =
        hop === 0
          ? 0
          : (Number(trace.hopIn[file]! > 0) - Number(trace.hopOut[file]! > 0)) *
            spacing *
            LIFT
      const [x, y, z] = anchors[file]!
      offsets.set(
        [
          centre[0] + Math.cos(angle) * radius - x,
          centre[1] + lift - y,
          centre[2] + Math.sin(angle) * radius - z,
        ],
        file * 3,
      )
    })
  })
  return offsets
}
