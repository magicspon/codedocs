/**
 * One codedocs index as the atlas the art is drawn from, with fallow's
 * health readings when fallow is on the PATH.
 */

import { dirname, resolve } from 'node:path'
import type { Atlas } from '../src/lib/atlas.ts'
import { withHealth } from './fallow-health.ts'
import { readAtlas } from './read-index.ts'
import { readFallow } from './read-fallow.ts'

/**
 * Reads the index at `dbPath` into an atlas named `name`, and runs fallow over
 * the repo it belongs to unless `fallow` is false.
 */
export function snapshot(
  dbPath: string,
  options: { readonly name: string; readonly fallow: boolean },
): Atlas {
  // The repo root is two levels above `.codedocs/index.db`.
  const root = resolve(dirname(dbPath), '..')
  const indexed = readAtlas(dbPath, options.name)
  const reading = options.fallow ? readFallow(root) : null
  return reading
    ? withHealth(indexed, reading.report, reading.deadCode)
    : indexed
}
