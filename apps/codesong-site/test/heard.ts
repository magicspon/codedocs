import type { GenreName, Song, SongFile } from '@codedocs/codesong/browser'

/**
 * A song file as the page plays it: in `genre`, or the genre the code
 * suggested. Takes the JSON import as it is, which TypeScript types loosely.
 */
export function heard(file: unknown, genre?: GenreName): Song {
  const { versions, evidence } = file as SongFile
  return { composition: versions[genre ?? evidence.genre.genre], evidence }
}
