import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import os from "os";
import isDev from "electron-is-dev";
import { initRenderer } from 'electron-store';
import { autoUpdater } from'electron-updater';
import { I18n } from 'i18n';

import { stopClient } from "./proxy";
import { setMainWindow } from "./proxy/client";
import logger from "./logs";
import { setupAfterInstall } from "./install";
import { IpcMainProcess } from './service/index';
import { IpcMainProcess as IpcMainProcessType, IpcMainWindowType } from './types/extention';
import IpcMainWindow from './window/MainWindow';
import { MessageChannel, ProcessManager } from 'electron-re';
import { checkEnvFiles, copyDir } from "./utils/utils";
import chmod from "./utils/fsChmod";
import { startProfiler } from "./performance/v8-inspect-profiler";

const packageName = 'shadowsocks-electron';
const platform = os.platform();
export const isInspect = process.env.INSPECT;
export let ipcMainProcess: IpcMainProcessType;
export let ipcMainWindow: IpcMainWindowType;
export const msgc = MessageChannel;

const appDataPath = path.join(app.getPath('appData'), packageName);
const pathRuntime = path.join(appDataPath, 'runtime/');
const pathExecutable = isDev ? app.getAppPath() : path.dirname(app.getPath('exe'));

export const getPathRoot = (p: string) => path.join(appDataPath, p);
export const getPathRuntime = (p: string) => path.join(pathRuntime, p);

export const i18n = new I18n();

logger.info(`appDataPath: ${appDataPath}`);
logger.info(`pathRuntime: ${pathRuntime}`);

/* -------------- pre work -------------- */

require('v8-compile-cache');

app.setAppUserModelId(`io.nojsja.${packageName}`);
app.dock?.hide();

checkEnvFiles(
  [
    { _path: appDataPath, isDir: true },
    ...(platform === 'linux' ? [{ _path: `${os.homedir}/.config/autostart`, isDir: true }] : []),
    { _path: pathRuntime, isDir: true },
    { _path: path.join(pathRuntime, 'bin'), isDir: true,
      exec: () => {
        copyDir(path.join(pathExecutable, 'bin'), path.join(pathRuntime, 'bin'));
      }
    }
  ]
);
chmod(path.join(pathRuntime, 'bin'), 0o711);

if (platform === 'linux') {
  try {
    app.disableHardwareAcceleration();
  } catch (error) {
    console.log(error);
  }
}

/* -------------- electron life cycle -------------- */

app.on("ready", async () => {
  let mainProfiler: any;

  isInspect && (mainProfiler = await startProfiler('main', 5222));

  initRenderer();
  ipcMainProcess = new IpcMainProcess(ipcMain);

  await setupAfterInstall(true);

  i18n.configure({
    locales: ['en-US', 'zh-CN'],
    defaultLocale: 'en-US',
    directory: path.join(__dirname, 'locales')
  });

  ipcMainWindow = new IpcMainWindow({
    width: 460,
    height: 540
  });
  ipcMainWindow.create().then((win: BrowserWindow) => {
    (global as any).win = win;
    if (isDev) {
      // win.webContents.openDevTools({ mode: 'undocked' });
      ProcessManager.openWindow();
    }
    setMainWindow(win);
  });

  ipcMainWindow.createTray();

  !isDev && autoUpdater.checkForUpdatesAndNotify();
  isInspect && setTimeout(() => { mainProfiler?.stop(); }, 5e3);
});

app.on("window-all-closed", () => {
  if (platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  ipcMainWindow.beforeQuitting();
});

app.on("will-quit", async () => {
  logger.info("App will quit. Cleaning up...");
  await stopClient();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    ipcMainWindow.create();
  }
});

process.on('exit', () => {
  app.quit();
});
