const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");

const FALLBACK_MAX_DURATION_MINUTES = 60;
const FALLBACK_SHORTCUT = "Command+Option+R";

const DEFAULTS = {
  inboxFolder: path.join(app.getPath("home"), "call-transcripts", "inbox"),
  autoRecord: true,
  recallApiKey: "",
  assemblyAiApiKey: "",
  inPersonMaxDurationMinutes: null,
  inPersonShortcut: "",
};

// Resolution order across all getters: settings (UI) > env > built-in fallback.
// Stored defaults are deliberately falsy so env vars and runtime fallbacks
// can shine through when the user hasn't explicitly chosen a value.

function getApiKey(settings) {
  return settings.recallApiKey || process.env.RECALL_API_KEY || "";
}

function getAssemblyAiKey(settings) {
  return settings.assemblyAiApiKey || process.env.ASSEMBLYAI_API_KEY || "";
}

function getInPersonMaxMinutes(settings) {
  const candidates = [
    settings.inPersonMaxDurationMinutes,
    process.env.IN_PERSON_MAX_DURATION_MINUTES,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return FALLBACK_MAX_DURATION_MINUTES;
}

function getInPersonShortcut(settings) {
  return (
    settings.inPersonShortcut ||
    process.env.IN_PERSON_SHORTCUT ||
    FALLBACK_SHORTCUT
  );
}

function load() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings) {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function ensureInboxFolder(settings) {
  const folder = settings.inboxFolder || DEFAULTS.inboxFolder;
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return folder;
}

module.exports = {
  load,
  save,
  ensureInboxFolder,
  getApiKey,
  getAssemblyAiKey,
  getInPersonMaxMinutes,
  getInPersonShortcut,
  DEFAULTS,
};
