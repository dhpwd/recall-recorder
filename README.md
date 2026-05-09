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

## In-person recording

For meetings without a video call window, hit `⌘⌥R` (Cmd+Option+R) to start a mic-only recording (or use the tray menu's "Start In-Person Recording"). A small floating indicator shows in the top-right with a timer; press `⌘⌥R` again to stop. Audio is uploaded to AssemblyAI directly and saved as a transcript in your inbox folder.

Configure via `.env` (see `.env.example`):

- `ASSEMBLYAI_API_KEY` – required
- `IN_PERSON_MAX_DURATION_MINUTES` – auto-stop limit (default `60`)
- `IN_PERSON_SHORTCUT` – Electron accelerator string (default `Command+Option+R`); the shortcut is registered system-wide while the app runs

The packaged app reads these from Preferences → "In-person recording" instead.

## Packaging

```bash
npm run make
codesign --force --deep --sign - --entitlements entitlements.plist "out/Recall Recorder-darwin-arm64/Recall Recorder.app"
rm -rf "/Applications/Recall Recorder.app"
cp -R "out/Recall Recorder-darwin-arm64/Recall Recorder.app" /Applications/
```

The packaged app reads the API key from Preferences (tray menu → Preferences) rather than `.env`.

## License

MIT – see [LICENSE](LICENSE).
