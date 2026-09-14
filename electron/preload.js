const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  saveSettings: (settings) =>
    ipcRenderer.invoke("settings:save", settings),

  setAutoStart: (enabled) =>
    ipcRenderer.invoke("settings:set-autostart", enabled),

  startAssistant: (mode) =>
    ipcRenderer.invoke("assistant:start", mode),

  stopAssistant: () =>
    ipcRenderer.invoke("assistant:stop"),

  statusAssistant: () =>
    ipcRenderer.invoke("assistant:status"),

  getAppSettings: () => ipcRenderer.invoke("settings:get"),
  completeFirstRun: () => ipcRenderer.invoke("settings:firstRunDone"),

  onLog: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("assistant:log", handler);
    return () => ipcRenderer.removeListener("assistant:log", handler);
  }
});
