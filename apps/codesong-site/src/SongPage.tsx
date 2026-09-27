import { getRouteApi, Link } from '@tanstack/react-router'
import type { JSX } from 'react'

// By path rather than by import, so the page and the router do not import each other.
const songRoute = getRouteApi('/$song')

/** One song: a player and a link to download the mp3. */
export function SongPage(): JSX.Element {
  const song = songRoute.useLoaderData()
  return (
    <article className="song">
      <h1>{song.slug}</h1>
      {/* `key` so moving between songs starts the new one from the top. */}
      <audio key={song.url} controls preload="metadata" src={song.url}>
        Your browser cannot play this audio.{' '}
        <a href={song.url}>Download the mp3</a> instead.
      </audio>
      <p className="actions">
        <a href={song.url} download={`${song.slug}.mp3`}>
          Download mp3
        </a>
        <Link to="/">All songs</Link>
      </p>
    </article>
  )
}

/** Shown for a path that names no song. */
export function UnknownSong(): JSX.Element {
  return (
    <p>
      There is no song with that name. <Link to="/">See all songs</Link>.
    </p>
  )
}
