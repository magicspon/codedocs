/**
 * Leaving whole folders out of the art, such as a repo's `examples/`. A
 * tsconfig higher up can still include those files after codedocs'
 * `discover.skip` has stopped it finding projects inside them.
 */

/**
 * Whether any folder on `path` is one of `dirs`. Matched by name at any depth,
 * as `discover.skip` matches.
 */
export function isSkipped(path: string, dirs: readonly string[]): boolean {
  if (dirs.length === 0) return false
  // The last segment is the file itself, not a folder.
  return path
    .split('/')
    .slice(0, -1)
    .some((dir) => dirs.includes(dir))
}
