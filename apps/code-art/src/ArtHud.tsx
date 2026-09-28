import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type JSX, type ReactNode } from 'react'
import { hoveredFile } from './lib/frame.ts'
import type { Legend } from './lib/legend.ts'
import { panel } from './lib/motion.ts'
import type { Series } from './lib/series.ts'
import { HomeIcon, IconToggle, InfoIcon } from './icons.tsx'
import { SceneSwitch } from './SceneSwitch.tsx'

/** Drops down into the top corner. */
const DROP_IN = panel({ y: -10 })

interface ArtHudProps {
  readonly scenes: readonly string[]
  readonly scene: string
  readonly onScene: (scene: string) => void
  readonly series: Series | null
  /** The whole frame under the playhead, which the hovered file's facts come from. */
  readonly frame: number
  /** The file under the pointer, an index into the series' `merged.files`. */
  readonly hovered: number | null
  /** What the scene's shapes mean, behind the info button. */
  readonly legend: Legend
  /** The info button's labels, to show and to hide the legend. */
  readonly labels: readonly [show: string, hide: string]
  /** Anything else the scene puts on screen. */
  readonly children?: ReactNode
}

/** What each shape in the scene means. */
function LegendPanel(props: { legend: Legend }): JSX.Element {
  return (
    <motion.div
      id="art-legend"
      className="panel art-legend"
      variants={DROP_IN}
      initial="hidden"
      animate="shown"
      exit="gone"
    >
      <dl>
        {props.legend.map(([shape, meaning]) => (
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
 * The overlay for an art piece, as bare as the galaxy's: home, the scene
 * switch, the name of the file under the pointer, and a legend behind the
 * info button. The art pieces have no search or trace.
 */
export function ArtHud(props: ArtHudProps): JSX.Element {
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
            labels={props.labels}
            controls="art-legend"
          >
            <InfoIcon />
          </IconToggle>
        </div>
        <AnimatePresence>
          {info && <LegendPanel legend={props.legend} />}
        </AnimatePresence>
      </div>
      {props.children}
    </>
  )
}
