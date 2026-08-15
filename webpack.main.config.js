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

// Copied here rather than by copy-webpack-plugin, which dereferences the
// framework's symlinks – see docs/patterns/native-payload-packaging.md, "Copy
// frameworks with symlinks intact".
class CopyFrameworksPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync(
      "CopyFrameworksPlugin",
      (_compilation, callback) => {
        try {
          const dest = path.join(compiler.outputPath, "Frameworks");
          // Skipped when already present so watch-mode rebuilds don't repeat a
          // ~140MB copy – see docs/patterns/native-payload-packaging.md for the
          // stale-frameworks trade-off that buys.
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
