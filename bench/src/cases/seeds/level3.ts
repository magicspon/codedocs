/**
 * Level 3 — across layers.
 *
 * The answer spans files in different projects or layers, and the path between
 * them runs through an interface, a service, a process boundary or an event
 * rather than a direct call. The agent cannot finish by reading one file: it
 * has to hold two ends of a path at once and establish that they are connected.
 * This is where a call graph is supposed to pay.
 */

import type { Seed } from './index.ts'

export const level3: Seed[] = [
  {
    id: '332885',
    issue: 332885,
    shape: 'symbol-named',
    fix: {
      commit: '3327a406b89e038f51f80c598f249dfe81229217',
      url: 'https://github.com/microsoft/vscode/commit/3327a406b89e038f51f80c598f249dfe81229217',
      landedAt: '2026-08-31T00:00:00Z',
    },
    truth: {
      files: [
        'src/vs/platform/agentHost/node/agentService.ts',
        'src/vs/platform/agentHost/node/copilot/copilotAgent.ts',
      ],
      symbols: [
        'restoreSession',
        '_doRestoreSession',
        '_readDefaultChatProviderData',
        'getChatMetadata',
        '_doResumeSession',
      ],
    },
    difficulty: {
      level: 3,
      why: 'Level 3. The answer spans two files in different layers — the agent host service and the Copilot provider behind it — and the call between them runs through the provider interface rather than by name. The reader has to hold both ends of a hang at once: metadata is requested in one layer and never resolved in the other. This is the edge a text search cannot see.',
    },
    notes:
      'A hang, reported with log lines rather than a stack: "restore: reading provider metadata" arrives and "restore: provider metadata resolved" never does. The symbols are named, the files are not, and the answer spans two files in different layers. The case where a call graph should pay.',
  },
  {
    id: '332146',
    issue: 332146,
    shape: 'symptom-only',
    fix: {
      commit: 'fd811a4543cba4ee8c40f32dff736bcc560abdcb',
      url: 'https://github.com/microsoft/vscode/commit/fd811a4543cba4ee8c40f32dff736bcc560abdcb',
      landedAt: '2026-08-23T22:51:05Z',
    },
    truth: {
      files: [
        'src/vs/sessions/browser/parts/mobile/mobileVisualViewport.ts',
        'src/vs/sessions/browser/workbench.ts',
      ],
      symbols: [
        'getMobileViewportDimension',
        'layout',
        'registerLayoutListeners',
      ],
    },
    difficulty: {
      level: 3,
      why: "Level 3. Two files joined by a browser event, not a call: the layout host sizes itself from the layout viewport, while the fact that the keyboard has shrunk the usable area lives in the visual-viewport part. The reader has to connect a `resize` on `window.visualViewport` to the workbench's own `layout()`, and establish that neither end knows about the other today. Nothing in the report is an identifier.",
    },
    notes:
      "Reported on Android: the on-screen keyboard covers the chat composer. The answer is a viewport helper plus the layout pass that must consult it, and the connection between them is an event on a platform object rather than an import. Also the pool's only web/mobile-layout case, which keeps level 3 from being two agent-host cases.",
  },
  {
    id: '326185',
    issue: 326185,
    shape: 'symbol-named',
    fix: {
      commit: '9f9213b45855b326a6cd8427fe4a34945ea2f625',
      url: 'https://github.com/microsoft/vscode/commit/9f9213b45855b326a6cd8427fe4a34945ea2f625',
      landedAt: '2026-09-01T15:37:11Z',
    },
    truth: {
      files: [
        'src/vs/platform/agentHost/node/copilot/copilotAgent.ts',
        'src/vs/platform/agentHost/node/copilot/copilotCliEnvironment.ts',
      ],
      symbols: [
        'invokeWithTemporaryProxyEnvironment',
        'createCopilotCliEnvironment',
        '_readNoProxy',
        '_createCopilotCliEnvironment',
      ],
    },
    difficulty: {
      level: 3,
      why: 'Level 3. The report names `http.noProxy`, and that setting is not what the fix reads: the agent host keeps its own proxy configuration, and the value has to reach a child process as environment variables. The path runs configuration → agent → CLI environment builder → spawned process, so the reader has to follow a value across a process boundary and establish that the no-proxy half of it is dropped on the way.',
    },
    notes:
      'A user setting that the agent host ignores. The trap is the obvious one: `http.noProxy` is a workbench setting with plenty of hits, and none of them is where the fix goes. Tests whether a structural interface helps an agent follow a value rather than a name.',
  },
]
