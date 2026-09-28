/**
 * The part of CodeSong a browser can load: the model, the realiser and the
 * theory, none of which touch Node. The site plays songs through this entry,
 * so it never bundles the pipeline that reads a repository.
 */

export type * from './model.ts'
export type * from './evidence.ts'
export {
  DRUM_NOTES,
  realise,
  type NoteEvent,
  type RealisedTrack,
} from './render/realise.ts'
export { toMidi } from './render/midi.ts'
export { NOTE_NAMES, SCALES } from './theory.ts'
export {
  BUSY,
  GENRE_NAMES,
  GENRES,
  KNOTTED,
  TANGLED,
  type Genre,
  type Suggestion,
} from './compose/genre.ts'
