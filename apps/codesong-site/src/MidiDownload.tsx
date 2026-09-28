import {
  toMidi,
  type Composition,
  type RealisedTrack,
} from '@codedocs/codesong/browser'
import type { JSX } from 'react'
import { DownloadIcon } from './icons.tsx'

interface Props {
  /** The song's name, which starts the file name. */
  readonly slug: string
  readonly composition: Composition
  readonly tracks: readonly RealisedTrack[]
}

/**
 * Saves the song, in the genre playing, as a `.mid` file with one track per
 * part. The browser writes it from the score it already has, so the site
 * keeps no MIDI files of its own.
 */
export function MidiDownload({
  slug,
  composition,
  tracks,
}: Props): JSX.Element {
  const label = `Download ${slug} as ${composition.genre} MIDI`
  const save = (): void => {
    const blob = new Blob([toMidi(composition, tracks)], { type: 'audio/midi' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${slug}-${composition.genre}.mid`
    link.click()
    // Revoked after the click has started the download, not before.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return (
    <button
      type="button"
      className="icon-button"
      onClick={save}
      aria-label={label}
      title={label}
    >
      <DownloadIcon />
    </button>
  )
}
