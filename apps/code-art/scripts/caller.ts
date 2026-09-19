import { resolve } from 'node:path'

/**
 * `path` resolved from where the command was typed. pnpm runs a package's
 * scripts from the package's own directory, so `pnpm --filter … export .` at
 * the repo root would otherwise mean `apps/code-art`. pnpm and npm keep the
 * caller's directory in `INIT_CWD`; run directly, it is the current one.
 */
export function fromCaller(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path)
}
