import type { JSX, MouseEvent } from 'react'
import { GalaxyIcon, TerrainIcon } from './icons.tsx'

/** Each scene's icon and what its button says; a scene without one gets no button. */
const LOOKS: Record<string, readonly [() => JSX.Element, string]> = {
  galaxy: [GalaxyIcon, 'Show as a galaxy'],
  terrain: [TerrainIcon, 'Show as terrain'],
}

/**
 * Which scene draws the data, as a pill of icon buttons at the bottom right.
 * Plain pressed buttons, like the follow switch, so the arrow keys stay with
 * the scene.
 */
export function SceneSwitch(props: {
  scenes: readonly string[]
  scene: string
  onScene: (scene: string) => void
}): JSX.Element {
  // Let go of focus, so Enter and Space go back to the scene's keys.
  const choose = (e: MouseEvent<HTMLButtonElement>, scene: string): void => {
    e.currentTarget.blur()
    props.onScene(scene)
  }
  return (
    <div className="follow scene-switch" role="group" aria-label="Scene">
      {props.scenes.map((scene) => {
        const look = LOOKS[scene]
        if (!look) return null
        const [Glyph, label] = look
        return (
          <button
            key={scene}
            className="icon-button"
            aria-pressed={props.scene === scene}
            aria-label={label}
            title={label}
            onClick={(e) => choose(e, scene)}
          >
            <Glyph />
          </button>
        )
      })}
    </div>
  )
}
