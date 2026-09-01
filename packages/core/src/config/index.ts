/**
 * `codedocs.jsonc`: the facts about a repository codedocs cannot determine.
 *
 * ADR 0010 admits a key only where an ADR found something undetectable, gives
 * every key a default so the file stays optional, and forbids any key that
 * changes what is reported about what was analysed. Parsing is strict on the
 * same reasoning: a file that exists and is wrong means the user's intent is
 * unknown, and guessing at it is how a config produces a confidently wrong
 * answer.
 *
 * Split by concern: `types.ts` is the resolved shape and its defaults,
 * `errors.ts` is the two ways the file can be refused, `jsonc.ts` reads JSON
 * with comments and trailing commas, `primitives.ts` and `schema.ts` are the
 * scalar checks and the per-key readers built from them, and `read.ts` is the
 * entry points — `loadConfig`, `configFacts`, `parseConfig`, `remediationFor`.
 *
 * This file is the module's only public surface.
 */

export {
  CONFIG_FILE,
  DEFAULT_CONFIG,
  type ClassifyRule,
  type Config,
  type Discover,
  type Remediation,
} from './types.ts'

export {
  ConfigError,
  configSentence,
  misplacedConfig,
  type ConfigRefusal,
} from './errors.ts'

export {
  configFacts,
  loadConfig,
  parseConfig,
  remediationFor,
  type ConfigFacts,
} from './read.ts'
