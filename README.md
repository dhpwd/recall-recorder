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

## Running

```bash
npm start
```

The app launches as a menu bar icon. On first launch, macOS will prompt for Accessibility, Microphone, and Screen Recording permissions.

**Note:** In dev mode, permission dialogs are attributed to your terminal app rather than Recall Recorder – see [macOS Permissions in Dev Mode](#macos-permissions-in-dev-mode).

## How It Works

1. The Recall Desktop SDK monitors for video call windows
2. When a meeting is detected, the app creates an SDK upload via the Recall API and starts recording
3. After the call ends, the recording uploads to Recall
4. The app requests an async transcript (AssemblyAI Universal 3 Pro with speaker diarisation)
5. Once the transcript is ready, it's saved as a markdown file with YAML frontmatter

## Transcript Output

Files are saved to `~/call-transcripts/inbox/` (configurable in Preferences) with the format `YYYY-MM-DD_HHmm_meeting-title.md`:

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

## Gotchas

### Recall API Region

Valid regions:

| Region             | URL                        |
| ------------------ | -------------------------- |
| US (Pay-as-you-go) | `us-west-2.recall.ai`      |
| US (Monthly)       | `us-east-1.recall.ai`      |
| EU                 | `eu-central-1.recall.ai`   |
| Japan              | `ap-northeast-1.recall.ai` |

### Transcription Is Not Automatic

Adding a provider API key to the Recall dashboard is necessary but not sufficient. You must also **explicitly call** `POST /api/v1/recording/{id}/create_transcript/` after the recording completes. Transcription does not happen automatically when an SDK upload finishes.

### AssemblyAI Parameter Format

AssemblyAI now requires `speech_models` (plural, as a list) rather than the older `speech_model` (singular string). The Recall docs may reference the old format.

Correct (current):

```json
{ "speech_models": ["universal-3-pro"] }
```

Wrong (outdated):

```json
{ "speech_model": "universal" }
```

### Recording Endpoint vs Bot Endpoint

Desktop SDK uploads produce **recordings**, not bots. Use `GET /api/v1/recording/{id}/` to retrieve transcript status – **not** `GET /api/v1/bot/{id}/` (which returns 404).

The transcript URL is at `media_shortcuts.transcript.data.download_url` directly on the recording object (not nested inside a `recordings` array like the bot endpoint).

### Webpack and Native SDK Binary

The Recall Desktop SDK includes a native macOS binary (`desktop_sdk_macos_exe`) and Frameworks directory. When using webpack (e.g. Electron Forge webpack template):

- The binary and Frameworks must be copied to the webpack output directory via `copy-webpack-plugin`
- Execute permissions are lost during copy – a post-build plugin (`FixPermissionsPlugin` in `webpack.main.config.js`) restores them
- For packaging, configure `asar.unpack` to keep native binaries outside the archive

### macOS Permissions in Dev Mode

Permission prompts (Accessibility, Microphone, Screen Recording) are attributed to the **terminal app** that launched Electron, not the app itself. Grant permissions to your terminal (e.g. iTerm, Terminal.app) for development. The packaged `.app` will prompt under its own name.

## Packaging

```bash
npm run make
```

This produces a standalone `.app` in the `out/` directory. The `overrides` in `package.json` use Recall's fork of `@electron/osx-sign` which is required for the Desktop SDK's code signing requirements.
