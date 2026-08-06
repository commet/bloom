#!/usr/bin/env node
/**
 * 봇 파이프라인 자체 점검. 토큰도 네트워크도 없이 돌아간다.
 *
 * 확인하는 것은 하나다 — **막아야 할 것을 실제로 막는가.** 지어낸 인용, 원문에 없는 숫자,
 * 평가 문장, 참석자 실명, 중복 회차를 각각 넣어 보고 검사가 잡아내는지 본다.
 * 통과시켜야 할 정상 레코드도 함께 넣어, 검사가 아무거나 막고 보는 것은 아닌지도 본다.
 *
 *   node tools/bot-selftest.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emit } from '../bot/lib/jsemit.mjs';
import { derive, validateEvent } from '../bot/lib/schema.mjs';

const dir = mkdtempSync(join(tmpdir(), 'bloom-bot-'));
const fails = [];
const ok = m => console.log(`  통과  ${m}`);
const bad = m => { fails.push(m); console.log(`  실패  ${m}`); };

/* ── 원문 픽스처 ── 실제 디스코드 공지·후기와 같은 모양으로 짰다 ── */
const RAW = [
  {
    message_id: '1', channel_name: '#공지', author_hash: 'aaaa', author_is_bot: false,
    posted_at: '2026-09-03T09:00:00Z',
    content: `[9/3(목) Claude Bloom × 테스트컴퍼니]
장소: 테스트컴퍼니 (서울 강남구), 12층
시간: 19:00 – 21:00
정원 80명, 신청 240명
키노트 20분 → 라운드테이블 2라운드 → 조별 발표
연사: 홍길동 (테스트컴퍼니 CTO)`,
  },
  {
    message_id: '2', channel_name: '#후기', author_hash: 'bbbb', author_is_bot: false,
    posted_at: '2026-09-04T02:00:00Z',
    content: `어제 80명이 모였습니다. 홍길동 CTO는 "도구를 바꾸는 것보다 일하는 방식을 바꾸는 게 훨씬 어렵습니다."라고 말했습니다.
이번 회차부터 조별 발표를 3분으로 늘렸습니다.`,
  },
];
const rawPath = join(dir, 'raw.jsonl');
writeFileSync(rawPath, RAW.map(r => JSON.stringify(r)).join('\n'));

const BASE = {
  id: '0903', venueKey: '테스트컴퍼니', date: '2026-09-03',
  title: 'Seoul | Claude Bloom × 테스트컴퍼니', short: '× 테스트컴퍼니',
  venue: '테스트컴퍼니 (서울 강남구)', floor: '12층', time: '19:00 – 21:00',
  sponsors: ['테스트컴퍼니'], applicants: 240, attendees: 80, capacity: 80,
  format: '키노트 20분 → 라운드테이블 2라운드 → 조별 발표',
  lang: 'ko', paid: false, kind: 'roundtable',
  firsts: ['조별 발표를 3분으로 늘렸다'],
  speakers: [{ n: '홍길동', a: '테스트컴퍼니 CTO' }],
  summary: ['정원 80명, 신청 240명. 키노트 20분에 이어 라운드테이블 2라운드를 진행했다.'],
  body: [{ h: '홍길동 (테스트컴퍼니) — 키노트', p: '도구를 바꾸는 것보다 일하는 방식을 바꾸는 것이 어렵다고 말했다.' }],
  quotes: [{ t: '도구를 바꾸는 것보다 일하는 방식을 바꾸는 게 훨씬 어렵습니다.', s: '홍길동 · 테스트컴퍼니 CTO' }],
  tables: [], feedback: [], actions: [], links: [], tags: ['라운드테이블'],
};

/** 케이스를 검사에 걸어 보고, 기대한 결과가 나오는지 본다 */
function run(name, events, shouldPass, expectText) {
  const patch = join(dir, 'patch.json');
  writeFileSync(patch, JSON.stringify({ events, skipped: [] }));
  let out = '', passed = true;
  try {
    out = execFileSync(process.execPath, ['tools/verify-source.mjs', '--patch', patch, '--corpus', rawPath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { passed = false; out = String(e.stdout || '') + String(e.stderr || ''); }

  if (passed !== shouldPass) return bad(`${name} — ${shouldPass ? '통과했어야' : '막았어야'} 하는데 반대로 나왔다\n${out.trim().split('\n').slice(0, 4).map(l => '        ' + l).join('\n')}`);
  if (expectText && !out.includes(expectText)) return bad(`${name} — 막긴 했는데 이유가 다르다 (기대: "${expectText}")`);
  ok(name);
}

console.log('\n원문 대조 검사');
run('정상 레코드는 통과한다', [BASE], true);
run('지어낸 인용은 막는다',
  [{ ...BASE, quotes: [{ t: '결국 사람이 중요합니다.', s: '홍길동 · 테스트컴퍼니 CTO' }] }],
  false, '원문에 없다');
run('인용을 다듬어도 막는다 — 한 글자라도 다르면 안 된다',
  [{ ...BASE, quotes: [{ t: '도구를 바꾸는 것보다 일하는 방식을 바꾸는 것이 훨씬 어렵습니다.', s: '홍길동 · 테스트컴퍼니 CTO' }] }],
  false, '원문에 없다');
run('원문에 없는 인원은 막는다', [{ ...BASE, attendees: 150 }], false, '원문에 없다');
run('산문에 슬쩍 넣은 수치도 막는다',
  [{ ...BASE, summary: ['참석자 만족도는 92% 였다.'] }], false, '원문에 없다');
run('평가 문장은 막는다',
  [{ ...BASE, summary: ['커뮤니티가 자리를 잡았음을 시사한다.'] }], false, '평가 표현');
run('참석자 실명은 막는다',
  [{ ...BASE, quotes: [{ t: '도구를 바꾸는 것보다 일하는 방식을 바꾸는 게 훨씬 어렵습니다.', s: '김철수 · 백엔드 엔지니어' }] }],
  false, '연사·운영진 명단에 없다');
run('직군·소속 표기는 통과한다',
  [{ ...BASE, quotes: [{ t: '도구를 바꾸는 것보다 일하는 방식을 바꾸는 게 훨씬 어렵습니다.', s: '백엔드 엔지니어 · 커머스' }] }],
  true);
run('이미 있는 회차는 막는다', [{ ...BASE, id: '0425', date: '2026-04-25' }], false, '이미 기록에 있는');
run('원문에 없는 문장을 길게 쓰면 막는다',
  [{ ...BASE, body: [{ h: '총평', p: '참여자들은 저마다의 맥락에서 각자의 전환점을 마주하며 새로운 협업 양식을 모색하는 계기를 얻었다.' }] }],
  false, '옮긴 것이 아니라');
run('요일·id 가 date 와 어긋나면 막는다', [{ ...BASE, id: '0904' }], false, 'date 와 어긋난다');

console.log('\n직렬화');
{
  const emitted = emit(derive(BASE), 1);
  const back = await import('data:text/javascript,export default ' + encodeURIComponent(emitted));
  const bugs = validateEvent(back.default, 'emit');
  if (bugs.length) bad(`찍어 낸 레코드를 다시 읽으니 스키마에 걸린다: ${bugs.join(', ')}`);
  else if (JSON.stringify(back.default) !== JSON.stringify(derive(BASE))) bad('찍어 낸 레코드가 원본과 다르다');
  else ok('레코드를 JS 로 찍었다가 다시 읽어도 같다');
  if (!emitted.includes("id: '0903'")) bad('키 표기가 data.js 스타일이 아니다');
  else ok('data.js 와 같은 표기로 찍는다');
}

console.log('\n현재 데이터');
try {
  execFileSync(process.execPath, ['tools/verify-source.mjs', '--data'], { stdio: 'pipe' });
  ok('src/data.js 26회차가 규칙을 지킨다');
} catch (e) { bad(`src/data.js 검사 실패\n${String(e.stdout || '')}`); }

console.log('\n반영 (임시로 넣었다 되돌린다)');
{
  const before = readFileSync('src/data.js', 'utf8');
  mkdirSync('bot/out', { recursive: true });
  try {
    writeFileSync('bot/out/patch.json', JSON.stringify({ events: [BASE], skipped: [] }));
    execFileSync(process.execPath, ['bot/apply.mjs'], { stdio: 'pipe' });
    const after = readFileSync('src/data.js', 'utf8');
    const mod = await import(`data:text/javascript,${encodeURIComponent(after.replace(/^\/\*[\s\S]*?\*\//, ''))}`);
    if (mod.events.length !== 27) bad(`반영 후 회차가 ${mod.events.length} (27 기대)`);
    else if (!mod.events.some(e => e.id === '0903')) bad('반영된 회차를 찾지 못했다');
    else ok('src/data.js 에 넣고 다시 읽어도 파싱된다');
  } catch (e) {
    bad(`반영 실패: ${String(e.stderr || e.stdout || e).slice(0, 300)}`);
  } finally {
    writeFileSync('src/data.js', before);
    rmSync('bot/out/patch.json', { force: true });
    rmSync('bot/out/added.json', { force: true });
  }
}

rmSync(dir, { recursive: true, force: true });
console.log(fails.length ? `\n${fails.length}건 실패` : '\n봇 파이프라인 모두 통과');
process.exit(fails.length ? 1 : 0);
