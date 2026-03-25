import { app, BrowserWindow, ipcMain, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pty from "node-pty";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logoPath = path.join(__dirname, "..", "public", "logo.png");
const projectRoot = path.join(__dirname, "..");

const DEFAULT_APP_URL = "http://127.0.0.1:4731/dashboard";
const TERMINAL_CHANNELS = {
  data: "reviews-terminal:data",
  exit: "reviews-terminal:exit",
};

let terminalProcess = null;

function getTerminalShell() {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "powershell.exe";
  }

  const candidates = [process.env.SHELL, "/bin/zsh", "/bin/bash"].filter(
    Boolean,
  );

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "/bin/sh";
}

function getTerminalCwd() {
  if (fs.existsSync(projectRoot)) {
    return projectRoot;
  }

  return os.homedir();
}

function buildTerminalEnv() {
  return Object.fromEntries(
    Object.entries({
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      TERM_PROGRAM: "github-activity-tracker",
    }).filter((entry) => typeof entry[1] === "string"),
  );
}

function buildTerminalSession(webContents) {
  const shellPath = getTerminalShell();
  const cwd = getTerminalCwd();

  const session = pty.spawn(shellPath, ["-l"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: buildTerminalEnv(),
  });

  session.onData((data) => {
    webContents.send(TERMINAL_CHANNELS.data, data);
  });

  session.onExit(({ exitCode, signal }) => {
    webContents.send(TERMINAL_CHANNELS.exit, { exitCode, signal });
    terminalProcess = null;
  });

  return {
    session,
    shellPath,
    cwd,
  };
}

function ensureTerminal(webContents) {
  if (terminalProcess) {
    return {
      terminal: terminalProcess,
      shell: getTerminalShell(),
      cwd: getTerminalCwd(),
    };
  }

  const { session, shellPath, cwd } = buildTerminalSession(webContents);
  terminalProcess = session;

  return {
    terminal: session,
    shell: shellPath,
    cwd,
  };
}

function disposeTerminal() {
  if (!terminalProcess) return;
  terminalProcess.kill();
  terminalProcess = null;
}

function getAppUrl() {
  return process.env.GHAT_DESKTOP_URL ?? DEFAULT_APP_URL;
}

function createMainWindow() {
  const appUrl = getAppUrl();
  const appOrigin = new URL(appUrl).origin;
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#09090b",
    icon: logoPath,
    title: "GitHub Activity Tracker",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(appOrigin)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });

  ipcMain.handle("reviews-terminal:start", () => {
    const { shell, cwd } = ensureTerminal(mainWindow.webContents);
    return {
      shell,
      cwd,
      home: os.homedir(),
    };
  });

  ipcMain.handle("reviews-terminal:write", (_event, data) => {
    const { terminal } = ensureTerminal(mainWindow.webContents);
    terminal.write(data);
  });

  ipcMain.handle("reviews-terminal:resize", (_event, dimensions) => {
    const { terminal } = ensureTerminal(mainWindow.webContents);
    if (!dimensions?.cols || !dimensions?.rows) return;
    terminal.resize(dimensions.cols, dimensions.rows);
  });

  ipcMain.handle("reviews-terminal:restart", () => {
    disposeTerminal();
    ensureTerminal(mainWindow.webContents);
  });

  mainWindow.on("closed", () => {
    disposeTerminal();
    ipcMain.removeHandler("reviews-terminal:start");
    ipcMain.removeHandler("reviews-terminal:write");
    ipcMain.removeHandler("reviews-terminal:resize");
    ipcMain.removeHandler("reviews-terminal:restart");
  });

  void mainWindow.loadURL(appUrl);
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock.setIcon(logoPath);
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  disposeTerminal();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
