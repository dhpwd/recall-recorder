# Recall Recorder

macOS menu bar app that auto-records video calls (Zoom, Meet, Teams) and saves speaker-attributed transcripts as markdown files via the Recall.ai Desktop SDK.

## Setup

```bash
npm install
cp .env.example .env
# Add your Recall API key to .env
```

You'll also need an AssemblyAI API key added to Recall's Transcription settings – see `memory-bank/tech-context.md` for full dashboard setup.

## Running

```bash
npm start
```

On first launch, macOS will prompt for Accessibility, Microphone, and Screen & System Audio Recording permissions. In dev mode these are attributed to your terminal app.

## Packaging

```bash
npm run make
codesign --force --deep --sign - --entitlements entitlements.plist "out/Recall Recorder-darwin-arm64/Recall Recorder.app"
rm -rf "/Applications/Recall Recorder.app"
cp -R "out/Recall Recorder-darwin-arm64/Recall Recorder.app" /Applications/
```

The packaged app reads the API key from Preferences (tray menu → Preferences) rather than `.env`.
