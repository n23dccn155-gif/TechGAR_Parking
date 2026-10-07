// Contract-level diag theo đúng qa/smoke.js của C + yêu cầu LEAD (>=3 frame, select options)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const code = readFileSync(resolve('../../algo-web/packs/frontend.js'), 'utf8');
const registered = {};
globalThis.window = { TechGarAlgo: { registerPack: (id, ls) => { registered[id] = ls; } } };
eval(code);
const lessons = registered.frontend;

function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return a === b;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEq(a[k], b[k]));
}

for (const L of lessons) {
  // param select rỗng
  for (const pr of L.parameters) {
    if (pr.type === 'select' && (!Array.isArray(pr.options) || pr.options.length === 0))
      console.log(`${L.id} PARAM-SELECT-EMPTY ${pr.key}`);
    if (pr.type === 'select' && pr.options && !pr.options.some(o => o.value === pr.default))
      console.log(`${L.id} PARAM-DEFAULT-NOT-IN-OPTIONS ${pr.key}`);
  }
  for (const sc of L.scenarios) {
    let t;
    try { t = L.buildTrace(sc.id, {}); } catch (e) { console.log(`${L.id}/${sc.id} THROW ${e.message}`); continue; }
    const probs = [];
    if (t.frames.length < 3) probs.push(`frames=${t.frames.length}<3`);
    const pids = new Set(L.pseudocode.map(p => p.id));
    t.frames.forEach((f, i) => (f.activeLines || []).forEach(ln => { if (!pids.has(ln)) probs.push(`frame${i} badLine ${ln}`); }));
    if (!deepEq(t.expected, sc.expected)) probs.push(`expected!=scenario.expected [got ${JSON.stringify(t.expected).slice(0, 120)}]`);
    (t.checks || []).forEach((c, i) => { if (c.pass !== true) probs.push(`check[${i}] ko: ${c.label} actual=${JSON.stringify(c.actual)} exp=${JSON.stringify(c.expected)}`); });
    if (!t.result || deepEq(t.result, {}) === false && Object.keys(t.result).length === 0) probs.push('result rỗng');
    if (probs.length) console.log(`${L.id}/${sc.id} :: ${probs.join(' | ')}`);
  }
}
console.log('--- done ---');
