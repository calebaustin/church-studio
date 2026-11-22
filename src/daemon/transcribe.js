// Audio extraction + Whisper transcription with word timestamps.
// Optionally limited to a range (when the user already knows where the sermon is),
// which makes long service videos much faster to process.
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { jsonFrom, run, tool, pyCommand } from './tools.js';
import { file, getProject, updateProject } from './projects.js';
import { loadConfig } from './config.js';
import { detectSermon } from './sermon.js';
import { audioFilter } from './audio.js';
import { normalizeWords, normalizeText, WHISPER_HINT } from './scripture.js';

export async function transcribeProject(id, { start = null, end = null, cleanup } = {}, ctx) {
  const project = await getProject(id);
  if (!project?.sourceFile) throw new Error('The video has not finished downloading.');
  const config = await loadConfig();
  const source = file(id, project.sourceFile);
  const wav = file(id, 'audio.wav');

  // Cleanup chosen here is remembered for the clips too.
  if (cleanup !== undefined) await updateProject(id, (p) => { p.audioCleanup = cleanup?.preset && cleanup.preset !== 'none' ? { preset: cleanup.preset, amount: Number(cleanup.amount ?? 0.5) } : null; });
  const af = audioFilter(cleanup !== undefined ? cleanup : project.audioCleanup);
  ctx.progress(2, af ? 'Extracting and cleaning up the audio…' : 'Extracting audio…');
  const range = [];
  if (start != null) range.push('-ss', String(start));
  if (end != null) range.push('-t', String(end - (start ?? 0)));
  await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', ...range, '-i', source, '-vn', ...(af ? ['-af', af] : []), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { signal: ctx.signal });

  ctx.progress(6, `Transcribing with Whisper (${config.whisperModel})… the first run downloads the model.`);
  ctx.detail({ Model: `Whisper ${config.whisperModel}`, Audio: af ? 'Cleaned up first' : null });
  const began = Date.now();
  const clock = (t) => { t = Math.round(t); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const x = String(t % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const { stdout } = await run(...pyCommand('transcribe', [wav, '--model', config.whisperModel, '--offset', String(start ?? 0), '--hotwords', WHISPER_HINT]), {
    signal: ctx.signal,
    onStderr: (chunk) => {
      const dev = chunk.match(/DEVICE (\w+)/);
      if (dev) ctx.detail({ 'Runs on': dev[1] === 'cuda' ? 'Graphics card' : dev[1] === 'cpu' ? 'This Mac’s processor' : dev[1] });
      const m = [...chunk.matchAll(/PROGRESS (\d+)(?: ([\d.]+) ([\d.]+) (\d+))?/g)].pop();
      if (!m) return;
      ctx.progress(6 + Number(m[1]) * 0.9, `Transcribing… ${m[1]}%`);
      if (m[2]) {
        const at = Number(m[2]); const len = Number(m[3]); const secs = (Date.now() - began) / 1000;
        ctx.detail({ Position: `${clock(at)} of ${clock(len)}`, 'Words so far': Number(m[4]).toLocaleString(), Pace: secs > 5 && at > 0 ? `${(at / secs).toFixed(1)}× real time` : null });
      }
    },
  });
  const transcript = jsonFrom(stdout);
  // Write Bible references the way people read them: 1 Corinthians 10:16.
  transcript.words = normalizeWords(transcript.words);
  for (const s of transcript.segments || []) s.text = normalizeText(s.text);
  transcript.scripture = 1;
  transcript.range = start != null || end != null ? { start: start ?? 0, end: end ?? project.media?.duration } : null;
  await writeFile(file(id, 'transcript.json'), JSON.stringify(transcript));
  await rm(wav, { force: true });

  ctx.progress(97, 'Finding the sermon…');
  const total = project.media?.duration ?? transcript.duration;
  const sermon = transcript.range
    ? { start: transcript.range.start, end: transcript.range.end, confidence: 1, method: 'manual', confirmed: true, reasons: ['You set this range before transcribing.'] }
    // Only the sermon was downloaded: the whole file is the sermon.
    : project.range ? { start: 0, end: total, confidence: 1, method: 'manual', confirmed: true, reasons: ['You downloaded just the sermon.'] }
      : detectSermon(transcript.words, total);
  await updateProject(id, (p) => {
    p.status = 'transcribed';
    p.sermon = sermon;
    // Shorts, lyric clips and wide videos use the whole recording as one clip, ready to edit.
    if (['short', 'lyric', 'wide'].includes(p.kind) && !p.clips.length) {
      const words = transcript.words;
      const start = Math.max(0, (words[0]?.start ?? 0) - 0.3);
      const end = Math.min(p.media?.duration ?? transcript.duration, (words.at(-1)?.end ?? p.media?.duration ?? 60) + 0.6);
      p.sermon = { start, end, confidence: 1, method: 'whole', confirmed: true, reasons: ['The whole recording'] };
      p.clips.push({
        id: Math.random().toString(36).slice(2, 10), start, end, title: p.title, summary: '', hook: '', score: null, category: 'Whole video',
        reasons: ['The whole recording'], startPhrase: '', endPhrase: '', hashtags: [], cutWords: [], tightenPauses: false,
        crop: p.kind === 'lyric' ? { mode: 'lyric', smooth: 0 } : p.kind === 'wide' ? { mode: 'fit', smooth: 0, bg: { type: 'blur' } } : { mode: 'auto', smooth: 0 },
        format: p.kind === 'wide' ? 'wide' : 'vertical', videoTheme: null, status: 'kept', source: 'whole',
      });
    }
    p.transcriptInfo = { model: transcript.model, device: transcript.device, words: transcript.words.length };
  });
  ctx.progress(100, `Transcribed ${transcript.words.length.toLocaleString()} words`);
  return { words: transcript.words.length, sermon };
}
