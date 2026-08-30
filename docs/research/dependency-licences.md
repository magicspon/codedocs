# Licence and redistribution audit of candidate analysis dependencies

**Issue:** [#3](https://github.com/magicspon/codedocs/issues/3) — wayfinder research
**Requirement:** PRD §30 (Licensing and dependencies)
**Verification date:** 2026-08-30
**Method:** every licence below was read from a **primary source** on the date above — the `LICENSE`
file in the project's own source repository (via `raw.githubusercontent.com`), and/or the `license`
field in published package metadata (npm registry, crates.io API, PyPI JSON API). Nothing here is
from recollection. Licences change; see [Re-verification](#re-verification) at the end.

## Distribution assumption

codedocs is a **proprietary, closed-source commercial CLI** sold as a one-time purchase. codedocs'
own source stays closed. The question for every dependency is therefore:

> may this be redistributed, in binary or bundled form, inside a closed-source product sold for
> money, without any obligation to open codedocs' own source?

Two consumption modes are distinguished throughout, because they have different obligations:

- **Library** — linked into or bundled with the codedocs artefact (npm dependency, static Rust
  crate, vendored binary shipped in our installer).
- **Subprocess** — a separate executable that codedocs shells out to, installed by the _user_
  (`npm i -g`, `uv tool install`, Homebrew) rather than shipped by us.

---

## Verdict summary

| Candidate                                                     | Version checked                                                | Licence             | Verdict                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------- | ------------------- | ----------------------------------------- |
| TypeScript compiler API (`typescript`)                        | 7.0.2 (npm latest), 5.x line                                   | Apache-2.0          | **CLEARED**                               |
| `ts-morph`                                                    | 28.0.0                                                         | MIT                 | **CLEARED**                               |
| Oxc (`oxc-parser`, `oxc_*` crates)                            | 0.147.0                                                        | MIT                 | **CLEARED**                               |
| `oxc-resolver`                                                | npm 11.24.2 / crate 11.24.3                                    | MIT                 | **CLEARED**                               |
| `oxlint`                                                      | latest                                                         | MIT                 | **CLEARED**                               |
| ast-grep (`@ast-grep/napi`, `@ast-grep/cli`, `ast-grep-core`) | 0.45.2                                                         | MIT                 | **CLEARED**                               |
| tree-sitter (crate / node / wasm / py)                        | crate 0.26.13, npm 0.25.1, py 0.25.2                           | MIT                 | **CLEARED**                               |
| `tree-sitter-typescript`                                      | 0.23.2                                                         | MIT                 | **CLEARED**                               |
| `scip-typescript`                                             | 0.4.0                                                          | Apache-2.0          | **CLEARED**                               |
| `typescript-go` / `tsgo`                                      | repo `main`; `@typescript/native-preview` 7.0.0-dev.20260707.2 | Apache-2.0          | **CLEARED** (licence); see stability note |
| **Graphify** (`graphifyy` on PyPI)                            | installed 0.8.37 = MIT; **current 0.9.53 = Apache-2.0**        | relicensed mid-life | **AMBIGUOUS** — see below                 |
| `psycopg` (via Graphify `postgres` extra only)                | 3.3.4                                                          | **LGPL-3.0-only**   | **DISQUALIFIED** as a bundled dependency  |
| Biome (`@biomejs/biome`)                                      | latest                                                         | MIT OR Apache-2.0   | **CLEARED** (elect MIT)                   |
| SWC (`@swc/core`)                                             | latest                                                         | Apache-2.0          | **CLEARED**                               |
| `dependency-cruiser` / `madge` / `jscpd`                      | latest                                                         | MIT                 | **CLEARED**                               |
| `knip`                                                        | latest                                                         | ISC                 | **CLEARED**                               |

**Nothing in the primary candidate set is disqualified.** The single copyleft hit in the whole
transitive tree is `psycopg` (LGPL-3.0-only), and it is reachable only through a Graphify _optional
extra_ we would never install. The only item needing a human decision is **Graphify**, and the
reason is licence _volatility_, not the current licence.

---

## Findings

### TypeScript compiler API — CLEARED

- **Licence:** Apache License 2.0.
- **Primary sources:** `microsoft/TypeScript` → `LICENSE.txt` on `main` (Apache-2.0, verbatim);
  npm `typescript@7.0.2` metadata `license: "Apache-2.0"`. The 5.x line carries the same field.
- **Closed-source commercial redistribution:** permitted. Apache-2.0 §4 allows distribution in
  Object form under terms of your choosing, with no reciprocal source obligation.
- **Attribution obligations:** Apache-2.0 §4(a)–(d). You must ship (i) a copy of the Apache-2.0
  licence text, (ii) retained copyright/attribution notices, and (iii) **the contents of the
  `NOTICE.txt` file**. The npm tarball ships `package/LICENSE` and `package/NOTICE.txt` — both must
  be reproduced. TypeScript 7 additionally vendors `vscode-jsonrpc` (`package/vendor/vscode-jsonrpc/License.txt`,
  MIT), which also needs reproducing.
  Where: a `THIRD-PARTY-NOTICES` file shipped alongside the codedocs binary, plus a
  `codedocs licences` command.
- **Transitive copyleft:** none. `NOTICE.txt` lists only DefinitelyTyped (MIT), Unicode (Unicode
  licence) and WebGL. A word-boundary scan of `NOTICE.txt` for GNU/GPL/LGPL/AGPL/MPL/SSPL returned
  no matches.
- **Subprocess vs library:** irrelevant for permission — both are fine. It _does_ change the
  attribution burden: if the user installs `typescript` themselves and we only shell out to
  `tsc`/`tsserver`, we distribute nothing and §4 never triggers. If we bundle it, we owe the notices
  above.
- **Caveat worth a human eye:** Microsoft's `NOTICE.txt` contains boilerplate lifted from their
  commercial product-notice template — _"Microsoft, not the third party, licenses the Third Party
  Code to you under the terms set forth in the EULA for the Microsoft Product"_. There is no EULA in
  the repository, the repo LICENSE is plain Apache-2.0, and the sentence is prefixed _"Provided for
  Informational Purposes Only"_. Industry practice treats TypeScript as unambiguously Apache-2.0
  and it is shipped inside commercial products universally. Flagged for completeness, not as a
  blocker.

### `ts-morph` — CLEARED

- **Licence:** MIT.
- **Primary sources:** `dsherret/ts-morph` → `LICENSE` on `latest` (MIT, © 2017 David Sherret);
  npm `ts-morph@28.0.0` `license: "MIT"`.
- **Closed-source commercial redistribution:** permitted without restriction.
- **Attribution obligations:** MIT requires the copyright notice and permission text in "all copies
  or substantial portions". A `THIRD-PARTY-NOTICES` entry satisfies this.
- **Transitive tree:** `@ts-morph/common` ~0.29.0 (MIT), `code-block-writer` ^13.0.3 (MIT), and
  `typescript` as a peer (Apache-2.0). No copyleft. Note that using ts-morph pulls the TypeScript
  attribution obligation along with it.
- **Subprocess vs library:** ts-morph is a library only; not applicable.

### Oxc — CLEARED

- **Licence:** MIT.
- **Primary sources:** `oxc-project/oxc` → `LICENSE` on `main` (MIT, © 2024-present VoidZero Inc. &
  Contributors, © 2023 Boshen); npm `oxc-parser@0.147.0` and the platform binding package
  `@oxc-parser/binding-darwin-arm64@0.147.0` both `license: "MIT"`; crates.io `oxc_parser`,
  `oxc_ast`, `oxc_semantic` all 0.147.0 `license: "MIT"`. `oxc-resolver` (npm 11.24.2 / crate
  `oxc_resolver` 11.24.3) and `oxlint` are likewise MIT.
- **Closed-source commercial redistribution:** permitted.
- **Attribution obligations:** MIT notice for Oxc itself, **plus** the contents of the repo's
  `THIRD-PARTY-LICENSE` file. Oxc carries code derived from ~15 other projects (TypeScript and
  `zkat/miette` under Apache-2.0; ESLint, eslint-plugin-import, Biome, typescript-eslint, esbuild,
  Closure Compiler, Prettier, UglifyJS, Meta/React sources and others under MIT/BSD-style terms),
  and those notices travel with any redistribution.
- **Transitive copyleft:** none. A word-boundary scan of `THIRD-PARTY-LICENSE` for
  GNU/GPL/LGPL/AGPL/MPL/SSPL/Eclipse returned zero matches. The file contains only Apache-2.0,
  MIT and BSD-family texts.
- **Subprocess vs library:** no difference in permission. Bundling the napi bindings means shipping
  a prebuilt native binary — the MIT notice obligation attaches to that binary, so the notice file
  must ship in the installer, not just in a repo we never publish.

### ast-grep — CLEARED

- **Licence:** MIT.
- **Primary sources:** `ast-grep/ast-grep` → `LICENSE` on `main` (MIT, © 2022 Herrington
  Darkholme); npm `@ast-grep/napi@0.45.2` and `@ast-grep/cli@0.45.2` both `license: "MIT"`;
  crates.io `ast-grep-core` and `ast-grep-language` 0.45.2 both MIT.
- **Closed-source commercial redistribution:** permitted.
- **Attribution obligations:** MIT notice. The repo has no `NOTICE` or `THIRD-PARTY-LICENSE` file
  (both 404 on `main`), so ast-grep itself adds no aggregated third-party notice — but it links
  tree-sitter and a set of tree-sitter grammars, whose MIT notices apply in their own right.
- **Transitive copyleft:** none found. The grammar set is MIT/Apache-2.0 (see tree-sitter below).
- **Subprocess vs library:** the CLI (`@ast-grep/cli`, shelled out to) and the library
  (`@ast-grep/napi`, linked) carry identical MIT terms. Subprocess use where the _user_ installs
  the CLI removes our distribution obligation entirely; bundling either one requires the notice.

### tree-sitter and `tree-sitter-typescript` — CLEARED

- **Licence:** MIT throughout.
- **Primary sources:** `tree-sitter/tree-sitter` → `LICENSE` on `master` (MIT, © 2018 Max
  Brunsfeld); `tree-sitter/tree-sitter-typescript` → `LICENSE` on `master` (MIT, © 2017 Max
  Brunsfeld); crates.io `tree-sitter` 0.26.13 MIT and `tree-sitter-typescript` 0.23.2 MIT; npm
  `tree-sitter@0.25.1` (node bindings) MIT, `tree-sitter-typescript@0.23.2` MIT,
  `web-tree-sitter` MIT; PyPI `tree_sitter` 0.25.2 MIT.
- **Closed-source commercial redistribution:** permitted.
- **Attribution obligations:** an MIT notice **per grammar**, not one for tree-sitter as a whole.
  Grammars are separately copyrighted packages. If we ship N grammars we owe N notices.
- **Transitive copyleft:** none in the grammars actually present in our tooling. Every grammar in
  the installed Graphify environment (29 grammar packages: python, javascript, typescript, go,
  rust, java, groovy, c, cpp, ruby, c-sharp, kotlin, scala, php, swift, lua, zig, powershell,
  elixir, objc, julia, verilog, fortran, bash, json) reports MIT, except `tree_sitter_elixir`
  0.3.5, whose `METADATA` `License:` field says `Apache-2.0` while its trove classifier says
  `MIT License` — an upstream metadata inconsistency, permissive under either reading.
  **Caution for future grammars:** the tree-sitter ecosystem is not uniformly MIT. Any grammar
  added later must be checked individually rather than assumed.
- **Subprocess vs library:** the tree-sitter CLI is a build-time tool (generates parsers); it does
  not ship in the product, so only the runtime library and grammar notices matter.

### `scip-typescript` — CLEARED

- **Licence:** Apache License 2.0.
- **Primary sources:** `sourcegraph/scip-typescript` → `LICENSE` on `main` (Apache-2.0, verbatim);
  npm `@sourcegraph/scip-typescript@0.4.0` `license: "Apache-2.0"`.
- **Closed-source commercial redistribution:** permitted. Apache-2.0, no reciprocity.
- **Attribution obligations:** licence text + retained notices. The repo has **no** `NOTICE` file
  (`NOTICE` and `NOTICE.txt` both 404 on `main`), so §4(d) adds nothing beyond the licence text
  itself.
- **Transitive tree:** `progress` (MIT), `commander` (MIT), `typescript` ^5.6.2 (Apache-2.0 —
  brings its own `NOTICE.txt` obligation), `google-protobuf` (`BSD-3-Clause AND Apache-2.0`). No
  copyleft.
- **Subprocess vs library:** scip-typescript is designed as a CLI that emits a SCIP index file.
  Consuming it as a subprocess and reading the index is the natural integration and is the cheapest
  legally: if the user installs it, we distribute nothing. Bundling it drags the whole TypeScript
  notice set in behind it.

### `typescript-go` / `tsgo` — CLEARED on licence

- **Licence:** Apache License 2.0.
- **Primary sources:** `microsoft/typescript-go` → `LICENSE` on `main` (Apache-2.0, verbatim); npm
  `@typescript/native-preview@7.0.0-dev.20260707.2` `license: "Apache-2.0"`, repository
  `github.com/microsoft/typescript-go`.
- **Closed-source commercial redistribution:** permitted.
- **Attribution obligations:** as TypeScript — licence text plus the repo's `NOTICE.txt`, which
  carries the same DefinitelyTyped / Unicode / WebGL / W3C entries. No copyleft in it.
- **Transitive copyleft:** none detected.
- **Subprocess vs library:** `tsgo` is a Go binary. In practice it is consumed as a subprocess or
  over LSP. Either way Apache-2.0 permits it; bundling the binary triggers the §4 notice duties.
- **Non-licence note (relevant to adoption, not to this audit):** `@typescript/native-preview`
  publishes dated `-dev` builds with no stable release line, and the native compiler now also ships
  as `typescript@7.0.2` on npm. The risk here is **API/version stability, not licensing** — do not
  let this audit's "cleared" be read as an adoption recommendation.

### Graphify — AMBIGUOUS (needs a human call)

This is the one entry that does not resolve cleanly, and it is a good illustration of why PRD §30
requires re-verification rather than recollection.

- **Identity:** the binary at `~/.local/bin/graphify` is a `uv` tool symlinked to
  `~/.local/share/uv/tools/graphifyy/bin/graphify`, reporting `graphify 0.8.37`. The PyPI
  distribution is **`graphifyy`** (three y's in total — note the trailing double-y), not `graphify`.
- **The licence changed between the installed version and the current one:**

  |            | Installed (0.8.37)               | Current on PyPI (0.9.53)                          |
  | ---------- | -------------------------------- | ------------------------------------------------- |
  | Licence    | **MIT**, © 2026 Safi Shamsi      | **Apache-2.0** (`license_expression: Apache-2.0`) |
  | Repository | `github.com/safishamsi/graphify` | `github.com/Graphify-Labs/graphify`               |

- **Primary sources:** installed `graphifyy-0.8.37.dist-info/METADATA` and its bundled
  `licenses/LICENSE` (full MIT text); PyPI JSON API for `graphifyy` (version 0.9.53,
  `license_expression: "Apache-2.0"`, project URLs pointing at `Graphify-Labs/graphify`); GitHub
  API for `Graphify-Labs/graphify` (`license.spdx_id: "Apache-2.0"`, default branch `v8`); the
  repo's `LICENSE` (Apache-2.0), `LICENSE-MIT` (MIT, © 2026 Safi Shamsi) and `NOTICE` files on `v8`.
- **The repo's own `NOTICE` explains the relicensing:**

  > Graphify
  > Copyright 2026 Safi Shamsi and the Graphify contributors.
  >
  > This product is licensed under the Apache License, Version 2.0 (see LICENSE).
  >
  > Portions of this software were contributed under the MIT License prior to the relicensing and
  > remain available under those terms. The original MIT license text is retained in LICENSE-MIT.

- **Closed-source commercial redistribution:** permitted under **both** the old MIT and the current
  Apache-2.0. Neither is copyleft. There is no source-available or non-commercial clause in either
  file. On today's terms Graphify is redistributable inside codedocs.
- **Attribution obligations:** now heavier than before. Apache-2.0 §4(d) means that if we
  redistribute Graphify we must reproduce the `NOTICE` text above — the copyright line and the
  relicensing paragraph — in our notices, in addition to the Apache-2.0 licence text. Under the old
  0.8.37 MIT terms a single copyright line sufficed.
- **Transitive tree (default install):** clean and entirely permissive. The 30 runtime packages in
  the installed environment are `networkx` (BSD-3-Clause), `numpy`
  (`BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`), `rapidfuzz` (MIT), `tree_sitter` (MIT)
  and 26 tree-sitter grammar packages, all MIT (with the `tree_sitter_elixir` metadata
  inconsistency noted above). **No copyleft in the default install.**
- **Transitive tree (optional extras) — one real hit:** `graphifyy` 0.9.53 declares many optional
  extras. All are permissive (`graspologic` MIT, `faster-whisper` MIT, `yt-dlp` Unlicense, `neo4j`
  `Apache-2.0 AND Python-2.0`, `falkordb` MIT, `mcp` MIT, `starlette` BSD-3-Clause, `pypdf`
  BSD-3-Clause, `watchdog` Apache-2.0, `python-docx`/`openpyxl`/`markdownify`/`tiktoken`/`jieba`
  MIT, `robotframework` Apache-2.0, `matplotlib` PSF-style) **except one**:
  - **`psycopg` 3.3.4 — LGPL-3.0-only**, pulled in by `graphifyy[postgres]`.
- **Subprocess vs library — this materially changes the answer.** Graphify is a Python CLI. Two
  options:
  - **Subprocess, user-installed** (`uv tool install graphifyy`), which is how it is used today:
    codedocs distributes no Graphify code, no Apache-2.0 §4 obligation is triggered, and the LGPL
    extra is the user's business and not in our artefact. This is the clean path.
  - **Bundled** (vendored Python runtime + wheels in our installer): we take on the Apache-2.0
    licence + `NOTICE` reproduction duty, we take on the notice duty for ~30 transitive packages,
    and we must **pin the extras set and exclude `postgres`** so `psycopg` never enters the bundle.
- **Why this is AMBIGUOUS rather than CLEARED:** the current licence is fine. The concern is
  governance. This is a single-maintainer project that has already **relicensed once mid-life and
  moved to a new GitHub org** within its 0.x series. A project that has relicensed once can
  relicense again, and the direction of travel in this tool category (MIT → Apache-2.0 → BSL/SSPL
  under a "Labs" entity) is a recognised pattern. codedocs is a paid product with a one-time
  purchase model, so a future upstream relicence would strand shipped copies.
  **A human should decide** which of these to adopt:
  1. Subprocess-only, user-installed, never bundled — lowest exposure, and codedocs degrades
     gracefully if Graphify is absent. _(Recommended.)_
  2. Bundle a **hard-pinned** version, archive the exact wheel plus its `LICENSE`/`LICENSE-MIT`/
     `NOTICE` as they read on the pinned date. Apache-2.0 grants are irrevocable for the version
     received, so a pinned copy stays safe regardless of what upstream does later.
  3. Treat Graphify as replaceable and keep the graph-building seam abstract, so a relicence is a
     swap rather than a rewrite.

### `psycopg` — DISQUALIFIED as a bundled dependency

- **Licence:** LGPL-3.0-only (PyPI `psycopg` 3.3.4, `license_expression: "LGPL-3.0-only"`).
- **Reachability:** only via `graphifyy[postgres]` / `graphifyy[all]`. It is **not** in the default
  install and **not** present in the installed 0.8.37 environment.
- **Why it matters:** LGPL is the one licence family in this whole audit with reciprocal
  obligations. LGPL-3.0 permits use by a proprietary program, but attaches relinking/replacement
  obligations (LGPL-3.0 §4) that are painful for a bundled, statically-assembled commercial CLI —
  and §4 of LGPL-3.0 also inherits GPL-3.0's anti-tivoisation and installation-information rules.
- **Action:** do not enable the `postgres` (or `all`) extra. If Postgres-backed graph storage is
  ever wanted, use a permissively licensed driver (e.g. `pg8000`, BSD-3-Clause) or reach Postgres
  out-of-process. Encode this as a build-time check on the bundled dependency set.

### Others encountered

Checked opportunistically because they are plausible substitutes or neighbours for the named
candidates. All from npm registry `license` fields on 2026-08-30.

| Package              | Licence                       | Notes                                                                                                                     |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@biomejs/biome`     | `MIT OR Apache-2.0`           | Dual — we **elect one** (MIT is simplest) and say so in our notices.                                                      |
| `@swc/core`          | Apache-2.0                    | Check for a `NOTICE` file before bundling.                                                                                |
| `oxlint`             | MIT                           | Same notice set as Oxc.                                                                                                   |
| `oxc-resolver`       | MIT                           |                                                                                                                           |
| `dependency-cruiser` | MIT                           |                                                                                                                           |
| `madge`              | MIT                           |                                                                                                                           |
| `jscpd`              | MIT                           |                                                                                                                           |
| `knip`               | ISC                           | ISC is functionally MIT; permissive, notice required.                                                                     |
| `@napi-rs/cli`       | MIT                           | Build-time only; not redistributed.                                                                                       |
| `google-protobuf`    | `BSD-3-Clause AND Apache-2.0` | Via scip-typescript. BSD-3 adds a no-endorsement clause — do not use "Google" in codedocs marketing to imply endorsement. |

---

## Copyleft in the transitive tree

**Exactly one hit across every tree examined:** `psycopg` (LGPL-3.0-only), reachable only through a
Graphify optional extra we will not install. See above.

No GPL, AGPL, SSPL, BSL, Elastic, Commons Clause, or any source-available-but-not-open licence was
found anywhere in the primary candidate set. Word-boundary scans for GNU/GPL/LGPL/AGPL/MPL/SSPL/
Eclipse were run over the two aggregated third-party notice files that exist in the set —
`microsoft/TypeScript` `NOTICE.txt` and `oxc-project/oxc` `THIRD-PARTY-LICENSE` — and both returned
zero matches.

**Nothing reaches codedocs' own source.** MIT, Apache-2.0, BSD-3-Clause, ISC, 0BSD, Zlib, Unlicense,
CC0 and the PSF-style licences found here are all non-reciprocal. codedocs' implementation stays
proprietary, satisfying PRD §30.

---

## Does subprocess vs library change the answer?

For **permission**, no — every cleared dependency permits both, and no licence here has a network
or process-boundary trigger (there is no AGPL in the set, which is the licence where the boundary
question actually bites).

For **obligations**, yes, substantially:

- **User-installed subprocess:** codedocs distributes no third-party code. Apache-2.0 §4 and the
  MIT notice clause are both conditioned on _distribution_, so neither triggers. We owe nothing
  beyond not misrepresenting the tools. This is the cheapest posture and is how Graphify,
  `scip-typescript`, `ast-grep` CLI and `tsgo` would naturally be used.
- **Bundled subprocess (binary in our installer):** identical obligations to bundling a library.
  Shipping a compiled binary _is_ distribution in Object form. There is no "it's a separate
  process" exemption for notices.
- **Linked library:** obligations as bundled.

The practical rule for codedocs: **prefer user-installed subprocesses for the heavy analysis tools**
(Graphify, scip-typescript, tsgo, ast-grep CLI), **bundle only the npm/native libraries we genuinely
need in-process** (`typescript`, `ts-morph`, `oxc-parser`, `@ast-grep/napi`, tree-sitter runtime +
grammars). That keeps the notice file short and keeps the LGPL extra permanently out of our
artefact. It also gives the graceful-degradation behaviour the PRD wants when a tool is absent.

---

## Attribution: what codedocs must actually ship

If codedocs bundles any of the cleared dependencies, ship a `THIRD-PARTY-NOTICES.txt` alongside the
binary and surface it from the CLI (e.g. `codedocs licences`). It must contain:

1. **Full licence text** for each distinct licence in use (Apache-2.0 once; MIT once is not
   sufficient — MIT carries a per-copyright-holder notice, so list each holder).
2. **Per-package copyright lines** for every bundled package, including each tree-sitter grammar
   separately.
3. **Verbatim `NOTICE` contents** for every bundled Apache-2.0 package that has one. Currently:
   `microsoft/TypeScript` (`NOTICE.txt`), `microsoft/typescript-go` (`NOTICE.txt`), and Graphify
   (`NOTICE`) if bundled. `scip-typescript` has none.
4. **Oxc's `THIRD-PARTY-LICENSE`** contents if Oxc is bundled — Oxc's own MIT notice does not cover
   the ~15 upstream projects it carries code from.
5. **A dual-licence election** for `@biomejs/biome` if used, stating which of MIT / Apache-2.0 we
   took.

For a **user-installed subprocess**, none of the above is legally required. Listing it anyway is
good practice and costs nothing.

---

## Re-verification

Licences are not stable facts. This audit found a live counter-example: **Graphify was MIT at
0.8.37 and is Apache-2.0 at 0.9.53**, under a new GitHub organisation. Every claim in this document
carries the version and the date it was checked for exactly that reason.

Recommended process:

- **Re-verify on every dependency version bump**, from the `license` field of the version being
  adopted, not from this document.
- **Record the SPDX identifier and the licence-file SHA** alongside the pinned version in the
  lockfile or a small manifest, so drift is detectable in CI.
- **Fail the build** on any dependency resolving to a licence outside an allowlist of
  `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `0BSD`, `Zlib`, `Unlicense`, `CC0-1.0`,
  `Python-2.0`, `PSF-2.0`.
- **Archive the licence files** for every bundled dependency at the pinned version. Both MIT and
  Apache-2.0 grants are irrevocable for the copy you received, so an archived pinned copy is
  immune to a later upstream relicence — but only if you can prove what the terms were on the day.

## Sources

All fetched 2026-08-30.

- `https://raw.githubusercontent.com/microsoft/TypeScript/main/LICENSE.txt`
- `https://raw.githubusercontent.com/microsoft/TypeScript/main/NOTICE.txt`
- `https://raw.githubusercontent.com/dsherret/ts-morph/latest/LICENSE`
- `https://raw.githubusercontent.com/oxc-project/oxc/main/LICENSE`
- `https://raw.githubusercontent.com/oxc-project/oxc/main/THIRD-PARTY-LICENSE`
- `https://raw.githubusercontent.com/ast-grep/ast-grep/main/LICENSE`
- `https://raw.githubusercontent.com/tree-sitter/tree-sitter/master/LICENSE`
- `https://raw.githubusercontent.com/tree-sitter/tree-sitter-typescript/master/LICENSE`
- `https://raw.githubusercontent.com/sourcegraph/scip-typescript/main/LICENSE`
- `https://raw.githubusercontent.com/microsoft/typescript-go/main/LICENSE`
- `https://raw.githubusercontent.com/microsoft/typescript-go/main/NOTICE.txt`
- `https://raw.githubusercontent.com/Graphify-Labs/graphify/v8/LICENSE`
- `https://raw.githubusercontent.com/Graphify-Labs/graphify/v8/LICENSE-MIT`
- `https://raw.githubusercontent.com/Graphify-Labs/graphify/v8/NOTICE`
- `https://api.github.com/repos/Graphify-Labs/graphify`
- `https://pypi.org/pypi/graphifyy/json` (and the same endpoint for each transitive/extra package)
- npm registry `license` fields via `npm view <pkg> license`
- crates.io API `https://crates.io/api/v1/crates/<crate>`
- Local installed metadata under
  `~/.local/share/uv/tools/graphifyy/lib/python3.12/site-packages/*.dist-info/METADATA`
