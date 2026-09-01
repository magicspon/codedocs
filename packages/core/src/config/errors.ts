/** The two ways `codedocs.jsonc` can be refused, and the sentence each prints. */

import { join } from 'node:path'

import type { EnvelopeError } from '../envelope.ts'
import { CONFIG_FILE } from './types.ts'

/**
 * The two ways a config can be refused, as the envelope carries them.
 *
 * Drawn from `EnvelopeError` rather than declared here so the codes and their
 * parameters cannot drift from the wire contract that has to render them.
 */
export type ConfigRefusal = Extract<
  EnvelopeError,
  { readonly code: 'config-invalid' | 'config-misplaced' }
>

/**
 * A config that exists and cannot be used. Carries the refusal whole, because it
 * reaches the caller as ADR 0006's `error` rather than as a stack trace.
 *
 * The `Error`'s own message is built from the same parameters by the same rule
 * the renderer uses, so the sentence a stack trace shows and the sentence the
 * terminal prints cannot say different things.
 */
export class ConfigError extends Error {
  readonly refusal: ConfigRefusal

  constructor(refusal: ConfigRefusal) {
    super(configSentence(refusal))
    this.name = 'ConfigError'
    this.refusal = refusal
  }
}

/**
 * The sentence a config refusal prints.
 *
 * It lives here rather than in the renderer because the parameters are this
 * module's: every message names the file first, then the key, then the
 * expectation, and that order is a property of the file's schema.
 */
export function configSentence(refusal: ConfigRefusal): string {
  if (refusal.code === 'config-misplaced') {
    const { found, expected } = refusal.params
    return `${found} is below the repository root — codedocs reads one ${CONFIG_FILE}, at ${expected}. Move its keys there, or delete it.`
  }
  const { key, expectation } = refusal.params
  const subject = key === '' ? 'the file' : `\`${key}\``
  return `${CONFIG_FILE}: ${subject} ${expectation}`
}

/** The expectation and the key are the parameters; `configSentence` joins them. */
export function invalid(expectation: string, key: string): ConfigError {
  return new ConfigError({
    code: 'config-invalid',
    params: { key, expectation },
  })
}

/**
 * A second config below the root.
 *
 * Not a merge and not nearest-wins: ADR 0004 gives one index per working tree,
 * so a file in one package would silently govern an index spanning every other.
 */
export function misplacedConfig(root: string, found: string): ConfigError {
  return new ConfigError({
    code: 'config-misplaced',
    params: { found, expected: join(root, CONFIG_FILE) },
  })
}
