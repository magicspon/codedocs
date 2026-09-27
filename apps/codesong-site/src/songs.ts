/**
 * The songs on the site: every mp3 in `public`. Adding a file
 * there adds a song; the glob makes Vite copy each one into the build with a
 * hashed name, so a re-rendered song is never served stale.
 */
const files = import.meta.glob<string>('../public/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** One rendered song. */
export interface Song {
  /** The file name without `.mp3`; also the song's path on the site. */
  readonly slug: string
  /** Where the browser fetches the mp3 from. */
  readonly url: string
}

/** Every song, in name order. */
export const SONGS: readonly Song[] = Object.entries(files)
  .map(([path, url]) => ({
    slug: path.slice(path.lastIndexOf('/') + 1, -'.mp3'.length),
    url,
  }))
  .sort((a, b) => a.slug.localeCompare(b.slug))

/** The song at `/slug`, if there is one. */
export function findSong(slug: string): Song | undefined {
  return SONGS.find((song) => song.slug === slug)
}
