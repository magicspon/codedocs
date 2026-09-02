/**
 * Baselines: the indexes codedocs kept from commits it once analysed.
 *
 * Split by concern: `store.ts` is capture, retention and opening one, and
 * `select.ts` is which one an answer uses and what to say when it is not the one
 * that was asked for.
 *
 * This file is the module's only public surface.
 */

export {
  BASELINE_DIR,
  capture,
  listBaselines,
  openBaseline,
  type Capture,
  type StoredBaseline,
} from './store.ts'
export { chooseBaseline, type BaselineChoice } from './select.ts'
