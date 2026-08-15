require("dotenv").config();
require("./logger");

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const settings = require("./settings");
const tray = require("./tray");
const recall = require("./recall");

if (require("electron-squirrel-startup")) {
  app.quit();
}

let mainWindow = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 420,
    show: false,
    resizable: false,
    title: "Recall Recorder – Preferences",
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  mainWindow.on("close", (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
};

function registerIpcHandlers() {
  ipcMain.handle("get-settings", () => settings.load());

  ipcMain.handle("save-settings", (_event, newSettings) => {
    const current = settings.load();
    const merged = { ...current, ...newSettings };
    settings.save(merged);
    return merged;
  });

  ipcMain.handle("get-recording-status", () => {
    const recording = recall.getCurrentRecording();
    return {
      isRecording: recall.isRecording(),
      meetingTitle: recording?.meetingTitle || null,
      startTime: recording?.startTime?.toISOString() || null,
    };
  });

  ipcMain.handle("open-inbox-folder", () => {
    const s = settings.load();
    const folder = settings.ensureInboxFolder(s);
    shell.openPath(folder);
  });

  ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });
}

app.whenReady().then(() => {
  createWindow();

  const currentSettings = settings.load();
  settings.ensureInboxFolder(currentSettings);

  tray.create({
    getWindow: () => mainWindow,
  });

  recall.init({
    onStateChange: (state, detail) => tray.handleStateChange(state, detail),
    settingsLoader: () => settings.load(),
  });

  registerIpcHandlers();
});

app.on("window-all-closed", () => {
  // Keep the app running in the tray on macOS – don't quit
});

let sdkShutdownStarted = false;

app.on("before-quit", (e) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners("close");
    mainWindow.close();
  }

  // Deferred once so the SDK can stop its native subprocess itself, and the
  // quit proceeds either way – see docs/recall-sdk.md, "Quitting".
  if (sdkShutdownStarted) return;
  sdkShutdownStarted = true;
  e.preventDefault();
  recall.shutdown().finally(() => app.quit());
});
