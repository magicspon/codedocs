import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type JSX } from 'react'
import { hoveredFile } from './lib/frame.ts'
import { panel } from './lib/motion.ts'
import type { Series } from './lib/series.ts'
import { TERRAIN_LEGEND } from './lib/terrain-text.ts'
import { HomeIcon, IconToggle, InfoIcon } from './icons.tsx'
import { SceneSwitch } from './SceneSwitch.tsx'

/** Drops down into the top corner. */
const DROP_IN = panel({ y: -10 })

interface TerrainHudProps {
  readonly scenes: readonly string[]
  readonly scene: string
  readonly onScene: (scene: string) => void
  readonly series: Series | null
  /** The whole frame under the playhead, which the hovered file's facts come from. */
  readonly frame: number
  /** The file under the pointer, an index into the series' `merged.files`. */
  readonly hovered: number | null
}

/** What each shape in the terrain means. */
function Legend(): JSX.Element {
  return (
    <motion.div
      id="terrain-legend"
      className="panel terrain-legend"
      variants={DROP_IN}
      initial="hidden"
      animate="shown"
      exit="gone"
    >
      <dl>
        {TERRAIN_LEGEND.map(([shape, meaning]) => (
          <div key={shape}>
            <dt>{shape}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
    </motion.div>
  )
}

/**
 * The terrain's overlay, as bare as the galaxy's: home, the scene switch, the
 * name of the file under the pointer, and a legend behind the info button.
 * The terrain is an art piece, so it has no search or trace.
 */
export function TerrainHud(props: TerrainHudProps): JSX.Element {
  // Opens once asked, and stays open until closed.
  const [info, setInfo] = useState(false)
  const name = hoveredFile(props.series, props.frame, props.hovered)?.path
  return (
    <>
      <Link to="/" className="icon-button home" aria-label="Home" title="Home">
        <HomeIcon />
      </Link>
      <SceneSwitch
        scenes={props.scenes}
        scene={props.scene}
        onScene={props.onScene}
      />
      <div className="corner">
        <div className="corner-head">
          {name && (
            // Isolated, so the right-to-left clipping keeps the path in order.
            <p className="file-name" title={name}>
              <bdi>{name}</bdi>
            </p>
          )}
          <IconToggle
            open={info}
            onToggle={setInfo}
            labels={[
              'Show what the terrain means',
              'Hide what the terrain means',
            ]}
            controls="terrain-legend"
          >
            <InfoIcon />
          </IconToggle>
        </div>
        <AnimatePresence>{info && <Legend />}</AnimatePresence>
      </div>
    </>
  )
}
