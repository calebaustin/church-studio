// Not used yet: kept for a future "expert mode" that turns on advanced settings across the app.
// Open a clip in a full video editor: Final Cut Pro (.fcpxml, also opens in DaVinci Resolve), Premiere
// Pro (.xml) and a caption file (.srt). The edit points match the clip, including words you cut and
// tightened pauses, and point at the original video, so nothing is re-encoded.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { file, getProject, getTranscript } from './projects.js';
import { keepSegments, downloadsDir } from './render.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (s) => String(s || 'Clip').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Clip';
const srtTime = (t) => { const ms = Math.max(0, Math.round(t * 1000)); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const s = Math.floor((ms % 60000) / 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };

/** Pieces of the source to use, in source seconds: [[start, end], ...]. */
function pieces(clip, words) {
  const keep = keepSegments(words, clip);
  const local = keep?.length ? keep : [[0, clip.end - clip.start]];
  return local.map(([a, b]) => [clip.start + a, clip.start + b]).filter(([a, b]) => b - a > 0.05);
}

/** Captions on the edited timeline, a few words at a time. */
function srt(clip, words, parts) {
  const cut = new Set(clip.cutWords || []);
  const lines = []; let out = 0; let group = [];
  const flush = () => { if (group.length) { lines.push([group[0].t0, group.at(-1).t1, group.map((g) => g.w).join(' ')]); group = []; } };
  for (const [a, b] of parts) {
    for (const [i, w] of words.entries()) {
      if (cut.has(i) || w.start < a || w.end > b) continue;
      group.push({ w: w.w, t0: out + (w.start - a), t1: out + (w.end - a) });
      if (group.length >= 4 || /[.?!]$/.test(w.w)) flush();
    }
    flush();
    out += b - a;
  }
  return lines.map(([s, e, t], k) => `${k + 1}\n${srtTime(s)} --> ${srtTime(e)}\n${t}\n`).join('\n');
}

function fcpxml({ name, src, fps, width, height, duration, parts }) {
  const fd = `100/${Math.round(fps * 100)}s`;
  const r = (t) => `${Math.round(t * fps) * 100}/${Math.round(fps * 100)}s`; // whole frames, as Final Cut expects
  let offset = 0;
  const clips = parts.map(([a, b]) => { const c = `<asset-clip ref="r2" offset="${r(offset)}" name="${esc(name)}" start="${r(a)}" duration="${r(b - a)}" tcFormat="NDF"/>`; offset += b - a; return c; });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" frameDuration="${fd}" width="${width}" height="${height}"/>
    <asset id="r2" name="${esc(path.basename(src))}" start="0s" duration="${r(duration)}" hasVideo="1" hasAudio="1" format="r1" audioSources="1" audioChannels="2">
      <media-rep kind="original-media" src="${esc(`file://${encodeURI(src)}`)}"/>
    </asset>
  </resources>
  <library>
    <event name="Church Studio">
      <project name="${esc(name)}">
        <sequence format="r1" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            ${clips.join('\n            ')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

function xmeml({ name, src, fps, width, height, duration, parts }) {
  const tb = Math.round(fps);
  const f = (t) => Math.round(t * tb);
  const total = parts.reduce((a, [s, e]) => a + (e - s), 0);
  const fileEl = (first) => (first
    ? `<file id="file-1"><name>${esc(path.basename(src))}</name><pathurl>${esc(`file://localhost${encodeURI(src)}`)}</pathurl><rate><timebase>${tb}</timebase></rate><duration>${f(duration)}</duration><media><video><samplecharacteristics><width>${width}</width><height>${height}</height></samplecharacteristics></video><audio><channelcount>2</channelcount></audio></media></file>`
    : '<file id="file-1"/>');
  let at = 0; let k = 0;
  const items = (kind) => { at = 0; return parts.map(([a, b]) => { const s = at; at += b - a; k++; return `<clipitem id="${kind}-${k}"><name>${esc(name)}</name><rate><timebase>${tb}</timebase></rate><start>${f(s)}</start><end>${f(at)}</end><in>${f(a)}</in><out>${f(b)}</out>${fileEl(kind === 'v' && k === 1)}</clipitem>`; }).join(''); };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>${esc(name)}</name>
    <duration>${f(total)}</duration>
    <rate><timebase>${tb}</timebase></rate>
    <media>
      <video><format><samplecharacteristics><width>${width}</width><height>${height}</height></samplecharacteristics></format><track>${items('v')}</track></video>
      <audio><track>${items('a')}</track></audio>
    </media>
  </sequence>
</xmeml>
`;
}

/** Write the editor files for one clip into a folder in Downloads. */
export async function exportForEditors(projectId, clipId) {
  const p = await getProject(projectId);
  if (!p) throw new Error('Project not found');
  const clip = p.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error('Clip not found');
  if (!p.media?.width) throw new Error('This project has no video to send to an editor.');
  const t = await getTranscript(projectId).catch(() => null);
  const words = t?.words || [];
  const src = file(projectId, p.sourceFile);
  const parts = pieces(clip, words);
  const info = { name: clip.title || p.title, src, fps: p.media.fps || 30, width: p.media.width, height: p.media.height, duration: p.media.duration, parts };
  const dir = path.join(downloadsDir() || os.homedir(), `${clean(clip.title || p.title)} - for editors`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${clean(clip.title)} (Final Cut Pro, DaVinci).fcpxml`), fcpxml(info));
  await writeFile(path.join(dir, `${clean(clip.title)} (Premiere Pro).xml`), xmeml(info));
  if (words.length) await writeFile(path.join(dir, `${clean(clip.title)} captions.srt`), srt(clip, words, parts));
  return { folder: dir, pieces: parts.length, seconds: +parts.reduce((a, [s, e]) => a + (e - s), 0).toFixed(2) };
}
