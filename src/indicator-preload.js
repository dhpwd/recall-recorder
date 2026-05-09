const { contextBridge, ipcRenderer } = require("electron");
const { INPERSON_CHANNELS } = require("./constants");

contextBridge.exposeInMainWorld("indicator", {
  onTick: (cb) =>
    ipcRenderer.on(INPERSON_CHANNELS.TICK, (_e, seconds) => cb(seconds)),
  onHint: (cb) =>
    ipcRenderer.on(INPERSON_CHANNELS.HINT, (_e, hint) => cb(hint)),
});
