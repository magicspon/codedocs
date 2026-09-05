/**
 * The command line, read straight from `process.argv`.
 *
 * Small enough not to want a parser, and keeping it here means the entry point
 * reads as the sequence of steps a run takes rather than as argument handling.
 */

/** The value after `--name`, or the fallback when the flag is absent. */
export function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback
}

/** True when `--name` was passed. */
export function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}
