import { Fragment, type JSX } from 'react'
import {
  KINDS,
  ROLES,
  symbolCount,
  type FallowMeta,
  type FileDatum,
} from './lib/atlas.ts'
import { healthRows } from './lib/health-text.ts'

/** Where the file sits on the search's trace; nothing when it is off the trace. */
function TraceRow({ hops }: { hops: string | undefined }): JSX.Element | null {
  if (!hops) return null
  return (
    <>
      <dt>Trace</dt>
      <dd>{hops}</dd>
    </>
  )
}

/** The +/− button that folds the panel down to its path. */
function CollapseToggle(props: {
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
}): JSX.Element {
  return (
    <button
      aria-expanded={!props.collapsed}
      aria-label={props.collapsed ? 'Show details' : 'Hide details'}
      onClick={() => props.onCollapse(!props.collapsed)}
    >
      {props.collapsed ? '+' : '−'}
    </button>
  )
}

/** The facts behind whatever the pointer is over: the art is data, so it can always be read back. */
export function FilePanel({
  file,
  fallow,
  hops,
  collapsed = false,
  onCollapse,
}: {
  file: FileDatum
  fallow: FallowMeta | undefined
  /** Where the file sits on the search's trace, in words; absent off it. */
  hops?: string | undefined
  /** Only the path shows when collapsed. */
  collapsed?: boolean
  /** Absent, the panel cannot be collapsed and shows no toggle. */
  onCollapse?: (collapsed: boolean) => void
}): JSX.Element {
  return (
    <div className="panel file">
      <div className="file-head">
        <strong>{file.path}</strong>
        {onCollapse && (
          <CollapseToggle collapsed={collapsed} onCollapse={onCollapse} />
        )}
      </div>
      {!collapsed && <FileFacts file={file} fallow={fallow} hops={hops} />}
    </div>
  )
}

/** Everything about the file below its path. */
function FileFacts({
  file,
  fallow,
  hops,
}: {
  file: FileDatum
  fallow: FallowMeta | undefined
  hops: string | undefined
}): JSX.Element {
  const kinds = KINDS.flatMap((kind, i) =>
    file.kinds[i] ? [`${file.kinds[i]} ${kind}`] : [],
  )
  return (
    <>
      <dl>
        <dt>Symbols</dt>
        <dd>{symbolCount(file)}</dd>
        <dt>Calls in</dt>
        <dd>{file.callsIn}</dd>
        <dt>Calls out</dt>
        <dd>{file.callsOut}</dd>
        <dt>Unresolved</dt>
        <dd>{file.unresolved}</dd>
        <dt>Role</dt>
        <dd>
          {ROLES[file.role]}
          {file.generated ? ', generated' : ''}
        </dd>
        <TraceRow hops={hops} />
      </dl>
      <p className="kinds">{kinds.join(' · ')}</p>
      {file.health && fallow && (
        <>
          <h3>Health</h3>
          <dl>
            {healthRows(file.health, fallow).map(([label, value]) => (
              <Fragment key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </Fragment>
            ))}
          </dl>
        </>
      )}
    </>
  )
}
