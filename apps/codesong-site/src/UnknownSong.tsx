import { Link } from '@tanstack/react-router'
import type { JSX } from 'react'

/** Shown for a path that names no song. */
export function UnknownSong(): JSX.Element {
  return (
    <p>
      There is no song with that name. <Link to="/">See all songs</Link>.
    </p>
  )
}
