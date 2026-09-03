/**
 * The frames of a thrown error that belong to codedocs.
 *
 * ADR 0011: a stack is separable from a message and safe to keep, but only the
 * part of it that is ours. A frame below codedocs' own packages is in the user's
 * code, and the absolute prefix above them names the machine the user is on —
 * `/home/alice/work/their-app/node_modules/@codedocs/core/…` is two repository
 * facts wearing one path. So frames are filtered *and* rewritten at capture,
 * and the unfiltered stack is never put anywhere it could travel from.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** One codedocs package: where it is installed, and what to call it instead. */
interface OwnPackage {
  readonly name: string
  readonly dir: string
  /**
   * Every spelling of that directory a frame might use, longest first.
   *
   * Node writes an ESM frame as a `file://` URL and a CommonJS one as a path,
   * and codedocs is run both ways — from `bin.ts` under type stripping, and
   * from a built bundle. Replacing only the path leaves `file://` stranded in
   * front of the package name.
   */
  readonly prefixes: readonly string[]
}

/**
 * Where codedocs' own code lives in this installation.
 *
 * Resolved rather than assumed, because the layout differs: a published install
 * puts both packages under `node_modules/@codedocs`, and this workspace puts
 * them side by side under `packages/`. Asking the module resolver is the one
 * question that has the same answer in both.
 */
const OWN: readonly OwnPackage[] = ownPackages()

function ownPackages(): readonly OwnPackage[] {
  const found = new Map<string, OwnPackage>()
  for (const specifier of ['@codedocs/core', '@codedocs/cli']) {
    const url = resolveQuietly(specifier)
    const own = url === null ? null : packageAt(url)
    if (own !== null) found.set(own.dir, own)
  }
  // This file's own package, in case `@codedocs/cli` is not resolvable from
  // itself — which is the ordinary case for a `bin` run from a checkout.
  const self = packageAt(import.meta.url)
  if (self !== null) found.set(self.dir, self)
  return [...found.values()]
}

/** A specifier that will not resolve is not an error; it just yields no root. */
function resolveQuietly(specifier: string): string | null {
  try {
    return import.meta.resolve(specifier)
  } catch {
    return null
  }
}

/** The package a module URL sits in: the nearest ancestor with a `package.json`. */
function packageAt(url: string): OwnPackage | null {
  let dir: string
  try {
    dir = dirname(fileURLToPath(url))
  } catch {
    return null
  }
  for (;;) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      const name = nameIn(manifest)
      if (name === null) return null
      return {
        name,
        dir,
        prefixes: [`${pathToFileURL(dir).href}/`, dir + sep],
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function nameIn(manifest: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'))
    const name = (parsed as { name?: unknown }).name
    return typeof name === 'string' ? name : null
  } catch {
    return null
  }
}

/**
 * The codedocs frames of `error`, package-relative, or `undefined` for none.
 *
 * `undefined` rather than an empty array so that a failure with nothing to say
 * about itself carries no `stack` key at all, which keeps the envelope of a
 * parse error — where nothing was thrown — identical to what it prints today.
 */
export function codedocsFrames(error: unknown): readonly string[] | undefined {
  if (!(error instanceof Error) || error.stack === undefined) return undefined
  const frames: string[] = []
  for (const line of error.stack.split('\n')) {
    const frame = line.trim()
    // The message can be several lines; only `at …` lines are frames.
    if (!frame.startsWith('at ')) continue
    const ours = relativise(frame)
    if (ours !== null) frames.push(ours)
  }
  return frames.length > 0 ? frames : undefined
}

/** Rewrite a frame to `at open (@codedocs/core/src/store/open.ts:12:3)`, or refuse it. */
function relativise(frame: string): string | null {
  for (const own of OWN) {
    for (const prefix of own.prefixes) {
      if (!frame.includes(prefix)) continue
      return frame.split(prefix).join(`${own.name}/`)
    }
  }
  return null
}

/**
 * The thrown message, kept as a parameter rather than as the error itself.
 *
 * It is free text out of `node:fs` or the adapter and can name a path, which is
 * exactly why it is a parameter: ADR 0011's default report drops parameters and
 * keeps codes.
 */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
