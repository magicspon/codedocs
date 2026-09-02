/**
 * The one place a code and its parameters become a sentence.
 *
 * ADR 0011 takes the formatted message off the wire, which only works if there
 * is somewhere else for it to live: an agent branches on `error.code`, and a
 * person still reads the line codedocs printed before. Every code is spelled out
 * here exactly once, so the terminal is unchanged and the machine envelope no
 * longer carries English at all.
 *
 * It is a switch over the closed set rather than a lookup table, so adding a
 * code without a sentence is a type error rather than a missing string.
 */

import {
  configSentence,
  OPERATIONS,
  operationSpec,
  operationsTaking,
  type EnvelopeError,
} from '@codedocs/core'

import { usage } from './args.ts'

/** Render one error as the sentence it used to carry. */
// One flat `case` per code, so the count is the size of the closed set rather
// than logic. Collapsing it to a lookup table is what this file's header
// rejected: the switch is what makes a code added without a sentence a type
// error.
// fallow-ignore-next-line complexity
export function formatError(error: EnvelopeError): string {
  switch (error.code) {
    case 'usage':
      return usage()
    case 'unknown-flag':
      return error.params.detail
    case 'unknown-operation':
      return `unknown operation \`${error.params.name}\`\n\n${usage()}`
    case 'subject-required': {
      const { operation, noun } = error.params
      // A variadic subject is a whole command line, so the example has to show
      // the `--` that starts it rather than a subject standing on its own.
      return variadic(operation)
        ? `\`${operation}\` needs a ${noun} after \`--\`, e.g. \`codedocs ${operation} -- trace AuthService.login\``
        : `\`${operation}\` needs a ${noun}, e.g. \`codedocs ${operation} AuthService.login\``
    }
    case 'too-many-arguments': {
      const { operation, noun, got } = error.params
      return variadic(operation)
        ? `\`${operation}\` takes no arguments of its own — its ${noun} goes after \`--\``
        : `\`${operation}\` takes at most one ${noun}, got ${got}`
    }
    case 'flag-unsupported': {
      const { flag, operation } = error.params
      // Derived from the manifest for the same reason `--depth`'s sentence is:
      // the list of operations that take a flag is the manifest's to know.
      const takes = operationsTaking(flag).map((entry) => `\`${entry.name}\``)
      return takes.length === 0
        ? `--${flag} does not apply to \`${operation}\``
        : `--${flag} applies to ${takes.join(', ')}, not \`${operation}\``
    }
    case 'report-recursive':
      return '`report-bug` cannot reproduce itself — give it the command that failed'
    case 'report-unwritable':
      return `could not write ${error.params.out}: ${error.params.detail}`
    case 'depth-unsupported': {
      // Derived from the manifest, so the list cannot fall out of step with the
      // operations that actually take a depth.
      const takes = OPERATIONS.filter((entry) => entry.depth).map(
        (entry) => `\`${entry.name}\``,
      )
      return `--depth applies to ${takes.join(', ')}, not \`${error.params.operation}\``
    }
    case 'label-invalid': {
      const { flag, value, expectation } = error.params
      return `--${flag} takes \`axis=value\`, got \`${value}\` — expected ${expectation}`
    }
    case 'claims-requires-json':
      return (
        '--claims needs --json — a claim expression restates a fact the ' +
        'answer already prints, so only the machine renderer carries it'
      )
    case 'limit-invalid':
      return `--limit must be a non-negative integer, got \`${error.params.value}\``
    case 'depth-invalid':
      return `--depth must be a non-negative integer, got \`${error.params.value}\``
    case 'config-invalid':
    case 'config-misplaced':
      // The config's own sentence, built by `core` from the same parameters, so
      // a stack trace and the terminal cannot disagree about what was wrong.
      return configSentence(error)
    case 'index-unavailable':
    case 'operation-failed':
      return error.params.detail
  }
}

/** Whether an operation's subject is a whole command line rather than one token. */
const variadic = (operation: string): boolean =>
  operationSpec(operation)?.subject?.variadic === true
