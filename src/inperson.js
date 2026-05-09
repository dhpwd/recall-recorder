const { BrowserWindow, screen, ipcMain } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const settings = require("./settings");
const { saveTranscript } = require("./transcript");
const { transcribeFile } = require("./assemblyai");

let recorderWin = null;
let indicatorWin = null;
let current = null;
let stateCallback = null;
let stopTimer = null;
let tickTimer = null;
let pendingStart = false;

function init({ onStateChange }) {
  stateCallback = onStateChange;

  ipcMain.on("inperson-recorder-ready", () => {
    if (pendingStart && recorderWin && !recorderWin.isDestroyed()) {
      pendingStart = false;
      recorderWin.webContents.send("inperson-start");
    }
  });

  ipcMain.on("inperson-chunk", (_e, buffer) => {
    if (current?.writeStream) {
      current.writeStream.write(Buffer.from(buffer));
    }
  });

  ipcMain.on("inperson-recorder-error", (_e, message) => {
    console.error("[inperson] recorder error:", message);
    stateCallback?.("error", `In-person recorder failed: ${message}`);
    cleanupActive();
  });

  ipcMain.on("inperson-recorder-stopped", () => {
    finalize().catch((err) => {
      console.error("[inperson] finalize threw:", err);
    });
  });
}

async function start() {
  if (current) return { ok: false, reason: "already-recording" };

  const recall = require("./recall");
  if (recall.isRecording()) {
    stateCallback?.("error", "A meeting recording is already active");
    return { ok: false, reason: "recall-active" };
  }

  const s = settings.load();
  const apiKey = settings.getAssemblyAiKey(s);
  if (!apiKey) {
    stateCallback?.(
      "error",
      "Set ASSEMBLYAI_API_KEY (env or Preferences) first",
    );
    return { ok: false, reason: "no-key" };
  }

  const tmpDir = path.join(os.tmpdir(), "recall-recorder");
  fs.mkdirSync(tmpDir, { recursive: true });
  const audioFile = path.join(tmpDir, `inperson-${Date.now()}.webm`);
  const writeStream = fs.createWriteStream(audioFile);

  current = {
    startTime: new Date(),
    audioFile,
    writeStream,
    meetingTitle: "In-Person Meeting",
  };

  ensureRecorderWindow();
  showIndicator();
  startTimers(s);

  stateCallback?.("inperson-recording", current.meetingTitle);
  return { ok: true };
}

function ensureRecorderWindow() {
  pendingStart = true;
  if (recorderWin && !recorderWin.isDestroyed()) {
    recorderWin.webContents.send("inperson-start");
    pendingStart = false;
    return;
  }
  recorderWin = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: RECORDER_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
    },
  });
  recorderWin.loadURL(RECORDER_WINDOW_WEBPACK_ENTRY);
}

function showIndicator() {
  const display = screen.getPrimaryDisplay();
  const w = 240;
  const h = 56;
  const x = display.workArea.x + display.workArea.width - w - 16;
  const y = display.workArea.y + 16;

  if (indicatorWin && !indicatorWin.isDestroyed()) {
    indicatorWin.setBounds({ x, y, width: w, height: h });
    indicatorWin.showInactive();
    return;
  }
  indicatorWin = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: INDICATOR_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
    },
  });
  indicatorWin.setAlwaysOnTop(true, "screen-saver");
  indicatorWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  indicatorWin.setIgnoreMouseEvents(true);
  indicatorWin.loadURL(INDICATOR_WINDOW_WEBPACK_ENTRY);
  indicatorWin.once("ready-to-show", () => indicatorWin.showInactive());
}

function hideIndicator() {
  if (indicatorWin && !indicatorWin.isDestroyed()) indicatorWin.hide();
}

function startTimers(s) {
  const maxMinutes = settings.getInPersonMaxMinutes(s);
  if (maxMinutes > 0) {
    stopTimer = setTimeout(
      () => {
        console.log(
          `[inperson] Auto-stop after ${maxMinutes} min limit reached`,
        );
        stop();
      },
      maxMinutes * 60 * 1000,
    );
  }

  tickTimer = setInterval(() => {
    if (!current || !indicatorWin || indicatorWin.isDestroyed()) return;
    const elapsed = Math.floor(
      (Date.now() - current.startTime.getTime()) / 1000,
    );
    indicatorWin.webContents.send("inperson-tick", elapsed);
  }, 1000);
}

function clearTimers() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function cleanupActive() {
  clearTimers();
  hideIndicator();
  if (current) {
    try {
      current.writeStream.end();
    } catch {}
    try {
      fs.unlinkSync(current.audioFile);
    } catch {}
    current = null;
  }
}

function stop() {
  if (!current) return;
  if (recorderWin && !recorderWin.isDestroyed()) {
    recorderWin.webContents.send("inperson-stop");
  } else {
    finalize().catch((err) => console.error("[inperson] finalize threw:", err));
  }
}

async function finalize() {
  if (!current) return;
  clearTimers();
  hideIndicator();

  const recording = current;
  current = null;

  await new Promise((resolve) => recording.writeStream.end(resolve));

  stateCallback?.("inperson-processing");

  try {
    const s = settings.load();
    const apiKey = settings.getAssemblyAiKey(s);
    const segments = await transcribeFile(recording.audioFile, apiKey);
    const filename = saveTranscript(
      s.inboxFolder,
      {
        id: "",
        startTime: recording.startTime,
        meetingTitle: recording.meetingTitle,
        platform: "in-person",
      },
      segments,
    );
    stateCallback?.("inperson-transcript-ready", filename);
  } catch (err) {
    console.error("[inperson] transcription failed:", err);
    stateCallback?.("error", `In-person transcription failed: ${err.message}`);
  } finally {
    try {
      fs.unlinkSync(recording.audioFile);
    } catch {}
    if (!current) stateCallback?.("idle");
  }
}

function isRecording() {
  return current !== null;
}

async function toggle() {
  if (current) {
    stop();
    return { ok: true, action: "stop" };
  }
  const result = await start();
  return { ...result, action: "start" };
}

module.exports = { init, start, stop, toggle, isRecording };
