# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Note on adjacent GitHub defaults

This repo also carries GitHub's default labels. Two of them look close to a triage role but are
**not** interchangeable — don't substitute them:

- `question` is not `needs-info`. `question` marks a discussion; `needs-info` means triage is
  blocked pending a reply from the reporter.
- `help wanted` is not `ready-for-human`. `ready-for-human` means triage finished and the issue is
  specified enough to implement.
