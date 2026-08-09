# Recall Recorder

macOS menu bar app that auto-records video calls (Zoom, Meet, Teams, Webex) and saves speaker-attributed transcripts as markdown files via the Recall.ai Desktop SDK.

Requires macOS 14.2+ on Apple Silicon. Recording is audio-only, and the system-audio permission it needs is unavailable below 14.2.

[I replaced Granola in 2 hours](https://danhopwood.com/posts/i-replaced-granola-in-2-hours) covers why this exists and what it was built against. It describes the first release, so follow this README rather than the post for setup and current behaviour.

## Setup

```bash
npm install
cp .env.example .env
# Add your Recall API key to .env
```

You'll need a [Recall.ai](https://eu-central-1.recall.ai) account and an AssemblyAI account. In the Recall dashboard:

1. Create an API key and add it to `.env` as `RECALL_API_KEY`
2. Open Transcription settings and add your AssemblyAI API key
3. Set the AssemblyAI endpoint – `api.eu.assemblyai.com` for EU, `api.assemblyai.com` for US

Building also needs Node.js 18+ and the Xcode Command Line Tools.

## Running

```bash
npm start
```

On first launch, macOS prompts for all three permissions. Microphone and System Audio Recording are granted from their prompts. Accessibility is the exception: its prompt cannot grant anything and instead takes you to System Settings → Privacy & Security → Accessibility, where you enable Recall Recorder on the toggle. It should already be listed there, and the '+' button is the fallback if it isn't. In dev mode all three are attributed to your terminal app, so the packaged app needs its own grants – they don't carry over.

## Transcription accuracy

`src/keyterms.js` biases transcription toward analytics and data-platform vocabulary, which is what this app was built for. Company, customer and product names are the words most likely to come back wrong, and those are yours rather than the repository's. Add them to `keyterms` in your settings file, created on first launch:

```
~/Library/Application Support/Recall Recorder/settings.json
```

```json
{
  "keyterms": ["Acme Corp", "Widgets Pro", "Northwind"]
}
```

Quit the app before editing, or it may overwrite the file when it next saves. The list is merged with the built-in vocabulary and sent to AssemblyAI on every transcript.

Keep the combined total under 200 phrases, with a maximum of 6 words per phrase. The 200 is Universal-2's cap, which applies because the request lists that model as a fallback. Leave out ordinary English words: biasing toward a common word costs accuracy elsewhere, and it transcribes correctly anyway.

If a name keeps coming back the _same_ wrong way and a keyterm hasn't helped, `custom_spelling` is the next lever. See `docs/recall-api.md`.

## Code signing

You need a signing certificate before packaging. It is what makes macOS permissions persist across rebuilds, so it matters even if you never distribute the app.

macOS binds each permission grant to the app's _designated requirement_, a signing expression it re-evaluates on every access. Ad-hoc signing (`codesign --sign -`) has no certificate, so that expression falls back to a hash of the exact binary, and **every rebuild invalidates every permission you granted**, with nothing to tell you it has happened. Accessibility is where you notice, because it has no prompt to re-trigger – it just stops working.

Any real certificate fixes this, because the requirement pins to the certificate rather than the binary.

### Option 1 – self-signed (free)

Right choice if you're building this for yourself. Create the certificate once:

1. Open **Keychain Access** → menu **Certificate Assistant → Create a Certificate…**
2. Name it `Recall Recorder Local Signing`, **Identity Type**: Self Signed Root, **Certificate Type**: Code Signing
3. Stop `codesign` prompting on every signed file – macOS needs the key's partition list set, which Keychain Access doesn't do for you:

   ```bash
   printf 'Keychain password: '; stty -echo; read KCPW; stty echo; echo
   security set-key-partition-list -S apple-tool:,apple:,codesign: -s \
     -k "$KCPW" ~/Library/Keychains/login.keychain-db
   unset KCPW
   ```

   Without this, `codesign` asks for your keychain password once per file it signs – hundreds of prompts per build, and "Allow" answers only one of them.

The build looks for this certificate name by default, so nothing else needs configuring.

Limitations: the certificate lives only in that Mac's login keychain, so the app can't be distributed (Gatekeeper rejects self-signed certificates on anything downloaded). Losing the keychain means a new certificate, and re-granting permissions once.

### Option 2 – Developer ID Application (requires Apple Developer Program)

You need this only to install the app on a Mac other than the one that builds it. The certificate is trusted, works across machines, and can be notarised.

Install the certificate, then point the build at it:

```bash
export CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
```

For distribution you'll also want notarisation, via an `osxNotarize` block in `forge.config.js` – see [Electron Forge's macOS signing guide](https://www.electronforge.io/guides/code-signing/code-signing-macos). Notarisation is a Gatekeeper concern and makes no difference to permission persistence.

### Verifying

```bash
codesign -d -r- "out/Recall Recorder-darwin-arm64/Recall Recorder.app"
```

The output must **not** contain `cdhash`. If it does, the app was ad-hoc signed and permissions will break on the next build.

## Packaging

```bash
npm run make
rm -rf "/Applications/Recall Recorder.app"
cp -R "out/Recall Recorder-darwin-arm64/Recall Recorder.app" /Applications/
```

`npm run make` signs the app – there is no separate `codesign` step. Check a build before installing it:

```bash
codesign --verify --deep --strict "out/Recall Recorder-darwin-arm64/Recall Recorder.app"
codesign -d --entitlements - "out/Recall Recorder-darwin-arm64/Recall Recorder.app"
```

The first prints nothing on success. The second must list all five keys from `entitlements.plist`.

The packaged app reads the API key from Preferences (tray menu → Preferences) rather than `.env`.

### After changing signing identity

Anything macOS bound to the old identity stops matching, so the first build signed with a different certificate needs some one-off cleanup.

Reset the stale permission grants:

```bash
tccutil reset Accessibility com.fidero.recall-recorder
tccutil reset Microphone com.fidero.recall-recorder
tccutil reset AudioCapture com.fidero.recall-recorder
```

The permission grants should then be the last ones you need. If they break again after a later rebuild, the certificate isn't producing a stable identity – check the `codesign -d -r-` output above for `cdhash`.

If you are upgrading from a build older than this one, you may have leftover `Recall Recorder Safe Storage` keychain items. Clear them once, with the app quit:

```bash
while security delete-generic-password -s "Recall Recorder Safe Storage" >/dev/null 2>&1; do :; done
```

Current builds don't create that item at all (see "Cookie encryption" below).

### Cookie encryption

Electron's `EnableCookieEncryption` fuse is off. With it on, Chromium encrypts its cookie store using a key in the login keychain, and **that keychain item's access list does not survive a rebuild** – not even with a stable signing certificate, and not even when the app created the item itself. Unlike macOS permission grants, which bind to the designated requirement and are stable, this prompts for your keychain password on the first launch of every build you make.

Nothing is protected by turning it on here: the only window loads local content and holds no cookies, the app never calls `safeStorage`, and the API key is already stored as plain JSON in `settings.json`. Turn it back on if a window ever authenticates against a remote service, and accept a keychain prompt per build.

`docs/patterns/code-signing.md` has the mechanism, along with the workarounds that don't hold.

## Licence

MIT – see [LICENSE](LICENSE).
