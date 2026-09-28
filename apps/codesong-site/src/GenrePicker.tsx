import { GENRE_NAMES, GENRES, type GenreName } from '@codedocs/codesong/browser'
import type { JSX } from 'react'

/**
 * The search parameters that play `genre`. The suggested genre needs none,
 * so a plain song link and the suggested genre are the same page.
 */
export function genreSearch(
  genre: GenreName,
  suggested: GenreName,
): { genre?: GenreName } {
  return genre === suggested ? {} : { genre }
}

interface Props {
  readonly genre: GenreName
  /** The genre the code suggested, marked in the list. */
  readonly suggested: GenreName
  readonly onChange: (genre: GenreName) => void
}

/**
 * Which genre the song plays in. Every genre is the same code-derived piece,
 * so switching keeps the place in the song.
 */
export function GenrePicker({
  genre,
  suggested,
  onChange,
}: Props): JSX.Element {
  return (
    <select
      className="genre"
      aria-label="Genre"
      value={genre}
      onChange={(e) => onChange(e.target.value as GenreName)}
      title="Play the same song in another genre"
    >
      {GENRE_NAMES.map((name) => (
        <option key={name} value={name}>
          {GENRES[name].label}
          {name === suggested ? ' (suggested)' : ''}
        </option>
      ))}
    </select>
  )
}
