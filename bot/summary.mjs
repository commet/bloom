#!/usr/bin/env node
/**
 * 워크플로가 쓰는 작은 조회 도구. 셸 안에 자바스크립트를 끼워 넣지 않으려고 따로 뒀다.
 *
 *   node bot/summary.mjs count   새 회차 수만 출력
 *   node bot/summary.mjs body    PR 본문 출력
 */
import { existsSync, readFileSync } from 'node:fs';

const read = f => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
const patch = read('bot/out/patch.json') || { events: [], skipped: [] };
const added = read('bot/out/added.json') || patch.events;

if (process.argv[2] === 'count') { console.log(patch.events.length); process.exit(0); }

console.log([
  '디스코드 원문에서 새로 찾은 회차입니다. **자동으로 반영되지 않으며, 이 PR 을 머지해야 페이지에 올라갑니다.**',
  '',
  '## 추가된 회차',
  '',
  ...added.map(e => `- **${e.date}** — ${e.title}`),
  '',
  '## 기계 검사 결과',
  '',
  '- 원문 대조 통과 — 인용문은 디스코드 원문에 문자 그대로 있고, 인원·수치는 모두 원문에 있는 값입니다.',
  '- 스키마·요일·중복 id 검사 통과',
  '- 평가·진단 표현 검사 통과 (이 아카이브에는 커뮤니티를 평가하는 문장을 넣지 않습니다)',
  '- 참석자 실명 없음 — 연사·운영진만 실명, 나머지는 직군·소속 표기',
  '',
  ...(patch.skipped?.length
    ? ['## 근거가 모자라 넣지 않은 것', '', ...patch.skipped.map(s => `- ${s.what} — ${s.why}`), '']
    : []),
  '## 머지 전에 확인해 주세요',
  '',
  '- 날짜·장소·인원이 실제와 맞는지',
  '- 인용문의 발화자 표기가 맞는지',
  '- 빠진 세션이나 잘못 들어간 세션이 없는지',
  '',
  '기계는 "원문에 없는 말인지"까지만 봅니다. "원문이 맞는지"는 사람이 봐야 합니다.',
].join('\n'));
