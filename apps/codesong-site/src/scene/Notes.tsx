import type { NoteEvent, RealisedTrack } from '@codedocs/codesong/browser'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import { Color, Matrix4, type InstancedMesh } from 'three'
import { blocks, NOTE_DEPTH, NOTE_HEIGHT } from './layout.ts'

/** How bright a note is drawn, from dim to sounding. */
const Level = {
  Muted: 0.08,
  Rest: 0.35,
  Motif: 1,
  Selected: 1.6,
  Sounding: 2.4,
} as const

/** A note picked in the scene: which track, and which of its notes. */
export interface NotePick {
  readonly track: string
  readonly index: number
}

interface Props {
  readonly track: RealisedTrack
  readonly lane: number
  readonly lanes: number
  readonly colour: string
  readonly muted: boolean
  /** The motif the pointer is over or that is selected: its notes light up. */
  readonly motif?: string
  /** The note picked, drawn brightest. */
  readonly picked?: number
  /** Where the music is, in beats. Read every frame, not every render. */
  readonly beats: () => number
  readonly onHover: (pick: NotePick | undefined) => void
  readonly onPick: (pick: NotePick) => void
}

/** Whether `note` is sounding at `beats`. */
const sounding = (note: NoteEvent, beats: number): boolean =>
  beats >= note.start && beats < note.start + note.duration

/**
 * One track's notes as a single instanced mesh: thousands of blocks in one
 * draw call. Colour carries all the state, so a frame only rewrites the
 * instances whose level changed.
 */
export function Notes(props: Props): JSX.Element {
  const { track, lane, lanes, colour, muted, motif, picked, beats } = props
  const mesh = useRef<InstancedMesh>(null)
  const layout = useMemo(() => blocks(track, lane, lanes), [track, lane, lanes])
  const levels = useRef<number[]>([])
  const base = useMemo(() => new Color(colour), [colour])

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const matrix = new Matrix4()
    layout.forEach((b, i) => {
      matrix
        .makeScale(b.width, NOTE_HEIGHT, NOTE_DEPTH)
        .setPosition(b.x, b.y, b.z)
      m.setMatrixAt(i, matrix)
      m.setColorAt(i, base)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
    // Forces every colour to be written on the next frame.
    levels.current = layout.map(() => -1)
  }, [layout, base])

  useFrame(() => {
    const m = mesh.current
    if (!m?.instanceColor) return
    const now = beats()
    const colourOf = new Color()
    let changed = false
    track.notes.forEach((note, i) => {
      const level = muted
        ? Level.Muted
        : sounding(note, now)
          ? Level.Sounding
          : i === picked
            ? Level.Selected
            : note.motif === motif
              ? Level.Motif
              : Level.Rest
      if (levels.current[i] === level) return
      levels.current[i] = level
      m.setColorAt(i, colourOf.copy(base).multiplyScalar(level))
      changed = true
    })
    if (changed) m.instanceColor.needsUpdate = true
  })

  const pick = (
    e: ThreeEvent<PointerEvent | MouseEvent>,
  ): NotePick | undefined =>
    e.instanceId === undefined
      ? undefined
      : { track: track.id, index: e.instanceId }

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, layout.length]}
      onPointerMove={(e) => {
        e.stopPropagation()
        props.onHover(pick(e))
      }}
      onPointerOut={() => props.onHover(undefined)}
      onClick={(e) => {
        // A drag to orbit the camera also ends in a click; ignore those.
        if (e.delta > 4) return
        e.stopPropagation()
        const p = pick(e)
        if (p) props.onPick(p)
      }}
    >
      <boxGeometry />
      <meshStandardMaterial toneMapped={false} roughness={0.5} />
    </instancedMesh>
  )
}
