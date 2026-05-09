import "./index.css";

const recallApiKeyInput = document.getElementById("recallApiKey");
const inboxFolderInput = document.getElementById("inboxFolder");
const browseBtn = document.getElementById("browseBtn");
const autoRecordCheckbox = document.getElementById("autoRecord");
const assemblyAiApiKeyInput = document.getElementById("assemblyAiApiKey");
const inPersonMaxDurationInput = document.getElementById(
  "inPersonMaxDurationMinutes",
);
const saveBtn = document.getElementById("saveBtn");
const saveStatus = document.getElementById("saveStatus");

async function loadSettings() {
  const settings = await window.api.getSettings();
  recallApiKeyInput.value = settings.recallApiKey || "";
  inboxFolderInput.value = settings.inboxFolder || "";
  autoRecordCheckbox.checked = settings.autoRecord !== false;
  assemblyAiApiKeyInput.value = settings.assemblyAiApiKey || "";
  inPersonMaxDurationInput.value =
    settings.inPersonMaxDurationMinutes ?? "";
}

browseBtn.addEventListener("click", async () => {
  const folder = await window.api.selectFolder();
  if (folder) {
    inboxFolderInput.value = folder;
  }
});

saveBtn.addEventListener("click", async () => {
  const raw = inPersonMaxDurationInput.value.trim();
  const parsed = Number(raw);
  const inPersonMaxDurationMinutes =
    raw && Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  await window.api.saveSettings({
    recallApiKey: recallApiKeyInput.value,
    inboxFolder: inboxFolderInput.value,
    autoRecord: autoRecordCheckbox.checked,
    assemblyAiApiKey: assemblyAiApiKeyInput.value,
    inPersonMaxDurationMinutes,
  });

  saveStatus.textContent = "Saved";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 2000);
});

loadSettings();
