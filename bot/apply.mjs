#!/usr/bin/env node
/**
 * 4단계 — 반영. 검사를 통과한 레코드를 src/data.js 의 events 배열 끝에 넣는다.
 *
 * 넣는 것만 한다. 기존 레코드를 고치거나 지우지 않는다 — 봇이 과거 기록을 건드릴 수 있으면
 * 원문 대조가 지켜 주는 범위 밖으로 나간다. 정정은 사람이 직접 한다.
 *
 * 실제 반영은 여전히 PR 머지 시점이다. 이 단계는 diff 를 만들 뿐이다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { emit } from './lib/jsemit.mjs';
import { derive, validateEvent } from './lib/schema.mjs';

const MARK = '/* __EVENTS_END__';

/* 기존 레코드와 같은 순서로 키를 세운다. diff 를 사람이 읽는다 */
const ORDER = [
  'id', 'venueKey', 'date', 'dow', 'month', 'title', 'short', 'venue', 'floor', 'time',
  'sponsors', 'applicants', 'applicantsNote', 'attendees', 'capacity', 'format', 'lang', 'paid',
  'kind', 'firsts', 'speakers', 'summary', 'body', 'quotes', 'tables', 'retro', 'feedback',
  'actions', 'links', 'note', 'tags',
];
const order = e => Object.fromEntries(
  ORDER.filter(k => e[k] !== undefined && e[k] !== null || k === 'applicants' || k === 'attendees')
    .map(k => [k, e[k] === undefined ? null : e[k]]),
);

const patch = JSON.parse(readFileSync('bot/out/patch.json', 'utf8'));
if (!patch.events?.length) { console.log('넣을 회차가 없다'); process.exit(0); }

const src = readFileSync('src/data.js', 'utf8');
const at = src.indexOf(MARK);
if (at < 0) { console.error(`src/data.js 에서 ${MARK} 표지를 찾지 못했다`); process.exit(1); }

const existing = new Set((await import('../src/data.js')).events.map(e => e.id));
const fresh = [];
for (const raw of patch.events) {
  const e = order(derive(raw));
  const bad = validateEvent(e, 'apply');
  if (bad.length) { console.error(bad.map(b => '  ✕ ' + b).join('\n')); process.exit(1); }
  if (existing.has(e.id)) { console.log(`  = ${e.id} 는 이미 있다 — 건너뛴다`); continue; }
  fresh.push(e);
}
if (!fresh.length) { console.log('새로 넣을 것이 없다'); process.exit(0); }

fresh.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
const block = fresh.map(e => '  ' + emit(e, 1) + ',\n').join('');
writeFileSync('src/data.js', src.slice(0, at) + block + '  ' + src.slice(at));

/* 넣자마자 파싱해 본다. 문법이 깨진 채 PR 이 올라가는 것보다 여기서 죽는 편이 낫다 */
try {
  execFileSync(process.execPath, ['--input-type=module', '-e',
    "const d = await import('./src/data.js'); if (!Array.isArray(d.events)) throw new Error('events 가 배열이 아니다');"],
    { stdio: 'pipe' });
} catch (err) {
  writeFileSync('src/data.js', src);
  console.error('넣은 뒤 src/data.js 를 읽지 못해 되돌렸다:\n' + String(err.stderr || err));
  process.exit(1);
}

console.log(`src/data.js 에 ${fresh.length}건 추가`);
for (const e of fresh) console.log(`  + ${e.date} ${e.id} ${e.short}`);
writeFileSync('bot/out/added.json', JSON.stringify(fresh.map(e => ({ id: e.id, date: e.date, short: e.short, title: e.title })), null, 2));
