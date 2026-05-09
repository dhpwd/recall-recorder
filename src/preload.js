const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  getRecordingStatus: () => ipcRenderer.invoke("get-recording-status"),
  openInboxFolder: () => ipcRenderer.invoke("open-inbox-folder"),
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  toggleInPerson: () => ipcRenderer.invoke("toggle-in-person"),
  getInPersonStatus: () => ipcRenderer.invoke("get-in-person-status"),
});
