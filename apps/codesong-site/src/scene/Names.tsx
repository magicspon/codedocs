import type { RealisedTrack } from '@codedocs/codesong/browser'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type JSX } from 'react'
import { due, fly, jumped, readerAt, type Reader } from './launch.ts'
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
  const reader = useRef<Reader>({ cursor: [], lastLaunch: [] })
  const last = useRef(-Infinity)
  const nextId = useRef(0)

  // Standing still, rewinding or seeking: start reading from here, silently.
  const restart = (now: number): void => {
    const moved = now !== last.current
    reader.current = readerAt(tracks, now)
    last.current = now
    // Names from where the music was no longer belong in the air.
    if (moved && flying.length > 0) setFlying([])
  }

  useFrame(() => {
    const now = beats()
    if (jumped(last.current, now)) return restart(now)
    last.current = now
    const clock = performance.now()
    const launched = due(tracks, names, muted, reader.current, now).map(
      ({ track, note }) => ({
        id: nextId.current++,
        text: names[track]![note]!,
        colour: ROLE_COLOUR[tracks[track]!.role],
        at: layout[track]![note]!,
        born: clock,
      }),
    )
    const next = fly(flying, launched, clock, LIFE, MOST)
    if (next !== flying) setFlying(next)
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
