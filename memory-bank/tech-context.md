# Tech Context

## Prerequisites

- Node.js (v18+)
- Xcode Command Line Tools – required for native Electron builds on macOS
- Recall.ai account – [eu-central-1 dashboard](https://eu-central-1.recall.ai)
- AssemblyAI account – API key added to Recall's Transcription settings

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and add your Recall API key
```

### Recall dashboard configuration

1. Sign up at [eu-central-1.recall.ai](https://eu-central-1.recall.ai)
2. Create an API key and add it to `.env` as `RECALL_API_KEY`
3. Go to Transcription settings and add your AssemblyAI API key
4. Set the AssemblyAI endpoint – `api.eu.assemblyai.com` for EU, `api.assemblyai.com` for US

## Stack

- **Electron** (v40) with Electron Forge (webpack template)
- **Recall.ai Desktop SDK** (`@recallai/desktop-sdk`) – meeting detection and recording. Context7 ID: `/websites/recall_ai`
- **Recall.ai API** (`eu-central-1.recall.ai`) – SDK upload management, transcript creation. Other regions: `us-west-2` (pay-as-you-go), `us-east-1` (monthly), `ap-northeast-1` (Japan)
- **AssemblyAI** (via Recall) – async transcription with Universal-3-Pro model, `en_uk` language code
- **No framework** for renderer – vanilla HTML/CSS/JS

## Project structure

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

## Build & run

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

## Native SDK binary handling

The Recall Desktop SDK includes a native macOS binary (`desktop_sdk_macos_exe`) and a `Frameworks/` directory with GStreamer and Rust libraries. These require special handling:

1. **Webpack:** `copy-webpack-plugin` copies the binary + Frameworks from `node_modules/@recallai/desktop-sdk/` to the webpack output. A custom `FixPermissionsPlugin` in `webpack.main.config.js` restores execute permissions after copy
2. **Packaging:** `forge.config.js` uses `asar.unpackDir: ".webpack/main"` to keep the entire main process output outside the asar archive. Do not switch to `asar.unpack` with glob patterns – they fail silently, the files end up inside the asar, and the SDK can't launch its binary
3. **Code signing:** `package.json` overrides use Recall's fork of `@electron/osx-sign`

## macOS permissions

- The app needs **Accessibility**, **Microphone**, and **Screen & System Audio Recording** permissions
- Grant **Screen & System Audio Recording**, not the "System Audio Recording Only" sub-section
- In dev mode, permissions are attributed to the terminal app (e.g. iTerm)
- The packaged `.app` needs permissions granted separately – they don't carry over from dev mode
- **Accessibility** must be granted manually via System Settings → Privacy & Security → Accessibility using the '+' button. Do not request it programmatically – with ad-hoc signing, `requestPermission("accessibility")` causes macOS to reset the toggle on every launch
- After each rebuild/reinstall, remove stale Accessibility entries and re-add the app fresh (binary hash changes invalidate old entries)
- Microphone and screen capture prompts are handled by the SDK on first launch and persist across restarts
- Bundle ID is `com.fidero.recall-recorder` – this must stay consistent or macOS permissions reset
