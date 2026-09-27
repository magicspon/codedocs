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
export { analyse, type Analysis, type Region } from './regions.ts'
export {
  readStructure,
  type Structure,
  type StructureNode,
} from './structure.ts'
export {
  buildPlan,
  type BuildReport,
  type LiveHost,
  type LiveTrackHost,
  type Progress,
} from './live/apply.ts'
export { DEFAULT_PALETTE, type Palette, type Voice } from './live/palette.ts'
export {
  livePlan,
  parsePlan,
  type DrumPad,
  type LiveClip,
  type LiveNote,
  type LivePlan,
  type LiveTrackPlan,
} from './live/plan.ts'
export { findKit } from './live/samples.ts'
