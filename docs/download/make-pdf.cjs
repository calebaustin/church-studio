// Makes docs/download/Download-Church-Studio.pdf, a one-page guide for sharing the app.
// Run: npx electron docs/download/make-pdf.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString('base64');
const REPO = require(path.join(ROOT, 'package.json')).updateRepo;
const link = (arch) => `https://github.com/${REPO}/releases/latest/download/Church-Studio-Mac-${arch}.dmg`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Caveat; src: url(data:font/ttf;base64,${b64('assets/fonts/Caveat.ttf')}); font-weight: 400 700; }
@font-face { font-family: Montserrat; font-weight: 500; src: url(data:font/ttf;base64,${b64('assets/fonts/Montserrat_500Medium.ttf')}); }
@font-face { font-family: Montserrat; font-weight: 700; src: url(data:font/ttf;base64,${b64('assets/fonts/Montserrat_700Bold.ttf')}); }
@font-face { font-family: Montserrat; font-weight: 800; src: url(data:font/ttf;base64,${b64('assets/fonts/Montserrat_800ExtraBold.ttf')}); }
@page { size: letter; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Montserrat, sans-serif; color: #1B2440; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 8.5in; height: 11in; padding: 0.5in 0.6in 0.4in; display: flex; flex-direction: column; gap: 0.2in; background: linear-gradient(170deg, #F4F8F5 0%, #FBF7EF 100%); }
.hero { display: flex; align-items: center; gap: 0.25in; }
.hero img { width: 1.15in; height: 1.15in; }
h1 { font-family: Caveat, cursive; font-size: 46pt; line-height: .9; margin: 0; color: #1F6048; }
.lead { font-size: 11.5pt; line-height: 1.5; margin: 4pt 0 0; color: #2E3A55; }
.free { display: inline-block; margin-top: 6pt; padding: 3pt 10pt; border-radius: 99pt; background: #D9A441; color: #1B2440; font-weight: 800; font-size: 9pt; letter-spacing: .08em; }
.buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 0.18in; }
a.btn { display: block; text-decoration: none; padding: 16pt 16pt 14pt; border-radius: 14pt; background: #2B7F5F; color: #fff; }
a.btn.big { text-align: center; padding: 20pt; }
a.btn.big .t { font-size: 20pt; }
a.btn .t { font-size: 15pt; font-weight: 800; display: block; }
a.btn .s { font-size: 9.5pt; opacity: .85; display: block; margin-top: 3pt; }
a.btn .go { display: inline-block; margin-top: 9pt; padding: 4pt 11pt; border-radius: 99pt; background: rgba(255,255,255,.18); font-weight: 700; font-size: 10pt; }
.card { background: #fff; border-radius: 14pt; padding: 14pt 16pt; box-shadow: 0 0 0 1px rgba(27,36,64,.07); }
h2 { font-size: 12.5pt; margin: 0 0 6pt; font-weight: 800; }
ol, ul { margin: 0; padding-left: 15pt; font-size: 10.5pt; line-height: 1.5; }
li { margin: 2pt 0; }
.two { display: grid; grid-template-columns: 1.25fr 1fr; gap: 0.18in; }
.which { font-size: 10pt; line-height: 1.5; }
.which b { color: #1F6048; }
.note { font-family: Caveat, cursive; font-size: 19pt; color: #1F6048; text-align: center; margin-top: auto; }
.foot { font-size: 8.5pt; color: #5E6676; text-align: center; }
.foot a { color: #2B7F5F; }
</style></head><body><div class="page">
  <div class="hero">
    <img src="data:image/png;base64,${b64('assets/build/icon.png')}" alt="">
    <div>
      <h1>Download Church Studio</h1>
      <p class="lead">Turn Sunday's sermon into clips, transcripts, blog posts, emails, small group guides, graphics and slides, then plan and post it all. One app on your Mac. No account, no cloud, no AI required.</p>
      <span class="free">FREE · FOR MACS WITH APPLE CHIPS</span>
    </div>
  </div>

  <a class="btn big" href="${link('arm64')}"><span class="t">Download Church Studio</span><span class="s">For Macs with an Apple chip: M1, M2, M3, M4 and newer</span><span class="go">Download ↓</span></a>

  <div class="two">
    <div class="card">
      <h2>Install in four steps</h2>
      <ol>
        <li>Click the download button above. It saves to your Downloads folder.</li>
        <li>Open the download, then drag <b>Church Studio</b> into <b>Applications</b>.</li>
        <li>Open Church Studio. macOS asks you to confirm because it's a free app from an independent maker. Click <b>Done</b>.</li>
        <li>Open <b>System Settings › Privacy &amp; Security</b>, scroll down and click <b>Open Anyway</b>. You only do this once.</li>
      </ol>
    </div>
    <div class="card which">
      <h2>Which Mac do I have?</h2>
      Click the Apple menu in the top-left corner, then <b>About This Mac</b>.<br><br>
      If it says <b>Chip: Apple M…</b>, you're ready to download.<br>
      If it says <b>Processor: … Intel</b>, this version won't run on that Mac.
    </div>
  </div>

  <div class="two">
    <div class="card">
      <h2>What you can make</h2>
      <ul>
        <li>Captioned vertical clips that follow the speaker</li>
        <li>Transcripts of sermons, classes and podcasts</li>
        <li>Blog posts, emails and small group guides</li>
        <li>Social graphics, slide decks and event flyers</li>
        <li>A social calendar next to your church's events</li>
      </ul>
    </div>
    <div class="card">
      <h2>Staying up to date</h2>
      <ol>
        <li>In the app, open <b>Settings › Updates</b>.</li>
        <li>Press <b>Download update</b>.</li>
        <li><b>Drag Church Studio into Applications and choose Replace.</b></li>
      </ol>
      <p style="font-size:9.5pt;margin:6pt 0 0;color:#5E6676">Your videos, designs and writing stay where they are.</p>
    </div>
  </div>

  <div class="note">Go into all the world. Today, that includes a feed.</div>
  <div class="foot">Church Studio is free and runs entirely on your Mac. Updates and source: <a href="https://github.com/${REPO}">github.com/${REPO}</a></div>
</div></body></html>`;

app.whenReady().then(async () => {
  const out = path.join(__dirname, 'Download-Church-Studio.pdf');
  fs.writeFileSync(path.join(__dirname, 'download.html'), html);
  const win = new BrowserWindow({ show: false, width: 850, height: 1100 });
  await win.loadFile(path.join(__dirname, 'download.html'));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  const pdf = await win.webContents.printToPDF({ pageSize: 'Letter', printBackground: true, margins: { marginType: 'none' }, preferCSSPageSize: true });
  fs.writeFileSync(out, pdf);
  console.log('Saved', out);
  app.quit();
});
