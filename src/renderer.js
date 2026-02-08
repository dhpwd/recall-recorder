import "./index.css";

const inboxFolderInput = document.getElementById("inboxFolder");
const browseBtn = document.getElementById("browseBtn");
const autoRecordCheckbox = document.getElementById("autoRecord");
const saveBtn = document.getElementById("saveBtn");
const saveStatus = document.getElementById("saveStatus");

async function loadSettings() {
  const settings = await window.api.getSettings();
  inboxFolderInput.value = settings.inboxFolder || "";
  autoRecordCheckbox.checked = settings.autoRecord !== false;
}

browseBtn.addEventListener("click", async () => {
  const folder = await window.api.selectFolder();
  if (folder) {
    inboxFolderInput.value = folder;
  }
});

saveBtn.addEventListener("click", async () => {
  await window.api.saveSettings({
    inboxFolder: inboxFolderInput.value,
    autoRecord: autoRecordCheckbox.checked,
  });

  saveStatus.textContent = "Saved";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 2000);
});

loadSettings();
