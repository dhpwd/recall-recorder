const { contextBridge, ipcRenderer } = require("electron");
const { INPERSON_CHANNELS } = require("./constants");

contextBridge.exposeInMainWorld("recorder", {
  chunk: (buf) => ipcRenderer.send(INPERSON_CHANNELS.CHUNK, buf),
  stopped: () => ipcRenderer.send(INPERSON_CHANNELS.STOPPED),
  error: (msg) => ipcRenderer.send(INPERSON_CHANNELS.ERROR, msg),
  onStart: (cb) => ipcRenderer.on(INPERSON_CHANNELS.START, () => cb()),
  onStop: (cb) => ipcRenderer.on(INPERSON_CHANNELS.STOP, () => cb()),
});
