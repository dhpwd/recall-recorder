# Recall Desktop SDK

`@recallai/desktop-sdk` 2.0.27. Context7 ID `/websites/recall_ai`, [changelog](https://docs.recall.ai/docs/dsdk-changelog). The native binary runs as a separate process from Electron, so if the Electron main process dies the binary can still finish an upload during its own shutdown.

## Method signatures

`stopRecording`, `pauseRecording`, `resumeRecording` and `uploadRecording` take a named `{ windowId }`, never a positional argument. Calling `stopRecording()` bare throws `TypeError: Cannot destructure property 'windowId' of 'undefined'`.

When `stopRecording` fails, `src/recall.js` falls back to `RecallAiSdk.shutdown()` followed by a re-init. That kills the native subprocess, which is drastic, but it beats an app stuck in a state it cannot leave. The fallback leaves `currentRecording` set, because no `recording-ended` follows it – so the tray stays on "Recording" and the transcript is never polled. DHP-3 covers that.

## Events

| Event                  | When                                    | Notes                                                                          |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `meeting-detected`     | Video call window found                 | Carries `evt.window.id`, `title`, `platform` and `url`                         |
| `meeting-updated`      | Window metadata changes                 | Usually the first event carrying a real title                                  |
| `recording-started`    | Recording begins                        | Drives the tray's recording state                                              |
| `recording-ended`      | Recording stops, auto or manual         | Triggers the upload and transcript flow                                        |
| `meeting-closed`       | Meeting window closes                   | Informational. On short calls it can be the first event carrying a title       |
| `media-capture-status` | A stream starts or stops being captured | `{ window, type: 'video' \| 'audio', capturing }`                              |
| `permission-status`    | Once per permission at startup          | `granted`, `not_requested` or `denied`                                         |
| `permissions-granted`  | All permissions become available        | Signals a transition, so it does not fire on a launch where nothing changed    |
| `error`                | SDK-level error                         | `{ type, message }`. From 2.0.12 internal fatals stop capture and report here  |
| `shutdown`             | Native subprocess exits unexpectedly    | `{ code, signal }`                                                             |
| `log`                  | The SDK's own native-side logging       | `{ level, message, subsystem, category, window_id }`, invisible to `console.*` |

Two events still ship but are dead. `sdk-state-change` is deprecated, replaced by `recording-started` / `recording-ended`. `upload-progress` is inert, because uploads have streamed in parallel with recording since 2.0.0. `paused` has no replacement event, so `sdk-state-change` is worth revisiting only if pause and resume are ever added.

The SDK stops recording by itself when it detects the meeting ended, so `meeting-closed` is not the hook for auto-stop.

`media-capture-status`, `error`, `shutdown` and `log` drive no behaviour. They exist so a failure leaves a timestamped cause in the log file – see `docs/logging.md`. `meeting-closed` is mostly diagnostic too, but its handler calls `updateRecordingMetadata`, because on a short call it can be the first event carrying a title – removing the listener would file those calls as "Untitled Meeting".

## Window metadata arrives after detection

`meeting-detected` fires with `title: null`, and the title appears later on `meeting-updated` or `meeting-closed`. Anything read at detection time therefore records "Untitled Meeting". `updateRecordingMetadata` in `src/recall.js` fills it in from whichever event carries it first and keeps that first real title, because a later one is likelier to be a post-call screen.

`evt.window` also carries `platform` and `url` directly, and those are authoritative. `detectPlatform` only string-matches the title, so with the title null it always returned `unknown` – it is now only a fallback.

The consequence for the upload is permanent: see `docs/recall-api.md`, "The meeting title cannot be corrected".

## Permissions

Automatic acquisition is off and all three permissions are requested in code:

```javascript
RecallAiSdk.init({ api_url: API_BASE, acquirePermissionsOnStartup: [] });
await RecallAiSdk.requestPermission("accessibility");
await RecallAiSdk.requestPermission("microphone");
await RecallAiSdk.requestPermission("system-audio");
```

Request them sequentially. Every example Recall publishes does, concurrent requests are documented nowhere, and `Promise.all` races macOS dialogs on first launch for no gain.

| Permission      | Covers                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `accessibility` | Meeting detection, active-speaker tracking, participant metadata ([FAQ](https://docs.recall.ai/docs/desktop-recording-sdk-faq)) |
| `microphone`    | The local user's audio                                                                                                          |
| `system-audio`  | Remote participants' audio                                                                                                      |

`screen-capture` is not needed. It covered remote-participant audio and video, both replaced by `system-audio` and audio-only recording. Audio-only does not weaken speaker attribution, because participant events come from the accessibility APIs rather than from video capture.

`Info.plist`, via `extendInfo` in `forge.config.js`, must declare `NSMicrophoneUsageDescription` and `NSAudioCaptureUsageDescription`. Without the second, the system-audio dialog never appears in a packaged build.

Accessibility has no prompt, so requesting it cannot grant it – the user still adds the app under System Settings → Privacy & Security → Accessibility with the '+' button. The request call was removed once, when the toggle reset on every launch, and restored on 2.0.27. No mechanism is documented by which requesting an already-granted permission revokes it, and SDK 2.0.20 fixed "accessibility permission dialog appeared unintentionally on initial install on macOS". If the toggle stops persisting across restarts, this call is the first suspect.

Grants break on every rebuild unless the app is signed with a certificate – see `docs/patterns/code-signing.md`.
