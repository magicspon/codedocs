/**
 * Level 1 — local. The report points at the code.
 *
 * One file, one project, and the cause sits inside what the report already
 * named or one hop from it in the same file. Discovery is nearly free for both
 * arms, which is what makes level 1 the control: a benchmark whose every case
 * favours the tool is a brochure.
 */

import type { Seed } from './index.ts'

export const level1: Seed[] = [
  {
    id: '333230',
    issue: 333230,
    shape: 'file-named',
    fix: {
      commit: '0f7b8aef913e61b9e39b80929695d214acdda2ad',
      url: 'https://github.com/microsoft/vscode/commit/0f7b8aef913e61b9e39b80929695d214acdda2ad',
      landedAt: '2026-08-31T22:47:13Z',
    },
    truth: {
      files: ['src/vs/base/browser/ui/list/listView.ts'],
      symbols: ['getVisibleRange'],
    },
    difficulty: {
      level: 1,
      why: "Level 1. One file, one project, and the report names it on eight of the stack's frames. The cause is `getVisibleRange`, which appears on no frame, but it sits in the same file one data-flow hop from `probeDynamicHeights`: it produces the inverted range the thrower consumes. Nothing has to be crossed, and no lifetime has to be understood.",
    },
    notes:
      'The control. A stack trace names listView.ts on eight frames, so both arms should find the file cheaply. The fix is in getVisibleRange, which appears on no frame — it produces the inverted range that probeDynamicHeights later throws on. Tests whether codedocs buys anything when the file is already given.',
  },
  {
    id: '329610',
    issue: 329610,
    shape: 'file-named',
    fix: {
      commit: 'be6741dd559c6f87d4c7575d1cee6e7b52aa1734',
      url: 'https://github.com/microsoft/vscode/commit/be6741dd559c6f87d4c7575d1cee6e7b52aa1734',
      landedAt: '2026-08-18T22:18:30Z',
    },
    truth: {
      files: [
        'src/vs/workbench/contrib/chat/browser/attachments/chatAttachmentWidgets.ts',
      ],
      symbols: [
        'hookUpSymbolAttachmentDragAndContextMenu',
        'setResourceContext',
      ],
    },
    difficulty: {
      level: 1,
      why: 'Level 1. Four frames, three of them in one file, and the changed line is inside the function the deepest frame names. The reader has to know that a `ServicesAccessor` is only valid inside the call it was handed to — a rule of one abstraction, not a relationship between several — and then wrap the call. Nothing is crossed and nothing is followed.',
    },
    notes:
      'A second level 1 in a different subsystem, so the control is not one file in `base/`. The stack lands inside the guilty function itself, which makes this the cheapest search in the pool: if codedocs cannot pay here, that is the expected result, not a failure.',
  },
  {
    id: '331914',
    issue: 331914,
    shape: 'file-named',
    fix: {
      commit: '041fc2c244a79d65eba0b56cbab37b1f05b1af87',
      url: 'https://github.com/microsoft/vscode/commit/041fc2c244a79d65eba0b56cbab37b1f05b1af87',
      landedAt: '2026-08-21T15:02:07Z',
    },
    truth: {
      files: ['src/vs/workbench/api/browser/mainThreadEditorTabs.ts'],
      symbols: ['_onDidTabActiveChange', '_onDidTabOpen', '_buildTabObject'],
    },
    difficulty: {
      level: 1,
      why: 'Level 1. The reporter did the search: the body names the file, permalinks `_buildTabObject`, and states the mechanism — `isActive` is set on activation and never cleared on the tabs that lose it. One file, one project, and both changed methods sit a few lines from the one the report points at. What is left is writing the fix, not finding it.',
    },
    notes:
      'The report is a full root-cause write-up, which is exactly what makes it level 1: the address is handed over, so the arms are compared on implementation rather than on discovery. The cached-DTO staleness underneath it would be level 4 if nobody had explained it, and it is worth knowing what that costs when somebody has.',
  },
]
