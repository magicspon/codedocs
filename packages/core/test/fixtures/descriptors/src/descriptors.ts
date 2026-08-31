/**
 * Every shape the descriptor path has to tell apart, and the two it cannot.
 *
 * Each declaration here exists to claim an id. What separates the claims is
 * always something the author wrote — a name, an object-literal key, a test
 * name — because ADR 0002 rejected the ordinal that would separate the rest.
 */

/** Stand-ins for a test runner, so the fixture needs no dependency. */
declare function describe(name: string, body: () => void): void
declare function it(name: string, body: () => void): void

// Sibling callbacks, told apart by the name their call was given.
describe('parsing', () => {
  it('accepts a known field', () => {
    const schema = 'known'
    return schema
  })

  it('rejects an unknown field', () => {
    const schema = 'unknown'
    return schema
  })
})

/** Sibling arrow functions, told apart by the key each was written under. */
export const pageObject = {
  queryDelete: (id: string) => {
    const field = `delete:${id}`
    return field
  },
  queryToggle: (id: string) => {
    const field = `toggle:${id}`
    return field
  },
}

/**
 * A constructor local beside a property of the same name. The constructor
 * declares no name of its own, so without a segment for it these two claim one
 * id — and one of them is durable, which is the only way this defect reached an
 * id something may anchor to.
 */
export class Calendar {
  private url = ''

  constructor(base: string) {
    const url = `${base}/calendar`
    this.url = url
  }

  read(): string {
    return this.url
  }
}

/**
 * Two catch clauses, each declaring `err`. A sibling block carries no name, so
 * both claim one id — the collision the descriptor path cannot resolve, and
 * which is therefore reported.
 */
export function retry(step: () => void): string {
  try {
    step()
  } catch (err) {
    const report = (): string => `first:${String(err)}`
    return report()
  }
  try {
    step()
  } catch (err) {
    const report = (): string => `second:${String(err)}`
    return report()
  }
  return 'ok'
}

/**
 * A call with no string literal names no scope. Returned directly, so no
 * enclosing variable names them either, these two `row`s collide as well.
 */
export function totals(rows: readonly number[]): number[] {
  if (rows.length > 0) {
    return rows.map((n) => {
      const row = n * 2
      return row
    })
  }
  return rows.map((n) => {
    const row = n / 2
    return row
  })
}

/** Overloads are one symbol. ADR 0002 collapses them, and that is not a collision. */
export function parse(input: string): string
export function parse(input: number): string
export function parse(input: string | number): string {
  return String(input)
}

/** A local type beside a local const is declaration merging, not a collision. */
export function merge(): string {
  type Attendee = { readonly id: string }
  const Attendee: Attendee = { id: 'a' }
  return Attendee.id
}
