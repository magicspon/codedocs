/**
 * The one place a code becomes a sentence.
 *
 * ADR 0011 takes the message off the wire, which only works if every code in
 * the closed set still has a line a person can read. This walks the whole set:
 * a code added without a sentence is already a type error, and a sentence that
 * says nothing about its own parameters is what this catches instead.
 */

import { describe, expect, it } from 'vitest'
import type { EnvelopeError } from '@codedocs/core'

import { formatError } from '../src/messages.ts'

/** Every code, with parameters that are plausible for it. */
const EVERY: readonly EnvelopeError[] = [
  { code: 'usage', params: {} },
  { code: 'unknown-flag', params: { detail: "Unknown option '--nope'" } },
  { code: 'unknown-operation', params: { name: 'explain' } },
  {
    code: 'subject-required',
    params: { operation: 'callers', noun: 'subject' },
  },
  {
    code: 'too-many-arguments',
    params: { operation: 'callers', noun: 'subject', got: 2 },
  },
  { code: 'depth-unsupported', params: { operation: 'callers' } },
  {
    code: 'flag-unsupported',
    params: { flag: 'measure', operation: 'callers' },
  },
  { code: 'limit-invalid', params: { value: 'lots' } },
  { code: 'claims-requires-json', params: {} },
  {
    code: 'label-invalid',
    params: { flag: 'label', value: 'nonsense', expectation: 'role=test' },
  },
  { code: 'depth-invalid', params: { value: 'two' } },
  {
    code: 'verdict-invalid',
    params: { value: 'verified', expectation: 'potentially-stale' },
  },
  {
    code: 'config-invalid',
    params: { key: 'baselines', expectation: 'a number' },
  },
  {
    code: 'config-misplaced',
    params: { found: 'apps/web/codedocs.jsonc', expected: 'codedocs.jsonc' },
  },
  {
    code: 'index-unavailable',
    params: { detail: 'the store could not be opened' },
  },
  { code: 'operation-failed', params: { detail: 'no such subject' } },
  { code: 'report-recursive', params: {} },
  {
    code: 'report-unwritable',
    params: { out: 'report.json', detail: 'EACCES' },
  },
]

describe('formatError', () => {
  it('has a sentence for every code in the closed set', () => {
    for (const error of EVERY) {
      const sentence = formatError(error)
      expect(sentence, error.code).not.toBe('')
      expect(sentence, error.code).not.toContain('undefined')
    }
  })

  it('shows the `--` a variadic subject begins with, and no example without one', () => {
    // `report-bug`'s subject is a whole command line, so an example showing a
    // bare subject would be an example nobody could type.
    expect(
      formatError({
        code: 'subject-required',
        params: { operation: 'report-bug', noun: 'command' },
      }),
    ).toContain('after `--`')
    expect(
      formatError({
        code: 'too-many-arguments',
        params: { operation: 'report-bug', noun: 'command', got: 1 },
      }),
    ).toContain('goes after `--`')

    expect(
      formatError({
        code: 'subject-required',
        params: { operation: 'callers', noun: 'subject' },
      }),
    ).toContain('codedocs callers AuthService.login')
  })

  it('reads the operations a flag applies to off the manifest', () => {
    // Listed rather than written out, so the sentence cannot fall out of step
    // with the operations that actually declare the flag.
    expect(
      formatError({
        code: 'flag-unsupported',
        params: { flag: 'measure', operation: 'callers' },
      }),
    ).toContain('`doctor`')
    // A flag no operation declares has no list to name.
    expect(
      formatError({
        code: 'flag-unsupported',
        params: { flag: 'invented', operation: 'callers' },
      }),
    ).toBe('--invented does not apply to `callers`')
  })

  it('names the operations that take a depth, from the same manifest', () => {
    expect(
      formatError({
        code: 'depth-unsupported',
        params: { operation: 'callers' },
      }),
    ).toContain('`trace`')
  })

  it('opens the usage text when nothing was named, and after an unknown operation', () => {
    expect(formatError({ code: 'usage', params: {} })).toContain('Usage:')
    expect(
      formatError({ code: 'unknown-operation', params: { name: 'explain' } }),
    ).toContain('Usage:')
  })
})
