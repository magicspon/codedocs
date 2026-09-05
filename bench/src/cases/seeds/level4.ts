/**
 * Level 4 — a relationship, not a location.
 *
 * The cause is not in a place; it is in how components relate over time —
 * ownership of state, ordering, a lifecycle transition, a migration. The report
 * describes a behaviour and contains no identifier that points at code.
 *
 * Level 4 is not level 3 with more files: a level 4 case may be answered by a
 * single file and still be the hardest case in the set.
 */

import type { Seed } from './index.ts'

export const level4: Seed[] = [
  {
    id: '331452',
    issue: 331452,
    shape: 'symptom-only',
    fix: {
      commit: 'c89822681aa2b6dd95f6ee4e329fed7dcc23d333',
      url: 'https://github.com/microsoft/vscode/commit/c89822681aa2b6dd95f6ee4e329fed7dcc23d333',
      landedAt: '2026-08-25T00:00:00Z',
    },
    truth: {
      files: ['src/vs/platform/agentHost/node/agentService.ts'],
      symbols: [
        '_writeAgentMergeNotice',
        '_withLiveSessionMetadata',
        'listSessions',
      ],
    },
    difficulty: {
      level: 4,
      why: 'Level 4. Nothing in the report is an identifier, and the cause is not a place: it is what the update path does when the agent catalog is unavailable, which it accepted as success and wrote back as an empty registry. Answering means reasoning about the states a window passes through across an update — ownership of the session registry, and when it is rewritten — not about which function calls which.',
    },
    notes:
      'Sessions vanish from a window after an update. The report is careful and detailed but names no code at all: the reader has to get from "the registry lost entries" to the migration path that accepted an unavailable catalog as success.',
  },
  {
    id: '329074',
    issue: 329074,
    shape: 'symbol-named',
    fix: {
      commit: 'c073c5616e5115e6fab18400610321a04f955081',
      url: 'https://github.com/microsoft/vscode/commit/c073c5616e5115e6fab18400610321a04f955081',
      landedAt: '2026-08-05T21:39:36Z',
    },
    truth: {
      files: ['src/vs/code/electron-main/app.ts'],
      symbols: [
        'configureSession',
        'isRequestFromWindow',
        'isUrlFromAuxiliaryWindow',
        'isUrlFromWindow',
      ],
    },
    difficulty: {
      level: 4,
      why: 'Level 4. The symptom is a chat feature failing in the renderer; the cause is the main process deciding, per Electron permission request, whether the requesting frame belongs to a VS Code window. An auxiliary window is opened at `about:blank`, so the requesting URL does not carry the workbench origin the check keys on, and it is denied. Reaching that means understanding how a window is created and what identity it carries afterwards — a relationship between two processes, with no identifier in the report to look up.',
    },
    notes:
      'The furthest symptom-to-cause distance in the pool. Everything the report offers — dictation, chat, `getUserMedia`, `NotAllowedError` — points at speech code, and the answer is in `code/electron-main`, a project nothing else in the pool touches. The failure mode this measures is an agent spending its turns in the subsystem the report named.',
  },
  {
    id: '329326',
    issue: 329326,
    shape: 'symptom-only',
    fix: {
      commit: 'b966285933b27aaa9be0904c1c6f2bbe666aefa9',
      url: 'https://github.com/microsoft/vscode/commit/b966285933b27aaa9be0904c1c6f2bbe666aefa9',
      landedAt: '2026-08-06T09:33:50Z',
    },
    truth: {
      files: ['src/vs/base/browser/ui/contextview/contextview.ts'],
      symbols: ['hide', 'completeHideAnimation'],
    },
    difficulty: {
      level: 4,
      why: "Level 4. Ordering, not location. A close animation defers the context view's disposal, and during that interval the dying menu is still in the document and still focusable, so its own mouse-out handling can take focus back from the quick pick that has just opened; the quick pick sees a blur and closes itself. Three components are involved and the fix is in none of the two the reporter describes — it is one file, reached by reasoning about what is alive when.",
    },
    notes:
      'The report explains the interaction and still does not give the address: it describes the menu taking focus back, and the fix makes the closing view inert instead. A second single-file level 4, in `base/`, which keeps the level from being defined by agent-host lifecycle bugs. The report names the regressing commit, which the shallow benchmark checkout cannot resolve — the agent gets the sentence, not the diff.',
  },
]
