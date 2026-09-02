# Using codedocs from an agent

For an agent working in a repository that has codedocs installed. Paste it into your `AGENTS.md`,
your `CLAUDE.md`, or your system prompt.

codedocs gives you a structural view of the repository. Use it to answer questions about **code
structure and relationships** before you start opening source files.

The goal is not to replace reading source. The goal is to stop rediscovering deterministic structure
through repeated search and file reads.

## When to reach for it

Reach for codedocs when you need to know:

- where a symbol is defined;
- what calls a symbol, or what it calls;
- where a symbol is named without being called;
- how a flow moves across several hops;
- what a change you have already made could reach;
- whether a documented claim still matches the code.

Read the source instead when you need:

- what the code actually does, line by line;
- comments, or anything written in prose;
- a string or content search;
- control flow codedocs cannot represent — dynamic dispatch, reflection, a call through a string key;
- anything codedocs itself reports as a blind spot.

Do not reach for codedocs because it is there. Reach for it when it saves you exploring.

## Choosing a tool

Pick the smallest tool that answers the question.

| You need                                     | Tool            |
| -------------------------------------------- | --------------- |
| Everything about one symbol, in one call     | `evidence`      |
| Find a symbol by name or glob                | `symbol`        |
| What calls this, one hop                     | `callers`       |
| What this calls, one hop                     | `callees`       |
| Where this is named without being called     | `references`    |
| What one file holds                          | `file`          |
| Follow a flow across several hops            | `trace`         |
| What my current change reaches               | `impact`        |
| Which docs my change reaches                 | `docs affected` |
| Which documented claims the code contradicts | `docs check`    |
| Why an answer is thin                        | `doctor`        |
| Build the index as a step of its own         | `analyse`       |
| codedocs itself is wrong                     | `report-bug`    |

Over MCP the names are the same, with one transliteration: `docs check` is `docs_check` and
`docs affected` is `docs_affected`, because a tool name may not carry a space.

Three of these are worth calling out.

**`evidence` is usually the right first call.** Given one subject it returns every kind of fact at
once — the declaration, the file, the labels, the callers, the callees, the references — so it
replaces a sequence of four narrower calls. Narrow to a single operation afterwards, when one kind of
fact needs a bigger `limit` than the others.

**`impact` takes no subject.** It reads the change from the diff against a baseline commit, so it
answers _what does my working tree already reach_, not _what would happen if I changed this symbol_.
For the hypothetical question, use `callers` or `trace` on the symbol.

**`trace` is the expensive one.** An unbounded walk from a busy root can yield thousands of paths.
Bound it with `depth` unless you have a reason not to.

## How to investigate

Start with the cheapest query that could answer the question.

```text
coding task
    ↓
identify the symbol or file
    ↓
evidence (or a narrower operation)
    ↓
answered?
    ├── yes → use it
    └── no → narrower or wider codedocs query
              ↓
         still not answered → read the source
```

Once codedocs has answered a structural question, **do not go and rediscover the same fact by
searching**. Search again only to verify something or to investigate a named blind spot.

For a bug fix, a reasonable sequence is:

```text
bug report → likely entry point → evidence → trace across layers
          → read the relevant source → impact before touching shared code
          → change → test
```

The sequence is not mandatory. Use the tools the task calls for.

## Read the answer honestly

Every answer carries the same envelope, whatever the operation. Four fields say how much to trust it:

| Field        | Says                                                                  |
| ------------ | --------------------------------------------------------------------- |
| `blindSpots` | what could not be seen, named one by one — never a score              |
| `budget`     | `returned` against `available`, and `truncated` if any were held back |
| `request`    | how the subject resolved, and the `scope` your labels applied         |
| `conditions` | the `fidelity` of each project the answer touched                     |

Three things are easy to blur into one and codedocs keeps apart:

- a **blind spot** is something codedocs could not see, so it does not know what it missed;
- **truncation** is something it withheld on purpose, and it knows exactly how much;
- **scope** is something you excluded, and it was part of your question.

`fidelity` is `typed` where the type checker ran and `syntactic` where a precondition was unmet. It
says which analysis ran — not how good the code is. If an answer looks thin and `conditions` says
`syntactic`, run `doctor`: it names the unmet precondition and the command that clears it.

**A missing relationship is not proof that none exists.** If codedocs reports that something could not
be resolved, read the source rather than concluding the edge is absent.

Exit codes: `0` is an answer, `1` is a negative finding — still an answer — and `2` means there is no
envelope at all. Over MCP, only exit 2 comes back as an error.

## Keep the two jobs apart

codedocs answers:

> What is structurally true about this code?

You answer:

> What does that mean for this task?

Do not ask codedocs to infer intent it cannot establish from the code, and do not invent an
explanation when the structural evidence does not support one.
