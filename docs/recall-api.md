# Recall API

Base URL `https://eu-central-1.recall.ai`. Other regions are `us-west-2` (pay-as-you-go), `us-east-1` (monthly) and `ap-northeast-1` (Japan). Transcription runs through AssemblyAI, whose API key is configured in Recall's dashboard rather than here, along with the AssemblyAI endpoint – `api.eu.assemblyai.com` for EU, `api.assemblyai.com` for US.

Auth is `Authorization: Token {key}`. The `Token ` prefix is added in `src/recall.js`, so the stored key is the raw value.

## Creating the upload

`POST /api/v1/sdk_upload/` returns `{ id, upload_token }`, and the token is what `startRecording` needs. The body accepts only `recording_config`, `_1080p` and `metadata`.

```json
{
  "metadata": { "meeting_title": "Discovery Call" },
  "recording_config": { "video_mixed_mp4": null, "audio_mixed_mp3": {} }
}
```

`video_mixed_mp4` is on by default, so audio-only recording has to null it explicitly. `audio_mixed_mp3` is off by default, so it has to be set to `{}`. The meeting title travels inside `metadata` – sent at the top level it is dropped, leaving recovery with no title to read back.

Request and response name the same artefacts differently. `recording_config` takes `video_mixed_mp4` and `audio_mixed_mp3`, while the recording's `media_shortcuts` drops the format suffix and returns `video_mixed` and `audio_mixed`.

### The meeting title cannot be corrected

The title is captured at detection, before the platform reports one, so `metadata.meeting_title` stays "Untitled Meeting" on Recall's side even though the local file gets the real title. `sdk_upload` is immutable: PATCH returns `405 Method Not Allowed` with `Allow: GET, HEAD, OPTIONS`, and the only documented operations are `sdk_upload_create`, `sdk_upload_list` and `sdk_upload_retrieve`. The recording's `meeting_metadata` shortcut is empty for Desktop SDK recordings, so it is no help either.

Waiting for the title before creating the upload is not an option, because the upload token is needed to start recording and the title takes a couple of seconds to arrive. `recover-transcript.js` therefore takes the real title as an optional second argument.

## Post-call flow

Recording is local and uploads after the call finishes, in three polling phases at 30s intervals:

1. `GET /api/v1/sdk_upload/{id}/` until `status.code === "complete"`, which yields `recording_id`
2. `POST /api/v1/recording/{id}/create_transcript/` to trigger transcription
3. `GET /api/v1/recording/{id}/` until `media_shortcuts.transcript.status.code === "done"`, then download `media_shortcuts.transcript.data.download_url`

SDK uploads use the recording endpoint, not `GET /api/v1/bot/{id}/`, which returns 404. The transcript URL sits directly on the recording object, not nested in a `recordings` array.

Transcription never starts on its own. Adding a provider API key in the Recall dashboard is necessary but not sufficient – the `create_transcript` call is what starts it.

## Transcript provider options

The request body sent by both `src/recall.js` and `recover-transcript.js`:

```json
{
  "provider": {
    "assembly_ai_async": {
      "speech_models": ["universal-3-5-pro", "universal-2"],
      "language_code": "en_uk",
      "keyterms_prompt": ["..."]
    }
  },
  "diarization": { "use_separate_streams_when_available": true }
}
```

`speech_models` is plural and a list. The older singular `speech_model` string returns an error, and Recall's own AssemblyAI guide may still show it. Recall does not validate the models – there is no enum, and the array passes straight through – so a wrong string fails the transcript rather than the API call. [AssemblyAI's model list](https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model) is authoritative. FID-555 covers sharing this body between the two callers instead of keeping them in step by hand.

`punctuate`, `format_text` and `disfluencies` already default to what a clean business transcript wants.

### Accuracy levers

- `keyterms_prompt` – domain words and phrases to bias recognition toward. Up to 200 on Universal-2 and 1000 on Universal-3 and later, 6 words per phrase. The request lists `universal-2` as a fallback, so 200 is the cap that applies. See `docs/transcripts.md` for what goes in it
- `custom_spelling` – find-and-replace over the finished transcript, currently unused. It corrects a known wrong output rather than biasing recognition, so it is the tool for a name that keeps coming back the _same_ wrong way when a keyterm has not helped. A replacement fires unconditionally and will corrupt a legitimate use of the same string, so try a keyterm first

  ```json
  "custom_spelling": [
    { "from": ["fidaro", "fedaro"], "to": "Fidero" }
  ]
  ```

- `speaker_labels` – provider-side voice diarisation with generic A/B/C labels. Only for recovering a call where speaker-timeline attribution collapsed, described in `docs/patterns/diarisation.md`

### Verifying which model ran

API acceptance is not proof the change took. The raw provider response sits beside the transcript at `media_shortcuts.transcript.data.provider_data_download_url` and records what was requested and what ran:

```
$.parts[*].data.body.speech_models     = ["universal-3-5-pro","universal-2"]
$.parts[*].data.body.speech_model_used = "universal-3-5-pro"
```

`parts` runs submission first, then completion, so `speech_model_used` is null in the earlier entries and set in the later ones. `speech_model` singular is legacy and stays null when the plural form is used. Read the same payload for provider-side warnings when a transcript comes back poor.

## Re-transcribing an existing recording

`POST /api/v1/recording/{id}/create_transcript/` works even when the recording already has a transcript. It returns 200 and a new transcript ID, reachable at `GET /api/v1/transcript/{transcript_id}/` and its `data.download_url` once `status.code === "done"`. The recording's `media_shortcuts.transcript` may still point at the old one. This is the route for recovering a call whose transcript is unusable but whose recording is intact – see `docs/recovery.md`.
