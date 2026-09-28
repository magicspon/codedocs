import type { RealisedTrack } from '@codedocs/codesong/browser'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type JSX } from 'react'
import { blocks, ROLE_COLOUR, type Block } from './layout.ts'

interface Props {
  readonly tracks: readonly RealisedTrack[]
  /** A name per note, per track, from `noteNames`; `''` shows nothing. */
  readonly names: readonly (readonly string[])[]
  readonly muted: ReadonlySet<string>
  readonly beats: () => number
}

/** One name in flight. */
interface Flying {
  readonly id: number
  readonly text: string
  readonly colour: string
  readonly at: Block
  /** When it was launched, in `performance.now()` milliseconds. */
  readonly born: number
}

/** How long a name floats, matching the CSS animation. */
const LIFE = 2400
/** Most names in the air at once, so a busy passage stays readable. */
const MOST = 16
/** Least beats between two names from one track. */
const GAP = 1
/** A jump this far means the viewer seeked rather than the music moved on. */
const JUMP = 2

/** The first note at or after `beats`. Notes are in start order. */
function firstFrom(track: RealisedTrack, beats: number): number {
  const i = track.notes.findIndex((n) => n.start >= beats)
  return i === -1 ? track.notes.length : i
}

/**
 * The symbol names the music is playing, rising off their notes as they
 * sound. Each track launches at most one name a beat, so a fast arpeggio
 * shows its loop of files without burying the scene in text.
 */
export function Names({ tracks, names, muted, beats }: Props): JSX.Element {
  const layout = useMemo(
    () => tracks.map((track, lane) => blocks(track, lane, tracks.length)),
    [tracks],
  )
  const [flying, setFlying] = useState<readonly Flying[]>([])
  const cursor = useRef<number[]>([])
  const lastLaunch = useRef<number[]>([])
  const last = useRef(-Infinity)
  const nextId = useRef(0)

  useFrame(() => {
    const now = beats()
    const clock = performance.now()
    // Standing still, rewinding or seeking: start reading from here, silently.
    if (now <= last.current || now - last.current > JUMP) {
      const moved = now !== last.current
      cursor.current = tracks.map((track) => firstFrom(track, now))
      lastLaunch.current = tracks.map(() => -Infinity)
      last.current = now
      // Names from where the music was no longer belong in the air.
      if (moved && flying.length > 0) setFlying([])
      return
    }
    last.current = now

    const launched: Flying[] = []
    tracks.forEach((track, t) => {
      let i = cursor.current[t] ?? 0
      for (; i < track.notes.length && track.notes[i]!.start <= now; i++) {
        const note = track.notes[i]!
        const text = names[t]?.[i]
        if (!text || muted.has(track.id)) continue
        if (note.start - (lastLaunch.current[t] ?? -Infinity) < GAP) continue
        lastLaunch.current[t] = note.start
        launched.push({
          id: nextId.current++,
          text,
          colour: ROLE_COLOUR[track.role],
          at: layout[t]![i]!,
          born: clock,
        })
      }
      cursor.current[t] = i
    })

    const alive = flying.filter((f) => clock - f.born < LIFE)
    if (launched.length > 0 || alive.length !== flying.length) {
      setFlying([...alive, ...launched].slice(-MOST))
    }
  })

  return (
    <group>
      {flying.map((f) => (
        <Html
          key={f.id}
          // From the note's left edge, where it starts to sound.
          position={[f.at.x - f.at.width / 2, f.at.y + 0.3, f.at.z]}
          className="symbol-name"
          style={{ color: f.colour }}
          zIndexRange={[20, 10]}
        >
          {f.text}
        </Html>
      ))}
    </group>
  )
}
