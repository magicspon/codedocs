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
export { NOTE_NAMES, SCALES } from './theory.ts'
