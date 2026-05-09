require("dotenv").config();

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  globalShortcut,
  session,
} = require("electron");
const path = require("node:path");
const settings = require("./settings");
const tray = require("./tray");
const recall = require("./recall");
const inperson = require("./inperson");

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

  ipcMain.handle("toggle-in-person", () => inperson.toggle());

  ipcMain.handle("get-in-person-status", () => ({
    isRecording: inperson.isRecording(),
  }));
}

function registerInPersonShortcut() {
  const accelerator = settings.getInPersonShortcut(settings.load());
  try {
    const ok = globalShortcut.register(accelerator, () => {
      inperson.toggle();
    });
    if (!ok) {
      console.error(`[main] Failed to register global shortcut: ${accelerator}`);
    } else {
      console.log(`[main] Registered global shortcut: ${accelerator}`);
    }
  } catch (err) {
    console.error("[main] globalShortcut.register threw:", err);
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === "media") return callback(true);
      callback(false);
    },
  );

  createWindow();

  const currentSettings = settings.load();
  settings.ensureInboxFolder(currentSettings);

  tray.create({
    getWindow: () => mainWindow,
  });

  const onStateChange = (state, detail) =>
    tray.handleStateChange(state, detail);

  recall.init({
    onStateChange,
    settingsLoader: () => settings.load(),
  });

  inperson.init({ onStateChange });

  registerIpcHandlers();
  registerInPersonShortcut();
});

app.on("window-all-closed", () => {
  // Keep the app running in the tray on macOS – don't quit
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  if (mainWindow) {
    mainWindow.removeAllListeners("close");
    mainWindow.close();
  }
});
