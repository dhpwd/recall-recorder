# Recovering a transcript

Transcript polling runs in the main process with nothing persisted, so quitting mid-processing loses the transcript. The recording itself is usually safe – the native SDK binary completes uploads independently of Electron – which is what makes recovery by hand possible. FID-553 covers making the app resilient instead.

```bash
node recover-transcript.js <upload-id> ["Meeting title"] [--rerender]
```

Find the upload ID in the broken file's `recall_upload_id` frontmatter, or list recent uploads:

```bash
curl -s -H "Authorization: Token $KEY" \
  "https://eu-central-1.recall.ai/api/v1/sdk_upload/?ordering=-created_at&limit=5"
```

The script reads the API key from `RECALL_API_KEY` or from `~/Library/Application Support/Recall Recorder/settings.json`. It cannot require `src/settings.js`, which pulls in Electron.

Pass the title as the second argument. The stored one is almost always "Untitled Meeting" and cannot be corrected on Recall's side – see `docs/recall-api.md`.

## Which route to take

| Situation                                                                       | Route                                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| App quit before the transcript arrived                                          | Default – waits for the recording, creates a transcript, saves it |
| `src/transcript.js` changed and existing files need re-rendering                | `--rerender`                                                      |
| The call's transcript was already recovered with different diarisation settings | `--rerender`                                                      |
| Speaker attribution collapsed onto one participant                              | Voice diarisation, below                                          |

`--rerender` writes the markdown again from the transcript already on the recording. It creates nothing and costs nothing.

Never re-run the default route on a call that has already been recovered. It requests speaker-timeline diarisation again and replaces the voice-separated transcript with the collapse it was recovered from.

## Recovering a collapsed call with voice diarisation

Only for a call where speaker-timeline attribution merged several remote voices onto one participant. `docs/patterns/diarisation.md` covers how to recognise that and why the trade-off exists. This is a manual sequence rather than a script route.

1. Take `recall_upload_id` from the broken file's frontmatter
2. `GET /api/v1/sdk_upload/{upload_id}/` → `recording_id`
3. `POST /api/v1/recording/{recording_id}/create_transcript/` with:

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
5. Pass the segments to `transformTranscript` with the original `startTime`, `meetingTitle` and `uploadId`, and save alongside the broken file with a `-voice-diarized` suffix
6. Speakers come back as `A`, `B`, `C` and need relabelling from context
