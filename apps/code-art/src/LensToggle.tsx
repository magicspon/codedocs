import type { JSX } from 'react'
import type { FallowMeta } from './lib/atlas.ts'
import { lensNote } from './lib/health-text.ts'

/**
 * Switches the health lens: fallow's readings drawn over the scene. Offered
 * only where fallow ran; elsewhere it says how to get the readings.
 */
export function LensToggle(props: {
  scene: string
  fallow: FallowMeta | undefined
  on: boolean
  onChange: (on: boolean) => void
}): JSX.Element {
  const available = props.fallow !== undefined
  const note = lensNote(props.scene, props.fallow, props.on)
  return (
    <div className="lens">
      <label>
        <input
          type="checkbox"
          checked={available && props.on}
          disabled={!available}
          onChange={(e) => props.onChange(e.target.checked)}
        />{' '}
        Health lens
      </label>
      {note && <p className="legend">{note}</p>}
    </div>
  )
}
