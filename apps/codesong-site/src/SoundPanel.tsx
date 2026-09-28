import type { RealisedTrack } from '@codedocs/codesong/browser'
import { button, folder, LevaPanel, useControls, useCreateStore } from 'leva'
import type { Schema } from 'leva/plugin'
import { useEffect, useMemo, type JSX } from 'react'
import { defaults, SETTINGS, type Sound } from './audio/sound.ts'
import { ROLE_COLOUR } from './scene/layout.ts'

interface Props {
  readonly track: RealisedTrack
  /** The track's sound when the panel opens, so earlier changes are kept. */
  readonly initial: Sound
  readonly onTune: (track: string, sound: Sound) => void
  readonly onClose: () => void
}

/** Leva's tokens, matched to the scene's dark overlay. */
const THEME = {
  colors: {
    elevation1: 'rgb(255 255 255 / 4%)',
    elevation2: 'rgb(10 12 22 / 85%)',
    elevation3: 'rgb(255 255 255 / 8%)',
    accent1: '#ffc56b',
    accent2: '#ffb347',
    accent3: '#ffd699',
    highlight1: '#6b7386',
    highlight2: '#9aa3b8',
    highlight3: '#e8ebf3',
    vivid1: '#ffc56b',
  },
  sizes: {
    rootWidth: '100%',
    controlWidth: '160px',
    numberInputMinWidth: '52px',
  },
  fontSizes: { root: '12px' },
}

/** The role's settings as a Leva schema: one folder per group, starting from `initial`. */
function schema(track: RealisedTrack, initial: Sound): Schema {
  const out: Schema = {}
  for (const [group, settings] of Object.entries(SETTINGS[track.role])) {
    const inputs: Schema = {}
    for (const [key, setting] of Object.entries(settings)) {
      const value = initial[key] ?? setting.value
      inputs[key] =
        'options' in setting
          ? { value: String(value), options: [...setting.options] }
          : { ...setting, value: Number(value) }
    }
    out[group] = folder(inputs)
  }
  return out
}

/**
 * The synth settings for one track, in a Leva panel over the scene. Each
 * panel has its own Leva store, so opening another track never shows this
 * one's values. Key it by track id.
 */
export function SoundPanel({
  track,
  initial,
  onTune,
  onClose,
}: Props): JSX.Element {
  const store = useCreateStore()
  // Built once per panel: Leva owns the values after that.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inputs = useMemo(() => schema(track, initial), [track.id])
  const [values, set] = useControls(() => inputs, { store }, [inputs])
  useControls({ reset: button(() => set(defaults(track.role))) }, { store }, [
    set,
    track.role,
  ])

  // A dynamic schema loses Leva's value types; every input here is a number or a string.
  useEffect(
    () => onTune(track.id, values as unknown as Sound),
    [onTune, track.id, values],
  )

  return (
    <div
      className="sound-panel"
      style={{ ['--role' as string]: ROLE_COLOUR[track.role] }}
    >
      <div className="sound-panel-head">
        <span>{track.name}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the sound settings"
        >
          ×
        </button>
      </div>
      <LevaPanel
        store={store}
        fill
        flat
        theme={THEME}
        titleBar={false}
        hideCopyButton
      />
    </div>
  )
}
