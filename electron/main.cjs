// Electron shell: own window, starts the local daemon, loads the UI from it.
const { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, screen, shell } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SC_PORT || 4317);
let daemon = null;
let mainWindow = null;
let presentWindow = null;

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
  win.on('closed', () => { if (presentWindow && !presentWindow.isDestroyed()) presentWindow.destroy(); });
  await win.loadURL(process.env.SC_UI_URL || `http://127.0.0.1:${PORT}/`);
}

ipcMain.handle('pick-video', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('pick-media', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Audio or video', extensions: ['mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg', 'aiff', 'aif', 'caf', 'opus', 'mp4', 'mov', 'm4v', 'mkv', 'webm'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('pick-files', async (_e, opts) => {
  // opts: { name, extensions, multi } for a specific kind of file, like a Jumpstart .zip.
  const ext = Array.isArray(opts?.extensions) ? opts.extensions.filter((x) => /^[a-z0-9]{1,6}$/i.test(x)) : null;
  const r = await dialog.showOpenDialog({
    properties: ['openFile', ...(opts?.multi === false ? [] : ['multiSelections'])],
    filters: [ext?.length ? { name: String(opts.name || 'Files').slice(0, 40), extensions: ext } : { name: 'Images and media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'heic', 'mp4', 'mov', 'pdf'] }],
  });
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
// Presenting: the audience screen goes full screen on another display, or opens as a window
// that can be dragged to a projector when only one display is connected.
const uiBase = () => process.env.SC_UI_URL || `http://127.0.0.1:${PORT}/`;
ipcMain.handle('displays', () => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, primary: d.id === primary, label: d.label || (d.id === primary ? 'This screen' : `Screen ${i + 1}`), width: d.size.width, height: d.size.height }));
});
ipcMain.handle('present-open', async (_e, { displayId } = {}) => {
  try {
    if (presentWindow && !presentWindow.isDestroyed()) presentWindow.destroy();
    const d = displayId != null ? screen.getAllDisplays().find((x) => x.id === displayId) : null;
    const b = d ? d.bounds : { width: 960, height: 540 };
    presentWindow = new BrowserWindow({
      ...b, show: false, backgroundColor: '#000000', title: 'Audience screen', frame: !d, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
    });
    presentWindow.on('closed', () => { presentWindow = null; });
    await presentWindow.loadURL(`${uiBase()}#present-out`);
    presentWindow.show();
    if (d) presentWindow.setSimpleFullScreen(true);
    mainWindow?.focus();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('present-close', () => { if (presentWindow && !presentWindow.isDestroyed()) presentWindow.destroy(); presentWindow = null; });
// The Dock shows the church's logo while the app runs (drawn by the UI). null puts the app icon back.
ipcMain.handle('set-dock-icon', (_e, dataUrl) => {
  if (process.platform !== 'darwin') return;
  if (dataUrl) app.dock.setIcon(nativeImage.createFromDataURL(dataUrl));
  else app.dock.setIcon(nativeImage.createFromPath(app.isPackaged ? path.join(process.resourcesPath, 'assets', 'build', 'icon.png') : path.join(ROOT, 'assets', 'build', 'icon.png')));
});
// Mac notifications for finished work and posts that are due. Clicking one brings the app forward.
ipcMain.handle('notify', (_e, { title, body } = {}) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title: String(title || 'Church Studio').slice(0, 80), body: String(body || '').slice(0, 200), silent: false });
  n.on('click', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  n.show();
  return true;
});
// Web links, and mailto: so feedback can open the person's Mail app filled in.
ipcMain.handle('open-external', (_e, url) => { if (/^https:\/\//.test(url) || /^mailto:[^\s@]+@[^\s@]+/.test(url)) shell.openExternal(url); });

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
app.on('before-quit', () => { if (presentWindow && !presentWindow.isDestroyed()) presentWindow.destroy(); });
app.on('quit', () => daemon?.kill());
