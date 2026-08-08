# Product Context

## Why this exists

Granola replacement. Need call transcripts in a local folder structure that can be processed alongside prospect/customer context using Claude Code. Commercial transcription tools don't integrate well with this workflow.

## How it works

1. The Recall Desktop SDK monitors for video call windows (Zoom, Meet, Teams, Webex)
2. When a meeting is detected, the app creates an SDK upload via the Recall API and starts recording
3. After the call ends, the recording uploads to Recall
4. The app requests an async transcript (AssemblyAI, British English, with speaker diarisation)
5. Once the transcript is ready, it's saved as a markdown file with YAML frontmatter to the inbox folder

## UX model

- Tray-only app – no dock icon, no main window. Preferences shown in a BrowserWindow on demand
- macOS notifications for recording start, transcript saved, and errors
- Transcript files named `YYYY-MM-DD_HHmm_meeting-title.md`

## Transcript format

Markdown with YAML frontmatter. Example:

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

`meeting_url` is omitted when the SDK doesn't report one. All string values are escaped, since real meeting titles and participant names contain quotes and colons.

The inbox folder is configurable in Preferences.
