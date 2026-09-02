/**
 * The claim parser, on its own.
 *
 * `docs.test.ts` reaches it through a planted repository, which is the right
 * shape for a verdict but the wrong one for syntax: every refusal ADR 0005's
 * closed predicate set makes is a fact about the text alone, and a fixture that
 * had to hold a symbol for each would say nothing extra about it.
 */

// cspell:ignore frobnicates — a predicate nothing produces, which is the point

import { describe, expect, it } from 'vitest'

import {
  parseClaim,
  type Claim,
  type ClaimSyntaxError,
} from '../src/docs/claim.ts'

/** The claim a text parses to, or `undefined` where it did not parse. */
const claimOf = (text: string): Claim | undefined => {
  const parsed = parseClaim(text)
  return parsed.ok ? parsed.claim : undefined
}

/** The refusal a text produced, or `undefined` where it parsed. */
const errorOf = (text: string): ClaimSyntaxError | undefined => {
  const parsed = parseClaim(text)
  return parsed.ok ? undefined : parsed.error
}

describe('the four forms', () => {
  it('reads a relation, and its negation', () => {
    expect(claimOf('calls(a, b)')).toEqual({
      form: 'relation',
      predicate: 'calls',
      negated: false,
      from: 'a',
      to: 'b',
    })
    expect(claimOf('!calls(a, b)')).toMatchObject({ negated: true })
  })

  it('reads every relation the index has a backend for', () => {
    for (const predicate of [
      'calls',
      'reaches',
      'references',
      'imports',
      'extends',
      'implements',
      'usesType',
    ]) {
      expect(claimOf(`${predicate}(a, b)`)).toMatchObject({ predicate })
    }
  })

  it('reads `exists`, `hasLabel`, `onlyCalledBy` and a count', () => {
    expect(claimOf('exists(a)')).toEqual({
      form: 'exists',
      negated: false,
      subject: 'a',
    })
    expect(claimOf('hasLabel(a, role, test)')).toEqual({
      form: 'label',
      negated: false,
      subject: 'a',
      axis: 'role',
      value: 'test',
    })
    expect(claimOf('onlyCalledBy(a, src/)')).toEqual({
      form: 'scoped',
      subject: 'a',
      directory: 'src/',
    })
    expect(claimOf('callers(a) == 0')).toEqual({
      form: 'count',
      predicate: 'callers',
      subject: 'a',
      expected: 0,
    })
  })

  it('treats whitespace, newlines included, as insignificant', () => {
    expect(claimOf('  calls( a ,\n   b )  ')).toMatchObject({
      from: 'a',
      to: 'b',
    })
    expect(claimOf('implementations(a)\n  == 2')).toMatchObject({ expected: 2 })
  })
})

describe('what it refuses', () => {
  it('names a predicate the index has no backend for, so the gap reads as ours', () => {
    expect(errorOf('exports(a, b)')).toEqual({
      code: 'no-backend',
      predicate: 'exports',
    })
    expect(errorOf('dependsOn(a, b)')).toEqual({
      code: 'no-backend',
      predicate: 'dependsOn',
    })
  })

  it('refuses a predicate it does not know at all', () => {
    expect(errorOf('frobnicates(a, b)')).toEqual({
      code: 'unknown-predicate',
      predicate: 'frobnicates',
    })
  })

  it('refuses a text that is not a call at all', () => {
    expect(errorOf('just some prose')).toEqual({ code: 'unparseable' })
  })

  it('refuses a comparison on a form that asserts nothing with one', () => {
    // Accepting it would leave the author believing the `== 3` meant something.
    expect(errorOf('calls(a, b) == 3')).toEqual({ code: 'unparseable' })
    expect(errorOf('exists(a) == 1')).toEqual({ code: 'unparseable' })
  })

  it('reports the arity every form expects', () => {
    expect(errorOf('exists(a, b)')).toEqual({
      code: 'arity',
      predicate: 'exists',
      expected: 1,
      got: 2,
    })
    expect(errorOf('calls(a)')).toEqual({
      code: 'arity',
      predicate: 'calls',
      expected: 2,
      got: 1,
    })
    expect(errorOf('hasLabel(a, role)')).toEqual({
      code: 'arity',
      predicate: 'hasLabel',
      expected: 3,
      got: 2,
    })
    expect(errorOf('onlyCalledBy(a)')).toEqual({
      code: 'arity',
      predicate: 'onlyCalledBy',
      expected: 2,
      got: 1,
    })
    expect(errorOf('callers(a, b) == 1')).toEqual({
      code: 'arity',
      predicate: 'callers',
      expected: 1,
      got: 2,
    })
  })

  it('refuses to negate `onlyCalledBy`, which is already one', () => {
    // `!onlyCalledBy` asserts that something outside calls it — a fact about no
    // particular caller, which no answer could repair.
    expect(errorOf('!onlyCalledBy(a, src/)')).toEqual({
      code: 'unknown-predicate',
      predicate: '!onlyCalledBy',
    })
  })

  it('refuses every comparator but `==`, and says what it takes', () => {
    for (const tail of ['>= 1', '< 2', '2', '== two', '']) {
      const error = errorOf(`callers(a) ${tail}`)
      expect(error?.code).toBe('count-invalid')
    }
    expect(errorOf('callers(a) >= 1')).toMatchObject({
      detail: 'callers(…) takes `== <n>`, got `>= 1`',
    })
  })

  it('reads a count with no arguments as the arity error it is', () => {
    expect(errorOf('implementations() == 2')).toMatchObject({ code: 'arity' })
  })
})
