# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `magicspon/codedocs`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

How the `wayfinder` skill's concepts map onto GitHub for this repo.

| Concept     | GitHub expression                                                    |
| ----------- | -------------------------------------------------------------------- |
| Map         | An issue labelled `wayfinder:map`                                    |
| Ticket      | A **sub-issue** of the map, labelled `wayfinder:<type>`              |
| Ticket type | `wayfinder:research` / `prototype` / `grilling` / `task`             |
| Claim       | Assign the issue to yourself: `gh issue edit <n> --add-assignee @me` |
| Blocking    | GitHub's native issue **dependencies** (`blocked by`)                |
| Frontier    | Open, unblocked, unassigned sub-issues of the map                    |

### Sub-issues and dependencies

Both APIs take the issue's **database id** (`.id`), not its number, and both need `gh api -F`
(typed) rather than `-f` (string) — `-f` fails with a 422 "not of type integer".

```bash
ID=$(gh api repos/magicspon/codedocs/issues/<child> --jq '.id')

# make <child> a sub-issue of <map>
gh api -X POST repos/magicspon/codedocs/issues/<map>/sub_issues -F sub_issue_id=$ID

# mark <issue> as blocked by <blocker>
BLOCKER=$(gh api repos/magicspon/codedocs/issues/<blocker> --jq '.id')
gh api -X POST repos/magicspon/codedocs/issues/<issue>/dependencies/blocked_by -F issue_id=$BLOCKER
```

Issues must exist before they can reference each other, so always create in one pass and wire in a
second.

### Research findings

The skill suggests a throwaway `research/<name>` branch per ticket. Don't — parallel research agents
share one working tree and cannot each check out a branch. Write findings to a distinct file under
`docs/research/` on the current branch instead, and link the path from the ticket's resolution
comment.
