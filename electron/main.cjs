// Electron shell: own window, starts the local daemon, loads the UI from it.
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SC_PORT || 4317);
let daemon = null;
let mainWindow = null;

function startDaemon() {
  if (process.env.SC_EXTERNAL_DAEMON) return Promise.resolve();
  return new Promise((resolve, reject) => {
    daemon = fork(path.join(ROOT, 'src', 'daemon', 'server.js'), [], {
      cwd: ROOT,
      env: {
        ...process.env, ELECTRON_RUN_AS_NODE: '1', SC_PORT: String(PORT),
        // Packaged: data in ~/Library/Application Support/Church Studio, bundled tools in Resources.
        ...(app.isPackaged ? { SC_HOME: app.getPath('userData'), SC_RESOURCES: process.resourcesPath } : {}),
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const timer = setTimeout(() => reject(new Error('Daemon did not start in 15 s')), 15000);
    daemon.on('message', (m) => { if (m?.ready) { clearTimeout(timer); resolve(); } });
    daemon.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 75) {
        // Switching workspaces: start the engine again and reload the window.
        startDaemon().then(() => mainWindow?.reload()).catch((e) => dialog.showErrorBox('Church Studio', e.message));
        return;
      }
      if (code) reject(new Error(`Daemon exited ${code}`));
    });
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1080, minHeight: 700,
    title: 'Church Studio',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: '#EEF2F8',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow = win;
  await win.loadURL(process.env.SC_UI_URL || `http://127.0.0.1:${PORT}/`);
}

ipcMain.handle('pick-video', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('pick-files', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images and media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'heic', 'mp4', 'mov', 'pdf'] }] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
// Print or make a PDF from a self-contained HTML page (writing guides). The page sets
// window.__ready once its images are loaded and its text is sized to fit.
ipcMain.handle('print-doc', async (_e, { html, landscape = false, action = 'pdf' }) => {
  const win = new BrowserWindow({ show: false, width: 1100, height: 1400, webPreferences: { sandbox: true, javascript: true } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    for (let i = 0; i < 100; i++) { if (await win.webContents.executeJavaScript('window.__ready === true')) break; await new Promise((r) => setTimeout(r, 100)); }
    if (action === 'print') {
      return await new Promise((resolve) => win.webContents.print({ printBackground: true, landscape }, (ok, reason) => resolve({ ok, reason })));
    }
    const pdf = await win.webContents.printToPDF({ pageSize: 'Letter', landscape, printBackground: true, margins: { marginType: 'none' }, preferCSSPageSize: true });
    return { ok: true, pdf: pdf.toString('base64') };
  } finally {
    setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, action === 'print' ? 60_000 : 0);
  }
});
ipcMain.handle('open-external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

/** The app used to be called Sermon Clips. Move its data to the new folder once, keeping workspace paths valid. */
function migrateOldData() {
  if (!app.isPackaged) return;
  const now = app.getPath('userData');
  const old = path.join(path.dirname(now), 'Sermon Clips');
  if (!fs.existsSync(old) || fs.existsSync(path.join(now, 'config.local.json'))) return;
  try {
    fs.mkdirSync(now, { recursive: true });
    for (const name of fs.readdirSync(old)) {
      const to = path.join(now, name);
      if (!fs.existsSync(to)) fs.renameSync(path.join(old, name), to);
    }
    const reg = path.join(now, 'workspaces.json');
    if (fs.existsSync(reg)) fs.writeFileSync(reg, fs.readFileSync(reg, 'utf8').split(JSON.stringify(old).slice(1, -1)).join(JSON.stringify(now).slice(1, -1)));
  } catch (e) { console.error('Could not move old data:', e.message); }
}

app.whenReady().then(async () => {
  const icon = path.join(ROOT, 'assets', 'build', 'icon.png');
  if (!app.isPackaged && process.platform === 'darwin' && fs.existsSync(icon)) app.dock.setIcon(icon);
  migrateOldData();
  try {
    await startDaemon();
  } catch (e) {
    dialog.showErrorBox('Church Studio couldn’t start', app.isPackaged ? e.message : `${e.message}\n\nRun scripts/setup.sh and try again.`);
    app.quit();
    return;
  }
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
app.on('quit', () => daemon?.kill());
