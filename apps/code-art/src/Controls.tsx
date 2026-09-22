import { useEffect, type JSX } from 'react'
import { Leva, useControls } from 'leva'
import type { FallowMeta } from './lib/atlas.ts'
import { frameSummary } from './lib/frame.ts'
import { lensNote } from './lib/health-text.ts'
import type { Series } from './lib/series.ts'
import type { Trace, TraceQuery } from './lib/trace.ts'
import { SearchResults } from './SearchResults.tsx'
import { useSearchControls } from './useSearchControls.ts'

/** What each scene maps, in one line, so the picture can be read and not just looked at. */
const LEGENDS: Record<string, string> = {
  galaxy:
    'Arms are top-level folders. The core holds the code everything else leans on. Stars are symbols, coloured by kind. Red haze marks calls the analysis could not resolve.',
  city: 'Districts are folders. Footprint is file size, height is symbol count, and each setback is another kind of symbol the file declares. Lit windows are the traffic through the file, tinted by the kind it mostly holds. Roof masts glow with incoming calls.',
}

/** Leva's tokens, matched to the rest of the overlay. */
const THEME = {
  colors: {
    elevation1: 'rgb(255 255 255 / 4%)',
    elevation2: 'rgb(10 12 22 / 72%)',
    elevation3: 'rgb(255 255 255 / 8%)',
    accent1: '#ffc56b',
    accent2: '#ffb347',
    accent3: '#ffd699',
    highlight1: '#6b7386',
    highlight2: '#9aa3b8',
    highlight3: '#e8ebf3',
    vivid1: '#ffc56b',
  },
  sizes: { rootWidth: '100%', controlWidth: '190px' },
  fontSizes: { root: '12px' },
}

interface ControlsProps {
  readonly datasets: readonly string[]
  readonly dataset: string
  readonly onDataset: (name: string) => void
  readonly scenes: readonly string[]
  readonly scene: string
  readonly onScene: (name: string) => void
  readonly lens: boolean
  readonly onLens: (on: boolean) => void
  readonly isolate: boolean
  readonly onIsolate: (on: boolean) => void
  readonly fallow: FallowMeta | undefined
  /** Null while loading, when there is nothing to say about the frame. */
  readonly series: Series | null
  readonly frame: number
  readonly query: TraceQuery
  readonly onQuery: (query: TraceQuery) => void
  readonly trace: Trace | null
}

/** What is on show, in one line: the file count and the commit. */
function showing(series: Series | null, frame: number): string {
  if (!series) return 'Loading…'
  const summary = frameSummary(series, frame)
  return `${summary.present.toLocaleString()} files · ${summary.commit?.sha.slice(0, 7) ?? ''}`
}

/** The pickers, what is on show and the search, in a Leva panel, with prose under it. */
export function Controls(props: ControlsProps): JSX.Element {
  const available = props.fallow !== undefined
  const shown = showing(props.series, props.frame)
  const legend = [
    LEGENDS[props.scene],
    lensNote(props.scene, props.fallow, props.lens),
  ]
    .filter(Boolean)
    .join('\n\n')

  // Leva owns the inputs; App keeps the state. `initial` is skipped so mounting
  // the panel never echoes the starting values back as a change.
  const [, set] = useControls(
    () => ({
      dataset: {
        value: props.dataset,
        options: [...props.datasets],
        onChange: (v: string, _: string, ctx: { initial: boolean }) => {
          if (!ctx.initial) props.onDataset(v)
        },
        transient: false,
      },
      scene: {
        value: props.scene,
        options: [...props.scenes],
        onChange: (v: string, _: string, ctx: { initial: boolean }) => {
          if (!ctx.initial) props.onScene(v)
        },
        transient: false,
      },
      'health lens': {
        value: available && props.lens,
        disabled: !available,
        onChange: (
          v: boolean | undefined,
          _: string,
          ctx: { initial: boolean },
        ) => {
          // A disabled input reports `undefined`; that is not a choice.
          if (!ctx.initial && v !== undefined) props.onLens(v)
        },
        transient: false,
      },
      // Only the galaxy can draw the trace's files in close.
      'isolate ( i )': {
        value: props.isolate,
        disabled: props.scene !== 'galaxy',
        onChange: (
          v: boolean | undefined,
          _: string,
          ctx: { initial: boolean },
        ) => {
          if (!ctx.initial && v !== undefined) props.onIsolate(v)
        },
        transient: false,
      },
      showing: { value: shown, editable: false },
    }),
    [props.datasets, props.scenes, available, props.scene],
  )

  // Registered after the pickers, so the search folder sits below them.
  useSearchControls(props.query, props.onQuery)

  // A read-only row follows the view; Leva keeps a value once set, so push it.
  useEffect(() => set({ showing: shown }), [set, shown])
  // The `i` key toggles isolation outside Leva.
  useEffect(() => set({ 'isolate ( i )': props.isolate }), [set, props.isolate])

  return (
    <div className="panel controls">
      <Leva
        fill
        flat
        theme={THEME}
        titleBar={{ title: 'Controls', drag: false, filter: false }}
        hideCopyButton
      />
      {/* Prose, so outside Leva: its text rows are fixed-height inputs. */}
      <div className="prose">
        {props.series && (
          <SearchResults
            query={props.query}
            onQuery={props.onQuery}
            trace={props.trace}
            files={props.series.merged.files}
          />
        )}
        <p className="legend">{legend}</p>
      </div>
    </div>
  )
}
