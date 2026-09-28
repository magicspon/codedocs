import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, useState, type JSX } from 'react'
import type { FileDatum } from '../lib/atlas.ts'
import type { MetroLayout } from '../lib/metro-layout.ts'
import { taggedLanes, tagName } from '../lib/metro-tags.ts'

/** Seconds between looking for the nearest lanes again. */
const LOOK_EVERY = 0.5

/**
 * Names over the sky lanes nearest the driver, at the top of each arch: the
 * file calling over the file called, and how often. Only a few at a time,
 * and only those the planet is not hiding.
 */
export function MetroSkyTags(props: {
  layout: MetroLayout
  files: readonly FileDatum[]
}): JSX.Element {
  const { layout, files } = props
  const [lanes, setLanes] = useState<number[]>([])
  const since = useRef(LOOK_EVERY)
  useFrame(({ camera }, dt) => {
    since.current += dt
    if (since.current < LOOK_EVERY) return
    since.current = 0
    const next = taggedLanes(layout, camera.position)
    setLanes((now) => (now.join() === next.join() ? now : next))
  })
  const { apex, calls } = layout.lanes
  return (
    <>
      {lanes.map((l) => {
        const [from, to, count] = calls[l]!
        return (
          <Html
            key={l}
            position={[apex[l * 3]!, apex[l * 3 + 1]!, apex[l * 3 + 2]!]}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div className="metro-tag aloft">
              <span>{tagName(files[from]!.path)}</span>
              <span>
                → {tagName(files[to]!.path)} <em>{count}</em>
              </span>
            </div>
          </Html>
        )
      })}
    </>
  )
}
