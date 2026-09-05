---
status: proposed
---

# A claim can be asked without being written down

ADR 0005 built a claim language, a per-claim evaluator and four [[Verdict]]s, and put exactly one
door in front of them: a [[Claim]] must be inside a [[Document]] before codedocs will evaluate it.
`checkClaim(context, claim)` already takes one claim on its own; nothing but the operation surface
requires that claim to have come from a file.

[#122](https://github.com/magicspon/codedocs/issues/122) proposes `verify '<claim>' ['<claim>' …]` —
the same evaluator, with the claim source moved from a Markdown file to the argument list, writing
nothing.

The question it answers is a developer's before it is an agent's: **is what I just said about this
code actually true?** _"I moved the charge behind the payment service"_ and _"nothing in `checkout`
imports the legacy gateway any more"_ are both propositions the index can settle, and today the only
way to ask is to write a document you did not want.

```sh
codedocs verify 'calls(src/checkout.ts#charge, src/payments.ts#capture)' \
                'not imports(src/checkout.ts, src/legacy/gateway.ts)'
```

## Why this is not `review` coming back

ADR 0012 deleted `review` by splitting PRD §16 and finding an owner for each half: the architecture
and dependency-hygiene halves are `fallow`'s, and what remained was `impact` and `docs affected`
printed next to each other, which is a renderer's job.

`verify` is neither half, because **the proposition comes from the caller**. codedocs is not asked
whether a change is good, whether a dependency direction is right, or whether a pattern was followed.
It is handed a statement and returns a verdict on that statement alone. It cannot produce a finding
nobody asked for, and it cannot rank two of them, so neither the judgement objection nor the
determinism objection that killed `review` and `plan` applies.

The same distinction settles the composition rule: `verify` calls no operation. It reads the index
through the ADR 0005 evaluator, the way `docs check` does.

## Claim coverage cannot be inflated by a claim nobody wrote

[[Claim coverage]] is the measure ADR 0005 built and ADR 0013 defended: it says _this prose is
unchecked_, and a [[Draft]]'s candidate marker exists so a drafted claim cannot count towards it
before a person has endorsed it.

An argv claim is safe by construction, and for a stronger reason than a draft's marker. Coverage is a
property of a document — a ratio over the sections of a file on disk. A claim that is never in a file
has no section to cover and no file to be measured against, so it cannot enter the measure by any
path. Two rules keep it that way:

- **`verify` writes nothing.** It has no `--out`, and it never adds a `codedocs:` marker to any file.
  A caller who wants a claim endorsed writes it into a document themselves, which is the act ADR 0013
  made deliberate.
- **`verify` is not a preview of endorsement.** A passing verdict says the index agrees today. It says
  nothing about whether the claim explains anything, which is the part a person is vouching for.

## Three verdicts, not four

`potentially stale` is derived, in `checkDocument`, from the document's own scope against the changed
files — it is the verdict for "the claims held, but code this document is about has moved". A claim
with no document has no scope to derive it from, so **`verify` reaches `verified`, `contradicted` and
`unable to verify`, and never `potentially stale`.**

That is a fact about the fourth verdict's definition, not a gap to fill later by inventing a scope for
an argv claim. The other three keep their ADR 0005 meanings exactly, including the rule that a vanished
symbol with a plausible relocation is reported as such rather than as a contradiction, and including
`unable to verify` staying a distinct outcome rather than collapsing into a failure.

## The envelope, per claim

Each claim is its own answer, so the result is keyed per claim in the order given — ADR 0014's
per-subject keying applied to the same shape of multiplicity, with each entry carrying its own
`resolved` subjects, `blindSpots` and `excluded` count for the identical reason: a pooled account
would make one claim's answer depend on another's, and on the order they were typed.

Exit code `1` on any `contradicted` verdict, matching `docs check` exactly, so the two are
interchangeable in CI. `--fail-on` applies the same way. A claim that does not parse is exit `2` with
an error code and typed parameters, never a formatted sentence — the syntax error is a failure to ask
the question, not a negative answer to it.

## Considered Options

- **`check '<claim>'` at the top level.** Rejected on the name alone: `docs check` exists, the two
  would differ only by a preceding word, and the one that takes an argument is the one people would
  reach for by accident.
- **`assert`.** Rejected: it names a test-runner contract — abort on the first false thing — which is
  the opposite of the honesty rules. All claims are evaluated, and `unable to verify` is a result, not
  an assertion failure.
- **`docs check --claim '<expr>'`.** Rejected: it attaches an operation whose result unit is a
  document to an input that has no document, and every document-shaped field on the answer would have
  to be nulled.
- **Leaving it to the caller.** Not available: the predicate parser and evaluator are internal, so
  there is no way to ask this today short of writing a throwaway Markdown file, checking it and
  deleting it — which is a worse version of this operation with a side effect on the working tree.
- **Letting `verify` endorse a claim into a document on success** (`--endorse`). Rejected: it is
  exactly the unattended write ADR 0005 refused and ADR 0013 only reopened under a marker, and it
  would make a green verdict enough to put an unreviewed sentence in a committed file.

## Consequences

- **The claim syntax becomes a user-facing input outside Markdown**, so its parse errors need error
  codes and typed parameters under ADR 0006's rule, where today a malformed claim is a
  [[Document]] fault reported against a file and a line.
- **`evidence --claims` gains the loop it was half of.** ADR 0006 trimmed candidate claims to an
  opt-in because "the claim string is pure restatement of a fact already in the payload". With
  `verify`, that restatement is an input: the strings `evidence` emits can be fed back later to ask
  whether the fact still holds.
- **MCP gains one tool**, because `verify` is an [[Operation]] — the rule that forbids a tool which is
  not an operation is untouched.
- **`CONTEXT.md`'s [[Claim]] entry needs widening** if this is accepted: a claim is currently defined
  as living in a document.
- **This is the first operation whose subject is a proposition rather than a symbol**, so the
  `request` block carries the claim expressions as given, verbatim, alongside what each resolved to.
