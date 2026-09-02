/**
 * One document's verdict, per section and per document.
 *
 * ADR 0005's four verdicts are **a routing table, not a scoring rule**: each has
 * exactly one producer, and nothing here blends them. Claims decide `verified`
 * and `contradicted`, the derived scope produces `potentially stale`, and
 * ADR 0001's blind spots produce `unable to verify`.
 *
 * The per-section verdict is the whole reason claims live inline. A
 * document-level verdict alone would send a reader to re-read a file whose
 * contradiction is in one paragraph.
 *
 * **A document's scope is derived**, never declared: its claims' files plus the
 * source files its prose links to. A Markdown link to a file that no longer
 * exists is a contradiction with no inference in it — no rename hint, no
 * candidate list, because a path in prose is not a symbol that could have moved
 * under a name codedocs still knows.
 */

import { existsAt } from './discover.ts'
import type { Candidate } from '../continuity/index.ts'
import type { FilePath, Provenance } from '../model.ts'
import { fileOf } from '../symbol-id.ts'
import {
  checkClaim,
  type CheckContext,
  type ClaimFault,
  type ClaimReason,
  type Verdict,
} from './predicate.ts'
import type { ClaimSyntaxError } from './claim.ts'
import {
  coverageOf,
  isRepositoryLink,
  type Coverage,
  type DocumentSection,
  type ParsedDocument,
  type ProseLink,
} from './document.ts'

/** One checked claim, as an answer carries it. */
export interface ClaimReport {
  /** The expression as the author wrote it, which is what they have to repair. */
  readonly text: string
  readonly line: number
  readonly verdict: Verdict
  readonly reason: ClaimReason
  /**
   * The provenance of the fact that decided it, or `null`.
   *
   * ADR 0005: provenance rides on the verdict, it does not multiply it. A claim
   * verified by an `inferred` edge renders as `verified` with that provenance
   * named — four verdicts, not eight.
   */
  readonly provenance: Provenance | null
  readonly resolved: readonly string[]
  /** Where a vanished subject appears to have gone. A hint, never a verdict. */
  readonly candidates: readonly Candidate[]
  /** A count claim's observed number, against the one it asserted. */
  readonly observed: number | null
}

/** One prose link, and whether the file it promises is there. */
export interface LinkReport {
  /** The target as written, which is what a reader has to correct. */
  readonly target: string
  /** The repository-relative path it resolves to. */
  readonly path: FilePath
  readonly line: number
  readonly broken: boolean
}

/** An error in the document itself, which is the author's to fix and not a verdict. */
export interface DocumentFault {
  readonly line: number
  /** The claim as written, so the line and the text agree. */
  readonly text: string
  readonly fault: ClaimSyntaxError | ClaimFault
}

/** One heading-delimited run, with the verdict its own claims reached. */
export interface SectionReport {
  readonly heading: string | null
  readonly line: number
  /** `null` where the section asserts nothing — uncovered, which is not a verdict. */
  readonly verdict: Verdict | null
  readonly claims: readonly ClaimReport[]
  readonly links: readonly LinkReport[]
}

/** ADR 0006's result unit for both `docs` operations. */
export interface DocumentReport {
  readonly path: FilePath
  readonly verdict: Verdict
  /** Reported with every verdict, and never combined with it into a score. */
  readonly coverage: Coverage
  readonly sections: readonly SectionReport[]
  readonly faults: readonly DocumentFault[]
  /** The files this document's claims and links touch, sorted. */
  readonly scope: readonly FilePath[]
}

/**
 * Check one document.
 *
 * @param changed - The files that changed, which is the only producer of
 * `potentially stale`. Empty where nothing changed, which is why a clean tree
 * never reports one.
 */
export function checkDocument(
  context: CheckContext,
  document: ParsedDocument,
  changed: ReadonlySet<FilePath>,
): DocumentReport {
  const faults: DocumentFault[] = []
  const sections = document.sections.map((section) =>
    checkSection(context, document, section, faults),
  )
  const claims = sections.flatMap((section) => section.claims)
  const links = sections.flatMap((section) => section.links)
  const scope = scopeOf(claims, links)

  // `potentially stale` applies only where everything else held: ADR 0005 words
  // it as "every claim still holds, but a file the document touches changed", so
  // it can never mask a contradiction or a blind spot.
  const decided = verdictOf(claims, links)
  const stalled = scope.some((file) => changed.has(file))

  return {
    path: document.path,
    verdict:
      decided === null || decided === 'verified'
        ? stalled
          ? 'potentially-stale'
          : 'verified'
        : decided,
    coverage: coverageOf(document),
    sections: sections.map((section) => stale(section, scope, changed)),
    faults,
    scope,
  }
}

/** One section's claims and links, with the faults collected as they are met. */
function checkSection(
  context: CheckContext,
  document: ParsedDocument,
  section: DocumentSection,
  faults: DocumentFault[],
): SectionReport {
  const claims: ClaimReport[] = []
  for (const site of section.claims) {
    if (!site.parsed.ok) {
      faults.push({
        line: site.line,
        text: site.text,
        fault: site.parsed.error,
      })
      continue
    }
    const checked = checkClaim(context, site.parsed.claim)
    if (!checked.ok) {
      faults.push({ line: site.line, text: site.text, fault: checked.fault })
      continue
    }
    claims.push({
      text: site.text,
      line: site.line,
      verdict: checked.verdict,
      reason: checked.reason,
      provenance: checked.provenance,
      resolved: checked.resolved,
      candidates: checked.candidates,
      observed: checked.observed,
    })
  }

  const links = section.links
    .filter((link) => isRepositoryLink(link.target))
    .map((link) => reportLink(context.root, document.path, link))

  return {
    heading: section.heading,
    line: section.line,
    verdict: verdictOf(claims, links),
    claims,
    links,
  }
}

/**
 * The verdict a set of claims and links reaches, or `null` where they assert
 * nothing.
 *
 * Ordered by which producer is decisive rather than by severity: a falsified
 * claim is a fact about the code, and an unverifiable one is a fact about the
 * analysis, so a document holding both is contradicted and the blind spot is
 * reported beside it rather than instead of it. `potentially stale` is not
 * reachable here — it comes from the derived scope, which is a document-level
 * fact.
 */
function verdictOf(
  claims: readonly ClaimReport[],
  links: readonly LinkReport[],
): Verdict | null {
  if (
    links.some((link) => link.broken) ||
    claims.some((claim) => claim.verdict === 'contradicted')
  ) {
    return 'contradicted'
  }
  if (claims.some((claim) => claim.verdict === 'unable-to-verify')) {
    return 'unable-to-verify'
  }
  return claims.length === 0 && links.length === 0 ? null : 'verified'
}

/** A verified section whose own files changed is potentially stale, and says so. */
function stale(
  section: SectionReport,
  scope: readonly FilePath[],
  changed: ReadonlySet<FilePath>,
): SectionReport {
  if (section.verdict !== 'verified') return section
  const touched = scopeOf(section.claims, section.links)
  const reach = touched.length === 0 ? scope : touched
  return reach.some((file) => changed.has(file))
    ? { ...section, verdict: 'potentially-stale' }
    : section
}

/** The files a set of claims and links touches, sorted and deduplicated. */
function scopeOf(
  claims: readonly ClaimReport[],
  links: readonly LinkReport[],
): FilePath[] {
  const files = new Set<FilePath>()
  for (const claim of claims) {
    for (const id of claim.resolved) files.add(fileOf(id))
  }
  for (const link of links) files.add(link.path)
  return [...files].sort()
}

/** Resolve one link against the document that wrote it, and see whether it is there. */
function reportLink(root: string, from: FilePath, link: ProseLink): LinkReport {
  const path = resolveRelative(from, link.target)
  return {
    target: link.target,
    path,
    line: link.line,
    broken: !existsAt(root, path),
  }
}

/**
 * A link target as a repository path.
 *
 * Markdown links are relative to the file that wrote them, and a document beside
 * the code it describes writes `../src/x.ts` far more often than an absolute
 * path. Resolved with `/` throughout because a repository path always uses it,
 * for the same reason the config's glob matcher is written out.
 */
function resolveRelative(from: FilePath, target: FilePath): FilePath {
  if (target.startsWith('/')) return target.slice(1)
  const segments = from.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') segments.pop()
    else segments.push(part)
  }
  return segments.join('/')
}

/**
 * The files a document touches, read from its text rather than from the index.
 *
 * What `docs affected` intersects the changed set with, before it checks
 * anything: a claim's shorthand carries its own path, so a document's scope is
 * derivable without resolving a single symbol, and a repository of 400 documents
 * is not checked to answer about the two a change touched.
 *
 * A claim whose subject is a bare name contributes nothing here — it names no
 * path — which is a real limit of writing one, and the reason ADR 0005's
 * examples all carry the path.
 */
export function scopeFromText(document: ParsedDocument): FilePath[] {
  const files = new Set<FilePath>()
  for (const section of document.sections) {
    for (const site of section.claims) {
      for (const path of pathsIn(site.text)) files.add(path)
    }
    for (const link of section.links) {
      if (isRepositoryLink(link.target)) {
        files.add(resolveRelative(document.path, link.target))
      }
    }
  }
  return [...files].sort()
}

/**
 * Every repository path a claim expression names.
 *
 * Read off the arguments rather than parsed, because this runs before a claim is
 * known to be well formed: a document whose one claim has a typo still has a
 * scope, and `docs affected` must still find it when the file it names changes.
 */
function pathsIn(text: string): FilePath[] {
  const inside = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'))
  return inside
    .split(',')
    .map((argument) => argument.trim().split('#')[0] ?? '')
    .filter((path) => path.includes('/') || /\.[cm]?[jt]sx?$/.test(path))
}
