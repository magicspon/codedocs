import { fromAtlas, type Series } from '../src/lib/series.ts'
import { atlas, file } from './fixture.ts'

/** A folder tree of `n` files, spread over a few folders, so the layout has something to push about. */
export function town(n: number): Series {
  const files = Array.from({ length: n }, (_, i) =>
    file(`${['app', 'lib', 'lib/deep', 'ui'][i % 4]}/f${i}.ts`, {
      kinds: [1 + (i % 7), i % 3, 0, 0, 0, 1, 0, 0],
      size: 500 + i * 37,
      callsIn: i % 5,
    }),
  )
  const calls = files.slice(1).map((_, i) => [i + 1, 0, 1 + (i % 4)] as const)
  return fromAtlas({ ...atlas(), files, calls, imports: [] })
}
