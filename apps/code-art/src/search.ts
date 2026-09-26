import type { Direction, TraceQuery } from './lib/trace.ts'

/** A view within a dataset, as its URL carries it so it can be bookmarked. */
export interface ViewSearch {
  readonly scene?: string
  readonly lens?: 'health'
  readonly isolate?: 'on'
  readonly q?: string
  readonly flow?: Direction
  readonly via?: 'imports'
}

const DIRECTIONS: readonly string[] = ['in', 'out', 'both']

/** Keeps only what a view understands; anything else in a URL is dropped. */
export function viewSearch(raw: Record<string, unknown>): ViewSearch {
  const text = (key: string): string | undefined =>
    typeof raw[key] === 'string' && raw[key] !== '' ? raw[key] : undefined
  const flow = text('flow')
  return {
    scene: text('scene'),
    lens: text('lens') === 'health' ? 'health' : undefined,
    isolate: text('isolate') === 'on' ? 'on' : undefined,
    q: text('q'),
    flow: flow && DIRECTIONS.includes(flow) ? (flow as Direction) : undefined,
    via: text('via') === 'imports' ? 'imports' : undefined,
  }
}

/** The search a view opens with: traced both ways, by calls, two hops deep. */
export function queryOf(search: ViewSearch): TraceQuery {
  return {
    text: search.q ?? '',
    direction: search.flow ?? 'both',
    via: search.via ?? 'calls',
    depth: 2,
  }
}

/** A view's search, leaving out whatever is already the default. */
export function searchOf(view: {
  scene: string
  lens: boolean
  isolate: boolean
  query: TraceQuery
}): ViewSearch {
  const q = view.query.text.trim()
  return {
    scene: view.scene === 'galaxy' ? undefined : view.scene,
    lens: view.lens ? 'health' : undefined,
    isolate: view.isolate ? 'on' : undefined,
    q: q || undefined,
    flow: view.query.direction === 'both' ? undefined : view.query.direction,
    via: view.query.via === 'imports' ? 'imports' : undefined,
  }
}
