/**
 * Reading one Markdown file, without a repository around it.
 *
 * `docs.test.ts` plants a fixture because a verdict needs an index; the reader
 * needs nothing but the text. The rules ADR 0005 gives it are all about text —
 * a fence is not content, a heading opens a section, a claim may wrap across
 * lines, a link may point out of the repository — so this is where they belong.
 */

import { describe, expect, it } from 'vitest'

import {
  coverageOf,
  isRepositoryLink,
  parseDocument,
} from '../src/docs/document.ts'

/** Parse a document written as lines, which is how the tests read best. */
const parse = (...lines: string[]) =>
  parseDocument('docs/one.md', lines.join('\n'))

describe('sections', () => {
  it('opens one per heading, and treats the run before the first as its own', () => {
    const document = parse(
      'Prose before any heading.',
      '',
      '# First',
      '',
      'More prose.',
      '',
      '## Second',
      '',
      'Yet more.',
    )
    expect(document.sections.map((one) => one.heading)).toEqual([
      null,
      'First',
      'Second',
    ])
    // The preamble is line 1; a heading's section starts at the heading.
    expect(document.sections.map((one) => one.line)).toEqual([1, 3, 7])
  })

  it('drops an empty run before the first heading rather than counting it', () => {
    // Nothing was written, so there is no section — which is what stops the
    // coverage denominator being quietly inflated by a blank first line.
    const document = parse('', '# Only', '', 'Prose.')
    expect(document.sections.map((one) => one.heading)).toEqual(['Only'])
  })

  it('reads a heading with trailing hashes as the text between them', () => {
    expect(parse('## Closed ##', 'Prose.').sections[0]?.heading).toBe('Closed')
  })

  it('counts the sections that carry a claim, and says nothing about the prose', () => {
    const document = parse(
      '# One',
      '',
      '<!-- codedocs: exists(src/a.ts#a) -->',
      '',
      '# Two',
      '',
      'Prose only.',
    )
    expect(coverageOf(document)).toEqual({ covered: 1, sections: 2 })
  })
})

describe('fenced code', () => {
  it('is not content: a claim inside a fence is an example, not an assertion', () => {
    // ADR 0005's own text carries one, and a reader that took it would make the
    // decision document a document.
    const document = parse(
      '# Fenced',
      '',
      '```markdown',
      '<!-- codedocs: calls(src/a.ts#a, src/b.ts#b) -->',
      '## Not a heading',
      '```',
    )
    expect(document.sections.map((one) => one.heading)).toEqual(['Fenced'])
    expect(document.sections[0]?.claims).toEqual([])
  })

  it('closes only on the same character, at least as long', () => {
    const document = parse(
      '# Fenced',
      '````',
      '```',
      '<!-- codedocs: exists(src/a.ts#a) -->',
      '````',
      '<!-- codedocs: exists(src/b.ts#b) -->',
    )
    // The inner ``` neither closed the outer ```` nor opened a second fence, so
    // only the claim after the real close is read.
    expect(document.sections[0]?.claims.map((one) => one.text)).toEqual([
      'exists(src/b.ts#b)',
    ])
  })

  it('does not let a tilde fence close a backtick one', () => {
    const document = parse(
      '# Fenced',
      '```',
      '~~~',
      '<!-- codedocs: exists(src/a.ts#a) -->',
      '```',
      '<!-- codedocs: exists(src/b.ts#b) -->',
    )
    expect(document.sections[0]?.claims.map((one) => one.text)).toEqual([
      'exists(src/b.ts#b)',
    ])
  })
})

describe('claims', () => {
  it('reads one that wraps across several lines as one expression', () => {
    // ADR 0005's own example wraps a claim to keep a paragraph readable.
    const document = parse(
      '# Wrapped',
      '<!-- codedocs: reaches(src/checkout.ts#checkout,',
      '                      src/payments.ts#audit) -->',
      'Prose after it.',
    )
    const claim = document.sections[0]?.claims[0]
    expect(claim?.text).toBe(
      'reaches(src/checkout.ts#checkout, src/payments.ts#audit)',
    )
    expect(claim?.line).toBe(2)
    // The continuation was consumed, not read again as prose.
    expect(document.sections[0]?.claims).toHaveLength(1)
  })

  it('ignores a marker that never closes, rather than swallowing the file', () => {
    const document = parse(
      '# Unclosed',
      '<!-- codedocs: exists(src/a.ts#a)',
      'and the file simply ends',
    )
    expect(document.sections[0]?.claims).toEqual([])
  })

  it('keeps a claim it cannot parse, so the fault can be reported against it', () => {
    const claim = parse('# Bad', '<!-- codedocs: not a claim -->').sections[0]
      ?.claims[0]
    expect(claim?.text).toBe('not a claim')
    expect(claim?.parsed.ok).toBe(false)
  })
})

describe('prose links', () => {
  it('reads a target without its anchor or query, which is the path half', () => {
    const document = parse('# Links', 'See [it](../src/a.ts#L4?raw=1).')
    expect(document.links.map((one) => one.target)).toEqual(['../src/a.ts'])
    expect(document.sections[0]?.links[0]?.line).toBe(2)
  })

  it('reads several links on one line, and skips one with no target', () => {
    const document = parse(
      '# Links',
      'See [a](./a.md) and [b](./b.md) and [c]().',
    )
    expect(document.links.map((one) => one.target)).toEqual([
      './a.md',
      './b.md',
    ])
  })
})

describe('isRepositoryLink', () => {
  it('is true for a path in this repository', () => {
    expect(isRepositoryLink('../src/a.ts')).toBe(true)
    expect(isRepositoryLink('docs/other.md')).toBe(true)
  })

  it('is false for anything somebody else keeps working', () => {
    expect(isRepositoryLink('https://example.test/x')).toBe(false)
    expect(isRepositoryLink('//example.test/x')).toBe(false)
    expect(isRepositoryLink('mailto:someone@example.test')).toBe(false)
    expect(isRepositoryLink('')).toBe(false)
  })
})
