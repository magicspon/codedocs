import { realise } from '@codedocs/codesong/browser'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type JSX } from 'react'
import { usePlayer } from './audio/usePlayer.ts'
import { noteNames } from './explain/names.ts'
import { Inspector, type Selection } from './inspect/Inspector.tsx'
import { length } from './scene/layout.ts'
import type { NotePick } from './scene/Notes.tsx'
import { Stage } from './scene/Stage.tsx'
import { SoundPanel } from './SoundPanel.tsx'
import { HomeIcon, IconToggle, InfoIcon } from './icons.tsx'
import { Transport } from './Transport.tsx'

// By path rather than by import, so the page and the router do not import each other.
const songRoute = getRouteApi('/$song')

/** Top left: back to the songs, and the button that shows the song's details. */
function Corner(props: {
  readonly info: boolean
  readonly onInfo: (open: boolean) => void
}): JSX.Element {
  return (
    <>
      <Link
        to="/"
        className="icon-button"
        aria-label="All songs"
        title="All songs"
      >
        <HomeIcon />
      </Link>
      <IconToggle
        open={props.info}
        onToggle={props.onInfo}
        labels={['Show how the song was made', 'Hide how the song was made']}
        controls="song-info"
      >
        <InfoIcon />
      </IconToggle>
    </>
  )
}

/**
 * One song as a 3D score filling the window: the bars run across a floor,
 * every note stands above its track, and a panel behind the info button says
 * which code each part, section and note came from. Tone.js plays it in the
 * browser.
 */
export function SongPage(): JSX.Element {
  const { slug, score } = songRoute.useLoaderData()
  const { composition } = score
  const tracks = useMemo(() => realise(composition), [composition])
  const beats = useMemo(() => length(composition), [composition])
  const names = useMemo(
    () => noteNames(composition, tracks, score.evidence),
    [composition, tracks, score.evidence],
  )

  const player = usePlayer(composition, tracks, beats)
  const [follow, setFollow] = useState(true)
  // The details start hidden so the score has the whole window.
  const [info, setInfo] = useState(false)
  const [hover, setHover] = useState<NotePick>()
  const [selection, setSelection] = useState<Selection>({ kind: 'song' })
  // The track whose synth settings are open.
  const [tuning, setTuning] = useState<string>()
  const tuned = tracks.find((t) => t.id === tuning)

  // A new song starts with the panel on the whole song and no synth open.
  useEffect(() => {
    setSelection({ kind: 'song' })
    setTuning(undefined)
  }, [composition])

  const pick = (p: NotePick): void => {
    const note = tracks.find((t) => t.id === p.track)?.notes[p.index]
    if (!note) return
    setSelection({ kind: 'motif', motif: note.motif, pick: p })
    // Picking asks what a note is, so show the answer.
    setInfo(true)
  }

  const hovered = hover
    ? tracks.find((t) => t.id === hover.track)?.notes[hover.index]?.motif
    : undefined
  const selectedMotif = selection.kind === 'motif' ? selection.motif : undefined

  return (
    <article className="player">
      <div className="stage">
        <Stage
          composition={composition}
          tracks={tracks}
          length={beats}
          muted={player.muted}
          names={names}
          beats={player.beats}
          follow={follow && player.playing}
          motif={hovered ?? selectedMotif}
          picked={selection.kind === 'motif' ? selection.pick : undefined}
          section={selection.kind === 'section' ? selection.index : undefined}
          onHover={setHover}
          onPick={pick}
          onSection={(index, at) => {
            setSelection({ kind: 'section', index })
            setInfo(true)
            player.seek(at)
          }}
        />
        <div className="hud">
          <Transport
            corner={<Corner info={info} onInfo={setInfo} />}
            title={slug}
            tracks={tracks}
            length={beats}
            composition={composition}
            playing={player.playing}
            muted={player.muted}
            follow={follow}
            beats={player.beats}
            onToggle={player.toggle}
            onSeek={player.seek}
            onMute={player.mute}
            onFollow={setFollow}
            selected={tuning}
            onSelect={(id) =>
              setTuning((open) => (open === id ? undefined : id))
            }
          />
          {info && (
            <Inspector
              score={score}
              tracks={tracks}
              selection={selection}
              onSelect={setSelection}
              onSeek={player.seek}
            />
          )}
        </div>
        {tuned && (
          <SoundPanel
            key={tuned.id}
            track={tuned}
            initial={player.sound(tuned.id)}
            onTune={player.tune}
            onClose={() => setTuning(undefined)}
          />
        )}
      </div>
    </article>
  )
}
