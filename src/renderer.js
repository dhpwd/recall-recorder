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
    settings.inPersonMaxDurationMinutes ?? 60;
}

browseBtn.addEventListener("click", async () => {
  const folder = await window.api.selectFolder();
  if (folder) {
    inboxFolderInput.value = folder;
  }
});

saveBtn.addEventListener("click", async () => {
  const maxMinutes = Number(inPersonMaxDurationInput.value);
  await window.api.saveSettings({
    recallApiKey: recallApiKeyInput.value,
    inboxFolder: inboxFolderInput.value,
    autoRecord: autoRecordCheckbox.checked,
    assemblyAiApiKey: assemblyAiApiKeyInput.value,
    inPersonMaxDurationMinutes:
      Number.isFinite(maxMinutes) && maxMinutes > 0 ? maxMinutes : 60,
  });

  saveStatus.textContent = "Saved";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 2000);
});

loadSettings();
