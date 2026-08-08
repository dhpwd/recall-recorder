const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");

const DEFAULTS = {
  inboxFolder: path.join(app.getPath("home"), "call-transcripts", "inbox"),
  autoRecord: true,
  recallApiKey: "",
  // Account and partner names to bias transcription toward. Kept here rather
  // than in the repository because it is public – see src/keyterms.js.
  keyterms: [],
};

function getApiKey(settings) {
  return settings.recallApiKey || process.env.RECALL_API_KEY || "";
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

module.exports = { load, save, ensureInboxFolder, getApiKey, DEFAULTS };
