# Logging and diagnosis

`electron-log` writes to `~/Library/Logs/Recall Recorder/main.log` with 5MB rotation. `src/logger.js` bootstraps it and `main.js` requires it ahead of all app setup. The tray has a "Reveal Log File" item.

## What reaches the file

- Every `console.*` call in the main process, via `Object.assign(console, log.functions)`. This must come after `require("electron-log/main")` – the console transport captures the original console methods when it loads, and reversing the two lines makes every log call recurse
- Uncaught exceptions and unhandled rejections, via `log.errorHandler.startCatching({ showDialog: false })`. No dialog, because the app runs during calls and the tray already notifies on error
- The preferences window's console, via `spyRendererConsole: true`
- The SDK's own native-side logs, via the `log` SDK event. These never pass through Electron's console, so rerouting `console.*` does not reach them. Level `debug` maps to `console.debug`, which the file transport's `info` level filters out – raise the level to see it

## Checking permissions took effect

Look for the `permission-status` lines on launch:

```
[recall] Permission accessibility: granted
[recall] Permission microphone: granted
[recall] Permission screen-capture: not_requested
[recall] Permission system-audio: granted
[recall] Permission full-disk-access: not_requested
```

That is the correct shape for audio-only recording – the two unused permissions read `not_requested`, not `denied`. These fire at startup, before the `requestPermission` calls, so they report current state rather than the result of the request.

`permissions-granted` is not a substitute. It signals a transition and does not fire on a launch where nothing changed, so its absence means nothing.

## Diagnosing a failed recording

A healthy call logs `Meeting closed` and then, within a second or two, `Recording ended event received`.

| Log                                    | Reading                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `meeting-closed`, no `recording-ended` | The SDK saw the call end and did not stop the recording                              |
| Neither                                | Meeting-end detection failed                                                         |
| `error` or `shutdown`                  | The native subprocess died. Before 2.0.12 an internal fatal produced no event at all |

A missing local microphone is the failure nothing announces: the file is complete apart from the local user's voice, so it surfaces only when someone listens back. `media-capture-status` with `type: 'audio'` and `capturing: false` mid-call pins the moment capture stopped.

Both failures have been observed once, neither has a known cause, and the SDK upgrade to 2.0.27 contains plausible fixes for each. The mic dropout lost a whole call's local audio, and the missing `recording-ended` followed a Teams call.

Once the cause is read, `docs/recovery.md` covers getting the transcript out.
