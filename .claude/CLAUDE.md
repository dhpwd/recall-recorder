# Recall Recorder

## Project Overview

Electron menu bar app (macOS) that detects video calls, records via Recall.ai Desktop SDK, and saves speaker-attributed transcripts as markdown files. Replaces Granola for call transcription – transcripts land in a local inbox folder for processing with Claude Code alongside prospect/customer context.

## Tech Stack

- **Electron** (v40) with Electron Forge (webpack template)
- **Recall.ai Desktop SDK** (`@recallai/desktop-sdk`) – meeting detection and recording
- **Recall.ai API** (`eu-central-1.recall.ai`) – SDK upload management, transcript creation
- **AssemblyAI** (via Recall) – async transcription with Universal-3-Pro model, `en_uk` language code
- **No framework** for renderer – vanilla HTML/CSS/JS

## Project Structure

```
src/
  main.js        – Main process: window, tray, IPC handlers, SDK + settings init
  recall.js      – Recall SDK init, meeting detection, recording, polling, transcript download
  tray.js        – System tray icon, context menu, macOS notifications
  transcript.js  – Transforms Recall JSON transcript → markdown with YAML frontmatter
  settings.js    – JSON settings persistence + API key helper (settings with .env fallback)
  preload.js     – IPC bridge (main ↔ renderer)
  index.html     – Preferences UI
  index.css      – Styles
  renderer.js    – Renderer logic for preferences

entitlements.plist – macOS entitlements for code signing (microphone, JIT, library validation)
```

## Build & Run

```bash
npm start          # Dev mode (reads .env for API key)
npm run make       # Package into .app (out/ directory)
```

After `npm run make`, sign and copy to Applications:

```bash
codesign --force --deep --sign - --entitlements entitlements.plist "out/Recall Recorder-darwin-arm64/Recall Recorder.app"
rm -rf "/Applications/Recall Recorder.app"
cp -R "out/Recall Recorder-darwin-arm64/Recall Recorder.app" /Applications/
```

The manual `codesign` step is needed because Electron Forge's osxSign config doesn't reliably trigger with the Recall osx-sign fork. Without it, the app gets a generic Electron identifier and permissions don't persist across launches.

The `.env` file is git-ignored and only used in dev mode. The packaged app reads the API key from Preferences (stored in `~/Library/Application Support/recall-recorder/settings.json`).

## Key Architecture Decisions

- **Async transcription** (not real-time) – higher accuracy, better diarisation, no data loss risk
- **Polling-based** – polls `GET /api/v1/sdk_upload/{id}/` then `GET /api/v1/recording/{id}/` every 30s
- **Three-phase post-call flow:** (1) wait for upload complete, (2) `POST create_transcript/`, (3) poll until transcript ready
- **Tray-only app** – BrowserWindow hidden by default, only shown for Preferences

## Native SDK Binary Handling

The Recall Desktop SDK includes a native macOS binary (`desktop_sdk_macos_exe`) and a `Frameworks/` directory with GStreamer and Rust libraries. These require special handling:

1. **Webpack:** `copy-webpack-plugin` copies the binary + Frameworks from `node_modules/@recallai/desktop-sdk/` to the webpack output. A custom `FixPermissionsPlugin` in `webpack.main.config.js` restores execute permissions after copy
2. **Packaging:** `forge.config.js` uses `asar.unpackDir: ".webpack/main"` to keep the entire main process output outside the asar archive. Do not switch to `asar.unpack` with glob patterns – they fail silently, the files end up inside the asar, and the SDK can't launch its binary
3. **Code signing:** `package.json` overrides use Recall's fork of `@electron/osx-sign`

## API Gotchas

- **Auth header format:** `Authorization: Token {key}` – the `Token ` prefix is added in code (`recall.js`), the stored key is just the raw value
- **Transcript creation is explicit** – must call `POST /api/v1/recording/{id}/create_transcript/` after upload completes. Adding a provider API key to the Recall dashboard is necessary but not sufficient; transcription does not start automatically
- **Recording endpoint, not bot endpoint** – SDK uploads use `GET /api/v1/recording/{id}/`, not `GET /api/v1/bot/{id}/` (returns 404). The transcript URL is at `media_shortcuts.transcript.data.download_url` directly on the recording object, not nested inside a `recordings` array
- **AssemblyAI parameter format** – uses `speech_models: ["universal-3-pro"]` (plural, list). The older `speech_model` (singular, string) format returns an error. Recall docs may reference the old format
- **Recall API regions** – EU is `eu-central-1`. Other regions: `us-west-2` (pay-as-you-go), `us-east-1` (monthly), `ap-northeast-1` (Japan)

## macOS Permissions

- The app needs **Accessibility**, **Microphone**, and **Screen & System Audio Recording** permissions
- Grant **Screen & System Audio Recording**, not the "System Audio Recording Only" sub-section
- In dev mode, permissions are attributed to the terminal app (e.g. iTerm)
- The packaged `.app` needs permissions granted separately – they don't carry over from dev mode
- First launch prompts for microphone and accessibility; screen recording may require a quit/relaunch and manual addition via the '+' button in System Settings
- Bundle ID is `com.fidero.recall-recorder` – this must stay consistent or macOS permissions reset

## Known Issues / Future Work

- Speaker names may appear as "Speaker 0", "Speaker 1" rather than real names from the Desktop SDK – needs validation with a multi-person call
- No error resilience for interrupted polling (app quit mid-processing loses the transcript)
- No auto-launch on login
- `asar.unpackDir: ".webpack/main"` unpacks the entire main process output – ideally only the native SDK binary and Frameworks would be unpacked. Previous attempts with `asar.unpack` glob patterns failed silently; worth revisiting if Electron Forge or the Recall osx-sign fork improves
- **Packaging:** Electron Forge's `osxSign` config doesn't trigger with Recall's osx-sign fork – requires manual `codesign` after each build. Investigate proper integration to eliminate the extra step

## Repository

Private repo: `fiderohq/recall-recorder`
