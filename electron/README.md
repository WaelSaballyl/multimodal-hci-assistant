# Electron shell

These three files come from the shipped Windows build, v1.0.0, and are unchanged, including the older commented-out window setup at the top of `main.js`.

- `main.js` creates the window and the tray icon, starts the packaged Python backend (`assistant_backend.exe <mode>`), streams its output to the UI, forwards JSON commands to its stdin, and shuts it down cleanly.
- `preload.js` is the only bridge the React UI gets: a small `window.api` object exposed through `contextBridge`.
- `package.json` is the development manifest. `npm start` points Electron at the Vite dev server on port 5173.

The IPC channels are `assistant:start`, `assistant:stop`, `assistant:status`, `assistant:cmd`, `settings:get`, `settings:save`, `settings:set-autostart` and `settings:firstRunDone`. Logs go back to the UI on `assistant:log`.
