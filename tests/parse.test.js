import { test, assert } from './harness.js';
import { extractJSON } from '../app/providers/parse.js';
const obj = { a: 1, b: [1, 2], c: { d: 'x' } };
const J = JSON.stringify(obj);
const cases = [
  ['plain', J], ['fenced json', '```json\n' + J + '\n```'], ['fenced plain', '```\n' + J + '\n```'],
  ['prose before', 'Here is the JSON you asked for:\n' + J], ['prose after', J + '\n\nLet me know if you need changes.'],
  ['both', 'Sure!\n```json\n' + J + '\n```\nDone.'], ['BOM', '\uFEFF' + J], ['trailing comma', '{"a":1,"b":[1,2,],}'],
  ['smart quotes', '{“a”:1,“b”:[1,2],“c”:{“d”:“x”}}'], ['line comment', '{"a":1, // note\n"b":[1,2],"c":{"d":"x"}}'],
  ['whitespace', '\n\n   ' + J + '   \n'],
];
for (const [name, raw] of cases) test(`parse: ${name}`, () => { const r = extractJSON(raw); assert.ok(r.ok, r.error); assert.equal(r.value.a, 1); });
test('parse: array wrapper', () => { const r = extractJSON('[' + J + ',' + J + ']'); assert.ok(r.ok); assert.equal(r.value.length, 2); });
test('parse: truncated array recovers complete items', () => { const r = extractJSON('{"rewrites":[{"bullet_id":"b1","text":"ok"},{"bullet_id":"b2","text":"partial'); assert.ok(r.ok, r.error); assert.ok(r.truncated); assert.equal(r.value.rewrites.length, 1); });
test('parse: empty fails clearly', () => { const r = extractJSON('   '); assert.ok(!r.ok); assert.ok(/Empty/.test(r.error)); });
test('parse: no json fails clearly', () => { const r = extractJSON('I cannot do that.'); assert.ok(!r.ok); });
