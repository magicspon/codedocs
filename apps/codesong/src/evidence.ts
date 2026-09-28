/**
 * What a composition was made from: the measures the composer read, kept
 * beside the piece so a viewer can show why every note is where it is. The
 * composition names its files; the evidence says what was measured in them.
 */

import type { SymbolNames } from '@codedocs/code-art/atlas'
import { fifths } from './compose/compose.ts'
import { suggest, type Suggestion } from './compose/genre.ts'
import type { Composition, GenreName } from './model.ts'
import type { Analysis } from './regions.ts'
import type { StructureNode } from './structure.ts'

/** One file's measures, as the composer read them. */
export type FileMeasures = Omit<StructureNode, 'path' | 'project'>

/** One subsystem's measures, which shaped the section built from it. */
export interface RegionEvidence {
  readonly path: string
  readonly name: string
  readonly files: number
  readonly share: number
  readonly weight: number
  readonly foundation: number
  readonly density: number
  readonly leafShare: number
  readonly clusters: number
  readonly cycles: number
}

/** Everything the viewer needs to explain a composition. */
export interface Evidence {
  /** Hand-written source files the piece was composed from. */
  readonly files: number
  readonly meanFanOut: number
  readonly leafShare: number
  /** Steps round the circle of fifths from C that the coupling picked. */
  readonly fifths: number
  /** The genre the code suggested, and the two measures behind it. */
  readonly genre: Suggestion
  /** Regions in path order. */
  readonly regions: readonly RegionEvidence[]
  /** Measures of every file a heard motif names, by path. */
  readonly measures: Readonly<Record<string, FileMeasures>>
  /**
   * The top-level names each of those files declares, by path, in source
   * order. Absent when the repository was exported without symbol names.
   */
  readonly symbols?: Readonly<Record<string, readonly string[]>>
}

/** Names kept per file: enough to show, not the whole file. */
const MAX_SYMBOLS = 12

/** A file's top-level names, each once, in the order the file declares them. */
function topLevel(names: SymbolNames, path: string): string[] {
  const file = names[path]
  if (!file) return []
  const kept = file.names.filter((_, i) => file.parents[i] === -1)
  return [...new Set(kept)].slice(0, MAX_SYMBOLS)
}

/** A composition and its evidence: one song in one genre. */
export interface Song {
  readonly composition: Composition
  readonly evidence: Evidence
}

/**
 * One song in every genre, as the site loads it. The versions share their
 * evidence, since they were all composed from the same code.
 */
export interface SongFile {
  readonly versions: Readonly<Record<GenreName, Composition>>
  readonly evidence: Evidence
}

/**
 * The evidence for `compositions`, which `analysis` composed. `names`, when
 * the repository was exported with them, adds each file's symbol names.
 */
export function evidence(
  analysis: Analysis,
  compositions: readonly Composition[],
  names?: SymbolNames,
): Evidence {
  const { structure, regions } = analysis
  const named = new Set(
    compositions.flatMap((c) => c.motifs.flatMap((m) => m.source.files)),
  )
  const measures: Record<string, FileMeasures> = {}
  for (const { path, project: _, ...rest } of structure.nodes) {
    if (named.has(path)) measures[path] = rest
  }
  return {
    files: structure.nodes.length,
    meanFanOut: structure.meanFanOut,
    leafShare: structure.leafShare,
    fifths: fifths(structure),
    genre: suggest(analysis),
    regions: regions.map((r) => ({
      path: r.path,
      name: r.name,
      files: r.files.length,
      share: r.share,
      weight: r.weight,
      foundation: r.foundation,
      density: r.density,
      leafShare: r.leafShare,
      clusters: r.clusters.length,
      cycles: r.cycles.length,
    })),
    measures,
    ...(names && {
      symbols: Object.fromEntries(
        Object.keys(measures).map((path) => [path, topLevel(names, path)]),
      ),
    }),
  }
}
