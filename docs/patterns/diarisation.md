# Diarisation on the Desktop SDK

**Problem:** real participant names and reliable voice separation are mutually exclusive, and the failure mode of the option in use is a transcript that looks perfectly normal while attributing every remote voice to one person.

The Desktop SDK only ever produces two audio streams – the local user's mic, and a single mixed stream of all remote participants, mixed by the OS before Recall sees it. Per-participant remote streams are a Bot SDK feature. That forces a choice at `create_transcript`:

| Mode                       | Params                                                                             | Output                                          | Failure mode                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Speaker-timeline (default) | `diarization: { use_separate_streams_when_available: true \| false }`              | Real names from the platform's participant list | Relies on the platform's active-speaker events. When those are ambiguous or missing, all remote audio collapses onto one participant |
| Machine (voice-based)      | `provider.assembly_ai_async.speaker_labels: true`, optional `speakers_expected: N` | Voice-separated speakers                        | Generic labels only (`A`, `B`, `C`), because the provider cannot map a voice to a platform participant                               |

`use_separate_streams_when_available` is effectively a no-op here, since separate remote streams are never produced. Setting it `false` does not switch to voice-based diarisation – it falls back to speaker-timeline using active-speaker events, which is the same failure mode.

**Solution:** keep speaker-timeline as the default and recover affected calls one at a time. The vast majority of calls attribute correctly, real names are worth the rare disaster, and machine diarisation would pay for the failure on every call. `docs/recovery.md` has the recovery procedure. [Recall's diarisation docs](https://docs.recall.ai/docs/diarization).

## Recognising a collapse

The trigger is two or more remote participants sharing a display name on the meeting platform. Platform identification is not involved – most calls render `platform: "unknown"` and work fine.

- A `[transcript] "<name>" covers N participant IDs` warning in the log. This is the direct signal, and the transcript names the duplicated participants `Name (1)` and `Name (2)` so the condition is visible in the output rather than hidden by a merge
- Frontmatter shows one or two participants for a call known to have had more
- One speaker holds the vast majority of the body in a single massive paragraph, with little turn-taking
- The raw transcript JSON has very few segments for a long call

The warning fires on duplicate display names, which is the trigger for a collapse rather than the collapse itself – two people with the same name may still be attributed correctly. Treat it as a prompt to check.

**Pre-flight check, one request:** download `media_shortcuts.participant_events.data.participants_download_url` for the recording. Two or more entries sharing a `name` make the collapse likely, and this is available before transcription completes.

Confirmed once, on 6th May 2026. The `participants` artefact held 4 entries but only 2 unique display names, each shared by two IDs, one participant having joined as "Guest" and been renamed mid-call. The `speaker_timeline` only ever fired events for two of those IDs, 80 events between them, and the other two got none. AssemblyAI's voice diarisation later found 4 distinct voices in the same audio, so the merged participants really were different people.
