import {
  realise,
  type GenreName,
  type SongFile,
} from '@codedocs/codesong/browser'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useMemo, useState, type JSX } from 'react'
import { usePlayer } from './audio/usePlayer.ts'
import { noteNames } from './explain/names.ts'
import { Inspector } from './inspect/Inspector.tsx'
import { useSelection } from './inspect/useSelection.ts'
import { length } from './scene/layout.ts'
import { Stage } from './scene/Stage.tsx'
import { SoundPanel } from './SoundPanel.tsx'
import { HomeIcon, IconToggle, InfoIcon } from './icons.tsx'
import { GenrePicker, genreSearch } from './GenrePicker.tsx'
import { MidiDownload } from './MidiDownload.tsx'
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
 * browser, in the genre the code suggested until the listener picks another.
 */
export function SongPage(): JSX.Element {
  const { slug, file } = songRoute.useLoaderData()
  // Keyed by song, so a new song starts over rather than taking the last
  // song's place.
  return <Song key={slug} slug={slug} file={file} />
}

/**
 * The genre playing, from the URL's `?genre=`, or the one the code suggested.
 * Picking one replaces the URL rather than pushing it, so Back leaves the
 * song instead of stepping through genres.
 */
function useGenre(
  suggested: GenreName,
): readonly [GenreName, (next: GenreName) => void] {
  const genre = songRoute.useSearch().genre ?? suggested
  const navigate = songRoute.useNavigate()
  const pick = (next: GenreName): void =>
    void navigate({ search: genreSearch(next, suggested), replace: true })
  return [genre, pick]
}

function Song({
  slug,
  file,
}: {
  readonly slug: string
  readonly file: SongFile
}): JSX.Element {
  const suggested = file.evidence.genre.genre
  const [genre, setGenre] = useGenre(suggested)
  const composition = file.versions[genre]
  const score = useMemo(
    () => ({ composition, evidence: file.evidence }),
    [composition, file.evidence],
  )
  const tracks = useMemo(() => realise(composition), [composition])
  const beats = useMemo(() => length(composition), [composition])
  const names = useMemo(
    () => noteNames(composition, tracks, score.evidence),
    [composition, tracks, score.evidence],
  )

  const player = usePlayer(composition, tracks, beats)
  const [follow, setFollow] = useState(true)
  const view = useSelection(composition, tracks)
  const tuned = tracks.find((t) => t.id === view.tuning)

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
          motif={view.highlight.motif}
          picked={view.highlight.picked}
          section={view.highlight.section}
          onHover={view.setHover}
          onPick={view.pick}
          onSection={(index, at) => {
            view.section(index)
            player.seek(at)
          }}
        />
        <div className="hud">
          <Transport
            corner={<Corner info={view.info} onInfo={view.setInfo} />}
            title={slug}
            beside={
              <>
                <GenrePicker
                  genre={genre}
                  suggested={suggested}
                  onChange={setGenre}
                />
                <MidiDownload
                  slug={slug}
                  composition={composition}
                  tracks={tracks}
                />
              </>
            }
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
            selected={view.tuning}
            onSelect={view.tune}
          />
          {view.info && (
            <Inspector
              score={score}
              tracks={tracks}
              selection={view.selection}
              onSelect={view.setSelection}
              onSeek={player.seek}
            />
          )}
        </div>
        {tuned && (
          <SoundPanel
            key={`${genre}:${tuned.id}`}
            track={tuned}
            genre={genre}
            initial={player.sound(tuned.id)}
            onTune={player.tune}
            onClose={view.closeTuning}
          />
        )}
      </div>
    </article>
  )
}
