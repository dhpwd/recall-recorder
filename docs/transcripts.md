# Transcript output

`src/transcript.js` turns Recall's JSON segments into the markdown file. `transformTranscript` renders it and `saveTranscript` writes it. `recover-transcript.js` imports `transformTranscript` and `buildFilename` but writes through its own `saveToInbox`, so a change to rendering reaches recovery while a change to the write path does not.

## File contract

Files are named `YYYY-MM-DD_HHmm_meeting-title.md`, with the slug lowercased, non-alphanumerics collapsed to hyphens and truncated to 60 characters. `buildFilename` takes the date from `toISOString()` (UTC) and the time from `getHours()` (local), so outside UTC the two halves disagree either side of midnight.

The app writes to the inbox folder, `~/call-transcripts/inbox/` by default and configurable in Preferences. `recover-transcript.js` hardcodes the default and never reads `settings.inboxFolder`, so a configured inbox and a recovered transcript end up in different directories.

```markdown
---
date: "2026-02-08T14:30:00.000Z"
platform: "zoom"
meeting_title: "Discovery Call"
meeting_url: "https://zoom.us/j/00000000000/"
participants:
  - "Speaker 0"
  - "Speaker 1"
duration_minutes: 45
recall_upload_id: "4abf29fc-36b5-4853-9f84-a9990b9e354b"
---

[00:00:05] Speaker 0: Hello, thanks for joining.

[00:00:13] Speaker 1: Thanks for having us.
```

`meeting_url` is omitted when the SDK reports none. Every string value is quoted and escaped, because real meeting titles and participant names contain quotes and colons and would otherwise emit invalid YAML.

A separate processing workflow consumes these fields, so renaming or dropping one is a breaking change rather than a formatting choice.

`duration_minutes` comes from `endTime - startTime` whenever both are present, and otherwise from the last word's offset into the recording. The app sets `endTime` when `recording-ended` fires, and recovery sets it from the recording's `completed_at`, so the fallback only applies to a recording that has neither. The clock at save time is not the end of the call – saving happens after transcript polling, which can add tens of minutes.

## Speaker labels

What identifies one speaker differs by diarisation mode, so `participantKey` keys on the participant ID when there is one and on the name otherwise. Machine-diarised segments carry `participant: { id: null, name: "A" }`, so keying on ID alone would merge every voice-separated speaker into one. Participant id `0` is a real ID and falsy, so the check is for `undefined` and `null` rather than truthiness.

Two participant IDs sharing a display name both get a number – `Name (1)` and `Name (2)` – and a `[transcript] "<name>" covers N participant IDs` warning goes to the log. Merging them would hide the speaker-timeline collapse described in `docs/patterns/diarisation.md`, since a collapsed transcript otherwise looks exactly like a healthy one. Numbering both matters: one plain and one suffixed reads as though the plain one is the real participant.

Participants with no `name` at all, such as PSTN dial-ins, render as `Speaker <id>`, so one call can mix real names with numbered speakers.

## Keyterms

`keyterms_prompt` biases recognition toward words that would otherwise come back wrong. `src/keyterms.js` holds generic industry and tool vocabulary only, because the repository is public. Account, customer and partner names go in `keyterms` in the user's `settings.json`, and `buildKeyterms` merges the two.

`docs/recall-api.md` owns the provider limits the list has to fit. Ordinary English words are deliberately absent – biasing toward a common word costs accuracy elsewhere and it transcribes correctly anyway.
