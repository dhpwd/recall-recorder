const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");

const DEFAULTS = {
  inboxFolder: path.join(app.getPath("home"), "call-transcripts", "inbox"),
  autoRecord: true,
  recallApiKey: "",
  assemblyAiApiKey: "",
  inPersonMaxDurationMinutes: 60,
  inPersonShortcut: "Command+Option+R",
};

function getApiKey(settings) {
  return settings.recallApiKey || process.env.RECALL_API_KEY || "";
}

function getAssemblyAiKey(settings) {
  return (
    settings.assemblyAiApiKey || process.env.ASSEMBLYAI_API_KEY || ""
  );
}

function getInPersonMaxMinutes(settings) {
  const fromEnv = Number(process.env.IN_PERSON_MAX_DURATION_MINUTES);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  const fromSettings = Number(settings.inPersonMaxDurationMinutes);
  if (Number.isFinite(fromSettings) && fromSettings > 0) return fromSettings;
  return DEFAULTS.inPersonMaxDurationMinutes;
}

function getInPersonShortcut(settings) {
  return (
    process.env.IN_PERSON_SHORTCUT ||
    settings.inPersonShortcut ||
    DEFAULTS.inPersonShortcut
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
