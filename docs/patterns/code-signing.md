# Code signing

## Why permissions break on every rebuild

**Problem:** macOS permission grants stop working after a rebuild, with nothing to say they have. Accessibility is where it gets noticed, because it has no prompt to re-trigger – a broken Microphone grant just re-prompts.

**Cause:** macOS binds each TCC grant to the app's _designated requirement_, a signing expression re-evaluated on every access. Ad-hoc signing (`--sign -`) has no certificate, so the requirement falls back to the binary's cdhash, which changes on every build:

```
designated => cdhash H"f301d50ca99b8afdbd948fee1852059e25924da3"
```

**Solution:** sign with any certificate. The requirement then names the bundle identifier and the certificate, neither of which changes between builds:

```
designated => identifier "com.fidero.recall-recorder" and certificate leaf = H"0155c1af..."
```

Self-signed costs nothing and needs no Apple Developer Program. The paid programme buys distribution, not persistence – Gatekeeper rejects self-signed certificates on anything carrying a quarantine flag, and notarisation needs a Developer ID, but neither affects TCC. Both matter only when the app is installed on a machine other than the one that builds it. The README's "Code signing" section has the setup for each.

**When to use:** any time a permission stops working, check `codesign -d -r-` for `cdhash` before looking anywhere else.

## Three osxSign settings that fail without an error

Each of these is required, and omitting any of them produces a build that reports success:

- `identityValidation: false` – osx-sign otherwise resolves the identity through `security find-identity -v`, which lists only trusted identities. A self-signed certificate is never trusted, so the lookup returns nothing and throws `No identity found for signing.` The same happened with the old `identity: "-"`, which was searched for as a substring. The setting is right for a Developer ID certificate too, because it only skips a lookup
- `optionsForFile` returning `{ entitlements }` – entitlements are read from this callback and nowhere else. A top-level `entitlements` key, and the pre-1.0 `entitlements-inherit`, are read by nothing and applied to nothing
- `continueOnError: false` – `@electron/packager` defaults this to `true` and downgrades a signing failure to a warning, so packaging emits an unsigned app and says it worked

`package.json` overrides `@electron/osx-sign` with Recall's fork, which parallelises signing for speed and makes no difference to correctness.

The designated requirement names the bundle identifier `com.fidero.recall-recorder` and the certificate, and needs both to match, so changing either invalidates every grant. Keep the identifier stable. On its own it binds nothing – an ad-hoc build carries the same identifier and still breaks on every rebuild.

**Anti-pattern:** trusting the build's exit status. Verify the signature after packaging – CLAUDE.md's full verify has the commands. Anything that suppresses a signing failure puts the manual `codesign` step back.

A self-signed certificate reports `0 valid identities` under `security find-identity -v`, and `CSSMERR_TP_NOT_TRUSTED` under `security find-identity` alone. Both are expected. Trust governs verification, not signing.

## Keychain items do not behave like TCC grants

**Problem:** a keychain item's access list does not survive a rebuild even with a stable certificate. An item created by the app itself, signed with the same certificate at the same path, still prompted after the next build. Whatever the ACL binds to, it is not the designated requirement.

That makes every workaround temporary – "Always Allow", deleting the item so the app recreates it, setting a partition list – each lasting until the next build.

**Solution:** avoid creating keychain items. Electron's `EnableCookieEncryption` fuse is off for this reason, so no item exists to prompt for. Nothing is protected by turning it on: the only window loads local content and holds no cookies, the app never calls `safeStorage`, and the API key is already plain JSON in `settings.json`. Revisit only if a window ever authenticates against a remote service.

`security import` sets a key's ACL but not its partition list, which is a separate matter and does have a permanent fix – without `security set-key-partition-list`, `codesign` prompts for the keychain password once per file it signs, and a plain "Allow" answers only one. The command is in the README.
