import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logoPath = path.join(__dirname, "..", "public", "logo.png");

const DEFAULT_APP_URL = "http://127.0.0.1:4731/dashboard";

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
      preload: path.join(__dirname, "preload.mjs"),
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
