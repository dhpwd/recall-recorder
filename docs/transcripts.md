# Transcript output

`src/transcript.js` turns Recall's JSON segments into the markdown file. `saveTranscript` writes it, `transformTranscript` renders it, and `recover-transcript.js` calls both, so a change to rendering changes recovery too.

## File contract

Files are named `YYYY-MM-DD_HHmm_meeting-title.md`, with the slug lowercased, non-alphanumerics collapsed to hyphens and truncated to 60 characters. They land in the inbox folder, `~/call-transcripts/inbox/` by default and configurable in Preferences.

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

`duration_minutes` comes from `endTime - startTime` when the app recorded a `recording-ended`, and otherwise from the last word's offset into the recording. The clock at save time is not the end of the call – saving happens after transcript polling, which can add tens of minutes.

## Speaker labels

What identifies one speaker differs by diarisation mode, so `participantKey` keys on the participant ID when there is one and on the name otherwise. Machine-diarised segments carry `participant: { id: null, name: "A" }`, so keying on ID alone would merge every voice-separated speaker into one. Participant id `0` is a real ID and falsy, so the check is for `undefined` and `null` rather than truthiness.

Two participant IDs sharing a display name both get a number – `Name (1)` and `Name (2)` – and a `[transcript] "<name>" covers N participant IDs` warning goes to the log. Merging them would hide the speaker-timeline collapse described in `docs/patterns/diarisation.md`, since a collapsed transcript otherwise looks exactly like a healthy one. Numbering both matters: one plain and one suffixed reads as though the plain one is the real participant.

Participants with no `name` at all, such as PSTN dial-ins, render as `Speaker <id>`, so one call can mix real names with numbered speakers.

## Keyterms

`keyterms_prompt` biases recognition toward words that would otherwise come back wrong. `src/keyterms.js` holds generic industry and tool vocabulary only, because the repository is public. Account, customer and partner names go in `keyterms` in the user's `settings.json`, and `buildKeyterms` merges the two.

Keep the combined total under 200 phrases at 6 words each, the Universal-2 cap that applies because the request lists that model as a fallback. Ordinary English words are deliberately absent – biasing toward a common word costs accuracy elsewhere and it transcribes correctly anyway.
