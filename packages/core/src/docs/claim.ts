/**
 * ADR 0005's claim syntax: a closed predicate set, parsed from what an author
 * typed into an HTML comment.
 *
 * The set is closed for the reason the edge enum is closed — adding a predicate
 * forces the question "which backend actually produces this?" — and this module
 * is where that question is answered by refusing the ones nothing answers yet.
 * `exports` and `dependsOn` are named here and refused: the index holds no
 * export edges and no package nodes, so a claim using them would be checked
 * against nothing, and a claim silently checked against nothing is worse than no
 * claim at all.
 *
 * `analysedIn` is deliberately absent rather than refused. A document asserting
 * which project globbed a file is asserting something about codedocs, not about
 * the repository, so it is not a predicate and never will be.
 *
 * Parsing only. Nothing here reads the index; `check.ts` does that.
 */

/** The relations a claim may assert between two subjects, and their backends. */
export type RelationPredicate =
  | 'calls'
  | 'reaches'
  | 'references'
  | 'imports'
  | 'extends'
  | 'implements'
  | 'usesType'

/** The counting predicates, which catch the *fourth* implementation being added. */
export type CountPredicate = 'implementations' | 'callers'

/**
 * The predicates ADR 0005 names that no backend produces yet.
 *
 * Kept in the vocabulary rather than treated as unknown, so the message says
 * "not yet" rather than "never" — the difference between a gap in codedocs and
 * a typo in the document, which are fixed by different people.
 */
const UNBACKED: readonly string[] = ['exports', 'dependsOn']

const RELATIONS: readonly RelationPredicate[] = [
  'calls',
  'reaches',
  'references',
  'imports',
  'extends',
  'implements',
  'usesType',
]

const COUNTS: readonly CountPredicate[] = ['implementations', 'callers']

/** One parsed claim. The four forms differ in what they assert, not in syntax. */
export type Claim =
  /** `calls(a, b)`, and its negation `!calls(a, b)`. */
  | {
      readonly form: 'relation'
      readonly predicate: RelationPredicate
      readonly negated: boolean
      readonly from: string
      readonly to: string
    }
  /** `exists(a)`: the subject resolves to exactly one node. */
  | {
      readonly form: 'exists'
      readonly negated: boolean
      readonly subject: string
    }
  /** `hasLabel(node, axis, value)`. */
  | {
      readonly form: 'label'
      readonly negated: boolean
      readonly subject: string
      readonly axis: string
      readonly value: string
    }
  /** `onlyCalledBy(x, dir/)`: nothing outside a directory calls the subject. */
  | {
      readonly form: 'scoped'
      readonly subject: string
      readonly directory: string
    }
  /** `implementations(x) == 3`. */
  | {
      readonly form: 'count'
      readonly predicate: CountPredicate
      readonly subject: string
      readonly expected: number
    }

/** Why a claim could not be parsed. Reported against the document, not as a verdict. */
export type ClaimSyntaxError =
  | { readonly code: 'unparseable' }
  | { readonly code: 'unknown-predicate'; readonly predicate: string }
  | { readonly code: 'no-backend'; readonly predicate: string }
  | {
      readonly code: 'arity'
      readonly predicate: string
      readonly expected: number
      readonly got: number
    }
  | { readonly code: 'count-invalid'; readonly detail: string }

/** A parsed claim, or the reason the text is not one. */
export type ParsedClaim =
  | { readonly ok: true; readonly claim: Claim }
  | { readonly ok: false; readonly error: ClaimSyntaxError }

const fail = (error: ClaimSyntaxError): ParsedClaim => ({ ok: false, error })

/** `predicate(arg, arg)` with an optional leading `!`, and an optional `== n`. */
const CALL = /^(!?)\s*([A-Za-z][A-Za-z0-9]*)\s*\(([^)]*)\)\s*(.*)$/

/**
 * Read one claim expression.
 *
 * Whitespace, newlines included, is insignificant between tokens: ADR 0005's own
 * example wraps a claim across two lines to keep a paragraph readable, so a
 * parser that cared about it would refuse the syntax the ADR documents.
 */
export function parseClaim(raw: string): ParsedClaim {
  const text = raw.replace(/\s+/g, ' ').trim()
  const matched = CALL.exec(text)
  if (matched === null) return fail({ code: 'unparseable' })

  const [, bang, name = '', body = '', tail = ''] = matched
  const negated = bang === '!'
  const args = body
    .split(',')
    .map((arg) => arg.trim())
    .filter((arg) => arg !== '')

  if (UNBACKED.includes(name))
    return fail({ code: 'no-backend', predicate: name })
  if (COUNTS.includes(name as CountPredicate)) {
    return countClaim(name as CountPredicate, args, tail)
  }
  // Every other form takes no tail: `calls(a, b) == 3` asserts nothing, and
  // accepting it would leave the author believing it did.
  if (tail !== '') return fail({ code: 'unparseable' })

  if (name === 'exists') return unary('exists', args, negated)
  if (name === 'onlyCalledBy') return scoped(args, negated)
  if (name === 'hasLabel') return labelClaim(args, negated)
  if (RELATIONS.includes(name as RelationPredicate)) {
    return relation(name as RelationPredicate, args, negated)
  }
  return fail({ code: 'unknown-predicate', predicate: name })
}

/** The arity check every form shares, said once. */
const wrongArity = (
  predicate: string,
  args: readonly string[],
  expected: number,
): ClaimSyntaxError | null =>
  args.length === expected
    ? null
    : { code: 'arity', predicate, expected, got: args.length }

function unary(
  predicate: 'exists',
  args: readonly string[],
  negated: boolean,
): ParsedClaim {
  const wrong = wrongArity(predicate, args, 1)
  if (wrong !== null) return fail(wrong)
  return {
    ok: true,
    claim: { form: 'exists', negated, subject: args[0] ?? '' },
  }
}

function relation(
  predicate: RelationPredicate,
  args: readonly string[],
  negated: boolean,
): ParsedClaim {
  const wrong = wrongArity(predicate, args, 2)
  if (wrong !== null) return fail(wrong)
  return {
    ok: true,
    claim: {
      form: 'relation',
      predicate,
      negated,
      from: args[0] ?? '',
      to: args[1] ?? '',
    },
  }
}

/**
 * `onlyCalledBy(x, dir/)` — encapsulation, which is the assertion architectural
 * documentation actually makes.
 *
 * It is already a negation ("nothing *outside* this directory calls x"), so
 * `!onlyCalledBy` would assert that something outside does, which is a fact
 * about no particular caller and cannot be repaired by reading the answer.
 */
function scoped(args: readonly string[], negated: boolean): ParsedClaim {
  if (negated)
    return fail({ code: 'unknown-predicate', predicate: '!onlyCalledBy' })
  const wrong = wrongArity('onlyCalledBy', args, 2)
  if (wrong !== null) return fail(wrong)
  return {
    ok: true,
    claim: {
      form: 'scoped',
      subject: args[0] ?? '',
      directory: args[1] ?? '',
    },
  }
}

function labelClaim(args: readonly string[], negated: boolean): ParsedClaim {
  const wrong = wrongArity('hasLabel', args, 3)
  if (wrong !== null) return fail(wrong)
  return {
    ok: true,
    claim: {
      form: 'label',
      negated,
      subject: args[0] ?? '',
      axis: args[1] ?? '',
      value: args[2] ?? '',
    },
  }
}

/**
 * `implementations(x) == 3`, and `==` alone.
 *
 * ADR 0005 refused a query language for claims, so the comparator set is one
 * entry rather than six: `>= 1` is `!` of a relation the author can already
 * write, and every unparseable comparison would become a support case.
 */
function countClaim(
  predicate: CountPredicate,
  args: readonly string[],
  tail: string,
): ParsedClaim {
  const wrong = wrongArity(predicate, args, 1)
  if (wrong !== null) return fail(wrong)
  const comparison = /^==\s*(\d+)$/.exec(tail)
  if (comparison === null) {
    return fail({
      code: 'count-invalid',
      detail: `${predicate}(…) takes \`== <n>\`, got \`${tail}\``,
    })
  }
  return {
    ok: true,
    claim: {
      form: 'count',
      predicate,
      subject: args[0] ?? '',
      expected: Number(comparison[1]),
    },
  }
}
