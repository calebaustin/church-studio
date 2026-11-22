// Electron shell: own window, starts the local daemon, loads the UI from it.
const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, Notification, screen, session, shell, Tray } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SC_PORT || 4317);
let daemon = null;
let mainWindow = null;
let presentWindow = null;
let tray = null;
let trayWindow = null;
let quitting = false;

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
  win.on('closed', () => {
    mainWindow = null;
    if (presentWindow && !presentWindow.isDestroyed()) presentWindow.destroy();
    // The menu bar panel is a hidden window; closing the main window still quits the app.
    if (!quitting) app.quit();
  });
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
// Quit so a downloaded update can replace the app in Applications.
ipcMain.handle('quit-app', () => { setTimeout(() => app.quit(), 50); });
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

// ---- Menu bar: a small icon that opens a Control Center style panel (week, checklist, stats, jump back in).
const TRAY_W = 380;
const TRAY_H = 452;
function showMain(route) {
  if (!mainWindow || mainWindow.isDestroyed()) { createWindow().then(() => route && mainWindow.webContents.send('go', route)); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus(); app.focus({ steal: true });
  if (route) mainWindow.webContents.send('go', route);
}
function placeTrayWindow() {
  const b = tray.getBounds();
  const area = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  const x = Math.round(Math.min(Math.max(b.x + b.width / 2 - TRAY_W / 2, area.x + 8), area.x + area.width - TRAY_W - 8));
  trayWindow.setPosition(x, Math.round(area.y + 6), false);
}
function toggleTrayWindow() {
  if (!trayWindow || trayWindow.isDestroyed()) {
    trayWindow = new BrowserWindow({
      width: TRAY_W, height: TRAY_H, show: false, frame: false, transparent: true, hasShadow: false, resizable: false,
      movable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
      backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
    });
    trayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    trayWindow.on('blur', () => { if (!trayWindow.webContents.isDevToolsOpened()) trayWindow.hide(); });
    trayWindow.loadURL(`${uiBase()}#tray`).then(() => { placeTrayWindow(); trayWindow.show(); });
    return;
  }
  if (trayWindow.isVisible()) { trayWindow.hide(); return; }
  placeTrayWindow();
  trayWindow.show();
  trayWindow.webContents.send('tray-shown');
}
function setMenuBar(on) {
  if (on && !tray) {
    const img = nativeImage.createFromPath(path.join(app.isPackaged ? process.resourcesPath : ROOT, 'assets', 'build', 'trayTemplate.png'));
    img.setTemplateImage(true);
    tray = new Tray(img);
    tray.setToolTip('Church Studio');
    tray.on('click', toggleTrayWindow);
    tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Open Church Studio', click: () => showMain() },
      { type: 'separator' },
      { label: 'Quit Church Studio', click: () => app.quit() },
    ])));
  } else if (!on && tray) {
    tray.destroy(); tray = null;
    if (trayWindow && !trayWindow.isDestroyed()) trayWindow.destroy();
    trayWindow = null;
  }
}
ipcMain.handle('set-menu-bar', (_e, on) => setMenuBar(!!on));
// From the panel: open the main window on a screen, then tuck the panel away.
ipcMain.handle('open-route', (_e, route) => {
  if (trayWindow && !trayWindow.isDestroyed()) trayWindow.hide();
  showMain(route && typeof route === 'object' ? route : null);
});
// ---- social sites in Church Studio windows: view, sign in once, and post without any developer account.
// Every site shares one remembered session ("persist:social"), so a sign-in sticks between launches.
const SITES = {
  instagram: { name: 'Instagram', login: 'https://www.instagram.com/accounts/login/', upload: 'https://www.instagram.com/', cookie: ['instagram.com', 'sessionid'] },
  facebook: { name: 'Facebook', login: 'https://www.facebook.com/login', upload: 'https://www.facebook.com/reels/create', cookie: ['facebook.com', 'c_user'] },
  youtube: { name: 'YouTube', login: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fstudio.youtube.com%2F', upload: 'https://www.youtube.com/upload', cookie: ['youtube.com', 'LOGIN_INFO'], autoFile: true },
  tiktok: { name: 'TikTok', login: 'https://www.tiktok.com/login', upload: 'https://www.tiktok.com/tiktokstudio/upload', cookie: ['tiktok.com', 'sessionid'], autoFile: true },
  x: { name: 'X', login: 'https://x.com/i/flow/login', upload: 'https://x.com/compose/post', cookie: ['x.com', 'auth_token'] },
  linkedin: { name: 'LinkedIn', login: 'https://www.linkedin.com/login', upload: 'https://www.linkedin.com/feed/?shareActive=true', cookie: ['linkedin.com', 'li_at'] },
  threads: { name: 'Threads', login: 'https://www.threads.com/login', upload: 'https://www.threads.com/', cookie: ['threads.com', 'sessionid'] },
};
let socialReady = false;
function socialSession() {
  const ses = session.fromPartition('persist:social');
  if (!socialReady) {
    // Sites like Google won't sign in from a browser that says it's an embedded app, so these windows say they're Chrome.
    ses.setUserAgent(ses.getUserAgent().replace(/\s?Electron\/\S+/, '').replace(/\s?church-studio\/\S+/i, ''));
    socialReady = true;
  }
  return ses;
}
const webWindows = new Map();
function webWindow(key, url, title) {
  const open = webWindows.get(key);
  if (open && !open.isDestroyed()) { open.loadURL(url); open.show(); open.focus(); return open; }
  const w = new BrowserWindow({ width: 1100, height: 900, title, autoHideMenuBar: true,
    webPreferences: { session: socialSession(), contextIsolation: true, sandbox: true } });
  // Sign-in pop-ups (Google, Facebook) open in the same remembered session, not in another browser.
  w.webContents.setWindowOpenHandler(({ url: u }) => (/^https:\/\//.test(u)
    ? { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, webPreferences: { session: socialSession(), contextIsolation: true, sandbox: true } } }
    : { action: 'deny' }));
  w.on('closed', () => webWindows.delete(key));
  webWindows.set(key, w);
  w.loadURL(url);
  return w;
}
ipcMain.handle('open-web', (_e, { url, title } = {}) => {
  if (!/^https:\/\//.test(String(url || ''))) return false;
  const host = new URL(url).hostname;
  const key = Object.keys(SITES).find((k) => host.includes(SITES[k].cookie[0].split('.')[0])) || host;
  webWindow(key, url, title || host);
  return true;
});
ipcMain.handle('web-login', (_e, platform) => { const s = SITES[platform]; if (!s) return false; webWindow(platform, s.login, `Sign in to ${s.name} · Church Studio`); return true; });
/** Which sites Church Studio is signed in to, from the saved session. */
ipcMain.handle('web-status', async () => {
  const ses = socialSession(); const out = {};
  for (const [k, s] of Object.entries(SITES)) {
    const [domain, name] = s.cookie;
    const c = await ses.cookies.get({ domain, name }).catch(() => []);
    out[k] = c.some((x) => x.value && (!x.expirationDate || x.expirationDate * 1000 > Date.now()));
  }
  return out;
});
ipcMain.handle('web-logout', async (_e, platform) => {
  const s = SITES[platform]; if (!s) return false;
  const ses = socialSession();
  for (const c of await ses.cookies.get({ domain: s.cookie[0] })) {
    await ses.cookies.remove(`https://${c.domain.replace(/^\./, '')}${c.path}`, c.name).catch(() => {});
  }
  return true;
});
/**
 * Post through the site itself: open its upload page signed in, hand it the video the moment it asks for a file
 * (no file picker), copy the caption, and show a small note at the top of the page saying what's next.
 */
ipcMain.handle('web-post', async (_e, { platform, file, caption = '', title = '' } = {}) => {
  const s = SITES[platform];
  if (!s || !file || !fs.existsSync(file)) return { ok: false, error: 'That video isn’t on this Mac anymore. Export it again.' };
  if (caption) clipboard.writeText(caption);
  const w = webWindow(platform, s.upload, `Post to ${s.name} · Church Studio`);
  const dbg = w.webContents.debugger;
  try { if (!dbg.isAttached()) dbg.attach('1.3'); } catch { /* another tool attached: the file picker still works by hand */ }
  const give = async (backendNodeId) => { try { await dbg.sendCommand('DOM.setFileInputFiles', { files: [file], backendNodeId }); } catch { /* the page moved on */ } };
  const intercept = async () => { try { await dbg.sendCommand('Page.enable'); await dbg.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true }); } catch { /* fine */ } };
  dbg.removeAllListeners('message');
  dbg.on('message', (_ev, method, params) => { if (method === 'Page.fileChooserOpened' && params.backendNodeId) give(params.backendNodeId); });
  await intercept();
  const note = `Church Studio: when ${s.name} asks for a file, your video goes in by itself.${caption ? ' The caption is copied: click the caption box and press ⌘V.' : ''}${title ? ` Title: ${title}` : ''}`;
  const show = () => {
    intercept();
    w.webContents.executeJavaScriptInIsolatedWorld(1001, [{ code: `(() => {
      if (document.getElementById('cs-post-note')) return;
      const d = document.createElement('div'); d.id = 'cs-post-note';
      d.style.cssText = 'position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);max-width:min(720px,92vw);padding:10px 40px 10px 16px;border-radius:999px;background:#2B5F45;color:#fff;font:600 13px -apple-system,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)';
      d.textContent = ${JSON.stringify(note)};
      const x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', 'Close');
      x.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:#fff;font-size:18px;cursor:pointer';
      x.onclick = () => d.remove(); d.appendChild(x); document.documentElement.appendChild(d);
    })();` }]).catch(() => {});
    // Upload pages that already show a file box (YouTube, TikTok) get the video right away.
    if (s.autoFile) setTimeout(async () => {
      try {
        const { root } = await dbg.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
        const { nodeId } = await dbg.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
        if (nodeId) await dbg.sendCommand('DOM.setFileInputFiles', { files: [file], nodeId });
      } catch { /* not there yet: the file picker hand-off covers it */ }
    }, 2500);
  };
  w.webContents.removeAllListeners('did-finish-load');
  w.webContents.on('did-finish-load', show);
  if (!w.webContents.isLoading()) show();
  return { ok: true };
});
/** Drag a clip or design out of Church Studio into any window: a browser, Finder, Mail, Messages. */
ipcMain.on('start-drag', (e, file) => {
  if (!file || !fs.existsSync(file)) return;
  const icon = nativeImage.createFromPath(path.join(app.isPackaged ? process.resourcesPath : ROOT, 'assets', 'build', 'icon.png'));
  e.sender.startDrag({ file, icon: icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 64, height: 64 }) });
});
ipcMain.handle('tray-hide', () => { if (trayWindow && !trayWindow.isDestroyed()) trayWindow.hide(); });
async function menuBarWanted() {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/config`); const j = await r.json(); return j.config?.menuBar !== false; } catch { return true; }
}

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
  if (process.platform === 'darwin' && await menuBarWanted()) setMenuBar(true);
  if (tray && process.env.SC_TRAY_OPEN) toggleTrayWindow(); // development: open the panel at launch
  app.on('activate', () => { if (!mainWindow || mainWindow.isDestroyed()) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { quitting = true; if (presentWindow && !presentWindow.isDestroyed()) presentWindow.destroy(); });
app.on('quit', () => daemon?.kill());
