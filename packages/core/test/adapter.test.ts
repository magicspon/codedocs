/**
 * What the adapter must get right, on a fixture small enough to reason about.
 *
 * Each case here is one of the boundary normalisations ADR 0002 names as the
 * leaks that actually cost: a barrel, a renamed re-export, a JSX invocation, a
 * call to a local binding, and a call with no enclosing declaration.
 */

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { analyse } from '../src/adapter/ts7/index.ts'
import type { CallEdge } from '../src/model.ts'

const fixture = (name: string): string =>
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', name)

const root = fixture('basic')
const result = analyse(root, ['tsconfig.json'])

const edge = (from: string, to: string): CallEdge | undefined =>
  result.callEdges.find(
    (candidate) => candidate.from === from && candidate.to === to,
  )

describe('the symbol sweep', () => {
  it('indexes every named declaration, including class members', () => {
    const ids = new Set(result.symbols.map((symbol) => symbol.id))
    expect(ids).toContain('src/payments.ts#Gateway')
    expect(ids).toContain('src/payments.ts#StripeGateway')
    expect(ids).toContain('src/payments.ts#StripeGateway.capture')
    expect(ids).toContain('src/payments.ts#charge')
  })

  it('indexes local bindings, and marks them not durable', () => {
    const local = result.symbols.find(
      (symbol) => symbol.id === 'src/checkout.ts#settle.run',
    )
    expect(local).toBeDefined()
    expect(local?.durable).toBe(false)
    // A top-level declaration in the same file is durable, so `durable` is
    // tracking scope rather than merely being false everywhere.
    expect(
      result.symbols.find((s) => s.id === 'src/checkout.ts#settle')?.durable,
    ).toBe(true)
  })

  it('records a line, so an answer can be shown to someone', () => {
    expect(
      result.symbols.find((s) => s.id === 'src/payments.ts#charge')?.line,
    ).toBe(11)
  })
})

describe('the call-site sweep', () => {
  it('resolves a call through a barrel re-export', () => {
    expect(
      edge('src/checkout.ts#checkout', 'src/payments.ts#charge'),
    ).toBeDefined()
  })

  it('resolves a method call on a constructed class', () => {
    expect(
      edge('src/payments.ts#charge', 'src/payments.ts#StripeGateway.capture'),
    ).toBeDefined()
  })

  it('treats a construction as an invocation of the class', () => {
    expect(
      edge('src/payments.ts#charge', 'src/payments.ts#StripeGateway'),
    ).toBeDefined()
  })

  it('resolves a call to a local binding, which per-symbol queries cannot find', () => {
    expect(
      edge('src/checkout.ts#settle', 'src/checkout.ts#settle.run'),
    ).toBeDefined()
  })

  it('credits a call with no enclosing function to the variable it initialises', () => {
    const found = edge('src/checkout.ts#bootTotal', 'src/checkout.ts#checkout')
    expect(found?.attribution).toBe('variable')
  })

  it('treats a JSX element as an invocation, and says the rule was its own', () => {
    const found = edge('src/component.tsx#Panel', 'src/component.tsx#Badge')
    expect(found?.provenance).toBe('syntactic')
    expect(found?.derivation).toBe('jsx-element-rule')
  })

  it('marks a checker-resolved call deterministic', () => {
    expect(
      edge('src/checkout.ts#checkout', 'src/payments.ts#charge')?.provenance,
    ).toBe('deterministic')
  })

  it('emits each edge once, rather than once per project the file belongs to', () => {
    const keys = result.callEdges.map(
      (e) => `${e.from}->${e.to}@${e.file}:${e.line}`,
    )
    expect(keys.length).toBe(new Set(keys).size)
  })
})

describe('caller attribution', () => {
  it('credits a call to the function around it, not to the const it initialises', () => {
    // `const run = billCustomer` inside `settle` must not become the caller of
    // the call on the next line, or asking for a function's callees returns
    // nothing.
    const found = edge('src/checkout.ts#settle', 'src/checkout.ts#settle.run')
    expect(found?.attribution).toBe('symbol')
    expect(
      edge('src/checkout.ts#settle.run', 'src/payments.ts#charge'),
    ).toBeUndefined()
  })

  it('never credits a call to a local when a callable encloses it', () => {
    const locals = result.callEdges.filter((e) => e.from.includes('#settle.'))
    expect(locals).toHaveLength(0)
  })
})

describe('the import sweep', () => {
  /**
   * Five syntactic forms name a module, and the wave propagates along all of
   * them. The fixture points each form at a module of its own, so a missing form
   * is a missing edge with a name rather than one absence among five.
   */
  const specifiers = analyse(fixture('specifiers'), ['tsconfig.json'])
  const to = (specifier: string): string | null | undefined =>
    specifiers.importEdges.find(
      (edge) => edge.from === 'src/forms.ts' && edge.specifier === specifier,
    )?.to

  it('follows a static import and a re-export', () => {
    expect(to('./statically')).toBe('src/statically.ts')
    expect(to('./reexported')).toBe('src/reexported.ts')
  })

  it('follows a dynamic import', () => {
    expect(to('./lazily')).toBe('src/lazily.ts')
  })

  it('follows an import-equals-require', () => {
    expect(to('./required')).toBe('src/required.ts')
  })

  it('follows a specifier in a type position', () => {
    expect(to('./typed')).toBe('src/typed.ts')
  })

  it('records a dynamic specifier that resolves to nothing', () => {
    // The row the wave needs: the file that would complete this import may
    // appear later, and nothing about `forms.ts` itself would say so.
    expect(to('./not-here')).toBeNull()
  })

  it('records nothing for a specifier that is not a literal', () => {
    // `import(where)` names no file anyone can know statically. The call sweep
    // records the site with cause `dynamic`; there is no edge to invent here.
    expect(
      specifiers.importEdges.filter((edge) => edge.from === 'src/forms.ts'),
    ).toHaveLength(6)
  })
})
