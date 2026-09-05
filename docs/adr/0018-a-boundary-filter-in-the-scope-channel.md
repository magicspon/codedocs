---
status: proposed
---

# The package boundary is a filter on an edge, not a report about a package

REQUIREMENTS §4 says codedocs "starts where the project boundary does", and it is the one line of the
product's own pitch that no query can express. The developer's question behind it is the change-safety
question a monorepo forces every day: **is this a local rename, or a breaking change?** — which is
`callers`, restricted to the callers that live outside the subject's own [[Package]].

[#123](https://github.com/magicspon/codedocs/issues/123) proposes a **boundary filter in the
[[Scope]] channel**: `--outside package` and `--outside project`, applied to the far end of each
edge, relative to the subject's own.

```sh
codedocs callers 'CheckoutService.charge' --outside package
codedocs references 'Money' --outside project
```

## Why this is not the export-reachability question ADR 0012 refused

This ADR contradicts nothing in ADR 0012, but it runs close enough to one of its rulings that the
distinction has to be written down rather than assumed.

ADR 0012 refused dead-code analysis **even where the typed graph would answer it better than
`fallow`'s syntactic pass**, on the grounds that the accuracy gain is unmeasured and the confusion of
two tools answering one question is certain. That refusal stands, and it is what rules out the shape
this feature first took: a `surface <package>` operation, enumerating a package's exports and marking
the ones nothing outside consumes. That answer _is_ `fallow dead-code` with a codedocs badge on it,
whatever the algorithm underneath.

What survives the refusal is the opposite framing:

|                     | Refused                     | Proposed                               |
| ------------------- | --------------------------- | -------------------------------------- |
| Shape of the input  | a package                   | a symbol the caller named              |
| Shape of the answer | a verdict about each export | the edges that cross a boundary, named |
| An empty result     | "this export is unused"     | "no crossing edge resolved"            |

The second column is a [[Scope]] applied to a relationship question codedocs already answers. It
names consumers; it never says an export is unused, because it never enumerates exports and never
consults an entry-point set — the `entry` list is `fallow`'s, and reachability from one is `fallow`'s
question.

## Why the scope channel, and what that costs it

`labels/scope.ts` states the current rule plainly: the scope channel is "one generic pair over the
labels rather than bespoke per-operation flags", because the store is keyed by node id so one filter
works on a symbol and on a file.

A boundary filter cannot be a `LabelFilter`, and the reason is structural rather than cosmetic. A
[[Label]] is an absolute fact about a file — its [[Role]], its [[Authorship]] — decided once at
classification time, so the same label means the same thing to every question. "Outside" means nothing
until a subject is named: the same caller is inside for one subject and outside for another. It is a
**relation between two nodes**, not a property of one.

So `Scope` gains a third member beside `include` and `exclude`:

- `boundary` — `null`, `package` or `project`, echoed on every answer whether or not it bit, like the
  rest of the channel.
- its own excluded count, beside the existing total. ADR 0014 already ruled that a pooled count "would
  hide that one subject's entire result set was excluded behind a small-looking aggregate number", and
  two filters sharing one count is the same hiding one level down: a caller who passed both could not
  tell which one emptied the answer.

It stays in the scope channel and not in a blind spot for the reason that channel exists: codedocs
knows exactly what it withheld, and filing a known exclusion as something it could not see is the one
move that would destroy the [[Blind spot]] signal.

## An empty crossing set is not permission to rename

The honesty note this feature most needs is the one a caller is most likely to skip. `callers X
--outside package` returning nothing means **no crossing caller was resolved**. Unresolved call sites,
dynamic dispatch and calls through a string key all remove callers from that answer, and the
[[Fidelity]] of the projects on the other side of the boundary is exactly where a missing install
bites hardest — an unprepared sibling package is `syntactic`, and its calls into this one may not be
in the index at all.

An answer scoped to a boundary therefore reports the [[Analysis conditions]] of **every project it
crossed into**, not only the subject's own, so a caller can see that the empty result came from a
package codedocs could barely read. `doctor` names the remediation as usual.

## Considered Options

- **A `surface <package>` operation.** Rejected above: it is the dead-code report ADR 0012 refused,
  and its empty rows would be read as deletion advice however carefully they were worded.
- **A `package=<name>` label axis.** Rejected: a label is an absolute property of a file and this is a
  relation to the subject. It would also make the caller name the package they are asking about, which
  is the fact they came to codedocs to learn.
- **Computing it caller-side from paths.** Rejected: a package boundary is not a path prefix in every
  repository — ADR 0003 resolves [[Package]] and [[Project]] from the manifests and tsconfigs, and the
  index already holds the answer. Making every caller re-derive it from strings guarantees they derive
  it differently.
- **A separate `--inside` filter for the complement.** Rejected for now: `--outside` names the risky
  half, and the inside half is the default answer minus it. Reopen it if a real question needs the
  complement rather than the difference.
- **Applying the boundary to the subject rather than the far end.** Rejected as meaningless: the
  subject's own package is what the boundary is measured from, so filtering on it either keeps
  everything or nothing.

## Consequences

- **`Scope` gains a field, so the envelope's `request.scope` shape changes** for every operation that
  echoes it — additive, and a `schemaVersion` decision to take with whatever else lands in the same
  bump.
- **It applies to `callers`, `callees`, `references`, `evidence` and `trace` alike**, because it is a
  channel and not an operation's flag. On `trace` it cuts a walk at the boundary, which is a second
  reason a path may stop and therefore a fourth `PathTerminus` value to consider — noted here rather
  than decided, since [ADR 0016](0016-inward-walk-from-a-named-subject.md)'s direction flag touches
  the same type.
- **`--trim` (ADR 0015) must not drop it.** A default `boundary: null` looks exactly like the
  reconstructible default that ADR's first rule permits trimming, and it is — but only while the
  caller knows they did not pass it. It trims under the same rule as `scope.include`, and never when
  it bit.
- **`CONTEXT.md`'s [[Scope]] entry widens** from "the label filter a question carries" to the filters
  a question carries, of which the labels are one.
- **`fallow`'s boundary stays where ADR 0012 put it.** Nothing here reports on a package's hygiene,
  and the README's comparison table needs no new row.
