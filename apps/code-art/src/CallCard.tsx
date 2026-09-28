import type { JSX } from 'react'
import type { CallNames } from './lib/call-names.ts'

/** A file's name as a card shows it: no folders. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** One end of a call: the symbol and its file, or, for top-level code, the file alone. */
function End(props: { symbol: string | null; path: string }): JSX.Element {
  const file = fileName(props.path)
  if (!props.symbol) return <b>{file}</b>
  return (
    <>
      <b>{props.symbol}</b>
      <i>{file}</i>
    </>
  )
}

/**
 * One call, as a card: the calling symbol over the symbol it calls, each
 * with the file it lives in, and how many calls that pair makes. Without
 * names, the files alone, and all the calls between them. `className`
 * picks the card's colours.
 */
export function CallCard(props: {
  from: string
  to: string
  names: CallNames
  className: string
}): JSX.Element {
  const { from, to, names, className } = props
  return (
    <div className={`metro-tag ${className}`}>
      <span>
        <End symbol={names.caller} path={from} />
      </span>
      <span>
        → <End symbol={names.callee} path={to} /> <em>{names.count}</em>
      </span>
    </div>
  )
}
