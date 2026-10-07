// Diagnostic: với mỗi lesson, chạy params-changed và in check fail (actual vs expected)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const code = readFileSync(resolve('../../algo-web/packs/frontend.js'), 'utf8');
const registered = {};
globalThis.window = { TechGarAlgo: { registerPack: (id, ls) => { registered[id] = ls; } } };
eval(code);
const lessons = registered.frontend;
for (const L of lessons) {
  if (!L.parameters.length) continue;
  const param = L.parameters[0];
  const alt = param.type === 'select' ? (param.options.find(o => o.value !== param.default) || {}).value
    : param.type === 'boolean' ? !param.default
    : (param.min !== undefined ? param.min : param.default + 1);
  if (alt === undefined) continue;
  const base = L.buildTrace('default', {});
  const changed = L.buildTrace('default', { [param.key]: alt });
  const diff = JSON.stringify(changed.result) !== JSON.stringify(base.result) || JSON.stringify(changed.frames) !== JSON.stringify(base.frames);
  const bad = changed.checks.filter(c => !c.pass);
  if (!diff || bad.length) {
    console.log(`### ${L.id}  param ${param.key}=${JSON.stringify(alt)}  diff=${diff}`);
    console.log('  result:', JSON.stringify(changed.result));
    console.log('  expected:', JSON.stringify(changed.expected));
    bad.forEach(c => console.log(`  FAIL "${c.label}" actual=${JSON.stringify(c.actual)} expected=${JSON.stringify(c.expected)}`));
  }
}
