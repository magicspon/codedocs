import { Vector3 } from 'three'
import { dash } from './lib/metro-dash.ts'
import { SpaceHash } from './lib/metro-hash.ts'
import type { MetroLayout } from './lib/metro-layout.ts'
import { RoadKind } from './lib/metro-roads.ts'

/**
 * Drawing the minimap: roads, buildings and landmarks round the buggy on a
 * 2D canvas, the way the buggy faces pointing up. Kept apart from the
 * component that schedules it.
 */

/** World units from the buggy to the map's rim. */
const RANGE = 90
/** The map's drawing size, in CSS pixels; the stylesheet may show it smaller. */
export const SIZE = 168
const HALF = SIZE / 2
const SCALE = HALF / RANGE

/** Colours per road kind: ring roads pink, avenues cyan, streets grey. */
const ROAD_INK: Record<RoadKind, string> = {
  [RoadKind.ring]: '#ff5fc0',
  [RoadKind.avenue]: '#72d8ff',
  [RoadKind.street]: '#8b8fb0',
}

/** Coarse hashes of the road points and buildings, one query covering the whole map. */
export interface MapIndex {
  readonly layout: MetroLayout
  readonly roads: SpaceHash
  readonly buildings: SpaceHash
}

/** Each layout's map index, built the first time the map draws it. */
const indexes = new WeakMap<MetroLayout, MapIndex>()

/** The map index for `layout`, built once. */
export function mapFor(layout: MetroLayout): MapIndex {
  let map = indexes.get(layout)
  if (!map) indexes.set(layout, (map = mapIndexOf(layout)))
  return map
}

/** Hashes `layout` for the map. */
function mapIndexOf(layout: MetroLayout): MapIndex {
  const roads = new SpaceHash(RANGE)
  const { points } = layout.roadIndex
  for (let k = 0; k < points.length / 3; k++)
    roads.insert(k, points[k * 3]!, points[k * 3 + 1]!, points[k * 3 + 2]!)
  const buildings = new SpaceHash(RANGE)
  const { foot } = layout.place
  for (let i = 0; i < layout.blocks.count; i++)
    buildings.insert(i, foot[i * 3]!, foot[i * 3 + 1]!, foot[i * 3 + 2]!)
  return { layout, roads, buildings }
}

const up = new Vector3()
const right = new Vector3()
const d = new Vector3()

/** Point `k` of `arr`, as map pixels round the buggy. */
function px(arr: ArrayLike<number>, k: number): [number, number] {
  d.set(arr[k * 3]!, arr[k * 3 + 1]!, arr[k * 3 + 2]!).sub(dash.position)
  return [HALF + d.dot(right) * SCALE, HALF - d.dot(dash.forward) * SCALE]
}

/** Each road point joined to the next on the same road, stroked by kind. */
function roads(g: CanvasRenderingContext2D, map: MapIndex): void {
  const { layout } = map
  const { road, points } = layout.roadIndex
  const { position } = dash
  const paths = new Map<RoadKind, Path2D>()
  map.roads.near(position.x, position.y, position.z, (k) => {
    if (road[k + 1] !== road[k]) return
    const kind = layout.roads[road[k]!]!.kind
    let path = paths.get(kind)
    if (!path) paths.set(kind, (path = new Path2D()))
    path.moveTo(...px(points, k))
    path.lineTo(...px(points, k + 1))
  })
  g.lineCap = 'round'
  for (const [kind, path] of paths) {
    g.strokeStyle = ROAD_INK[kind]
    g.lineWidth = kind === RoadKind.street ? 1.5 : 2.5
    g.stroke(path)
  }
}

/** Buildings as squares, sized by their reach; the one ahead picked out. */
function buildings(
  g: CanvasRenderingContext2D,
  map: MapIndex,
  ahead: number | null,
): void {
  const { layout } = map
  const { position } = dash
  map.buildings.near(position.x, position.y, position.z, (i) => {
    const [x, y] = px(layout.place.foot, i)
    const r = Math.max(1, layout.blocks.reach[i]! * SCALE * 0.7)
    g.fillStyle = i === ahead ? '#ffd27a' : 'rgba(200, 205, 230, 0.35)'
    g.fillRect(x - r, y - r, r * 2, r * 2)
  })
}

/** Landmarks: a dot in range, a smaller one on the rim towards one beyond it. */
function landmarks(g: CanvasRenderingContext2D, layout: MetroLayout): void {
  const { spots } = layout.beacons
  const rim = HALF - 7
  g.fillStyle = '#ffb347'
  for (let b = 0; b * 4 < spots.length; b++) {
    d.set(spots[b * 4]!, spots[b * 4 + 1]!, spots[b * 4 + 2]!).sub(
      dash.position,
    )
    const x = d.dot(right)
    const y = -d.dot(dash.forward)
    const far = Math.hypot(x, y) || 1
    const reach = Math.min(far * SCALE, rim)
    g.beginPath()
    g.arc(
      HALF + (x / far) * reach,
      HALF + (y / far) * reach,
      far * SCALE < rim ? 3.5 : 2.5,
      0,
      Math.PI * 2,
    )
    g.fill()
  }
}

/** The buggy, always in the middle, always heading up. */
function buggy(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(HALF, HALF - 7)
  g.lineTo(HALF + 5, HALF + 5)
  g.lineTo(HALF - 5, HALF + 5)
  g.closePath()
  g.fill()
}

/** Draws one frame of the map round the buggy; `ahead` is the file it faces. */
export function drawMap(
  g: CanvasRenderingContext2D,
  map: MapIndex,
  ahead: number | null,
): void {
  up.copy(dash.position).normalize()
  right.crossVectors(dash.forward, up)
  g.clearRect(0, 0, SIZE, SIZE)
  g.save()
  g.beginPath()
  g.arc(HALF, HALF, HALF - 1, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = 'rgba(6, 6, 14, 0.78)'
  g.fill()
  roads(g, map)
  buildings(g, map, ahead)
  landmarks(g, map.layout)
  g.restore()
  buggy(g)
}
