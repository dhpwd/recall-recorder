const { BrowserWindow, screen, ipcMain } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const settings = require("./settings");
const { saveTranscript } = require("./transcript");
const { transcribeFile } = require("./assemblyai");
const { STATES, INPERSON_CHANNELS } = require("./constants");

const MEETING_TITLE = "In-Person Meeting";
const TMP_DIR = path.join(os.tmpdir(), "recall-recorder");

let recorderWin = null;
let indicatorWin = null;
let current = null;
let stateCallback = null;
let stopTimer = null;
let tickTimer = null;

function init({ onStateChange }) {
  stateCallback = onStateChange;
  cleanupTmpFiles();

  ipcMain.on(INPERSON_CHANNELS.CHUNK, (_e, buffer) => {
    if (current?.writeStream) {
      current.writeStream.write(Buffer.from(buffer));
    }
  });

  ipcMain.on(INPERSON_CHANNELS.ERROR, (_e, message) => {
    console.error("[inperson] recorder error:", message);
    stateCallback?.(STATES.ERROR, `In-person recorder failed: ${message}`);
    cleanupActive();
  });

  ipcMain.on(INPERSON_CHANNELS.STOPPED, () => {
    finalize().catch((err) => {
      console.error("[inperson] finalize threw:", err);
    });
  });
}

function cleanupTmpFiles() {
  try {
    if (!fs.existsSync(TMP_DIR)) return;
    for (const entry of fs.readdirSync(TMP_DIR, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith("inperson-")) {
        try {
          fs.unlinkSync(path.join(TMP_DIR, entry.name));
        } catch {}
      }
    }
  } catch (err) {
    console.warn("[inperson] tmp cleanup failed:", err.message);
  }
}

async function start() {
  if (current) return { ok: false, reason: "already-recording" };

  const recall = require("./recall");
  if (recall.isRecording()) {
    stateCallback?.(STATES.ERROR, "A meeting recording is already active");
    return { ok: false, reason: "recall-active" };
  }

  const s = settings.load();
  const apiKey = settings.getAssemblyAiKey(s);
  if (!apiKey) {
    stateCallback?.(
      STATES.ERROR,
      "Set ASSEMBLYAI_API_KEY (env or Preferences) first",
    );
    return { ok: false, reason: "no-key" };
  }

  fs.mkdirSync(TMP_DIR, { recursive: true });
  const audioFile = path.join(TMP_DIR, `inperson-${Date.now()}.webm`);
  const writeStream = fs.createWriteStream(audioFile);

  current = {
    startTime: new Date(),
    audioFile,
    writeStream,
    meetingTitle: MEETING_TITLE,
  };

  ensureRecorderWindow();
  showIndicator(settings.getInPersonShortcut(s));
  startTimers(s);

  stateCallback?.(STATES.INPERSON_RECORDING, current.meetingTitle);
  return { ok: true };
}

function ensureRecorderWindow() {
  if (recorderWin && !recorderWin.isDestroyed()) {
    sendTo(recorderWin, INPERSON_CHANNELS.START);
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
  sendTo(recorderWin, INPERSON_CHANNELS.START);
}

function sendTo(win, channel, payload) {
  if (!win || win.isDestroyed()) return;
  const wc = win.webContents;
  if (!wc || wc.isDestroyed()) return;
  if (wc.isLoading()) {
    wc.once("did-finish-load", () => {
      if (!wc.isDestroyed()) wc.send(channel, payload);
    });
  } else {
    wc.send(channel, payload);
  }
}

function showIndicator(shortcut) {
  const display = screen.getPrimaryDisplay();
  const w = 240;
  const h = 56;
  const x = display.workArea.x + display.workArea.width - w - 16;
  const y = display.workArea.y + 16;

  if (indicatorWin && !indicatorWin.isDestroyed()) {
    indicatorWin.setBounds({ x, y, width: w, height: h });
    sendTo(indicatorWin, INPERSON_CHANNELS.HINT, formatAccelerator(shortcut));
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
  indicatorWin.once("ready-to-show", () => {
    sendTo(indicatorWin, INPERSON_CHANNELS.HINT, formatAccelerator(shortcut));
    indicatorWin.showInactive();
  });
}

function formatAccelerator(acc) {
  if (!acc) return "";
  return acc
    .split("+")
    .map((part) => {
      const lower = part.toLowerCase();
      if (
        lower === "command" ||
        lower === "cmd" ||
        lower === "commandorcontrol" ||
        lower === "cmdorctrl"
      ) {
        return "⌘";
      }
      if (lower === "control" || lower === "ctrl") return "⌃";
      if (lower === "option" || lower === "alt") return "⌥";
      if (lower === "shift") return "⇧";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("");
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
    if (!current) return;
    const elapsed = Math.floor(
      (Date.now() - current.startTime.getTime()) / 1000,
    );
    sendTo(indicatorWin, INPERSON_CHANNELS.TICK, elapsed);
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
    sendTo(recorderWin, INPERSON_CHANNELS.STOP);
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

  stateCallback?.(STATES.INPERSON_PROCESSING);

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
    stateCallback?.(STATES.INPERSON_TRANSCRIPT_READY, filename);
  } catch (err) {
    console.error("[inperson] transcription failed:", err);
    stateCallback?.(
      STATES.ERROR,
      `In-person transcription failed: ${err.message}`,
    );
  } finally {
    try {
      fs.unlinkSync(recording.audioFile);
    } catch {}
  }
}

function isRecording() {
  return current !== null;
}

function getRecorderWebContentsId() {
  if (!recorderWin || recorderWin.isDestroyed()) return null;
  const wc = recorderWin.webContents;
  if (!wc || wc.isDestroyed()) return null;
  return wc.id;
}

async function toggle() {
  if (current) {
    stop();
    return { ok: true, action: "stop" };
  }
  const result = await start();
  return { ...result, action: "start" };
}

module.exports = {
  init,
  start,
  stop,
  toggle,
  isRecording,
  getRecorderWebContentsId,
};
