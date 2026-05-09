const { Tray, Menu, Notification, shell, nativeImage } = require("electron");
const path = require("node:path");
const recall = require("./recall");
const inperson = require("./inperson");
const settings = require("./settings");
const { STATES } = require("./constants");

let tray = null;
let settingsWindow = null;
let state = STATES.IDLE;
let currentMeetingTitle = null;

const STATUS_LABELS = {
  [STATES.IDLE]: "Status: Idle",
  [STATES.RECORDING]: "Status: Recording",
  [STATES.PROCESSING]: "Status: Processing Transcript",
  [STATES.ERROR]: "Status: Error",
  [STATES.INPERSON_RECORDING]: "Status: Recording (in-person)",
  [STATES.INPERSON_PROCESSING]: "Status: Processing Transcript",
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
  const recallActive = state === STATES.RECORDING;
  const inpersonActive = state === STATES.INPERSON_RECORDING;
  const isProcessing =
    state === STATES.PROCESSING || state === STATES.INPERSON_PROCESSING;

  let statusLabel;
  if (recallActive && currentMeetingTitle) {
    statusLabel = `Recording: ${currentMeetingTitle}`;
  } else if (inpersonActive) {
    statusLabel = "Recording: in-person";
  } else {
    statusLabel = STATUS_LABELS[state] || STATUS_LABELS[STATES.IDLE];
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
      enabled: inpersonActive || (!recallActive && !isProcessing),
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
  if (recall.isRecording()) return STATES.RECORDING;
  if (inperson.isRecording()) return STATES.INPERSON_RECORDING;
  return STATES.IDLE;
}

function handleStateChange(newState, detail) {
  state = newState;

  switch (newState) {
    case STATES.RECORDING:
      currentMeetingTitle = detail || null;
      showNotification(
        "Recording Started",
        `Recording: ${detail || "meeting"}`,
      );
      break;
    case STATES.PROCESSING:
      currentMeetingTitle = null;
      break;
    case STATES.TRANSCRIPT_READY:
      showNotification("Transcript Saved", detail || "Transcript ready");
      state = restingState();
      break;
    case STATES.INPERSON_RECORDING:
      currentMeetingTitle = "in-person";
      showNotification("Recording Started", "Recording in-person meeting");
      break;
    case STATES.INPERSON_PROCESSING:
      currentMeetingTitle = null;
      break;
    case STATES.INPERSON_TRANSCRIPT_READY:
      showNotification(
        "Transcript Saved",
        detail || "In-person transcript ready",
      );
      state = restingState();
      break;
    case STATES.ERROR:
      showNotification("Error", detail || "An error occurred");
      state = restingState();
      break;
    case STATES.IDLE:
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
