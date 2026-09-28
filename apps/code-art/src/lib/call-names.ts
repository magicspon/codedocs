import { LINK_WIDTH, type SymbolNames } from './atlas.ts'

/**
 * Which symbol calls which, for a call between two files: the calling
 * function, method or variable, and the export it calls. The atlas counts
 * calls file to file; the names export keeps them symbol to symbol, so the
 * heaviest pair between the two files names the call.
 */
export interface CallNames {
  /** The calling symbol's name, or `null` for the file's top-level code. */
  readonly caller: string | null
  /** The called symbol's name, or `null` for the other file's top-level code. */
  readonly callee: string | null
  /** How many calls this pair of symbols makes, of all those between the files. */
  readonly count: number
}

/**
 * The heaviest symbol-to-symbol call from the file at `from` to the file at
 * `to`, or `null` when the names do not have it (a dataset exported without
 * names, or a call the names' links missed).
 */
export function callNames(
  names: SymbolNames,
  from: string,
  to: string,
): CallNames | null {
  const file = names[from]
  const peer = file?.peers?.indexOf(to) ?? -1
  if (!file?.links || peer < 0) return null
  let best = -1
  let most = 0
  for (let i = 0; i < file.links.length; i += LINK_WIDTH) {
    const [symbol, via, inbound, at, , count] = file.links.slice(
      i,
      i + LINK_WIDTH,
    )
    // Calls only, made by this file, to that one.
    if (via !== 0 || inbound === 1 || at !== peer || symbol === undefined)
      continue
    if (count! > most) {
      most = count!
      best = i
    }
  }
  if (best < 0) return null
  const symbol = file.links[best]!
  const other = file.links[best + 4]!
  return {
    caller: file.names[symbol] ?? null,
    callee: other >= 0 ? (names[to]?.names[other] ?? null) : null,
    count: most,
  }
}

/**
 * The call from `from` to `to` as a card names it: the symbols where the
 * names know them, else neither, with all `count` calls between the files.
 */
export function namedCall(
  names: SymbolNames | null | undefined,
  from: string,
  to: string,
  count: number,
): CallNames {
  return (
    (names && callNames(names, from, to)) ?? {
      caller: null,
      callee: null,
      count,
    }
  )
}
