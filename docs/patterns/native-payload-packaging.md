# Packaging the native SDK payload

The Recall Desktop SDK ships a native macOS binary (`desktop_sdk_macos_exe`) and a `Frameworks/` directory of GStreamer and Rust libraries. Both must reach the packaged app executable and outside the asar archive. Three things about that are non-obvious.

## Copy frameworks with symlinks intact

**Problem:** `GStreamer.framework` uses the canonical macOS framework layout, where `GStreamer`, `Libraries` and `Resources` are symlinks into `Versions/Current/`. `copy-webpack-plugin` dereferences symlinks, which turns those into real files and directories. That duplicates the whole framework payload (~140MB) and produces a directory `codesign` rejects with `bundle format is ambiguous (could be app or framework)`, failing the build.

**Solution:** `CopyFrameworksPlugin` in `webpack.main.config.js` copies it separately with `fs.cpSync({ verbatimSymlinks: true })`. Only the binary goes through `copy-webpack-plugin`.

**Verify after a build** – those three entries must still be symlinks, and CLAUDE.md's full verify lists the command. A correctly copied framework signs as `org.freedesktop.gstreamer`, while a dereferenced one keeps whatever linker signature Recall's build machine left on it, an identifier shaped like `tmp<random>GStreamer`.

## asar unpack globs fail without an error

**Problem:** `asar.unpack` glob patterns appear to work and do not. The files end up inside the archive, the SDK cannot launch its binary, and nothing surfaces until a recording starts.

**Solution:** `forge.config.js` uses `asar.unpackDir: ".webpack/main"`, which keeps the whole main-process output outside the archive.

**Trade-off:** that unpacks more than it needs to, but narrowing it saves no space. Of 146MB unpacked, 137MB is `Frameworks/` and 9.3MB the SDK binary, both of which must stay outside to be executable, leaving ~92KB to move. The gain would be asar integrity coverage for `index.js`. DHP-10 covers it.

## afterEmit plugin order is the sequencing

`CopyFrameworksPlugin` and `FixPermissionsPlugin` both tap `afterEmit`, so their order in the `plugins` array is the only thing that sequences them. Permissions are restored on the files the copy puts in place, so the copy has to be first.

`CopyFrameworksPlugin` skips the copy when the destination already exists, which keeps watch-mode rebuilds from repeating a ~140MB copy. The cost is that bumping the SDK within one dev session keeps stale frameworks until `.webpack` is cleared. `npm run make` starts from a clean output directory and is unaffected.
