---
status: accepted
---

# A draft is not a document until a person endorses a claim

`docs draft <subject>` writes a Markdown file prefilled with everything the index holds about one
symbol or one file: the facts as readable prose material, and every [[Claim]] those facts would
support, as **candidates**. It writes no sentences, and it writes no claim either — a candidate
carries the marker `<!-- codedocs?: … -->`, which [`docs check`](0005-document-claims-and-verdicts.md)
does not read. A drafted file is therefore not a [[Document]] at all until a person deletes a `?`.

This **reverses** [ADR 0006](0006-operation-set-and-renderer-contract.md), which deleted
`docs generate` twice over — once as "`evidence` plus a file write ADR 0005 forbids", and once as a
skeleton that "inverts the coverage measure". Both objections were right about the design in front of
them. Neither survives the endorsement marker, and the reversal is recorded here rather than made
quietly, because the second objection is the one that kept [[Claim coverage]] meaningful and it is
the one this decision has to answer in full.

## What the two objections were, and what answers them

**"It is codedocs writing a document."** ADR 0005 refused codedocs writing to documents, and the two
examples it gave say what it was refusing: a verification timestamp, which is "a committed lie the
moment anyone edits the code", and a claim repaired after a rename, which "writes an `inferred` fact
into a committed file". Both are **unattended writes into a file someone else already owns**. A draft
is neither. It is asked for by name, it lands at a path derived from the subject, and it **refuses to
write over an existing file** — there is no flag to make it. codedocs still never edits a document;
`report-bug`, which writes `./codedocs-report.json` unless told otherwise, is the existing precedent
for an operation that writes the one file it was asked for and nothing else.

**"It inverts the coverage measure."** This is the real one. Coverage exists to say _this prose is
unchecked_; a skeleton whose every section carries a claim and no prose reports `14 of 14 sections
covered` while nothing has been written, which is the exact overstatement ADR 0005 built coverage to
prevent. The answer is that a drafted claim is not a claim:

```markdown
<!-- codedocs?: calls(src/checkout/service.ts#CheckoutService.charge,
                      src/payments/service.ts#PaymentService.capture) -->
```

`docs check` discovers documents by scanning for `<!-- codedocs:`, and `<!-- codedocs?:` does not
match it. So a freshly drafted file has coverage of **nothing**, because it is not a document. Each
`?` a person deletes is one assertion they have read the prose for and are prepared to commit to, and
coverage counts exactly those. The measure is not inverted; it is moved to where the judgement is.

The marker is a question mark for the reason the claim marker is an HTML comment: it is invisible in
every preview, plain text in a diff, one character to remove, and impossible to remove by accident.

## Where a draft lands

**Beside the code it is about**, in a `docs/` folder next to the file the subject is declared in:

| Subject                                          | Draft                                                 |
| ------------------------------------------------ | ----------------------------------------------------- |
| `src/checkout/service.ts#CheckoutService.charge` | `src/checkout/docs/service.CheckoutService.charge.md` |
| `src/checkout/service.ts`                        | `src/checkout/docs/service.md`                        |

`--out <path>` overrides it, and `--out -` writes to stdout and no file.

The default is a path rather than stdout because **a draft is a file about to be edited**, and the
edit happens in an editor, not in a pipe. A default of stdout makes the first thing every caller
does a shell redirect — the one write codedocs cannot refuse, over a file it cannot see, which is
the loss this ADR built the overwrite refusal to prevent. Making the write the default moves that
gesture inside the refusal.

**The folder, not the source directory.** A `docs/` sibling keeps prose out of a directory listing
of code while staying one hop from it, so a draft is found by looking where the code is rather than
by remembering a convention at the repository root. It is created if it is not there; creating a
folder is not editing anybody's file.

**The name carries both parts** — the file stem, then the dotted descriptor path — because a
directory of drafts is read as a list, and `charge.md` beside `capture.md` says nothing about which
file either is about. It also makes collision structural rather than lucky: two symbols of one file
differ in the second part, and the same symbol name in two files differs in the first.

An ambiguous subject still drafts **one** file, named after the first match, because it produces one
Markdown answer. The note beside it reports the ambiguity, as everywhere else.

Only the derived path is repository-relative. An `--out` resolves against the directory the user is
standing in: `--cwd` names the repository to draft _about_, and a path somebody typed belongs where
they typed it.

## What a draft contains

One **section** per subject — the result unit, and what `--limit` counts.

| For a subject that names | The draft holds                                                                 |
| ------------------------ | ------------------------------------------------------------------------------- |
| a symbol                 | one section for it; several where the subject was ambiguous, as everywhere else |
| a file                   | one section for the file, then one per **durable** symbol declared in it        |

A file's sections come from the containment the index already holds, not from a list the caller
supplied, so this is not the `context` command [ADR 0012](0012-audience-and-the-fallow-boundary.md)
rejected: that one looped over several subjects a caller passed. Local symbols are skipped because
ADR 0002 forbids anything [[Durable]] anchoring to one, so a candidate claim about a local is a
candidate nobody may endorse.

**The facts inside a section are not bounded.** `--limit` counts sections and stops there. A limit is
a display bound, and a draft is not a display — it is a file about to be edited, and a fact silently
missing from it is a fact the author will never learn was missing. A subject with 176 callers drafts
176 bullets; the way to draft less is a narrower subject or `--exclude-label role=test`, both of which
are part of the question and echoed as such.

Three things ride along because a committed file outlives the terminal that produced it. The
[[Snapshot]] the draft was taken at is written into its header comment. A section whose file is
`syntactic` says so, in prose, where a reader will see it. And the answer's [[Blind spot]]s are
written into a footer — the envelope carries them either way, but the envelope is not what gets
committed.

**No timestamp**, anywhere. ADR 0006's second renderer rule is that the same commit rebuilt gives
byte-identical output, and a drafted-at line would break it on every run for no reader's benefit.

## Considered Options

- **Leaving the decision alone**, and answering the request with `evidence --json --claims` plus an
  `AGENTS.md` recipe. Rejected on what it asks of the caller: the facts are already there, but every
  agent then invents its own layout, its own heading depth and its own idea of which facts matter, and
  a person writing by hand gets nothing at all. The recipe is still worth writing
  ([#18](https://github.com/magicspon/codedocs/issues/18)); it is not a substitute for one command.
- **Emitting the skeleton to stdout only**, never writing. It survives ADR 0005 untouched and it was
  the safer half of this decision. Rejected because the refusal to overwrite is what makes the write
  safe, and a shell redirect has no such refusal — `> notes.md` over an existing file is the loss the
  design was trying to prevent, moved into the user's shell where codedocs cannot decline it.
- **Stdout by default, with `--out` to write.** The first shape of this decision, and rejected for
  the reason above turned one step further: if the redirect is the unsafe path, defaulting to the
  output that _needs_ a redirect makes the unsafe path the ordinary one. `--out -` keeps stdout for
  the caller who wants to pipe.
- **A single `docs/` tree at the repository root.** Rejected: it puts the document a directory tree
  away from the code, so nothing about opening one file suggests where the other is, and every
  repository that already has a `docs/` for something else gets drafts mixed into it.
- **The source directory itself**, with no `docs/` folder. Rejected on the directory listing: a
  package of eight modules would list eight more Markdown files between them, and the folder costs
  one path segment to avoid that.
- **Endorsed claims by default, with a `--candidates` flag to soften them.** Rejected: it makes the
  overstating shape the default and the honest one opt-in, and the first drafted file committed
  unread would report `verified` over prose nobody wrote.
- **A frontmatter list of candidates** instead of inline markers. Rejected for the reason ADR 0005
  rejected claims in frontmatter: the list and the prose drift apart silently, and here it would also
  put the endorsement gesture far away from the paragraph it is a judgement about.
- **Bounding facts within a section by `--limit`.** Rejected above: a truncated draft is a file whose
  gaps are invisible once it is committed.
- **A `--force` to overwrite.** Rejected. The flag exists to be passed, and the file it destroys is a
  document someone wrote by hand. Deleting the file first is a gesture that names its own consequence.
- **Drafting from a `trace` rather than from `evidence`**, as ADR 0006's rejected sketch had it —
  headings from a call path. Rejected: heading depth would then track call depth, which is a fact
  about the code and not about the document, and a walk from a busy root drafts thousands of headings.

## Consequences

- **ADR 0006's operation table gains a row**, and its rejection of `docs generate` is superseded on
  both grounds. The name is different because the operation is: `generate` promised prose, and
  settled constraint 2 still forbids it. codedocs writes facts, markers and headings, and not one
  sentence about what the code is for.
- **A new marker enters the vocabulary**, and only `docs draft` writes it. `docs check` ignores it by
  construction rather than by rule — the discovery scan tests for `<!-- codedocs:`, which
  `<!-- codedocs?:` is not a case of — so nothing has to remember to keep them apart.
- **`--out` is a second operation's flag now.** ADR 0006 keeps per-operation flags additive, so the
  spelling is shared and the defaults are not: `report-bug` writes `./codedocs-report.json`, and
  `docs draft` writes a path derived from its subject. Both take `-` for stdout.
- **The overwrite refusal is load-bearing, not a courtesy.** It was the guard on a flag somebody had
  to pass; it is now the guard on what happens when nobody says anything. A change that ever softens
  it — a `--force`, an "only if unchanged", a silent skip — is a change to the default behaviour of
  the command, and reopens this ADR.
- **`docs_draft` over MCP writes into the tree.** The MCP binding runs the same command line, so an
  agent that asks for a draft gets a file, which is what an agent about to write documentation
  wants. It cannot destroy one: the same refusal applies, and an agent that meant to replace a
  document has to delete it first, which is a gesture a person can see in the diff.
- **A draft can be re-run and diffed.** Byte-identical output at the same commit means a draft taken
  again after an edit is a diff against the file on disk, which is the closest thing to updating a
  document that codedocs may do without editing one.
- **Coverage stays a measure of what a person vouched for.** This is the load-bearing consequence: if
  a later change ever makes drafted claims count, ADR 0005's coverage measure is dead and this ADR
  should be reopened rather than worked around.
