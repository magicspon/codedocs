/**
 * Reading one Markdown file: its sections, the claims in them, and the files its
 * prose links to.
 *
 * Three rules from ADR 0005 shape it.
 *
 * **A claim sits immediately after the prose it justifies**, so its position is
 * what lets a verdict name a contradicted *section* rather than a contradicted
 * file. Sections are heading-delimited because cal.com's Markdown averages a
 * heading every 18 lines — 1,758 across 381 files — so the section is a real
 * unit rather than an invented one.
 *
 * **A document's scope is derived**, never declared: its claims' files plus the
 * source files its prose links to.
 *
 * **Fenced code is not content.** ADR 0005's own text carries a claim inside a
 * ```` ```markdown ```` fence as its worked example, and a scan that read it
 * would make the decision document a document making a claim about a repository
 * that does not exist. The same rule keeps a heading inside a fence out of the
 * coverage denominator.
 */

import type { FilePath } from '../model.ts'
import { parseClaim, type ParsedClaim } from './claim.ts'

/** The marker a file opts in with. Writing one is how a file becomes a document. */
export const MARKER = '<!-- codedocs:'

/** One claim as it appears in a document. */
export interface ClaimSite {
  /** The expression as written, whitespace collapsed onto one line. */
  readonly text: string
  /** 1-based line of the marker that carries it. */
  readonly line: number
  readonly parsed: ParsedClaim
}

/** One heading-delimited run of a document, which is what coverage counts. */
export interface DocumentSection {
  /** The heading text, or `null` for the run before the first heading. */
  readonly heading: string | null
  /** 1-based line of the heading, or `1` for the preamble. */
  readonly line: number
  readonly claims: readonly ClaimSite[]
  /**
   * The links written in this section, which are half the derived scope.
   *
   * Held per section rather than per document so a broken one lands in the
   * section whose prose made the promise, exactly as a contradicted claim does.
   */
  readonly links: readonly ProseLink[]
}

/** One Markdown link out of the prose, which is half the derived scope. */
export interface ProseLink {
  /** The target as written, with any `#anchor` and query removed. */
  readonly target: string
  readonly line: number
}

/** One Markdown file, read. */
export interface ParsedDocument {
  readonly path: FilePath
  readonly sections: readonly DocumentSection[]
  readonly links: readonly ProseLink[]
}

const HEADING = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
/** `[text](target)`, with the target stopping at whitespace or a title. */
const LINK = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g

/**
 * Read one Markdown file into sections, claims and links.
 *
 * @param text - The file's contents. Read by the caller, so the discovery scan
 * can test for the marker without this module opening anything.
 */
export function parseDocument(path: FilePath, text: string): ParsedDocument {
  const lines = text.split('\n')
  const sections: DocumentSection[] = []
  const links: ProseLink[] = []
  let run = opening()
  let fence: string | null = null

  // Named field by field rather than spread: `written` is bookkeeping, and a
  // spread would put it in the envelope every `docs check` prints.
  const close = (): void => {
    if (run.heading !== null || run.written) {
      sections.push({
        heading: run.heading,
        line: run.line,
        claims: run.claims,
        links: run.links,
      })
    }
  }

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] ?? ''

    const nested = fenceAfter(line, fence)
    if (nested !== undefined) {
      fence = nested
      run.written = true
      continue
    }
    if (fence !== null) {
      run.written = true
      continue
    }

    // Tested before the run is marked as written, or a heading would count as
    // content of the section it closes rather than of the one it opens.
    const headed = HEADING.exec(line)
    if (headed !== null) {
      close()
      run = opening(headed[1] ?? '', at + 1)
      continue
    }
    at = readProse(lines, at, run, links)
  }
  close()

  return { path, sections, links }
}

/**
 * Read one line of prose into the run it belongs to.
 *
 * @returns The line the reader has reached — past the expression where a claim
 * wrapped across several, so the loop does not read its continuation as prose.
 */
function readProse(
  lines: readonly string[],
  at: number,
  run: Run,
  links: ProseLink[],
): number {
  const line = lines[at] ?? ''
  if (line.trim() !== '') run.written = true

  for (const link of linksIn(line, at)) {
    links.push(link)
    run.links.push(link)
  }

  const claim = line.includes(MARKER) ? claimAt(lines, at) : null
  if (claim === null) return at
  run.claims.push(claim.site)
  return claim.endedAt
}

/** One section while it is still being read, before its end is known. */
interface Run {
  heading: string | null
  line: number
  claims: ClaimSite[]
  links: ProseLink[]
  /**
   * Whether the run holds anything at all.
   *
   * A document opening with `# Title` has an empty preamble, and counting it
   * would put a section nobody wrote into the coverage denominator.
   */
  written: boolean
}

/**
 * A section to read into.
 *
 * Defaulted to the preamble, which is a section of its own: prose before the
 * first heading is where a README says what the file is, and leaving it out of
 * the denominator would quietly inflate coverage.
 */
const opening = (heading: string | null = null, line = 1): Run => ({
  heading,
  line,
  claims: [],
  links: [],
  written: false,
})

/**
 * The fence state after one line, or `undefined` where the line is not a fence.
 *
 * `undefined` rather than the unchanged state, so the caller can tell "this line
 * was a fence marker" from "this line was inside one" — they differ in nothing
 * else, and both count as written.
 */
function fenceAfter(
  line: string,
  open: string | null,
): string | null | undefined {
  const found = FENCE.exec(line)
  if (found === null) return undefined
  const ticks = found[1] ?? ''
  if (open === null) return ticks
  // A fence closes only with the same character, and at least as long.
  return ticks[0] === open[0] && ticks.length >= open.length ? null : open
}

/** Every link one line of prose carries, in the order they appear. */
function linksIn(line: string, at: number): ProseLink[] {
  const found: ProseLink[] = []
  for (const match of line.matchAll(LINK)) {
    const target = match[1] ?? ''
    if (target !== '') found.push({ target: bare(target), line: at + 1 })
  }
  return found
}

/** The claim a marker on this line opens, and the line its expression ended on. */
function claimAt(
  lines: readonly string[],
  at: number,
): { site: ClaimSite; endedAt: number } | null {
  const read = marker(lines, at)
  if (read === null) return null
  return {
    site: { text: read.text, line: at + 1, parsed: parseClaim(read.text) },
    endedAt: read.endedAt,
  }
}

/**
 * One marker's expression, which may wrap across lines.
 *
 * ADR 0005's example wraps a claim to keep the paragraph readable, so the reader
 * runs to the closing `-->` rather than to the end of the line. An unterminated
 * marker is not a claim — there is nothing to parse and no line to blame beyond
 * the one it opened on.
 */
function marker(
  lines: readonly string[],
  from: number,
): { text: string; endedAt: number } | null {
  const opened = lines[from] ?? ''
  const start = opened.indexOf(MARKER) + MARKER.length
  let body = opened.slice(start)
  let at = from
  while (!body.includes('-->')) {
    at += 1
    if (at >= lines.length) return null
    body += ` ${lines[at] ?? ''}`
  }
  return {
    text: body.slice(0, body.indexOf('-->')).replace(/\s+/g, ' ').trim(),
    endedAt: at,
  }
}

/** A link target without its anchor or query, which is the path half. */
const bare = (target: string): string =>
  target.split('#')[0]?.split('?')[0] ?? ''

/** Whether a link points at something in this repository rather than out of it. */
export function isRepositoryLink(target: string): boolean {
  if (target === '') return false
  // A scheme, a protocol-relative URL or a bare `mailto:` is somebody else's to
  // keep working; codedocs reports on this repository alone.
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)
}

/**
 * How many of a document's sections carry a claim at all.
 *
 * Reported with every verdict and never combined with it: without this,
 * `verified` silently means "the checkable part is true", which is exactly the
 * completeness failure ADR 0001 exists to prevent. It counts sections and says
 * nothing about whether the prose in them is right.
 */
export interface Coverage {
  readonly covered: number
  readonly sections: number
}

export const coverageOf = (document: ParsedDocument): Coverage => ({
  covered: document.sections.filter((one) => one.claims.length > 0).length,
  sections: document.sections.length,
})
