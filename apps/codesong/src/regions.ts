/**
 * The musical analysis: the structure divided into regions, one per
 * subsystem, each with the measures the composer reads for its section.
 */

import { clusters, cycles } from './clusters.ts'
import { subsystems, type Subsystem } from './hierarchy.ts'
import type { Structure } from './structure.ts'

/** One subsystem and how it sits in the codebase. */
export interface Region {
  readonly path: string
  readonly name: string
  /** Node indexes, most central first. */
  readonly files: readonly number[]
  /** Share of all composed files. */
  readonly share: number
  /** Share of the codebase's total centrality: how much everything leans on it. */
  readonly weight: number
  /**
   * 0–1: how much of the traffic across its border comes in rather than goes
   * out. A subsystem others depend on is foundational; one that only depends
   * on others sits on top.
   */
  readonly foundation: number
  /** Mean distinct dependencies per file, inside the region. */
  readonly density: number
  /** Share of its files that depend on nothing. */
  readonly leafShare: number
  /** Its clusters, largest first, each most central file first. */
  readonly clusters: readonly (readonly number[])[]
  /** Dependency cycles that mostly sit inside it, largest first. */
  readonly cycles: readonly (readonly number[])[]
}

/** The whole analysis the composer reads. */
export interface Analysis {
  readonly structure: Structure
  /** Regions in path order; the form decides the order they play in. */
  readonly regions: readonly Region[]
}

/** Smaller clusters are noise, not a harmonic group. */
const MIN_CLUSTER = 3

function byCentrality(structure: Structure) {
  return (a: number, b: number): number =>
    structure.nodes[b]!.centrality - structure.nodes[a]!.centrality || a - b
}

function region(
  structure: Structure,
  subsystem: Subsystem,
  owner: readonly number[],
  loops: readonly number[][],
  id: number,
): Region {
  const order = byCentrality(structure)
  const files = [...subsystem.files].sort(order)
  let inbound = 0
  let outbound = 0
  let internal = 0
  for (const i of files) {
    for (const [to, w] of structure.out[i]!) {
      if (owner[to] === id) internal++
      else outbound += w
    }
  }
  structure.out.forEach((edges, from) => {
    if (owner[from] === id) return
    for (const [to, w] of edges) if (owner[to] === id) inbound += w
  })

  // Clustered inside the region alone, so a busy neighbour cannot merge it.
  const local = new Map(files.map((i, k) => [i, k]))
  const inner = files.map((i) =>
    structure.out[i]!.flatMap(([to, w]): [number, number][] => {
      const k = local.get(to)
      return k === undefined ? [] : [[k, w]]
    }),
  )
  const label = clusters(inner)
  const groups = new Map<number, number[]>()
  files.forEach((i, k) => {
    const list = groups.get(label[k]!) ?? []
    list.push(i)
    groups.set(label[k]!, list)
  })
  const total = structure.nodes.reduce((sum, n) => sum + n.centrality, 0) || 1
  return {
    path: subsystem.path,
    name: subsystem.name,
    files,
    share: files.length / structure.nodes.length,
    weight:
      files.reduce((sum, i) => sum + structure.nodes[i]!.centrality, 0) / total,
    foundation: inbound + outbound === 0 ? 0.5 : inbound / (inbound + outbound),
    density: internal / files.length,
    leafShare:
      files.filter((i) => structure.nodes[i]!.fanOut === 0).length /
      files.length,
    clusters: [...groups.values()]
      .filter((g) => g.length >= MIN_CLUSTER)
      .sort((a, b) => b.length - a.length || a[0]! - b[0]!),
    cycles: loops
      .filter(
        (loop) => loop.filter((i) => owner[i] === id).length * 2 > loop.length,
      )
      .map((loop) => [...loop].sort(order)),
  }
}

/** Divides the structure into regions and measures each one. */
export function analyse(structure: Structure): Analysis {
  const found = subsystems(structure.nodes.map((n) => n.path))
  // Which region each file belongs to; -1 for files in no subsystem.
  const owner = structure.nodes.map(() => -1)
  found.forEach((s, id) => {
    for (const i of s.files) owner[i] = id
  })
  const loops = cycles(structure.out)
  return {
    structure,
    regions: found.map((s, id) => region(structure, s, owner, loops, id)),
  }
}
