import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Shape } from '../lib/metro-buildings.ts'

/**
 * One unit building per shape: a foot one unit across, standing one unit
 * tall from `y = 0`, scaled per instance to the file's own size. Each sinks a
 * little below the ground, since a flat foot on a round planet would lift
 * clear at its corners. Faces are flat, so the window grid lies square on them.
 */

/** How far below the ground a building's foot reaches, as a share of its height. */
const SINK = 0.06

/** A box `w` wide and deep, from `y0` to `y1`. */
function box(w: number, y0: number, y1: number): BufferGeometry {
  return new BoxGeometry(w, y1 - y0, w).translate(0, (y0 + y1) / 2, 0)
}

/** A flat-faced prism with `sides`, tapering from `bottom` to `top` across. */
function prism(
  sides: number,
  bottom: number,
  top: number,
  y0: number,
  y1: number,
): BufferGeometry {
  const g = new CylinderGeometry(top / 2, bottom / 2, y1 - y0, sides, 1)
    .translate(0, (y0 + y1) / 2, 0)
    .toNonIndexed()
  g.computeVertexNormals()
  // A few sides turn a face to the front, as the boxes do.
  return g.rotateY(Math.PI / sides)
}

/** Tiers stacked up: each `[across, top]`, the first starting below ground. */
function stack(tiers: readonly (readonly [number, number])[]): BufferGeometry {
  let from = -SINK
  const parts = tiers.map(([w, top]) => {
    const part = box(w, from, top)
    from = top
    return part
  })
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))
}

/** Every shape's unit geometry, indexed by `Shape`. */
export function shapeGeometries(): BufferGeometry[] {
  const out: BufferGeometry[] = []
  out[Shape.block] = box(1, -SINK, 1)
  out[Shape.tower] = prism(8, 1, 1, -SINK, 1)
  out[Shape.setback] = stack([
    [1, 0.55],
    [0.74, 0.8],
    [0.48, 1],
  ])
  out[Shape.spire] = prism(6, 1, 0.45, -SINK, 1)
  out[Shape.stepped] = stack([
    [1, 0.25],
    [0.8, 0.5],
    [0.6, 0.75],
    [0.4, 1],
  ])
  out[Shape.pod] = prism(10, 1, 0.8, -SINK, 1)
  return out
}
