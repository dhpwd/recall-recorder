const path = require("path");
const fs = require("fs");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const sdkDir = path.resolve(
  __dirname,
  "node_modules",
  "@recallai",
  "desktop-sdk",
);

function chmodRecursive(dir, fileMode) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      chmodRecursive(fullPath, fileMode);
    } else if (
      entry.name.endsWith(".dylib") ||
      entry.name === "desktop_sdk_macos_exe"
    ) {
      fs.chmodSync(fullPath, fileMode);
    }
  }
}

// Frameworks is copied here rather than by copy-webpack-plugin because that
// dereferences symlinks. GStreamer.framework ships the canonical framework
// layout (GStreamer -> Versions/Current/GStreamer and the same for Libraries
// and Resources); flattening those into real files duplicates the payload and
// leaves a directory codesign rejects as "bundle format is ambiguous".
class CopyFrameworksPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync(
      "CopyFrameworksPlugin",
      (_compilation, callback) => {
        try {
          const dest = path.join(compiler.outputPath, "Frameworks");
          // Skipped when already present so watch-mode rebuilds don't repeat a
          // ~140MB copy. `make` starts from a clean output directory, so a
          // stale copy can only survive within a single dev session.
          if (fs.existsSync(dest)) {
            callback();
            return;
          }
          fs.cpSync(path.join(sdkDir, "Frameworks"), dest, {
            recursive: true,
            verbatimSymlinks: true,
          });
        } catch (err) {
          console.warn("Could not copy Frameworks:", err.message);
        }
        callback();
      },
    );
  }
}

class FixPermissionsPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync(
      "FixPermissionsPlugin",
      (_compilation, callback) => {
        try {
          const exePath = path.join(
            compiler.outputPath,
            "desktop_sdk_macos_exe",
          );
          if (fs.existsSync(exePath)) {
            fs.chmodSync(exePath, 0o755);
          }
          chmodRecursive(path.join(compiler.outputPath, "Frameworks"), 0o755);
        } catch (err) {
          console.warn("Could not fix permissions:", err.message);
        }
        callback();
      },
    );
  }
}

module.exports = {
  entry: "./src/main.js",
  module: {
    rules: require("./webpack.rules"),
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, "assets"),
          to: "assets",
        },
        {
          from: path.join(sdkDir, "desktop_sdk_macos_exe"),
          to: "desktop_sdk_macos_exe",
          toType: "file",
        },
      ],
    }),
    // Order matters – both tap afterEmit, and permissions are fixed on the
    // files this copy puts in place.
    new CopyFrameworksPlugin(),
    new FixPermissionsPlugin(),
  ],
};
