import type { SongFile } from '@codedocs/codesong/browser'

/**
 * The songs on the site: every `<name>.song.json` in `songs/`, which the
 * composer writes. Each loads only when its page opens, since a song carries
 * every note and the files behind them.
 */
const scores = import.meta.glob<SongFile>('../songs/*.song.json', {
  import: 'default',
})

/** One song, before its score has loaded. */
export interface Song {
  /** The repository's name; also the song's path on the site. */
  readonly slug: string
  /** Loads the song in every genre, and its evidence. */
  readonly load: () => Promise<SongFile>
}

/** The file name between the last `/` and the first `.`. */
const slugOf = (path: string): string =>
  path.slice(path.lastIndexOf('/') + 1).split('.')[0]!

/** Every song, in name order. */
export const SONGS: readonly Song[] = Object.entries(scores)
  .map(([path, load]) => ({ slug: slugOf(path), load }))
  .sort((a, b) => a.slug.localeCompare(b.slug))

/** The song at `/slug`, if there is one. */
export function findSong(slug: string): Song | undefined {
  return SONGS.find((song) => song.slug === slug)
}
