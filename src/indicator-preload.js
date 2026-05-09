const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("indicator", {
  onTick: (cb) =>
    ipcRenderer.on("inperson-tick", (_e, seconds) => cb(seconds)),
});
