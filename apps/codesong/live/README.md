# CodeSong for Ableton Live

An Ableton Live extension that builds a CodeSong composition into the open
Live Set: one MIDI track per role with Live's own instruments and effects, one
clip per section, a marker per section and a 909 kit from Live's library.

## Before you start

- Ableton Live 12.4 beta, the first Live with extensions. Turn on
  **Settings → Extensions → Developer Mode**.
- Node.js 24.16 or later.
- The Ableton Extensions SDK, unzipped. Its licence makes it confidential, so
  it is never committed: setup copies it into `vendor/`, which git ignores.

## Set up once

```sh
ABLETON_EXTENSIONS_SDK=~/path/to/extensions-sdk-1.0.0-beta.1 \
  pnpm --filter @codedocs/codesong live:setup
```

Without `ABLETON_EXTENSIONS_SDK`, setup looks on the Desktop. It also finds a
Live that can run extensions and writes its path to `.env`.

## Build a song

1. Compose. This writes `<repo>.live.json` to `apps/codesong/out/`:

   ```sh
   pnpm --filter @codedocs/codesong compose apps/code-art/src/data/vscode.json
   ```

2. Start the extension with Live open. It reads plans from `apps/codesong/out/`:

   ```sh
   pnpm --filter @codedocs/codesong live
   ```

3. In Live, right-click any track and choose **Build CodeSong**. It builds the
   newest plan and adds new tracks, so start from an empty Set.

The terminal running `pnpm live` reports what was built and any device Live
refused.

## Limits of the SDK today

- Only Live's built-in devices, with their default presets.
- No playback control: press play yourself.
- No key or scale on the Set, and no automation.
- Each track and clip is its own undo step.
