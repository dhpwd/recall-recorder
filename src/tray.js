const { Tray, Menu, Notification, shell, nativeImage } = require("electron");
const path = require("node:path");
const recall = require("./recall");
const inperson = require("./inperson");
const settings = require("./settings");

let tray = null;
let settingsWindow = null;
let state = "idle";
let currentMeetingTitle = null;

const STATUS_LABELS = {
  idle: "Status: Idle",
  recording: "Status: Recording",
  processing: "Status: Processing Transcript",
  error: "Status: Error",
  "inperson-recording": "Status: Recording (in-person)",
  "inperson-processing": "Status: Processing Transcript",
};

function create({ getWindow }) {
  const iconPath = path.join(__dirname, "assets", "trayIconTemplate.png");

  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("Recall Recorder");
  settingsWindow = getWindow;
  updateMenu();
  return tray;
}

function updateMenu() {
  const recallActive = state === "recording";
  const inpersonActive = state === "inperson-recording";

  let statusLabel;
  if (recallActive && currentMeetingTitle) {
    statusLabel = `Recording: ${currentMeetingTitle}`;
  } else if (inpersonActive) {
    statusLabel = "Recording: in-person";
  } else {
    statusLabel = STATUS_LABELS[state] || STATUS_LABELS.idle;
  }

  const accelerator = settings.getInPersonShortcut(settings.load());

  const template = [
    { label: statusLabel, enabled: false },
    {
      label: "Stop Recording",
      enabled: recallActive,
      click: () => recall.stopRecording(),
    },
    {
      label: inpersonActive
        ? "Stop In-Person Recording"
        : "Start In-Person Recording",
      accelerator,
      enabled: inpersonActive || (!recallActive && state !== "processing"),
      click: () => inperson.toggle(),
    },
    { type: "separator" },
    {
      label: "Open Transcript Inbox",
      click: () => {
        const s = settings.load();
        const folder = settings.ensureInboxFolder(s);
        shell.openPath(folder);
      },
    },
    {
      label: "Preferences...",
      click: () => {
        const win = settingsWindow?.();
        if (win) {
          win.show();
          win.focus();
        }
      },
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ];

  const contextMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(contextMenu);
}

function restingState() {
  if (recall.isRecording()) return "recording";
  if (inperson.isRecording()) return "inperson-recording";
  return "idle";
}

function handleStateChange(newState, detail) {
  state = newState;

  switch (newState) {
    case "recording":
      currentMeetingTitle = detail || null;
      showNotification(
        "Recording Started",
        `Recording: ${detail || "meeting"}`,
      );
      break;
    case "processing":
      currentMeetingTitle = null;
      break;
    case "transcript-ready":
      showNotification("Transcript Saved", detail || "Transcript ready");
      state = restingState();
      break;
    case "inperson-recording":
      currentMeetingTitle = "in-person";
      showNotification("Recording Started", "Recording in-person meeting");
      break;
    case "inperson-processing":
      currentMeetingTitle = null;
      break;
    case "inperson-transcript-ready":
      showNotification(
        "Transcript Saved",
        detail || "In-person transcript ready",
      );
      state = restingState();
      break;
    case "error":
      showNotification("Error", detail || "An error occurred");
      state = "idle";
      break;
    case "idle":
      currentMeetingTitle = null;
      break;
  }

  updateMenu();
}

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

module.exports = { create, handleStateChange };
