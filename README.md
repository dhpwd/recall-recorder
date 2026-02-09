# Recall Recorder

Desktop app for automatic call recording and transcription. Runs as a macOS menu bar app, detects video calls (Zoom, Google Meet, Teams), records via the Recall.ai Desktop SDK, and saves speaker-attributed transcripts as markdown files.

## Prerequisites

- **Node.js** (v18+)
- **Xcode Command Line Tools** – required for native Electron builds on macOS
- **Recall.ai account** – [eu-central-1 dashboard](https://eu-central-1.recall.ai)
- **AssemblyAI account** – API key added to Recall's Transcription settings

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and add your Recall API key
```

### Recall Dashboard Configuration

1. Sign up at [eu-central-1.recall.ai](https://eu-central-1.recall.ai)
2. Create an API key and add it to `.env`:
   ```
   RECALL_API_KEY=your-key-here
   ```
3. Go to Transcription settings and add your **AssemblyAI API key**
4. Set the AssemblyAI endpoint – `api.eu.assemblyai.com` for EU, `api.assemblyai.com` for US

## Running (Dev Mode)

```bash
npm start
```

The app launches as a menu bar icon. On first launch, macOS will prompt for Accessibility, Microphone, and Screen & System Audio Recording permissions.

In dev mode, permission dialogs are attributed to your terminal app (e.g. iTerm) rather than Recall Recorder – this is normal. Grant permissions to the terminal for development

## How It Works

1. The Recall Desktop SDK monitors for video call windows
2. When a meeting is detected, the app creates an SDK upload via the Recall API and starts recording
3. After the call ends, the recording uploads to Recall
4. The app requests an async transcript (AssemblyAI Universal 3 Pro, British English, with speaker diarisation)
5. Once the transcript is ready, it's saved as a markdown file to `~/call-transcripts/inbox/`

## Transcript Format

Files are saved with the format `YYYY-MM-DD_HHmm_meeting-title.md`:

```markdown
---
date: "2026-02-08T14:30:00.000Z"
platform: "zoom"
meeting_title: "Discovery Call"
participants:
  - Speaker 0
  - Speaker 1
duration_minutes: 45
recall_upload_id: "4abf29fc-36b5-4853-9f84-a9990b9e354b"
---

[00:00:05] Speaker 0: Hello, thanks for joining.

[00:00:13] Speaker 1: Thanks for having us.
```

The inbox folder is configurable in Preferences.

## Packaging

```bash
npm run make
cp -R "out/Recall Recorder-darwin-arm64/Recall Recorder.app" /Applications/
```

The packaged app reads the API key from Preferences (tray menu → Preferences) rather than `.env`. You'll also need to grant macOS permissions separately for the packaged app via System Settings → Privacy & Security.
