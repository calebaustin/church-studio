// Social accounts + posts, persisted as JSON under data/social/. Credentials are encrypted.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from '../tools.js';
import { encrypt, decrypt } from './vault.js';

const DIR = path.join(DATA_DIR, 'social');
const ACCOUNTS = path.join(DIR, 'accounts.json');
const POSTS = path.join(DIR, 'posts.json');

async function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, 'utf8'));
}
async function writeJson(file, data) {
  await mkdir(DIR, { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}

// Serialize writes so the scheduler and API never clobber each other.
let chain = Promise.resolve();
const locked = (fn) => (chain = chain.then(fn, fn));

export const newId = () => randomUUID().slice(0, 10);

// ---------------- accounts
export async function listAccounts() {
  return (await readJson(ACCOUNTS, [])).map(({ secret, ...a }) => a);
}
export async function getAccount(id, { withCredentials = false } = {}) {
  const a = (await readJson(ACCOUNTS, [])).find((x) => x.id === id);
  if (!a) return null;
  const { secret, ...pub } = a;
  return withCredentials ? { ...pub, credentials: decrypt(secret) } : pub;
}
export function saveAccount(account) {
  return locked(async () => {
    const all = await readJson(ACCOUNTS, []);
    const { credentials, ...pub } = account;
    const prev = all.find((x) => x.id === account.id);
    const row = { ...prev, ...pub, secret: credentials ? encrypt(credentials) : prev?.secret, updated: new Date().toISOString() };
    await writeJson(ACCOUNTS, [...all.filter((x) => x.id !== account.id), row]);
    const { secret, ...out } = row;
    return out;
  });
}
export function deleteAccount(id) {
  return locked(async () => writeJson(ACCOUNTS, (await readJson(ACCOUNTS, [])).filter((x) => x.id !== id)));
}

// ---------------- posts
export const listPosts = () => readJson(POSTS, []);
export async function getPost(id) { return (await listPosts()).find((p) => p.id === id) || null; }
export function updatePost(id, mutate) {
  return locked(async () => {
    const all = await readJson(POSTS, []);
    const i = all.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('Post not found');
    const next = (await mutate(all[i])) ?? all[i];
    next.updated = new Date().toISOString();
    all[i] = next;
    await writeJson(POSTS, all);
    return next;
  });
}
export function insertPost(post) {
  return locked(async () => {
    const all = await readJson(POSTS, []);
    all.push(post);
    await writeJson(POSTS, all);
    return post;
  });
}
export function removePost(id) {
  return locked(async () => writeJson(POSTS, (await readJson(POSTS, [])).filter((p) => p.id !== id)));
}
