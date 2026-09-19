import { Fragment, type JSX } from 'react'
import {
  KINDS,
  ROLES,
  symbolCount,
  type FallowMeta,
  type FileDatum,
} from './lib/atlas.ts'
import { healthRows } from './lib/health-text.ts'

/** The facts behind whatever the pointer is over: the art is data, so it can always be read back. */
export function FilePanel({
  file,
  fallow,
}: {
  file: FileDatum
  fallow: FallowMeta | undefined
}): JSX.Element {
  const kinds = KINDS.flatMap((kind, i) =>
    file.kinds[i] ? [`${file.kinds[i]} ${kind}`] : [],
  )
  return (
    <div className="panel file">
      <strong>{file.path}</strong>
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
    </div>
  )
}
