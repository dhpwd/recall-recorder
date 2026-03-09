# System Patterns

## Recall Desktop SDK

### Method signatures require `{ windowId }`

**Problem:** SDK methods that operate on a recording window require a named `{ windowId }` parameter, not a positional argument. Calling `stopRecording()` without it throws `TypeError: Cannot destructure property 'windowId' of 'undefined'`.

**Solution:** Always pass `{ windowId }` from `currentRecording.windowId` or the event's `evt.window.id`.

```javascript
// Correct
await RecallAiSdk.stopRecording({ windowId: currentRecording.windowId });

// Wrong – crashes at runtime
await RecallAiSdk.stopRecording();
```

**Affected methods:** `stopRecording`, `pauseRecording`, `resumeRecording`, `uploadRecording`

**When `stopRecording` fails:** Fall back to `RecallAiSdk.shutdown()` then re-init. This is a nuclear option (kills the SDK subprocess) but prevents the app from getting stuck in an unrecoverable state.

### Recording lifecycle

- The SDK auto-detects meeting windows and fires `meeting-detected`
- `recording-ended` fires when a recording stops – either because the SDK detected the meeting ended, or because `stopRecording()` was called manually
- The SDK handles auto-stop natively; no need to listen to `meeting-closed` for this purpose
- The native SDK binary runs as a separate process from Electron. If the Electron main process crashes, the native binary can still complete uploads during its own graceful shutdown

### Key SDK events

| Event              | When                                                  | Notes                                                                            |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `meeting-detected` | Video call window found                               | Contains `evt.window.id` and `evt.window.title`                                  |
| `recording-ended`  | Recording stops (auto or manual)                      | Triggers the upload → transcript flow                                            |
| `meeting-closed`   | Meeting window closes                                 | Informational – do not use to auto-stop (SDK handles this via `recording-ended`) |
| `sdk-state-change` | SDK transitions between `idle`, `recording`, `paused` | Used to update tray menu state                                                   |
| `upload-progress`  | During upload                                         | `{ window: { id }, progress: number }`                                           |
| `error`            | SDK-level errors                                      | `{ type, message }`                                                              |
| `shutdown`         | Native subprocess exits unexpectedly                  | `{ code, signal }`                                                               |

### Permissions

**Problem:** After rebuilds, the accessibility permission would not persist – the toggle in System Settings reset on every app launch. Root cause uncertain: possibly `requestPermission("accessibility")` interacting badly with ad-hoc signing, or stale accessibility entries from previous builds, or both.

**Solution:** Disable automatic permission acquisition and only request microphone and screen-capture programmatically. Let the user grant accessibility manually via System Settings.

```javascript
RecallAiSdk.init({ api_url: API_BASE, acquirePermissionsOnStartup: [] });

// Only request permissions that can be granted via prompt
await RecallAiSdk.requestPermission("microphone");
await RecallAiSdk.requestPermission("screen-capture");
// Accessibility must be set manually in System Settings (requesting it programmatically
// was correlated with the toggle-reset issue, though Recall's docs say it should be safe)
```

**Post-build permission setup:** After installing a new build, remove any existing "Recall Recorder" entries in System Settings → Accessibility, then re-add via the '+' button. The binary hash changes on each build, so stale entries won't work.

## Recall API

### Auth header format

`Authorization: Token {key}` – the `Token ` prefix is added in code (`recall.js`), the stored key is just the raw value.

### Transcript creation is explicit

Must call `POST /api/v1/recording/{id}/create_transcript/` after upload completes. Adding a provider API key to the Recall dashboard is necessary but not sufficient; transcription does not start automatically.

### Recording endpoint, not bot endpoint

SDK uploads use `GET /api/v1/recording/{id}/`, not `GET /api/v1/bot/{id}/` (returns 404). The transcript URL is at `media_shortcuts.transcript.data.download_url` directly on the recording object, not nested inside a `recordings` array.

### AssemblyAI parameter format

Uses `speech_models: ["universal-3-pro"]` (plural, list). The older `speech_model` (singular, string) format returns an error. Recall docs may reference the old format.

### Three-phase post-call flow

Recording is local, then uploaded after the call finishes. The post-call transcript flow has three polling phases:

1. Poll `GET /api/v1/sdk_upload/{id}/` every 30s until upload complete
2. `POST /api/v1/recording/{id}/create_transcript/` to trigger transcription
3. Poll `GET /api/v1/recording/{id}/` every 30s until transcript ready

If the app crashes mid-processing, the recording is likely already on Recall's servers (the native SDK binary completes uploads independently). Use `recover-transcript.js` to manually poll the API, create the transcript, and save it to the inbox.
