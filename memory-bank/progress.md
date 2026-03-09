# Progress

## Done

- Core recording and transcription pipeline (meeting detection → recording → upload → transcript → markdown file)
- Tray menu with status, stop recording, open inbox, preferences
- Preferences UI with API key, inbox folder, auto-record toggle
- Electron Forge packaging with native SDK binary handling
- Manual codesign workflow for packaged app
- `stopRecording` fix: now passes required `{ windowId }` parameter
- `stopRecording` error handling: falls back to `shutdown()` + re-init if stop fails
- `recover-transcript.js` script for manual transcript recovery via Recall API
- Permission handling fix: disabled SDK auto-permission acquisition, removed programmatic accessibility request (was causing macOS to reset the toggle on every launch with ad-hoc signing)

## Known issues

- Speaker names appear as "Speaker 0", "Speaker 1" rather than real names – needs validation with a multi-person call
- No error resilience for interrupted polling (app quit mid-processing loses the transcript). Manual recovery possible via `recover-transcript.js` – the gap is in the app itself
- No persistent logging in the packaged app – `console.log` output is lost
- No auto-launch on login
- `asar.unpackDir: ".webpack/main"` unpacks the entire main process output – ideally only the native SDK binary and Frameworks would be unpacked. Previous attempts with `asar.unpack` glob patterns failed silently
- Electron Forge's `osxSign` config doesn't trigger with Recall's osx-sign fork – requires manual `codesign` after each build
- Teams auto-stop failure (09/03/2026) – cause unknown, see active-context.md
