/** The tool's own identity: what a stored index is compared against to decide whether it is stale. */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** The tool's own version, which invalidates the index when it changes. */
export const TOOL_VERSION = '0.0.0'

/** The TypeScript version the index was built with. A change discards the index. */
export function typescriptVersion(): string {
  const pkg = require('typescript/package.json') as { version?: string }
  return pkg.version ?? 'unknown'
}
