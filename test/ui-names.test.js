// Every component or icon used as a JSX tag must be imported or defined in that file. The build
// doesn't catch a missing one, and the screen then fails to open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.jsx')) files.push(p); } })('src/ui');

test('JSX tags are imported or defined', () => {
  const problems = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const known = new Set(['React', 'Fragment']);
    for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
      for (const n of m[1].replace(/[{}]/g, ',').split(',')) { const name = n.trim().split(/\s+as\s+/).pop().trim(); if (name) known.add(name); }
    }
    for (const m of src.matchAll(/(?:function|const|let|class)\s+([A-Z][A-Za-z0-9]*)/g)) known.add(m[1]);
    for (const m of src.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=/g)) for (const n of m[1].split(',')) { const name = n.split(':').pop().trim(); if (name) known.add(name); }
    for (const m of src.matchAll(/\(\s*\{([^}]*)\}\s*\)\s*=>|function\s+\w+\s*\(\s*\{([^}]*)\}/g)) for (const n of (m[1] || m[2]).split(',')) { const name = n.split(':').pop().split('=')[0].trim(); if (/^[A-Z]/.test(name)) known.add(name); }
    for (const m of src.matchAll(/\[\s*(?:\w+\s*,\s*)*([A-Z]\w*)\s*(?:,|\])/g)) known.add(m[1]); // array destructuring like [k, Icon]
    for (const m of src.matchAll(/(?:const|let)\s+([A-Z]\w*)\s*=/g)) known.add(m[1]);
    for (const m of src.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) if (!known.has(m[1])) problems.push(`${f}: <${m[1]}> is not imported`);
  }
  assert.deepEqual([...new Set(problems)], []);
});
