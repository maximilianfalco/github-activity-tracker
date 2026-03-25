import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("ghatDesktop", {
  isDesktop: true,
  platform: process.platform,
});
