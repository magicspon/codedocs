/**
 * A draft's facts, as the Markdown that gets committed.
 *
 * Kept in `core` rather than in a binding because ADR 0013's draft *is* the
 * bytes: the CLI writes them, the MCP binding returns them, and a draft taken
 * twice at one commit must be the same file both times. A renderer in each
 * binding would be two files that look alike until they do not.
 *
 * Two rules shape every line here. **No prose**: settled constraint 2 stands, so
 * this writes facts, headings and markers, and asks the questions it cannot
 * answer rather than answering them. **No timestamp**: ADR 0006's second
 * renderer rule promises byte-identical output at one commit, and a drafted-at
 * line would break it on every run for no reader's benefit.
 */

/** One labelled run of facts, as a bullet in a section. */
export interface DraftFactGroup {
  /** What the run is, e.g. `Calls`. */
  readonly label: string
  /** Each fact, already rendered. Empty groups are dropped, never printed as none. */
  readonly items: readonly string[]
}

/** One section's facts, before they are Markdown. */
export interface DraftBody {
  /** The heading, which is the subject as a reader would name it. */
  readonly heading: string
  /** ADR 0005's shorthand for a symbol, or the path for a file. */
  readonly subject: string
  /** What it is and where, in one sentence of fact. */
  readonly lead: string
  /**
   * Why the facts below may be incomplete, or `null`.
   *
   * Written into the file rather than left to the envelope, because a committed
   * document outlives the terminal that produced it and the envelope is not what
   * gets committed.
   */
  readonly caution: string | null
  readonly facts: readonly DraftFactGroup[]
  /** Claim expressions, without their marker. */
  readonly candidates: readonly string[]
}

/** What the draft says about itself, above its first section. */
export interface DraftHeader {
  /** The subject as the caller typed it. */
  readonly subject: string
  readonly commit: string | null
  readonly dirty: boolean
  /** Sections written, and sections there were, which `--limit` may separate. */
  readonly written: number
  readonly available: number
}

/** One blind spot, as the footer names it. */
export interface DraftBlindSpot {
  readonly subject: string
  readonly reason: string
}

/** The marker a candidate claim carries, which `docs check` does not read. */
export const CANDIDATE_MARKER = '<!-- codedocs?:'

/**
 * Render one draft.
 *
 * @param blindSpots - Named in a footer for the same reason `caution` is named
 * in a section: the answer's honesty fields do not survive the file being
 * committed unless they are in the file.
 */
export function markdownFor(
  header: DraftHeader,
  bodies: readonly DraftBody[],
  blindSpots: readonly DraftBlindSpot[],
): string {
  return [
    `# ${header.subject}`,
    '',
    ...preamble(header),
    ...bodies.flatMap((body) => [...section(body), '']),
    ...footer(blindSpots),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s*$/, '\n')
}

/**
 * The comment that says where the file came from and what to do with it.
 *
 * It explains the `?` because that is the one thing a reader cannot work out
 * from the file: a candidate looks exactly like a claim, and the difference is
 * the whole of ADR 0013.
 */
function preamble(header: DraftHeader): string[] {
  const at =
    header.commit === null
      ? 'a working tree that is not a repository'
      : `commit ${header.commit}${header.dirty ? ', with uncommitted changes on top' : ''}`
  const counted =
    header.available === 0
      ? 'nothing in the index matched it'
      : header.written === header.available
        ? `${header.available} ${header.available === 1 ? 'section' : 'sections'}`
        : `${header.written} of ${header.available} sections — pass --limit for the rest`
  return [
    '<!--',
    `Drafted by codedocs from \`${escaped(header.subject)}\` at ${at}: ${counted}.`,
    '',
    'codedocs wrote no prose. Everything below is a fact read from the index, and',
    'the paragraphs are yours. Each `codedocs?:` comment is a *candidate* claim:',
    'delete the `?` to endorse it, and `docs check` verifies it from then on.',
    'Until you endorse one, this file is not a document and nothing checks it.',
    '-->',
    '',
  ]
}

/** One section: the question codedocs cannot answer, its facts, its candidates. */
function section(body: DraftBody): string[] {
  return [
    `## ${body.heading}`,
    '',
    `_${question(body)}_`,
    '',
    ...(body.caution === null ? [] : [`> ${body.caution}`, '']),
    body.lead,
    '',
    ...body.facts.flatMap(group),
    '',
    ...body.candidates.map((claim) => `${CANDIDATE_MARKER} ${claim} -->`),
  ]
}

/**
 * One run of facts, one fact per line.
 *
 * A nested list rather than a comma-separated run: a drafted file is committed
 * and then diffed, and a symbol gaining one caller should be one line added
 * rather than a wrapped paragraph rewritten.
 */
const group = (facts: DraftFactGroup): string[] => [
  `- **${facts.label}**`,
  ...facts.items.map((item) => `  - ${item}`),
]

/**
 * The prompt a section opens with.
 *
 * Phrased as a question rather than as `TODO`, because what is missing is not a
 * task codedocs left half-done — it is the half codedocs is constitutionally
 * unable to do, and the question is the most useful thing it can leave in its
 * place.
 */
const question = (body: DraftBody): string =>
  `What is \`${body.heading}\` for, and why does it exist? ` +
  'codedocs does not know, and will not guess.'

/** The blind spots, or nothing at all where the answer was complete. */
function footer(blindSpots: readonly DraftBlindSpot[]): string[] {
  if (blindSpots.length === 0) return []
  return [
    '---',
    '',
    'codedocs could not see these while drafting, and any of them could have',
    'changed the facts above:',
    '',
    ...blindSpots.map((spot) => `- \`${spot.subject}\` — ${spot.reason}`),
  ]
}

/**
 * Text going inside an HTML comment, with the one sequence that would end it
 * early defused.
 *
 * The subject is whatever the caller typed, so it is the one string in a draft
 * that codedocs did not choose.
 */
const escaped = (text: string): string => text.replaceAll('-->', '--&gt;')
