import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, type JSX } from 'react'
import {
  Color,
  FogExp2,
  type DirectionalLight,
  type HemisphereLight,
} from 'three'
import { blend } from '../lib/health.ts'
import type { Playhead } from '../lib/series.ts'
import { skyMaterial } from '../lib/sky.ts'
import { useLens } from './lens.ts'

/** Moonlight over a sound repository, and the sodium cast of a choked one. */
const MOON = new Color('#b8c6ff')
const SODIUM = new Color('#ffa54a')
/** The sky's bounce into the streets, clear and choked. */
const BOUNCE = new Color('#6f7fb8')
const HAZE = new Color('#a2704a')

/**
 * Moonlight is faint, and comes in low: a night city is lit by its own
 * windows, and a light from overhead would turn a dense city into a carpet of
 * bright roofs.
 */
const MOONLIGHT = 0.55

/** How far the fog closes in as the air thickens. */
const CLEAR_FOG = 0.85
const THICK_FOG = 1.9

/**
 * The city's air. Over a healthy repository it is a clear blue night with
 * stars; as the health lens opens it thickens towards sodium-lit smog, in
 * proportion to how much trouble the whole repository is in. The weather is
 * the reading no single building can give: a city may raise only a few alarm
 * pillars and still be hard to breathe in.
 */
export function Weather(props: {
  /** How choked the air is in each frame, in `[0, 1]`. */
  smog: Float32Array
  size: number
  playhead: Playhead
  lens: boolean
}): JSX.Element {
  const { size, playhead } = props
  const scene = useThree((state) => state.scene)
  const sky = useMemo(skyMaterial, [])
  const lens = useLens(props.lens)
  const hemisphere = useRef<HemisphereLight>(null)
  const sun = useRef<DirectionalLight>(null)
  // The fog and the background share the sky's own horizon colour, so the
  // streets fade into exactly the sky they stand under.
  const fog = useMemo(() => new FogExp2(sky.horizon.getHex()), [sky])

  useFrame(() => {
    const smog =
      blend(props.smog, 0, props.smog.length, playhead.t) * lens.current
    sky.setSmog(smog)
    fog.color.copy(sky.horizon)
    fog.density = ((CLEAR_FOG + (THICK_FOG - CLEAR_FOG) * smog) * 0.6) / size
    scene.fog = fog
    scene.background = sky.horizon
    hemisphere.current?.color.copy(BOUNCE).lerp(HAZE, smog)
    sun.current?.color.copy(MOON).lerp(SODIUM, smog)
    // Smog does not let the moon through.
    if (sun.current) sun.current.intensity = MOONLIGHT * (1 - smog * 0.5)
  })

  return (
    <>
      <mesh material={sky.material} raycast={() => null}>
        <sphereGeometry args={[size * 2.4, 32, 16]} />
      </mesh>
      <hemisphereLight ref={hemisphere} args={[BOUNCE, '#0a0a12', 0.22]} />
      <directionalLight
        ref={sun}
        position={[size * 0.7, size * 0.3, size * 0.9]}
        intensity={MOONLIGHT}
        color={MOON}
      />
    </>
  )
}
