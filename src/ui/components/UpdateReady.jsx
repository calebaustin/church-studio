// Shown when an update finishes downloading. The installer window is already open in Finder; this says,
// big and plain, what to do next: quit, drag Church Studio into Applications, choose Replace, open it again.
// Saved work is never touched by an update.
import { Download } from 'lucide-react';
import Modal from './Modal.jsx';
import { api } from '../api.js';

export default function UpdateReady({ info, onClose }) {
  const canQuit = Boolean(window.desktop?.quitApp);
  const steps = [
    canQuit ? 'Press Quit Church Studio below.' : 'Close Church Studio.',
    'In the Church Studio window that opened, drag the app onto the Applications folder.',
    'Choose Replace, then open Church Studio again.',
  ];
  return (
    <Modal label="Update ready" width={520} onClose={onClose}>
      <div className="update-ready">
        <span className="cn-icon tone tone-1 update-ready-icon"><Download size={28} /></span>
        <h2>Church Studio {info.version || ''} is ready</h2>
        <p className="muted">Quit the app, then drag in the new version to finish. Your sermons, designs and settings stay just as they are.</p>
        <ol className="update-steps">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
          {canQuit && <button className="btn primary lg" onClick={() => window.desktop.quitApp()}>Quit Church Studio</button>}
          {info.file && <button className="btn" onClick={() => api.post('/api/reveal', { path: info.file }).catch(() => {})}>Show the download</button>}
          <button className="btn ghost" onClick={onClose}>Later</button>
        </div>
      </div>
    </Modal>
  );
}
