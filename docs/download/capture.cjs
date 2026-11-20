// Takes the feature screenshots for the share PDF from a running Church Studio engine.
// Run: npx electron docs/download/capture.cjs [http://localhost:4327]
// Saves docs/images/share-*.png at 1440×900. The engine should have a real sermon to show.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const URL = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4327';
const OUT = path.resolve(__dirname, '..', 'images');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Small helpers that run inside the page.
const H = `
  window.__nav = (name) => [...document.querySelectorAll('.side-nav button')].find((b) => b.textContent.trim().startsWith(name))?.click();
  window.__btn = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text))?.click();
  // Click a card the way a person does: on its picture, just above its name.
  window.__card = (text) => { const e = [...document.querySelectorAll('.main *')].find((x) => x.children.length === 0 && x.textContent.trim().startsWith(text)); if (!e) return; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top - 70); (t || e).click(); };
  window.__until = async (sel, ms = 30000) => { const t = Date.now(); while (!document.querySelector(sel) && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 250)); };
`;
const SHOTS = [
  ['share-dashboard', `__nav('Dashboard')`, 2500],
  ['share-sermon', `__nav('Videos'); await new Promise(r=>setTimeout(r,1500)); __card('We Remember His Love'); await new Promise(r=>setTimeout(r,2000)); __btn('Sermon page');`, 3500],
  ['share-clip', `__btn('Edit & export'); await new Promise(r=>setTimeout(r,2500)); [...document.querySelectorAll('.tabs button')].find(b=>b.textContent.trim()==='Framing')?.click(); await new Promise(r=>setTimeout(r,800)); document.querySelector('.look-card summary, .look-head, [aria-expanded="false"]')?.click();`, 3500],
  ['share-writing', `__nav('Writing'); await new Promise(r=>setTimeout(r,1500)); __card('How We Love');`, 3500],
  ['share-design', `__nav('Design'); await new Promise(r=>setTimeout(r,1500)); __card('Fall Harvest'); await new Promise(r=>setTimeout(r,2500)); document.querySelector('.helper-fab')?.click(); await new Promise(r=>setTimeout(r,1500)); __btn('Headline ideas'); await __until('.helper-option');`, 2500],
  ['share-ai', `document.querySelector('button[aria-label="Minimize"]')?.click(); await new Promise(r=>setTimeout(r,600)); __nav('Settings'); await new Promise(r=>setTimeout(r,800)); __btn('AI helper');`, 2500],
];

app.whenReady().then(async () => {
  // A real window, parked off-screen, captures reliably (hidden or offscreen windows can stall).
  const win = new BrowserWindow({ width: 1440, height: 900, x: -4000, y: 0, show: true, frame: false, focusable: false, skipTaskbar: true });
  await win.loadURL(URL);
  await wait(3000);
  await win.webContents.executeJavaScript(`${H}; true`); // return something simple, not a function
  for (const [name, js, settle] of SHOTS) {
    try { await win.webContents.executeJavaScript(`(async () => { ${js}; return true; })()`); } catch (e) { console.log(name, 'step failed:', e.message); }
    await wait(settle);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
    console.log('Saved', name, img.getSize());
  }
  app.quit();
});
