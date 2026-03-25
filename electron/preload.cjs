const { contextBridge, ipcRenderer } = require("electron");

const TERMINAL_CHANNELS = {
  data: "reviews-terminal:data",
  exit: "reviews-terminal:exit",
};

/**
 * @callback TerminalDataCallback
 * @param {string} data
 * @returns {void}
 */

/**
 * @callback TerminalExitCallback
 * @param {{ exitCode: number, signal: number }} payload
 * @returns {void}
 */

contextBridge.exposeInMainWorld("ghatDesktop", {
  isDesktop: true,
  platform: process.platform,
  reviewsTerminal: {
    start: () => ipcRenderer.invoke("reviews-terminal:start"),
    /**
     * @param {string} data
     */
    write: (data) => ipcRenderer.invoke("reviews-terminal:write", data),
    /**
     * @param {number} cols
     * @param {number} rows
     */
    resize: (cols, rows) =>
      ipcRenderer.invoke("reviews-terminal:resize", { cols, rows }),
    restart: () => ipcRenderer.invoke("reviews-terminal:restart"),
    /**
     * @param {TerminalDataCallback} callback
     */
    onData: (callback) => {
      /**
       * @param {Electron.IpcRendererEvent} _event
       * @param {string} data
       */
      const listener = (_event, data) => callback(data);
      ipcRenderer.on(TERMINAL_CHANNELS.data, listener);
      return () => ipcRenderer.removeListener(TERMINAL_CHANNELS.data, listener);
    },
    /**
     * @param {TerminalExitCallback} callback
     */
    onExit: (callback) => {
      /**
       * @param {Electron.IpcRendererEvent} _event
       * @param {{ exitCode: number, signal: number }} payload
       */
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on(TERMINAL_CHANNELS.exit, listener);
      return () => ipcRenderer.removeListener(TERMINAL_CHANNELS.exit, listener);
    },
  },
});
