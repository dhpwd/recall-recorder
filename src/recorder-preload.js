const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recorder", {
  ready: () => ipcRenderer.send("inperson-recorder-ready"),
  chunk: (buf) => ipcRenderer.send("inperson-chunk", buf),
  stopped: () => ipcRenderer.send("inperson-recorder-stopped"),
  error: (msg) => ipcRenderer.send("inperson-recorder-error", msg),
  onStart: (cb) => ipcRenderer.on("inperson-start", () => cb()),
  onStop: (cb) => ipcRenderer.on("inperson-stop", () => cb()),
});
