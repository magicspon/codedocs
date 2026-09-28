import type { Composition, RealisedTrack } from '@codedocs/codesong/browser'
import { Html } from '@react-three/drei'
import { useMemo, type JSX } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { beatsAt, FORM_COLOUR, LANE, ROLE_COLOUR, xOf, zOf } from './layout.ts'

interface Props {
  readonly composition: Composition
  readonly tracks: readonly RealisedTrack[]
  readonly beats: number
  /** The section picked, drawn lighter. */
  readonly section?: number
  readonly onSection: (index: number, beats: number) => void
}

/** Bars between numbered bar lines. */
const NUMBERED = 8

/**
 * Bar lines across the floor and lane lines along it, as one set of line
 * segments.
 */
function rules(
  bars: number,
  beatsPerBar: number,
  lanes: number,
): BufferGeometry {
  const depth = lanes * LANE
  const end = xOf(bars * beatsPerBar)
  const points: number[] = []
  for (let bar = 0; bar <= bars; bar++) {
    const x = xOf(bar * beatsPerBar)
    points.push(x, 0.01, -depth / 2, x, 0.01, depth / 2)
  }
  for (let lane = 0; lane <= lanes; lane++) {
    const z = lane * LANE - depth / 2
    points.push(0, 0.01, z, end, 0.01, z)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  return geometry
}

/**
 * The plane the piece stands on: one band per section, coloured by its form,
 * with the bars ruled across it and each lane named at its start.
 */
export function Floor(props: Props): JSX.Element {
  const { composition, tracks, beats } = props
  const depth = tracks.length * LANE
  const bars = Math.ceil(beats / composition.beatsPerBar)
  const lines = useMemo(
    () => rules(bars, composition.beatsPerBar, tracks.length),
    [bars, composition.beatsPerBar, tracks.length],
  )

  return (
    <group>
      {composition.sections.map((section, i) => {
        const width = xOf(section.length)
        return (
          <group key={section.start}>
            <mesh
              rotation-x={-Math.PI / 2}
              position={[xOf(section.start) + width / 2, 0, 0]}
              onClick={(e) => {
                if (e.delta > 4) return
                e.stopPropagation()
                props.onSection(i, beatsAt(e.point.x))
              }}
            >
              <planeGeometry args={[width, depth]} />
              <meshStandardMaterial
                color={FORM_COLOUR[section.form]}
                emissive={FORM_COLOUR[section.form]}
                emissiveIntensity={props.section === i ? 0.9 : 0.25}
              />
            </mesh>
            {/* At the front edge, nearest the camera. */}
            <Html
              position={[xOf(section.start), 0, depth / 2 + 0.6]}
              className="scene-label section-label"
              zIndexRange={[10, 0]}
            >
              <b>{section.name}</b>{' '}
              {section.name !== section.form && <span>{section.form}</span>}
            </Html>
          </group>
        )
      })}
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#6c7897" transparent opacity={0.35} />
      </lineSegments>
      {Array.from({ length: Math.floor(bars / NUMBERED) + 1 }, (_, k) => (
        <Html
          key={k}
          position={[
            xOf(k * NUMBERED * composition.beatsPerBar),
            0,
            -depth / 2 - 0.4,
          ]}
          className="scene-label bar-label"
          zIndexRange={[10, 0]}
        >
          {k * NUMBERED + 1}
        </Html>
      ))}
      {tracks.map((track, lane) => (
        <Html
          key={track.id}
          position={[-1.5, 0, zOf(lane, tracks.length)]}
          className="scene-label lane-label"
          style={{ color: ROLE_COLOUR[track.role] }}
          zIndexRange={[10, 0]}
        >
          {track.name}
        </Html>
      ))}
    </group>
  )
}
