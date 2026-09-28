import { useEffect, useMemo, type JSX } from 'react'
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  MeshBasicMaterial,
} from 'three'
import type { FileDatum, FileSymbols } from '../lib/atlas.ts'
import { dash } from '../lib/metro-dash.ts'
import type { Frames } from '../lib/metro-frames.ts'
import type { MetroLayout } from '../lib/metro-layout.ts'
import {
  posterLines,
  posterSpot,
  type PosterLine,
} from '../lib/metro-poster.ts'
import type { Vec3 } from '../lib/metro-sphere.ts'
import { KIND_COLORS } from '../lib/palette.ts'

/** The poster's drawing width in pixels, and its margins and line height. */
const WIDTH = 512
const MARGIN = 28
const LINE = 44
const TITLE = 78

/** One line of the poster at height `y`: a dot in its kind's colour, the text, and its note. */
function drawLine(
  g: CanvasRenderingContext2D,
  line: PosterLine,
  y: number,
  w: number,
): void {
  const named = line.kind >= 0
  const color = named ? `#${KIND_COLORS[line.kind]!.getHexString()}` : '#9a9ab0'
  g.fillStyle = color
  if (named) {
    g.beginPath()
    g.arc(MARGIN + 7, y, 8, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = named ? '#f4f1ff' : '#9a9ab0'
  g.font = '500 30px ui-monospace, Menlo, monospace'
  g.textAlign = 'left'
  g.fillText(line.text, MARGIN + 28, y, w - MARGIN * 2 - 150)
  g.fillStyle = color
  g.font = '400 22px ui-monospace, Menlo, monospace'
  g.textAlign = 'right'
  g.fillText(line.note, w - MARGIN, y)
  g.textAlign = 'left'
}

/** The file's name and its lines, drawn as a paper poster with a neon rim. */
function draw(
  name: string,
  lines: readonly PosterLine[],
  ink: string,
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = TITLE + lines.length * LINE + MARGIN * 1.5
  const g = canvas.getContext('2d')!
  const { width: w, height: h } = canvas
  // Dark paper, a neon rim, and tape at the top corners.
  g.fillStyle = 'rgba(8, 8, 18, 0.92)'
  g.fillRect(0, 0, w, h)
  g.strokeStyle = ink
  g.lineWidth = 4
  g.strokeRect(6, 6, w - 12, h - 12)
  g.fillStyle = 'rgba(255, 244, 220, 0.35)'
  g.fillRect(-10, 8, 70, 18)
  g.fillRect(w - 60, 8, 70, 18)
  g.textBaseline = 'middle'
  g.fillStyle = ink
  g.font = '700 40px ui-monospace, Menlo, monospace'
  let size = 40
  while (size > 16 && g.measureText(name).width > w - MARGIN * 2) {
    size -= 2
    g.font = `700 ${size}px ui-monospace, Menlo, monospace`
  }
  g.fillText(name, MARGIN, TITLE / 2 + 6)
  lines.forEach((line, n) => drawLine(g, line, TITLE + LINE * (n + 0.5), w))
  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  return texture
}

/** A flat quad at `spot`, facing out from the wall. */
function quad(
  middle: Vec3,
  across: Vec3,
  up: Vec3,
  w: number,
  h: number,
): BufferGeometry {
  const corner = (a: number, b: number): number[] =>
    [0, 1, 2].map(
      (c) => middle[c]! + across[c]! * a * (w / 2) + up[c]! * b * (h / 2),
    )
  const g = new BufferGeometry()
  g.setAttribute(
    'position',
    new Float32BufferAttribute(
      [...corner(-1, -1), ...corner(1, -1), ...corner(-1, 1), ...corner(1, 1)],
      3,
    ),
  )
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2))
  g.setIndex([0, 1, 2, 2, 1, 3])
  return g
}

/**
 * What the building the driver faces holds, pasted up on its wall as a
 * poster: the file's name, then its symbols, each in its kind's colour.
 * Without symbol names, how many of each kind it declares instead.
 */
export function MetroPoster(props: {
  layout: MetroLayout
  frames: Frames
  files: readonly FileDatum[]
  /** The building faced, or `null`. */
  ahead: number | null
  /** The faced file's symbols: `undefined` while loading, `null` when none were exported. */
  symbols: FileSymbols | null | undefined
  /** The district's colour for building `file`, as CSS. */
  inkOf: (file: number) => string
}): JSX.Element | null {
  const { layout, frames, files, ahead, symbols, inkOf } = props
  const poster = useMemo(() => {
    if (ahead === null || symbols === undefined) return null
    const file = files[ahead]!
    const lines = posterLines(file, symbols)
    const name = file.path.slice(file.path.lastIndexOf('/') + 1)
    const map = draw(name, lines, inkOf(ahead))
    const aspect = map.image.height / map.image.width
    const { middle, across, up, width, height } = posterSpot(
      layout,
      frames,
      ahead,
      dash.position.toArray(),
      aspect,
    )
    return {
      geometry: quad(middle, across, up, width, height),
      material: new MeshBasicMaterial({
        map,
        transparent: true,
        side: DoubleSide,
        toneMapped: false,
      }),
    }
  }, [layout, frames, files, ahead, symbols, inkOf])
  useEffect(
    () => () => {
      poster?.geometry.dispose()
      poster?.material.map?.dispose()
      poster?.material.dispose()
    },
    [poster],
  )
  if (!poster) return null
  return (
    <mesh
      geometry={poster.geometry}
      material={poster.material}
      frustumCulled={false}
    />
  )
}
