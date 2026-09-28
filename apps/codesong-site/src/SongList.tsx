import { Link } from '@tanstack/react-router'
import type { JSX } from 'react'
import { SONGS } from './songs.ts'

/** Every song, each linking to its own page. */
export function SongList(): JSX.Element {
  if (SONGS.length === 0)
    return (
      <p>
        No songs yet. Copy a song.json from the composer into
        apps/codesong-site/songs.
      </p>
    )

  return (
    <ul className="songs">
      {SONGS.map((song) => (
        <li key={song.slug}>
          <Link to="/$song" params={{ song: song.slug }}>
            {song.slug}
          </Link>
        </li>
      ))}
    </ul>
  )
}
