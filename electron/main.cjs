// Electron shell: own window, starts the local daemon, loads the UI from it.
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SC_PORT || 4317);
let daemon = null;

function startDaemon() {
  if (process.env.SC_EXTERNAL_DAEMON) return Promise.resolve();
  return new Promise((resolve, reject) => {
    daemon = fork(path.join(ROOT, 'src', 'daemon', 'server.js'), [], {
      cwd: ROOT,
      env: {
        ...process.env, ELECTRON_RUN_AS_NODE: '1', SC_PORT: String(PORT),
        // Packaged: data in ~/Library/Application Support/Sermon Clips, bundled tools in Resources.
        ...(app.isPackaged ? { SC_HOME: app.getPath('userData'), SC_RESOURCES: process.resourcesPath } : {}),
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const timer = setTimeout(() => reject(new Error('Daemon did not start in 15 s')), 15000);
    daemon.on('message', (m) => { if (m?.ready) { clearTimeout(timer); resolve(); } });
    daemon.on('exit', (code) => { clearTimeout(timer); if (code) reject(new Error(`Daemon exited ${code}`)); });
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1080, minHeight: 700,
    title: 'Sermon Clips',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: '#EEF2F8',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(process.env.SC_UI_URL || `http://127.0.0.1:${PORT}/`);
}

ipcMain.handle('pick-video', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('open-external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

app.whenReady().then(async () => {
  try {
    await startDaemon();
  } catch (e) {
    dialog.showErrorBox('Sermon Clips couldn’t start', app.isPackaged ? e.message : `${e.message}\n\nRun scripts/setup.sh and try again.`);
    app.quit();
    return;
  }
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
app.on('quit', () => daemon?.kill());
