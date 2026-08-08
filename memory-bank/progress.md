# Progress

Known limitations of the current implementation. Git holds what was built and when.

## Speaker attribution

- Speaker-timeline diarisation collapses remote voices onto one participant when two or more remote attendees share a display name. Structural to the Desktop SDK, not fixable locally – see system-patterns.md "Diarisation on Desktop SDK" for the trade-off and the recovery route
- Participants with no `name` (e.g. PSTN dial-ins) render as `Speaker <id>`, so a call can mix real names and numbered speakers

## Recording and transcription

- Local microphone capture has been observed to fail for a whole call, with only remote audio captured. Cause unknown – see active-context.md
- `recording-ended` has been observed not to fire after a Teams call – see active-context.md
- Quitting mid-processing loses the transcript: polling runs in the main process with no persistence. `recover-transcript.js` recovers it by hand, but the app itself has no resilience
- `metadata.meeting_title` on Recall's side stays "Untitled Meeting". It is written before the platform reports a title, and `sdk_upload` is immutable. Pass the real title to `recover-transcript.js` as its second argument
- `stopRecording`'s shutdown-and-reinit fallback leaves `currentRecording` set, since no `recording-ended` follows. The tray stays on "Recording" and the transcript is never polled

## Packaging

- `asar.unpackDir: ".webpack/main"` unpacks the whole main-process output, where only the native SDK binary and `Frameworks/` need to be outside the archive. Narrowing it saves no space – of 146MB unpacked, 137MB is `Frameworks/` and 9.3MB the SDK binary, both of which must stay outside to be executable, leaving ~92KB to move. The gain would be asar integrity coverage for `index.js`. `asar.unpack` glob patterns were tried and failed silently: the files end up inside the archive and the SDK cannot launch its binary, which only surfaces when a recording starts
- `CopyFrameworksPlugin` skips the copy when the destination exists, so bumping the SDK within a single dev session keeps stale frameworks until `.webpack` is cleared. `npm run make` starts clean and is unaffected

## Not built

- No auto-launch on login
