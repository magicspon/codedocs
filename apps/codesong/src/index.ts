/**
 * CodeSong: a TypeScript repository's architecture as a piece of music.
 * See `docs/AUDIO.md` for the design.
 */

export { compose, DEFAULT_OPTIONS } from './compose/compose.ts'
export type * from './model.ts'
export { toMidi } from './render/midi.ts'
export {
  realise,
  type NoteEvent,
  type RealisedTrack,
} from './render/realise.ts'
export {
  readStructure,
  type Structure,
  type StructureNode,
} from './structure.ts'
