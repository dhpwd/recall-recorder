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

### Window metadata arrives after detection

`meeting-detected` fires with `title: null`. The title appears later, on `meeting-updated` or `meeting-closed`, so anything read at detection time records "Untitled Meeting". `updateRecordingMetadata` in `recall.js` fills it in from whichever event carries it first, keeping the first real title – a later one is likelier to be a post-call screen.

`evt.window` also carries `platform` and `url` directly. `detectPlatform` only string-matches the title, so with the title null it always returned `unknown`; the SDK field is authoritative and the guess is now a fallback.

Known gap: the `metadata.meeting_title` sent to Recall on the SDK upload is captured at detection, before the title exists, so it stays "Untitled Meeting" on Recall's side. The local file gets the real title.

This cannot be corrected after the fact. `sdk_upload` is immutable – a PATCH returns `405 Method Not Allowed` with `Allow: GET, HEAD, OPTIONS`, and the only documented operations are `sdk_upload_create`, `sdk_upload_list` and `sdk_upload_retrieve`. The recording's `meeting_metadata` shortcut is empty for DSDK recordings, so it is no help either. Waiting for the title before creating the upload isn't an option – the upload token is needed to start recording, and the title takes a couple of seconds to arrive.

`recover-transcript.js` therefore takes the real title as an optional second argument.

### Diagnosing a failed recording

The diagnostic listeners exist so these failures are readable in `~/Library/Logs/Recall Recorder/main.log` after the fact. Both have been seen once and neither has a known cause; the SDK upgrade to 2.0.27 contains plausible fixes for each.

**Recording that never stops.** A healthy call logs `Meeting closed` and then, within a second or two, `Recording ended event received`.

| Log                                    | Reading                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `meeting-closed`, no `recording-ended` | The SDK saw the call end and did not stop the recording                              |
| Neither                                | Meeting-end detection failed                                                         |
| `error` or `shutdown`                  | The native subprocess died. Before 2.0.12 an internal fatal produced no event at all |

**Local microphone missing from a recording.** Silent – the file is complete apart from the local user's voice, so nothing surfaces until someone listens back. `media-capture-status` with `type: 'audio'` and `capturing: false` mid-call pins the moment capture stopped.

### Recording lifecycle

- The SDK auto-detects meeting windows and fires `meeting-detected`
- `recording-ended` fires when a recording stops – either because the SDK detected the meeting ended, or because `stopRecording()` was called manually
- The SDK handles auto-stop natively; no need to listen to `meeting-closed` for this purpose
- The native SDK binary runs as a separate process from Electron. If the Electron main process crashes, the native binary can still complete uploads during its own graceful shutdown

### Key SDK events

| Event                  | When                                                  | Notes                                                                                                                |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `meeting-detected`     | Video call window found                               | Contains `evt.window.id` and `evt.window.title`                                                                      |
| `recording-ended`      | Recording stops (auto or manual)                      | Triggers the upload → transcript flow                                                                                |
| `meeting-closed`       | Meeting window closes                                 | Informational – do not use to auto-stop (SDK handles this via `recording-ended`)                                     |
| `media-capture-status` | A stream starts or stops being captured               | `{ window, type: 'video' \| 'audio', capturing }` – `audio` + `capturing: false` mid-call is a mic dropout           |
| `error`                | SDK-level errors                                      | `{ type, message }`. From 2.0.12 internal fatals stop capture and report here                                        |
| `shutdown`             | Native subprocess exits unexpectedly                  | `{ code, signal }`                                                                                                   |
| `log`                  | SDK's own native-side logging                         | `{ level, message, subsystem, category, window_id }` – not visible through `console.*`                               |
| `recording-started`    | Recording begins                                      | Drives the tray's recording state                                                                                    |
| `sdk-state-change`     | SDK transitions between `idle`, `recording`, `paused` | Deprecated and unused. Still ships. `paused` has no replacement event, so revisit if pause/resume is ever added      |
| `upload-progress`      | During upload                                         | `{ window: { id }, progress: number }`. Deprecated and inert – uploads stream in parallel with recording since 2.0.0 |

`meeting-closed`, `media-capture-status`, `error`, `shutdown` and `log` drive no behaviour and exist only to make failures readable in the log file afterwards. They are the difference between "the recording stopped and we don't know why" and a timestamped cause.

### Permissions

**Problem:** the accessibility permission does not persist – the System Settings entry stops working after a rebuild, and at one point the toggle reset on every launch.

**What actually binds a grant:** the app's designated requirement, which under ad-hoc signing is the binary's cdhash. Every rebuild invalidates every grant. This is a signing property, not an SDK or API behaviour – see tech-context.md "Why permissions break on every rebuild" for the mechanism and the self-signed certificate that fixes it.

**Current arrangement:** automatic permission acquisition is off, and all three permissions are requested programmatically.

```javascript
RecallAiSdk.init({ api_url: API_BASE, acquirePermissionsOnStartup: [] });

await RecallAiSdk.requestPermission("accessibility");
await RecallAiSdk.requestPermission("microphone");
await RecallAiSdk.requestPermission("system-audio");
```

Request them sequentially. Every example Recall publishes does, and concurrent requests are documented nowhere – `Promise.all` races macOS dialogs on first launch for no gain.

Accessibility has no prompt, so the request cannot grant it; the user still adds the app via System Settings → Accessibility. The call was removed once, when the toggle reset on every launch, and restored on 2.0.27: no mechanism is documented by which requesting an already-granted permission revokes it, and SDK 2.0.20 fixed "accessibility permission dialog appeared unintentionally on initial install on macOS". If the toggle stops persisting across restarts, this call is the first suspect.

**Permission model (audio-only mode):** `accessibility` powers meeting detection, active-speaker tracking, and participant metadata (https://docs.recall.ai/docs/desktop-recording-sdk-faq). `microphone` records the local user's audio. `system-audio` records remote participants. `screen-capture` is not needed – it covered remote-participant audio and video, both of which `system-audio` and audio-only mode replace. Audio-only does not degrade speaker attribution: participant events come from the accessibility APIs, not from video capture.

**Post-build permission setup:** while the app is ad-hoc signed, remove any existing "Recall Recorder" entry in System Settings → Accessibility after installing a new build and re-add it via '+'. A self-signed certificate removes this step.

## Recall API

### Auth header format

`Authorization: Token {key}` – the `Token ` prefix is added in code (`recall.js`), the stored key is just the raw value.

### Transcript creation is explicit

Must call `POST /api/v1/recording/{id}/create_transcript/` after upload completes. Adding a provider API key to the Recall dashboard is necessary but not sufficient; transcription does not start automatically.

### Recording endpoint, not bot endpoint

SDK uploads use `GET /api/v1/recording/{id}/`, not `GET /api/v1/bot/{id}/` (returns 404). The transcript URL is at `media_shortcuts.transcript.data.download_url` directly on the recording object, not nested inside a `recordings` array.

### Accuracy levers available on assembly_ai_async

Confirmed present in Recall's `create_transcript` schema for `assembly_ai_async`:

- `keyterms_prompt` – array of domain-specific words or phrases, up to 200 on Universal-2 and 1000 on Universal-3 and later, max 6 words per phrase. Because the request lists `universal-2` as a fallback, treat 200 as the cap. In use: `src/keyterms.js` holds generic industry vocabulary, and `keyterms` in settings.json holds account and partner names – those stay out of the repository, which is public. Ordinary English words are excluded deliberately: biasing toward them costs accuracy elsewhere
- `custom_spelling` – find-and-replace applied to the finished transcript. Unused. It corrects a known wrong output rather than biasing recognition, so it is the tool for a name that keeps coming back the _same_ wrong way, where a keyterm hasn't helped. Shape:

  ```json
  "custom_spelling": [
    { "from": ["fidaro", "fedaro"], "to": "Fidero" },
    { "from": ["purchasely"], "to": "Purchasely" }
  ]
  ```

  `from` is a list of observed mistranscriptions, `to` the replacement. Add it alongside `keyterms_prompt` in `createTranscript`, and keep `recover-transcript.js` in step. Prefer a keyterm first – a replacement rule fires unconditionally and will corrupt a legitimate use of the same string

- `speaker_labels` – provider-side voice diarisation, generic A/B/C labels. Only for recovering a call where speaker-timeline diarisation collapsed

`punctuate`, `format_text` and `disfluencies` already default to what a clean business transcript wants.

### AssemblyAI parameter format

Uses `speech_models` (plural, list). The older `speech_model` (singular, string) format returns an error, and Recall's own AssemblyAI guide may still show it. Current models are in tech-context.md "Stack".

### Three-phase post-call flow

Recording is local, then uploaded after the call finishes. The post-call transcript flow has three polling phases:

1. Poll `GET /api/v1/sdk_upload/{id}/` every 30s until upload complete
2. `POST /api/v1/recording/{id}/create_transcript/` to trigger transcription
3. Poll `GET /api/v1/recording/{id}/` every 30s until transcript ready

If the app crashes mid-processing, the recording is likely already on Recall's servers (the native SDK binary completes uploads independently). Use `recover-transcript.js` to manually poll the API, create the transcript, and save it to the inbox.

### Re-transcribing an existing recording

`POST /api/v1/recording/{id}/create_transcript/` works even when a transcript already exists for that recording – it returns 200 and a new transcript ID. The new transcript is reachable at `GET /api/v1/transcript/{transcript_id}/` and its `data.download_url` once `status.code === "done"`. The recording's `media_shortcuts.transcript` shortcut may still point at the old one. Useful for recovery when the original transcript is unusable but the recording is intact.

### Diarisation on Desktop SDK: real names vs voice separation are mutually exclusive

The Desktop SDK only ever produces two audio streams – the local user's mic and a single mixed stream of all remote participants (system audio, mixed by the OS before Recall sees it). Per-participant remote streams are a Bot SDK feature.

This forces a choice between two diarisation modes when calling `create_transcript`:

| Mode                       | Params                                                                             | Output                                                                                           | Failure mode                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Speaker-timeline (default) | `diarization: { use_separate_streams_when_available: true \| false }`              | Real names from the meeting platform's participant list (`participant.name`, e.g. "Dan Hopwood") | Relies on the platform's active-speaker events. When those are ambiguous or missing, all remote audio collapses onto one participant identity |
| Machine (voice-based)      | `provider.assembly_ai_async.speaker_labels: true`, optional `speakers_expected: N` | Voice-separated speakers, but generic labels only (`A`, `B`, `C`, …)                             | Loses real names entirely – the provider has no way to map a voice to a platform participant                                                  |

`use_separate_streams_when_available` is essentially a no-op on Desktop SDK because separate streams aren't produced for remote participants. Setting it `false` does **not** switch to voice-based diarisation; it just falls back to speaker-timeline using active-speaker events, which is the same failure mode.

**Current stance:** keep speaker-timeline as the default. The vast majority of calls work correctly, and real names are worth the rare disaster. Recover affected calls case-by-case rather than paying for machine diarisation on every call.

**Trigger for the collapse:** two or more remote participants with the same Zoom (or other platform) display name. Confirmed once on 06/05/2026 (`de337443-...`):

- Recall's `participants` artefact had 4 entries but only 2 unique display names, each shared by two IDs (one participant had joined as "Guest" and been renamed mid-call)
- The `speaker_timeline` only ever fired events for two of those four IDs (id=32766 and id=1, 80 events). The other two (id=32767 and id=0) got zero active-speaker events
- AssemblyAI's voice diarisation later found 4 distinct voices in the same audio – so the merged participants really were different humans, not duplicates of the same voice
- Net effect: every remote voice was attributed to the single ID that did receive events

Platform identification is not the trigger – most calls render `platform: "unknown"` (only Teams gets identified) and work fine.

**How to recognise the failure:**

- A `[transcript] "<name>" covers N participant IDs` warning in the log. This is the direct signal – the transcript itself names duplicated participants `Name (1)`, `Name (2)`, so the condition is visible in the output rather than hidden by a merge
- Frontmatter shows 1–2 participants for a call you know had more
- One speaker has the vast majority of the body in a single massive paragraph (low turn-taking)
- The raw transcript JSON has a tiny number of segments (e.g. 2) for a long call

The warning fires on duplicate display names, which is the _trigger_ for the collapse, not the collapse itself – two people with the same name may still be attributed correctly. Treat it as a prompt to check, not a verdict.

**Cheap pre-flight check:** download `media_shortcuts.participant_events.data.participants_download_url` for the recording. If two or more entries share the same `name`, the timeline collapse is likely. This is a deterministic signal available before transcription completes.

**Recovery procedure:**

1. From the broken markdown, grab `recall_upload_id` from frontmatter
2. `GET /api/v1/sdk_upload/{upload_id}/` → `recording_id`
3. `POST /api/v1/recording/{recording_id}/create_transcript/` with body:
   ```json
   {
     "provider": {
       "assembly_ai_async": {
         "speech_models": ["universal-3-5-pro", "universal-2"],
         "language_code": "en_uk",
         "speaker_labels": true
       }
     }
   }
   ```
4. Poll `GET /api/v1/transcript/{transcript_id}/` until `status.code === "done"`, then download `data.download_url`
5. Pass segments to `transformTranscript` from `src/transcript.js` with the original `startTime`, `meetingTitle`, and `uploadId`. Save alongside the broken file with a `-voice-diarized` suffix
6. Speakers will be labelled `A`, `B`, `C`, … – relabel manually from context

Machine-diarised segments carry `participant: { id: null, name: "A" }`. Speaker identity there is the name, not the ID – `transformTranscript` keys on whichever is available, so keying on ID alone would merge every voice-separated speaker into one.

**Never re-run the default recovery path on a call that has already been recovered.** It creates a new transcript with the standard speaker-timeline settings, replacing the voice-separated one with the collapse it was recovered from. Use `--rerender` to write the markdown again from the transcript already on the recording:

```bash
node recover-transcript.js <upload-id> "Meeting title" --rerender
```

That creates nothing, costs nothing, and is also the way to apply a change in `src/transcript.js` to existing calls.

Docs: https://docs.recall.ai/docs/diarization
