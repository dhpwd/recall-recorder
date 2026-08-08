# Recall Recorder

macOS menu bar app that auto-records video calls through the Recall.ai Desktop SDK and writes speaker-attributed transcripts as markdown to a local inbox folder. Almost all of it is Electron main process – the one renderer window is a preferences form.

<!-- Maintainer's shared coding conventions. The path is outside this repository, so the import resolves to nothing for anyone else and can be ignored. -->

@~/Workspace/cli-agents/shared/coding.md

## Constraints

- The repository is public. Account, customer and partner names stay out of it and belong in `keyterms` in the user's `settings.json` – `src/keyterms.js` holds generic industry vocabulary only
- Transcript frontmatter is a consumed contract, not a display detail. Files land in `~/call-transcripts/inbox/` and a separate processing workflow reads `date`, `platform`, `meeting_title`, `participants`, `duration_minutes` and `recall_upload_id`. Renaming or dropping a field breaks it
- Recording is audio-only and needs macOS 14.2+ on Apple Silicon, because the `system-audio` permission does not exist below that

## Commands

```bash
npm start     # Dev mode – API key from .env, permissions attributed to the terminal
npm run make  # Package and sign into out/ – there is no separate codesign step
node recover-transcript.js <upload-id> ["Meeting title"] [--rerender]
```

## Verification

### Preflight (every change)

```bash
node --check <each changed .js file>
```

No linter and no test suite – `npm run lint` is a stub. DHP-5 covers adding both.

### Full verify (at completion)

Preflight, then package and check the signature, since a signing failure does not fail the build:

```bash
APP="out/Recall Recorder-darwin-arm64/Recall Recorder.app"
npm run make
codesign --verify --deep --strict "$APP"          # silent on success
codesign -d -r- "$APP"                            # must not mention cdhash
codesign -d --entitlements - "$APP"               # all five keys from entitlements.plist
ls -la "$APP/Contents/Resources/app.asar.unpacked/.webpack/main/Frameworks/GStreamer.framework/"
```

`GStreamer`, `Libraries` and `Resources` must be symlinks in that last listing.

Changes to transcript rendering are verified against a real call: `node recover-transcript.js <upload-id> "Title" --rerender` re-renders an existing transcript, creating nothing.

## Pattern index

- Signing, entitlements or permissions that stop working → read `docs/patterns/code-signing.md`
- Editing `forge.config.js` or `webpack.main.config.js`, or bumping `@recallai/desktop-sdk` → read `docs/patterns/native-payload-packaging.md`
- Anything affecting who a line is attributed to → read `docs/patterns/diarisation.md`

## Key references

- `docs/recall-sdk.md` – Desktop SDK events, recording lifecycle, permission requests
- `docs/recall-api.md` – Recall REST contracts, transcript creation and provider options
- `docs/transcripts.md` – the output file contract
- `docs/logging.md` – what reaches the log file and how to read a failed recording
- `docs/recovery.md` – recovering or re-rendering a transcript by hand
