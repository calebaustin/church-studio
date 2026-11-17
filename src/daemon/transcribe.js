// Audio extraction + Whisper transcription with word timestamps.
// Optionally limited to a range (when the user already knows where the sermon is),
// which makes long service videos much faster to process.
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run, tool, python, SCRIPTS_DIR } from './tools.js';
import { file, getProject, updateProject } from './projects.js';
import { loadConfig } from './config.js';
import { detectSermon } from './sermon.js';

export async function transcribeProject(id, { start = null, end = null } = {}, ctx) {
  const project = await getProject(id);
  if (!project?.sourceFile) throw new Error('The video has not finished downloading.');
  const config = await loadConfig();
  const source = file(id, project.sourceFile);
  const wav = file(id, 'audio.wav');

  ctx.progress(2, 'Extracting audio…');
  const range = [];
  if (start != null) range.push('-ss', String(start));
  if (end != null) range.push('-t', String(end - (start ?? 0)));
  await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', ...range, '-i', source, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { signal: ctx.signal });

  ctx.progress(6, `Transcribing with Whisper (${config.whisperModel})… the first run downloads the model.`);
  const { stdout } = await run(python(), [
    path.join(SCRIPTS_DIR, 'transcribe.py'), wav, '--model', config.whisperModel, '--offset', String(start ?? 0),
  ], {
    signal: ctx.signal,
    onStderr: (chunk) => {
      const m = [...chunk.matchAll(/PROGRESS (\d+)/g)].pop();
      if (m) ctx.progress(6 + Number(m[1]) * 0.9, `Transcribing… ${m[1]}%`);
    },
  });
  const transcript = JSON.parse(stdout);
  transcript.range = start != null || end != null ? { start: start ?? 0, end: end ?? project.media?.duration } : null;
  await writeFile(file(id, 'transcript.json'), JSON.stringify(transcript));
  await rm(wav, { force: true });

  ctx.progress(97, 'Finding the sermon…');
  const sermon = transcript.range
    ? { start: transcript.range.start, end: transcript.range.end, confidence: 1, method: 'manual', confirmed: true, reasons: ['You set this range before transcribing.'] }
    : detectSermon(transcript.words, project.media?.duration ?? transcript.duration);
  await updateProject(id, (p) => {
    p.status = 'transcribed';
    p.sermon = sermon;
    p.transcriptInfo = { model: transcript.model, device: transcript.device, words: transcript.words.length };
  });
  ctx.progress(100, `Transcribed ${transcript.words.length.toLocaleString()} words`);
  return { words: transcript.words.length, sermon };
}
