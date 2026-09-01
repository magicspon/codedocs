/** The resolved shape of `codedocs.jsonc`, and its defaults. */

import type { Authorship, Role } from '../model.ts'

/** The one file, read from the repository root and nowhere else. */
export const CONFIG_FILE = 'codedocs.jsonc'

/**
 * One `classify` glob and the labels it forces (ADR 0003).
 *
 * Partial by design: a rule may set one axis and leave the other to the signals.
 * Order is the file's own, because ADR 0003 makes the last matching rule win.
 */
export interface ClassifyRule {
  readonly glob: string
  readonly role: Role | null
  readonly authorship: Authorship | null
}

/** One `missing-generated` remediation: the specifier it covers, and the command. */
export interface Remediation {
  /** A glob over the specifier as written, e.g. `@calcom/prisma/*`. */
  readonly specifier: string
  /** The command a user runs. codedocs prints it and never executes it. */
  readonly run: string
}

/** Additions to project discovery. Neither key decides membership (ADR 0003). */
export interface Discover {
  /** Extra config paths or globs, added to what the walk found. */
  readonly projects: readonly string[]
  /** Extra directory names to skip, added to the walk's floor. */
  readonly skip: readonly string[]
}

/** The resolved configuration: the file's keys, or their defaults. */
export interface Config {
  readonly version: number
  readonly classify: readonly ClassifyRule[]
  readonly baselines: number
  readonly discover: Discover
  readonly remediations: readonly Remediation[]
}

/**
 * What codedocs runs on when no file exists, which is the ordinary case.
 *
 * ADR 0010's second test: absence is legal and yields a defensible answer, so a
 * fresh clone never has to be configured before it can be analysed.
 */
export const DEFAULT_CONFIG: Config = {
  version: 1,
  classify: [],
  baselines: 3,
  discover: { projects: [], skip: [] },
  remediations: [],
}
