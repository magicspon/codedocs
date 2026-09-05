/**
 * Argument parsing, asserted without running an operation.
 *
 * `main.test.ts` reaches the parser through `run`, which needs a planted
 * repository to answer anything — so the refusals ADR 0006 requires of it are
 * pinned here instead. Every one of them is a fact about the command line
 * alone, and ADR 0011 makes each a code with typed parameters rather than a
 * sentence, which is exactly what a test can hold.
 */

import { describe, expect, it } from 'vitest'

import { flagsIn, parse } from '../src/args.ts'

/** The refusal a command line produced, or `undefined` where it parsed. */
const errorOf = (...argv: string[]) => {
  const parsed = parse(argv, '/tmp/fixture')
  return parsed.ok ? undefined : parsed.error
}

/** The command a line parsed to, or `undefined` where it was refused. */
const commandOf = (...argv: string[]) => {
  const parsed = parse(argv, '/tmp/fixture')
  return parsed.ok ? parsed.command : undefined
}

describe('what it accepts', () => {
  it('defaults the working directory to the process’s own', () => {
    // The default is what `bin.ts` relies on; `report-bug` is the one caller
    // that passes its own, so that a reproduction runs where it was pointed.
    const parsed = parse(['callers', 'charge'])
    expect(parsed.ok && parsed.command.cwd).toBe(process.cwd())
  })

  it('reads a two-word operation before it tries a one-word one', () => {
    // There is no operation called `docs`, so a one-word attempt first would
    // refuse both of the operations spelled with two.
    expect(commandOf('docs', 'check')?.operation).toBe('docs check')
    expect(commandOf('docs', 'affected')?.operation).toBe('docs affected')
  })

  it('takes an operation that has no subject at all', () => {
    const command = commandOf('analyse')
    expect(command?.operation).toBe('analyse')
    expect(command?.subject).toBeNull()
  })

  it('keeps a variadic subject as the words it was given as', () => {
    const command = commandOf('report-bug', '--', 'trace', 'charge', '--json')
    expect(command?.subject).toBeNull()
    expect(command?.trailing).toEqual(['trace', 'charge', '--json'])
  })

  it('takes several subjects for one of ADR 0014’s six batched operations', () => {
    const command = commandOf('evidence', 'charge', 'refund', 'audit')
    expect(command?.subject).toBeNull()
    expect(command?.subjects).toEqual(['charge', 'refund', 'audit'])
  })

  it('still takes exactly one subject as a batch of one', () => {
    const command = commandOf('callers', 'charge')
    expect(command?.subjects).toEqual(['charge'])
  })
})

describe('what it refuses', () => {
  it('names an operation it does not know, whichever side of `--` it was on', () => {
    expect(errorOf('explain', 'X')).toEqual({
      code: 'unknown-operation',
      params: { name: 'explain' },
    })
    // Nothing before the `--`, so the name has to be read off the other side.
    expect(errorOf('--', 'explain', 'X')).toEqual({
      code: 'unknown-operation',
      params: { name: 'explain' },
    })
  })

  it('refuses a flag it does not know, carrying node’s own sentence as a parameter', () => {
    const error = errorOf('callers', 'charge', '--nope')
    expect(error?.code).toBe('unknown-flag')
    // Node's own sentence names the flag the user typed, which is why it is a
    // parameter rather than part of the code.
    expect(error?.code === 'unknown-flag' ? error.params.detail : '').toContain(
      '--nope',
    )
  })

  it('asks for usage where the line names nothing, or asks for help', () => {
    expect(errorOf()).toEqual({ code: 'usage', params: {} })
    expect(errorOf('--help')).toEqual({ code: 'usage', params: {} })
  })

  it('counts the extra arguments, naming what the operation calls one', () => {
    // `trace` takes exactly one subject — unlike ADR 0014's six batched
    // operations, a second positional is refused rather than a second subject.
    expect(errorOf('trace', 'charge', 'extra')).toEqual({
      code: 'too-many-arguments',
      params: { operation: 'trace', noun: 'root', got: 2 },
    })
    // An operation with no subject has no noun of its own to name.
    expect(errorOf('analyse', 'here', 'there')).toEqual({
      code: 'too-many-arguments',
      params: { operation: 'analyse', noun: 'argument', got: 2 },
    })
  })

  it('refuses a variadic subject given nothing after `--`, or a word before it', () => {
    expect(errorOf('report-bug')).toMatchObject({ code: 'subject-required' })
    expect(errorOf('report-bug', 'trace')).toMatchObject({
      code: 'too-many-arguments',
    })
  })

  it('refuses a depth that is not a non-negative integer', () => {
    expect(errorOf('trace', 'charge', '--depth=-1')).toEqual({
      code: 'depth-invalid',
      params: { value: '-1' },
    })
    expect(errorOf('trace', 'charge', '--depth=two')).toMatchObject({
      code: 'depth-invalid',
    })
    expect(commandOf('trace', 'charge', '--depth=0')?.depth).toBe(0)
  })

  it('refuses a label filter it does not know, on either flag', () => {
    // Silently matching nothing would read as "no results" — a filter that
    // quietly excludes everything is worse than one that is refused.
    expect(errorOf('callers', 'charge', '--label', 'nonsense')).toMatchObject({
      code: 'label-invalid',
      params: { flag: 'label' },
    })
    expect(
      errorOf('callers', 'charge', '--exclude-label', 'nonsense'),
    ).toMatchObject({
      code: 'label-invalid',
      params: { flag: 'exclude-label' },
    })
  })

  it('refuses a `--fail-on` that names no verdict it would fail on', () => {
    expect(errorOf('docs', 'check', '--fail-on', 'verified')).toMatchObject({
      code: 'verdict-invalid',
    })
    expect(
      commandOf('docs', 'check', '--fail-on', 'potentially-stale')?.failOn,
    ).toBe('potentially-stale')
  })
})

describe('the flags a report may carry', () => {
  it('names the recognised flags and drops everything else', () => {
    // ADR 0011: the flag names travel, their values do not — the values are the
    // user's own text, and this is what stops one being smuggled into the safe
    // shape.
    expect(
      flagsIn(['trace', 'charge', '--json', '--limit=5', '--nope']),
    ).toEqual(['json', 'limit'])
    expect(flagsIn(['--with-repository'])).toEqual(['with-repository'])
    expect(flagsIn([])).toEqual([])
  })
})

describe('colour', () => {
  it('is off when asked to be off, whatever else says', () => {
    expect(commandOf('callers', 'charge', '--no-color')?.color).toBe(false)
    expect(commandOf('callers', 'charge', '--color', '--no-color')?.color).toBe(
      false,
    )
  })

  it('is on when asked for, which is what a captured pipe needs', () => {
    expect(commandOf('callers', 'charge', '--color')?.color).toBe(true)
  })

  it('follows NO_COLOR before it looks at the terminal', () => {
    const held = process.env['NO_COLOR']
    try {
      process.env['NO_COLOR'] = '1'
      expect(commandOf('callers', 'charge')?.color).toBe(false)
      // An empty value is not a setting, per the NO_COLOR convention.
      process.env['NO_COLOR'] = ''
      expect(commandOf('callers', 'charge')?.color).toBe(
        process.stdout.isTTY === true,
      )
    } finally {
      if (held === undefined) delete process.env['NO_COLOR']
      else process.env['NO_COLOR'] = held
    }
  })
})
