const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

// Overridable so a Developer ID Application certificate can be used without
// editing tracked config. See README "Code signing".
const SIGNING_IDENTITY =
  process.env.CODESIGN_IDENTITY || "Recall Recorder Local Signing";

module.exports = {
  packagerConfig: {
    appBundleId: "com.fidero.recall-recorder",
    asar: {
      unpackDir: ".webpack/main",
    },
    extendInfo: {
      NSMicrophoneUsageDescription:
        "Recall Recorder records your microphone during video calls to produce meeting transcripts.",
      NSAudioCaptureUsageDescription:
        "Recall Recorder captures system audio from video calls to produce meeting transcripts.",
    },
    osxSign: {
      // A real certificate, not ad-hoc signing. Ad-hoc has no certificate, so
      // the designated requirement falls back to the binary's cdhash and every
      // rebuild invalidates every macOS permission grant. Any certificate –
      // self-signed or Developer ID – pins the requirement to itself instead.
      identity: SIGNING_IDENTITY,
      // Required: osx-sign otherwise resolves the identity through
      // `security find-identity -v`, which lists only trusted identities and so
      // never returns a self-signed one. It throws, and @electron/packager
      // swallows that (continueOnError defaults to true), emitting an unsigned
      // app from a build that reports success.
      identityValidation: false,
      // Entitlements are only read from optionsForFile. A top-level
      // `entitlements` key – and the old `entitlements-inherit` – are silently
      // ignored, so entitlements.plist was never reaching codesign via Forge.
      optionsForFile: () => ({
        entitlements: "./entitlements.plist",
        // Off to match what the manual codesign step produced. Turn on together
        // with a real signing identity if the app is ever notarised.
        hardenedRuntime: false,
      }),
      continueOnError: false,
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {},
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    {
      name: "@electron-forge/plugin-webpack",
      config: {
        mainConfig: "./webpack.main.config.js",
        renderer: {
          config: "./webpack.renderer.config.js",
          entryPoints: [
            {
              html: "./src/index.html",
              js: "./src/renderer.js",
              name: "main_window",
              preload: {
                js: "./src/preload.js",
              },
            },
          ],
        },
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      // Off deliberately. On, Chromium encrypts its cookie store with a key in
      // the login keychain, and the keychain ACL does not survive a rebuild
      // even with a stable signing certificate – so every build prompts for the
      // keychain password on first launch. There is nothing to protect: the
      // only window loads local content and holds no cookies, and the API key
      // is already stored as plain JSON in settings.json. Revisit if a window
      // ever authenticates against a remote service.
      [FuseV1Options.EnableCookieEncryption]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
