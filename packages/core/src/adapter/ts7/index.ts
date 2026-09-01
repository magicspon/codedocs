/**
 * The TypeScript 7 adapter: the only part of codedocs that knows a backend
 * exists.
 *
 * It sweeps call sites and resolves callees in batches, rather than asking
 * "who calls X" per symbol. The spike measured the per-symbol method at 12.6 ms
 * a query, unbatchable, and projected 122 s for one cal.com project; the sweep
 * produces a strict superset of the same edges in 4.1 s.
 *
 * Split by sweep: `program.ts` opens the backend and drives extraction,
 * `symbols.ts`, `calls.ts`, `imports.ts` and `export-shapes.ts` are the four
 * sweeps an extraction runs, `descriptors.ts` builds the descriptor path and
 * call attribution both symbol and call sweeps share, and `shared.ts` holds
 * the low-level helpers with no dependency on any of it. `types.ts` is the
 * contract all of them read and write.
 *
 * This file is the module's only public surface.
 */

export type { DeclarationSite } from './types.ts'
export type { AnalysisSession } from './types.ts'
export { analyse, openAnalysis } from './program.ts'
