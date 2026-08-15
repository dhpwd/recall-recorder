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
    // A real certificate, identityValidation, entitlements via optionsForFile
    // and continueOnError are each required, and each produces a build that
    // reports success without them – see docs/patterns/code-signing.md.
    osxSign: {
      identity: SIGNING_IDENTITY,
      identityValidation: false,
      optionsForFile: () => ({
        entitlements: "./entitlements.plist",
        // Off deliberately – it pairs with notarisation. See
        // docs/patterns/code-signing.md.
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
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      // Off deliberately – on, every build prompts for the keychain password on
      // first launch, and nothing here needs protecting. See
      // docs/patterns/code-signing.md, "Keychain items do not behave like TCC
      // grants".
      [FuseV1Options.EnableCookieEncryption]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
