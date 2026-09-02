---
'@codedocs/cli': minor
---

First published release. `@codedocs/cli` ships the thirteen operations, both renderers and the MCP
server as one bundled ESM binary, with `@codedocs/core` bundled in rather than published — Node
refuses to strip types inside `node_modules`, so a build is forced and the CLI is the only public
surface. `typescript` is pinned to an exact `7.0.2` because the adapter uses its explicitly unstable
API.
