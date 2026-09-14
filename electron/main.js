// const { app, BrowserWindow, ipcMain, Menu } = require("electron");
// const path = require("path");

// Menu.setApplicationMenu(null);

// function createWindow() {
//   const win = new BrowserWindow({
//     width: 1200,
//     height: 800,
//     webPreferences: {
//       preload: path.join(__dirname, "preload.js"),
//     },
//   });

//   if (process.env.ELECTRON_START_URL) {
//     win.loadURL(process.env.ELECTRON_START_URL);
//   } else {
//     win.loadFile(path.join(__dirname, "../ui/dist/index.html"));
//   }
// }

// app.whenReady().then(() => {
//   createWindow();

//   app.on("activate", () => {
//     if (BrowserWindow.getAllWindows().length === 0) createWindow();
//   });
// });

// app.on("window-all-closed", () => {
//   if (process.platform !== "darwin") app.quit();
// });

// electron/main.js
const { app, BrowserWindow, ipcMain, Menu,Tray } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const { execSync } = require("child_process");
let tray = null;
let isQuitting = false;


const settingsPath = path.join(app.getPath("userData"), "settings.json");

let settings = {
  firstRun: true,
};

Menu.setApplicationMenu(null);

let mainWindow = null;
let pythonProcess = null;

if (process.platform === "win32") {
  app.setAppUserModelId("com.mhci.assistant");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // ❌ Do NOT quit on close — minimize to tray
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../ui/dist/index.html"));
  }
}

function createTray() {
  if (tray) return;

  const trayIconPath = app.isPackaged
  ? path.join(process.resourcesPath, "tray.png")
  : path.join(__dirname, "tray.png");

  tray = new Tray(trayIconPath);
  tray.setToolTip("MultiModal HCI Assistant");

  const trayMenu = Menu.buildFromTemplate([
    {
      label: "Show App",
      click: () => {
        if (!mainWindow) {
          createWindow();
        }
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: "Quit",
      click: async () => {
        isQuitting = true;
        try {
          await stopPythonProcess();
        } catch {}
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(trayMenu);

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}



app.whenReady().then(() => {
  // Load settings
  try {
    settings = {
      ...settings,
      ...JSON.parse(fs.readFileSync(settingsPath, "utf-8")),
    };
  } catch {}

  // Create settings file if missing
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  // Create window + tray
  createWindow();
  createTray();

  // Detect startup launch
  const loginSettings = app.getLoginItemSettings();
  const launchedAtLogin = loginSettings.wasOpenedAtLogin;

  // Start minimized if Windows startup
  if (launchedAtLogin) {
    mainWindow.hide();
  }

  // Auto-start engine ONLY on Windows startup
  if (launchedAtLogin && settings.autoStart && settings.startMode) {
    setTimeout(() => {
      if (!pythonProcess) {
        startPython(settings.startMode);
      }
    }, 1000);
  }

  app.on("activate", () => {
    if (!mainWindow) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});


app.on("window-all-closed", async () => {
  
});

app.on("before-quit", async () => {
  try {
    if (pythonProcess) pythonProcess.kill();
  } catch {}
});

/* -------------------------------------------------
   PYTHON PROCESS CONTROL
------------------------------------------------- */

function getPythonModule(mode) {
  if (mode === "voice") return "engine.voice.voice_main_wake";
  if (mode === "gesture") return "engine.gesture.gesture_runtime";
  if (mode === "both") return "engine.run_voice_and_gesture"; // both
}

function getBackendExePath() {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "electron",
      "backend",
      "assistant_backend.exe",
    );
  }

  // dev mode
  return path.join(__dirname, "backend", "assistant_backend.exe");
}

function startPython(mode) {
  const exePath = getBackendExePath();

  pythonProcess = spawn(exePath, [mode], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  pythonProcess.stdout.on("data", (d) => sendLog("stdout", d.toString()));
  pythonProcess.stderr.on("data", (d) => sendLog("stderr", d.toString()));

  pythonProcess.on("exit", (code) => {
    sendLog("system", `Python exited with code ${code}`);
    pythonProcess = null;
  });
}

// pick venv python if available
function resolvePythonExe(projectRoot) {
  const isWin = process.platform === "win32";
  const venvPy = isWin
    ? path.join(projectRoot, ".venv", "Scripts", "python.exe")
    : path.join(projectRoot, ".venv", "bin", "python");

  if (fs.existsSync(venvPy)) return venvPy;

  // fallback to system python
  return isWin ? "python" : "python3";
}

function sendLog(type, message) {
  if (!mainWindow) return;
  mainWindow.webContents.send("assistant:log", {
    type,
    message: String(message ?? ""),
  });
}

function updateWindowsAutoStart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
  });
}

function killProcessTree(pid) {
  try {
    const stdout = execSync(`ps -o pid= --ppid ${pid}`, { encoding: "utf8" });

    const children = stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const childPid of children) {
      killProcessTree(childPid);
    }

    // ✅ graceful first
    try {
      process.kill(pid, "SIGTERM");
    } catch {}

    // ⏳ give Python time to clean up
    setTimeout(() => {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }, 1500);
  } catch {
    // already dead
  }
}

function stopPythonProcess() {
  return new Promise((resolve) => {
    if (!pythonProcess) return resolve();

    const pid = pythonProcess.pid;
    pythonProcess = null;

    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
      } else {
        // 🔥 kill entire tree on macOS/Linux
        killProcessTree(pid);
      }
    } catch (e) {}

    resolve();
  });
}

ipcMain.handle("settings:save", (_event, newSettings) => {
  settings = {
    ...settings,       // keep firstRun
    ...newSettings,    // apply updates
  };

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return { ok: true };
});




ipcMain.handle("settings:set-autostart", (_event, enabled) => {
  updateWindowsAutoStart(enabled);
  return { ok: true };
});

ipcMain.handle("settings:get", () => settings);

ipcMain.handle("settings:firstRunDone", () => {
  settings.firstRun = false;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return { ok: true };
});

ipcMain.handle("assistant:start", async (_event, mode) => {
  if (pythonProcess) {
    return { running: true, alreadyRunning: true };
  }

  const exePath = getBackendExePath();
  if (!fs.existsSync(exePath)) {
    sendLog("system", "Backend EXE not found");
    return { running: false, error: "backend_missing" };
  }

  pythonProcess = spawn(exePath, [mode], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  pythonProcess.stdout.on("data", (data) => sendLog("stdout", data.toString()));

  pythonProcess.stderr.on("data", (data) => sendLog("stderr", data.toString()));

  pythonProcess.on("exit", (code) => {
    sendLog("system", `Python exited with code ${code}`);
    pythonProcess = null;
  });

  return { running: true };
});

ipcMain.handle("assistant:cmd", async (_event, payload) => {
  if (!pythonProcess || !pythonProcess.stdin) {
    return { ok: false, error: "python_not_running" };
  }

  try {
    pythonProcess.stdin.write(JSON.stringify(payload) + "\n");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("assistant:stop", async () => {
  await stopPythonProcess();
  return { stopped: true };
});

ipcMain.handle("assistant:status", async () => {
  return { running: Boolean(pythonProcess) };
});
