import { useHotkey } from '@tanstack/react-hotkeys'
import { useEffect, useRef } from 'react'
import { useControls } from 'leva'
import type { Direction, TraceQuery, Via } from './lib/trace.ts'

/** Leva's id for the search box: its path, folder first. */
const BOX = 'search.find'

/** What each direction is called, per kind of link, in words a reader uses. */
const DIRECTIONS: Record<Via, Record<string, Direction>> = {
  calls: { Callers: 'in', Both: 'both', Callees: 'out' },
  imports: { Importers: 'in', Both: 'both', Imports: 'out' },
}

/**
 * Search and trace, as a Leva folder: find files by path, then watch the calls
 * or imports flow into and out of them. `/` jumps to the box. App keeps the
 * query; this mirrors it both ways.
 */
export function useSearchControls(
  query: TraceQuery,
  onQuery: (query: TraceQuery) => void,
): void {
  // Leva's callbacks are fixed when the schema is built, so they read the
  // latest query through a ref. Unchanged patches are dropped, which stops
  // the echo when a pushed value comes back as a change.
  const change = useRef((_: Partial<TraceQuery>): void => {})
  change.current = (patch) => {
    const next = { ...query, ...patch }
    const same = (Object.keys(patch) as (keyof TraceQuery)[]).every(
      (k) => next[k] === query[k],
    )
    if (!same) onQuery(next)
  }
  const on =
    <T>(key: keyof TraceQuery) =>
    (v: T, _: string, ctx: { initial: boolean }) => {
      if (!ctx.initial && v !== undefined) change.current({ [key]: v })
    }

  const [, set] = useControls(
    'search',
    () => ({
      find: {
        value: query.text,
        label: 'find ( / )',
        onChange: on<string>('text'),
        transient: false,
      },
      via: {
        value: query.via,
        options: { Calls: 'calls', Imports: 'imports' },
        onChange: on<Via>('via'),
        transient: false,
      },
      direction: {
        value: query.direction,
        options: DIRECTIONS[query.via],
        onChange: on<Direction>('direction'),
        transient: false,
      },
      depth: {
        value: query.depth,
        min: 1,
        max: 4,
        step: 1,
        onChange: on<number>('depth'),
        transient: false,
      },
    }),
    [query.via],
  )

  // A pick in the scene or the match list changes the query outside Leva.
  useEffect(
    () =>
      set({
        find: query.text,
        via: query.via,
        direction: query.direction,
        depth: query.depth,
      }),
    [set, query],
  )

  useSearchKeys(change)
}

/**
 * Leva's text box only reports on Enter or blur; this traces as you type.
 * `/` anywhere but a text box jumps to the search. Escape, which clears it,
 * belongs to the path keys: it clears the selection from anywhere.
 */
function useSearchKeys(change: {
  current: (patch: Partial<TraceQuery>) => void
}): void {
  useHotkey('/', () => document.getElementById(BOX)?.focus())
  useEffect(() => {
    const onInput = (e: Event): void => {
      const box = e.target
      if (box instanceof HTMLInputElement && box.id === BOX)
        change.current({ text: box.value })
    }
    addEventListener('input', onInput)
    return () => removeEventListener('input', onInput)
  }, [change])
}
