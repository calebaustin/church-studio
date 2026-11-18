import { useState } from 'react';
import { FolderOpen, Sparkles } from 'lucide-react';
import { api, desktop } from '../api.js';
import { useApp } from '../App.jsx';
import Modal, { ModalHead } from './Modal.jsx';
import AudioCleanup from './AudioCleanup.jsx';

/** Clean up any recording on this Mac and save a copy to Downloads. */
export default function CleanAudioDialog({ onClose }) {
  const { trackJob, toast } = useApp();
  const [file, setFile] = useState(null);
  const [value, setValue] = useState({ preset: 'voice', amount: 0.5 });
  const pick = async () => { const f = await desktop?.pickMedia?.(); if (f) setFile(f); };
  const run = async () => {
    try {
      const { job } = await api.post('/api/audio/clean', { file, ...value });
      trackJob(job);
      toast({ text: 'Cleaning up the audio. The copy goes to Downloads.' });
      onClose();
    } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  return (
    <Modal onClose={onClose} width={640} label="Clean up a recording">
      <ModalHead title="Clean up a recording" sub="Pick what went wrong, set the strength and hear the difference. Video keeps its picture." onClose={onClose} />
      <div className="row" style={{ gap: 10 }}>
        <button className="btn" onClick={pick}><FolderOpen size={14} />{file ? 'Pick another file' : 'Pick an audio or video file'}</button>
        {file && <span className="small truncate muted">{file.split('/').pop()}</span>}
      </div>
      <AudioCleanup value={value} onChange={(v) => setValue(v || { preset: 'voice', amount: value.amount })} source={file ? { file } : null} />
      <div className="row between" style={{ marginTop: 6 }}>
        <span className="hint">Your original file is never changed.</span>
        <button className="btn primary" disabled={!file || !value?.preset} onClick={run}><Sparkles size={14} />Save a clean copy</button>
      </div>
    </Modal>
  );
}
