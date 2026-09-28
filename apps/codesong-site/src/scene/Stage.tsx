import type { Composition, RealisedTrack } from '@codedocs/codesong/browser'
import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRef, type JSX } from 'react'
import type { Group, Vector3 } from 'three'
import { Floor } from './Floor.tsx'
import { Names } from './Names.tsx'
import { LANE, ROLE_COLOUR, xOf } from './layout.ts'
import { Notes, type NotePick } from './Notes.tsx'

/** What the stage shows and what it reports back. */
export interface StageProps {
  readonly composition: Composition
  readonly tracks: readonly RealisedTrack[]
  readonly length: number
  readonly muted: ReadonlySet<string>
  /** A symbol name per note, per track, shown as the note sounds. */
  readonly names: readonly (readonly string[])[]
  /** Where the music is, in beats; read every frame. */
  readonly beats: () => number
  /** Whether the camera keeps the playhead in view. */
  readonly follow: boolean
  readonly motif?: string
  readonly picked?: NotePick
  readonly section?: number
  readonly onHover: (pick: NotePick | undefined) => void
  readonly onPick: (pick: NotePick) => void
  readonly onSection: (index: number, beats: number) => void
}

/** The part of drei's orbit controls that following needs. */
interface Controls {
  readonly target: Vector3
  update(): void
}

/** A glowing wall across the lanes where the music is. */
function Playhead({
  beats,
  depth,
}: {
  beats: () => number
  depth: number
}): JSX.Element {
  const group = useRef<Group>(null)
  useFrame(() => {
    if (group.current) group.current.position.x = xOf(beats())
  })
  return (
    <group ref={group}>
      <mesh position={[0, 1.6, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[depth, 3.2]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
      {/* A bright line where the wall meets the floor. */}
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.08, 0.04, depth]} />
        <meshBasicMaterial color="#ffc56b" toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * Keeps the playhead in view by sliding the camera and its orbit target along
 * with it, so a viewer who has turned the camera keeps their angle.
 */
function Follow({ beats, on }: { beats: () => number; on: boolean }): null {
  const { camera, controls } = useThree()
  useFrame((_, delta) => {
    const orbit = controls as Controls | null
    if (!on || !orbit) return
    // A little ahead of the playhead, so what is coming is in view.
    const goal = xOf(beats()) + 6
    const step = (goal - orbit.target.x) * Math.min(1, delta * 3)
    orbit.target.x += step
    camera.position.x += step
    orbit.update()
  })
  return null
}

/** The piece in 3D: sections on the floor, notes above their lanes. */
export function Stage(props: StageProps): JSX.Element {
  const { composition, tracks, beats } = props
  const depth = tracks.length * LANE
  return (
    <Canvas
      camera={{ position: [14, 22, 22], fov: 45, near: 0.1, far: 800 }}
      dpr={[1, 2]}
      onPointerMissed={() => props.onHover(undefined)}
    >
      <color attach="background" args={['#07080f']} />
      <fog attach="fog" args={['#07080f', 40, 140]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[20, 30, 15]} intensity={1.2} />
      <Floor
        composition={composition}
        tracks={tracks}
        beats={props.length}
        section={props.section}
        onSection={props.onSection}
      />
      {tracks.map((track, lane) => (
        <Notes
          key={track.id}
          track={track}
          lane={lane}
          lanes={tracks.length}
          colour={ROLE_COLOUR[track.role]}
          muted={props.muted.has(track.id)}
          motif={props.motif}
          picked={
            props.picked?.track === track.id ? props.picked.index : undefined
          }
          beats={beats}
          onHover={props.onHover}
          onPick={props.onPick}
        />
      ))}
      <Names
        tracks={tracks}
        names={props.names}
        muted={props.muted}
        beats={beats}
      />
      <Playhead beats={beats} depth={depth} />
      <OrbitControls
        makeDefault
        target={[14, 0, 0]}
        maxPolarAngle={Math.PI / 2.1}
      />
      <Follow beats={beats} on={props.follow} />
    </Canvas>
  )
}
