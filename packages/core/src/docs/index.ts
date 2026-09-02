/**
 * The document layer: ADR 0005's claims, their four verdicts, and coverage.
 *
 * Split by concern: `claim.ts` is the closed predicate set and its parser,
 * `document.ts` reads one Markdown file into sections and links, `discover.ts`
 * is the repository-wide marker scan, `predicate.ts` checks one claim against
 * the index, and `check.ts` turns a document's claims into verdicts.
 *
 * This file is the module's only public surface.
 */

export {
  type ClaimSite,
  type Coverage,
  type DocumentSection,
  type ParsedDocument,
  type ProseLink,
} from './document.ts'
export {
  parseClaim,
  type Claim,
  type ClaimSyntaxError,
  type CountPredicate,
  type ParsedClaim,
  type RelationPredicate,
} from './claim.ts'
export { discoverDocuments, type DocumentScan } from './discover.ts'
export {
  checkDocument,
  scopeFromText,
  type ClaimReport,
  type DocumentFault,
  type DocumentReport,
  type LinkReport,
  type SectionReport,
} from './check.ts'
export {
  type CheckContext,
  type ClaimFault,
  type ClaimReason,
  type Verdict,
} from './predicate.ts'
