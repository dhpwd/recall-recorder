const log = require("electron-log/main");

// preload is off deliberately – see docs/logging.md, "What reaches the file".
log.initialize({ preload: false, spyRendererConsole: true });
log.transports.file.level = "info";
log.transports.file.maxSize = 5 * 1024 * 1024;

// No dialog: the app runs during calls and the tray already notifies on error.
log.errorHandler.startCatching({ showDialog: false });

// Must come after the require above – electron-log's console transport captures
// the original console methods when it loads, and reversing the order makes
// every log call recurse.
Object.assign(console, log.functions);

function getLogFilePath() {
  return log.transports.file.getFile().path;
}

module.exports = { getLogFilePath };
