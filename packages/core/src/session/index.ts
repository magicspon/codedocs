/**
 * A session is one question's worth of index access: open the store, bring it up
 * to date, and assemble the honesty fields the envelope owes.
 *
 * ADR 0004 makes every query update before it answers. An answer that could not
 * be brought up to date — because the caller passed `--no-update` — is still
 * given, with the drifted files named as blind spots. Silence is the one
 * behaviour ruled out.
 *
 * Split by concern: `version.ts` is the tool's own identity, `shared.ts` is what
 * a repair and a cold build share, `cold.ts` is the cold build, `wave.ts` is the
 * incremental repair, and `open.ts` is `openSession` itself — deciding what is
 * outstanding and choosing between the two.
 *
 * This file is the module's only public surface.
 */

export { openSession, type Session, type SessionOptions } from './open.ts'
export { rebuild } from './cold.ts'
export type { RepairReport } from './shared.ts'
export { TOOL_VERSION, typescriptVersion } from './version.ts'
