// Every engine file must at least parse: a syntax error here stops the whole app from starting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const dirs = ['src/daemon', 'src/daemon/social'];
test('engine files parse', () => {
  for (const d of dirs) for (const f of readdirSync(d).filter((x) => x.endsWith('.js'))) {
    const file = path.join(d, f);
    try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); } catch (e) { assert.fail(`${file} does not parse:\n${e.stderr}`); }
  }
});
