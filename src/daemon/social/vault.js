// AES-256-GCM encryption for social account credentials.
// The key is generated once into data/social/credentials.key (mode 600). Back up the whole data/
// folder together: without the key, saved accounts can't be unlocked and must be reconnected.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../tools.js';

const KEY_FILE = path.join(DATA_DIR, 'social', 'credentials.key');
let key = null;

function getKey() {
  if (key) return key;
  if (!existsSync(KEY_FILE)) {
    mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    writeFileSync(KEY_FILE, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  }
  const hex = readFileSync(KEY_FILE, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('data/social/credentials.key is damaged.');
  key = Buffer.from(hex, 'hex');
  return key;
}

export function encrypt(value) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), data.toString('hex')].join(':');
}

export function decrypt(blob) {
  try {
    const [iv, tag, data] = blob.split(':').map((h) => Buffer.from(h, 'hex'));
    const d = createDecipheriv('aes-256-gcm', getKey(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
  } catch {
    throw new Error('Cannot unlock this account. Restore data/social/credentials.key or reconnect it.');
  }
}
