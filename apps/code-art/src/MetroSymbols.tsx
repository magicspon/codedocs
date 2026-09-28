import type { JSX } from 'react'
import type { FileDatum } from './lib/atlas.ts'
import { useSymbols } from './hooks.ts'
import { KIND_COLORS } from './lib/palette.ts'

/** Each kind in plain words, indexed by `KINDS`. */
const KIND_WORDS: readonly string[] = [
  'function',
  'class',
  'interface',
  'type',
  'enum',
  'variable',
  'method',
  'namespace',
]

/** How many names the panel lists before it just counts the rest. */
const SHOWN = 8

/**
 * The symbols in the building the driver faces: its top-level names, each
 * with its kind in words and in its kind's colour (the same colours as its sign and the galaxy's
 * stars). Names are read only once a file is faced, and not at all for a
 * dataset exported without them.
 */
export function MetroSymbols(props: {
  repo: string
  file: FileDatum
}): JSX.Element | null {
  const symbols = useSymbols(props.repo, props.file.path)
  if (symbols === null) return null
  if (symbols === undefined)
    return <div className="panel metro-symbols">Reading names…</div>
  // Top-level first: a class's methods sit under it, so the class says more.
  const order = symbols.names
    .map((name, i) => ({
      name,
      kind: symbols.kinds[i]!,
      top: symbols.parents[i] === -1,
    }))
    .sort((a, b) => Number(b.top) - Number(a.top))
  const rest = order.length - SHOWN
  return (
    <div className="panel metro-symbols">
      <ul>
        {order.slice(0, SHOWN).map((s, i) => (
          <li key={`${s.name}:${i}`}>
            <span
              className="metro-kind"
              style={{ background: `#${KIND_COLORS[s.kind]!.getHexString()}` }}
            />
            <span className="metro-name">{s.name}</span>
            <span className="metro-what">{KIND_WORDS[s.kind]}</span>
          </li>
        ))}
      </ul>
      {rest > 0 && <p>and {rest} more</p>}
    </div>
  )
}
