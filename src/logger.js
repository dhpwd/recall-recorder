const log = require("electron-log/main");

// spyRendererConsole routes the preferences window's console output to the same
// file. preload is off because nothing in the renderer calls electron-log
// directly, and leaving it on makes electron-log write a generated preload
// script into userData at runtime.
log.initialize({ preload: false, spyRendererConsole: true });
log.transports.file.level = "info";
log.transports.file.maxSize = 5 * 1024 * 1024;

// Uncaught exceptions and unhandled rejections would otherwise leave no trace –
// recall.init() and the transcript polling loop both run outside any try block.
// No dialog: this is a tray app that runs during calls, and the tray already
// notifies on error.
log.errorHandler.startCatching({ showDialog: false });

// Reroute every console.* call across the process into electron-log's file
// transport. Must come after the require above – electron-log's console
// transport captures the original console methods when it loads, and reversing
// the order makes every log call recurse.
Object.assign(console, log.functions);

function getLogFilePath() {
  return log.transports.file.getFile().path;
}

module.exports = { getLogFilePath };
