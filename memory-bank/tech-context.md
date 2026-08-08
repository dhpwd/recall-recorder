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
- **Recall.ai Desktop SDK** (`@recallai/desktop-sdk`, 2.0.27) – meeting detection and recording. Context7 ID: `/websites/recall_ai`. Changelog: https://docs.recall.ai/docs/dsdk-changelog
- **Recall.ai API** (`eu-central-1.recall.ai`) – SDK upload management, transcript creation. Other regions: `us-west-2` (pay-as-you-go), `us-east-1` (monthly), `ap-northeast-1` (Japan)
- **AssemblyAI** (via Recall) – async transcription, `speech_models: ["universal-3-5-pro", "universal-2"]`, `en_uk` language code. Recall does not validate `speech_models` for `assembly_ai_async` – there is no enum, the array passes straight to AssemblyAI, so a wrong model string fails the transcript rather than the API call. AssemblyAI's response carries `speech_model_used` to confirm which one ran. Recall's own AssemblyAI guide is stale on models; https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model is authoritative
- **No framework** for renderer – vanilla HTML/CSS/JS

## Project structure

```
src/
  main.js        – Main process: window, tray, IPC handlers, SDK + settings init
  recall.js      – Recall SDK init, meeting detection, recording, polling, transcript download
  tray.js        – System tray icon, context menu, macOS notifications
  transcript.js  – Transforms Recall JSON transcript → markdown with YAML frontmatter
  settings.js    – JSON settings persistence + API key helper (settings with .env fallback)
  keyterms.js    – domain vocabulary sent as keyterms_prompt to improve proper-noun accuracy
  preload.js     – IPC bridge (main ↔ renderer)
  index.html     – Preferences UI
  index.css      – Styles
  renderer.js    – Renderer logic for preferences

entitlements.plist – macOS entitlements for code signing (microphone, JIT, library validation)
```

## Build & run

```bash
npm start          # Dev mode (reads .env for API key)
npm run make       # Package, sign, and produce .app (out/ directory)
```

`npm run make` produces a fully signed app – there is no separate `codesign` step. Certificate setup, install and verification commands are in the README's "Code signing" and "Packaging" sections.

The `.env` file is git-ignored and only used in dev mode. The packaged app reads the API key from Preferences (stored in `~/Library/Application Support/Recall Recorder/settings.json` – the directory takes its name from `productName`, not `name`).

### osxSign configuration

Three settings in `forge.config.js` are each required, and each fails without an error if omitted:

- `identityValidation: false` – osx-sign otherwise resolves the identity through `security find-identity -v`, which lists only trusted identities. A self-signed certificate is never trusted, so this returns nothing and throws `No identity found for signing.` The same happened with the old `identity: "-"`, which was searched for as a substring
- `optionsForFile` returning `{ entitlements }` – entitlements are read only from this callback. A top-level `entitlements` key, and the pre-1.0 `entitlements-inherit`, are read by nothing and applied to nothing
- `continueOnError: false` – `@electron/packager` defaults this to `true` and downgrades a signing failure to a warning, so packaging reports success and emits an unsigned app

Signing failures are silent by default. Anything that suppresses them puts the manual `codesign` step back.

`identity` reads `CODESIGN_IDENTITY`, falling back to the self-signed certificate name. `identityValidation: false` is correct for both that and a Developer ID certificate – it only skips a lookup.

## Native SDK binary handling

The Recall Desktop SDK includes a native macOS binary (`desktop_sdk_macos_exe`) and a `Frameworks/` directory with GStreamer and Rust libraries. These require special handling:

1. **Webpack:** `copy-webpack-plugin` copies `desktop_sdk_macos_exe`. `Frameworks/` is copied separately by `CopyFrameworksPlugin` using `fs.cpSync({ verbatimSymlinks: true })`, because copy-webpack-plugin dereferences symlinks – see "Framework symlinks" below. A custom `FixPermissionsPlugin` then restores execute permissions. Both tap `afterEmit`, so their order in the `plugins` array is what sequences them
2. **Packaging:** `forge.config.js` uses `asar.unpackDir: ".webpack/main"` to keep the entire main process output outside the asar archive. Do not switch to `asar.unpack` with glob patterns – they fail silently, the files end up inside the asar, and the SDK can't launch its binary
3. **Code signing:** `package.json` overrides use Recall's fork of `@electron/osx-sign`. The fork parallelises signing for speed; it makes no behavioural difference to correctness

### Framework symlinks

`GStreamer.framework` ships the canonical macOS framework layout, where `GStreamer`, `Libraries` and `Resources` are symlinks into `Versions/Current/`. Copying it with symlinks dereferenced turns those into real files and directories, which:

- duplicates the entire framework payload (~140MB of bundle size)
- produces a directory `codesign` rejects with `bundle format is ambiguous (could be app or framework)`, failing the build

Verify after a build – these three must be symlinks:

```bash
ls -la "out/Recall Recorder-darwin-arm64/Recall Recorder.app/Contents/Resources/app.asar.unpacked/.webpack/main/Frameworks/GStreamer.framework/"
```

A correctly copied framework signs as `org.freedesktop.gstreamer`. A dereferenced one keeps whatever linker signature Recall's build machine left on it (an identifier of the form `tmp<random>GStreamer`).

## macOS permissions

- The app needs **Accessibility**, **Microphone**, and **System Audio Recording** permissions (audio-only mode; macOS 14.2+ on Apple Silicon required). `screen-capture` is not needed once video output is disabled
- In dev mode, permissions are attributed to the terminal app (e.g. iTerm)
- The packaged `.app` needs permissions granted separately – they don't carry over from dev mode
- **Accessibility** is granted manually via System Settings → Privacy & Security → Accessibility using the '+' button. There is no prompt for it and no `Info.plist` key – unlike Microphone and Audio Capture, which are prompt-driven
- `Info.plist` (via `forge.config.js` `extendInfo`) must declare `NSMicrophoneUsageDescription` and `NSAudioCaptureUsageDescription`. Without `NSAudioCaptureUsageDescription` the system-audio dialog never appears in a packaged build
- Bundle ID is `com.fidero.recall-recorder` – this must stay consistent, though on its own it is not what binds a permission grant (see below)

### Why permissions break on every rebuild

macOS binds each TCC grant to the app's **designated requirement**, a signing expression re-evaluated on every access. Ad-hoc signing (`--sign -`) has no certificate, so the requirement falls back to the binary's cdhash:

```
$ codesign -d -r- "/Applications/Recall Recorder.app"
designated => cdhash H"f301d50ca99b8afdbd948fee1852059e25924da3"
```

Every rebuild changes that hash, so every grant stops matching. A Developer ID app names a bundle identifier and a team certificate instead, and never mentions a hash – which is why other apps update without re-granting.

This applies to all three permissions equally. Accessibility is the one that gets noticed because it has no prompt: a broken Microphone grant silently re-prompts, a broken Accessibility grant just stops working.

The app now signs with a self-signed certificate, giving:

```
designated => identifier "com.fidero.recall-recorder" and certificate leaf = H"0155c1af..."
```

The certificate is what the grant is bound to, and it doesn't change between builds. Setup for both a self-signed and a Developer ID certificate is in the README's "Code signing" section.

Any certificate solves this – self-signed costs nothing and needs no Apple Developer Program. The paid programme buys distribution, not persistence: Gatekeeper rejects self-signed certificates on anything carrying a quarantine flag, and notarisation requires a Developer ID. Neither affects TCC. Both only matter if the app is installed on a machine other than the one that builds it.

Two things that aren't obvious:

- `security import` sets the key's ACL but not its **partition list**, so `codesign` prompts for the keychain password on every file it signs – hundreds of prompts per build, and plain "Allow" answers only one. `security set-key-partition-list` fixes it permanently (command in the README)
- a self-signed certificate is never trusted, so `security find-identity -v` reports `0 valid identities` and `security find-identity` alone reports `CSSMERR_TP_NOT_TRUSTED`. Both are expected and neither prevents signing. Trust governs verification, not signing – which is why `identityValidation: false` is required

Keychain items do not behave like TCC grants, and are not a signal about signing. A keychain item's access list does not survive a rebuild even with a stable certificate: an item created by the app itself, signed with the same certificate at the same path, still prompted after the next build. Whatever the ACL binds to, it is not the designated requirement.

That makes every workaround temporary – "Always Allow", deleting the item so the app recreates it, setting a partition list – each lasts until the next build. The `EnableCookieEncryption` fuse is therefore off, so no keychain item exists to prompt for. Nothing is protected by turning it on here: the only window loads local content and holds no cookies, the app never calls `safeStorage`, and the API key is already plain JSON in `settings.json`. Revisit only if a window authenticates against a remote service.

## Recording config

The `sdk_upload` POST body sets `recording_config.video_mixed_mp4: null` and `audio_mixed_mp3: {}` to record audio only. `video_mixed_mp4` is enabled by default, so it has to be nulled explicitly – omitting it leaves video on. `audio_mixed_mp3` defaults to off, so it has to be set to `{}`.

The request and response use different names for the same artefacts. `recording_config` takes `video_mixed_mp4` / `audio_mixed_mp3`; the recording's `media_shortcuts` drops the format suffix and returns `video_mixed` / `audio_mixed`.

The only other fields `sdk_upload` accepts are `_1080p` and `metadata`. The meeting title travels in `metadata.meeting_title` – sent at the top level it is dropped, which leaves recovery with no title to read back.

### Verifying which model ran

Recall passes `speech_models` through without validation, so a wrong model string fails at AssemblyAI rather than erroring on the call. API acceptance is not proof the change took. The raw provider response sits beside the transcript at `media_shortcuts.transcript.data.provider_data_download_url`, and is the record of what was requested and what ran:

```
$.parts[*].data.body.speech_models     = ["universal-3-5-pro","universal-2"]
$.parts[*].data.body.speech_model_used = "universal-3-5-pro"
```

The payload is a `parts` array – submission first, then completion – so `speech_model_used` is `null` in the earlier parts and set in the later ones. `speech_model` (singular) is the legacy field and stays `null` when the plural form is used. Read the same payload for provider-side warnings when a transcript comes back poor.

## Logging

`electron-log` writes to `~/Library/Logs/Recall Recorder/main.log` (5MB rotation). Bootstrapped in `src/logger.js`, required at the top of `main.js` ahead of all app setup. Tray menu has a "Reveal Log File" item.

To check permissions took effect, look for the `permission-status` lines on launch:

```
[recall] Permission accessibility: granted
[recall] Permission microphone: granted
[recall] Permission screen-capture: not_requested
[recall] Permission system-audio: granted
[recall] Permission full-disk-access: not_requested
```

That is the correct shape for audio-only – the two unused permissions read `not_requested`, not `denied`. These fire at startup, before the `requestPermission` calls, so they report current state rather than the result of the request.

`permissions-granted` is not a substitute: it signals a transition and does not fire on a launch where nothing changed, so its absence means nothing.

What reaches the file:

- every `console.*` call in the main process, via `Object.assign(console, log.functions)`. This must come after `require("electron-log/main")` – the console transport captures the original console methods when it loads, and reversing the two lines makes every log call recurse
- uncaught exceptions and unhandled rejections, via `log.errorHandler.startCatching({ showDialog: false })`. No dialog, because the app runs during calls and the tray already notifies on error
- the preferences window's console, via `spyRendererConsole: true`
- the SDK's own native-side logs, via the `log` SDK event. These never pass through Electron's console, so rerouting `console.*` doesn't reach them. Level `debug` maps to `console.debug` so the file transport's `info` level filters it out – raise the level to see it
