#!/usr/bin/env node
/**
 * 전체 흐름을 한 번에 돌린다. 로컬에서 손으로 확인할 때 쓰고, CI 도 같은 순서를 따른다.
 *
 *   node bot/run.mjs            적재 → 구조화 → 대조 → 반영 → 빌드
 *   node bot/run.mjs --dry      대조까지만. src/data.js 를 건드리지 않는다
 *
 * 어느 단계든 실패하면 그 자리에서 멈춘다. 검사를 건너뛰고 반영되는 경로를 두지 않는다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const dry = process.argv.includes('--dry');

function step(label, cmd, args) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 60 - label.length))}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`\n${label} 에서 멈췄다 (exit ${r.status}). 반영하지 않는다.`);
    process.exit(r.status || 1);
  }
}

const node = process.execPath;
step('1. 적재  — 디스코드 원문 → bloom_raw', node, ['bot/ingest.mjs']);
step('2. 구조화 — 원문 → 레코드 초안', node, ['bot/extract.mjs']);
step('3. 대조  — 원문에 없는 내용 차단', node, ['tools/verify-source.mjs']);

const patch = existsSync('bot/out/patch.json') ? JSON.parse(readFileSync('bot/out/patch.json', 'utf8')) : { events: [] };
if (!patch.events.length) { console.log('\n새 회차 없음 — 여기서 끝낸다'); process.exit(0); }
if (dry) { console.log('\n--dry — 여기까지'); process.exit(0); }

step('4. 반영  — src/data.js 에 추가', node, ['bot/apply.mjs']);
step('5. 재검사 — 전체 데이터 규칙', node, ['tools/verify-source.mjs', '--data']);
step('6. 빌드  — dist/index.html', node, ['build.mjs']);
console.log('\n초안 준비 완료. 남은 것은 사람이 PR 을 보고 머지하는 일이다.');
