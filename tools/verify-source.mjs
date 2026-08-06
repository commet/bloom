#!/usr/bin/env node
/**
 * 원문 대조 검사 — 파이프라인에서 사람 대신 "안 된다"고 말하는 곳.
 *
 * 봇이 낸 레코드를 그대로 믿지 않는다. 모델은 그럴듯한 문장을 잘 만들고, 이 페이지는
 * 그럴듯함이 아니라 원문에 있었느냐로 서 있다. 그래서 사람이 PR 을 보기 전에 기계가 먼저 건다.
 *
 *   node tools/verify-source.mjs                     # bot/out/patch.json 을 bot/out/raw.jsonl 과 대조
 *   node tools/verify-source.mjs --patch a --corpus b
 *   node tools/verify-source.mjs --data              # 현재 src/data.js 의 스키마·표기 규칙만 검사
 *
 * 검사 항목
 *   1. 스키마      — 필드 이름·형식·요일·id 와 date 의 정합
 *   2. 인용 대조   — quotes[].t 가 원문에 문자 그대로 있는가
 *   3. 수치 대조   — 산문에 나온 모든 숫자가 원문에 있는가 (추정치 유입을 막는다)
 *   4. 어휘 대조   — 원문에 없던 낱말이 얼마나 섞였는가 (지어낸 문장의 신호)
 *   5. 평가 금지   — 진단·의미부여 표현이 들어갔는가
 *   6. 실명 규칙   — 연사·운영진이 아닌 사람 이름이 들어갔는가
 *   7. 중복        — 이미 있는 회차를 다시 넣지 않았는가
 */
import { existsSync, readFileSync } from 'node:fs';
import { validateEvent, derive } from '../bot/lib/schema.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const dataOnly = argv.includes('--data');

const data = await import('../src/data.js');
const fail = [];
const warn = [];

/* ───────────────────────── 규칙 ───────────────────────── */

/* 커뮤니티를 진단하거나 의미를 부여하는 표현. 이 페이지에는 이런 문장이 한 줄도 없다.
 * 인용문 안에서는 발화자의 말이므로 검사하지 않는다 — 산문 필드에만 적용한다. */
const EVALUATIVE = [
  '시사한다', '시사하는', '의미가 크다', '의미심장', '주목할 만', '눈여겨볼',
  '인상적이', '인상 깊', '아쉬운 지점', '아쉬움이 남', '한계로 보인다', '한계를 드러',
  '성공적이었', '실패로 보인다', '보여준다는 점에서', '방증', '반증하듯',
  '엿볼 수 있', '읽어낼 수 있', '해석할 수 있', '평가된다', '평가받는다',
];

/* 실명 표기 예외 — 활동명·필명은 그대로 둔다 */
const KEEPNAME = new Set(['조코딩', '팔로알토', 'KEEPKWAN', 'Kyle', 'junshu', '빌더 조쉬', 'Celina', '까칠한AI']);

/* 사람 이름이 아니라 역할이다. 두세 글자 한글이라 이름과 모양이 같아 따로 빼 둔다 */
const ROLE = new Set([
  '운영진', '참석자', '연사', '조장', '진행자', '모더레이터', '발표자', '스태프', '사회자',
  '주최측', '패널', '멤버', '청중', '질문자', '대표', '창업자', '개발자', '기획자', '디자이너',
]);

const bareName = s => s.replace(/\s*\([^)]*\)\s*/g, '').trim();
const KNOWN_PEOPLE = new Set([
  ...data.people.map(p => bareName(p.n)),
  ...data.events.flatMap(e => (e.speakers || []).map(s => bareName(s.n))),
]);

/* ───────────────────────── 대조 도구 ───────────────────────── */

const norm = s => String(s)
  .replace(/[“”„‟"]/g, '"').replace(/[‘’‚‛']/g, "'")
  .replace(/[–—―]/g, '-').replace(/…/g, '...')
  .replace(/\s+/g, ' ').trim();

/* 한국어는 조사·어미가 붙어 원문과 형태가 달라진다. 문법 조각까지 "원문에 없는 낱말"로
 * 세면 정상 기록도 걸리므로, 내용이 없는 것들은 빼고 센다. 형태소 분석기를 붙일 만한
 * 일은 아니다 — 여기서 잡으려는 것은 지어낸 고유명사·수치·주장이다. */
const STOP = new Set([
  '그리고', '그러나', '하지만', '그래서', '또한', '이어', '이후', '이번', '지난', '다음',
  '것이', '것을', '것은', '것이다', '수는', '수가', '있다', '없다', '했다', '한다', '된다',
  '대해', '위해', '통해', '따라', '함께', '모두', '각각', '등의', '등을', '가장', '바로',
  '분에', '명이', '명을', '시간', '경우', '내용', '이야기', '자리', '진행', '참석', '기준',
]);

/** 조사·어미가 붙은 채로는 원문에 없을 수 있다. 앞에서부터 두 글자까지 줄여 가며 찾는다. */
function inCorpus(token, corpus) {
  if (corpus.includes(token)) return true;
  if (!/^[가-힣]+$/.test(token)) return false;
  for (let len = token.length - 1; len >= 2; len--) {
    if (corpus.includes(token.slice(0, len))) return true;
  }
  return false;
}

const words = s => [
  ...(s.match(/[가-힣]{2,}/g) || []),
  ...(s.match(/[A-Za-z][A-Za-z0-9'’-]{2,}/g) || []),
].filter(w => !STOP.has(w));
const nums = s => (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => n.replace(/,/g, ''));

/** 레코드에서 산문 필드만 모은다 (인용은 따로 엄격하게 본다).
 *  일부 필드는 문자열이 아니라 객체로도 들어와 있어 값만 훑어 평평하게 만든다. */
const flat = v => {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(flat);
  if (v && typeof v === 'object') return Object.values(v).flatMap(flat);
  return [];
};

function prose(e) {
  return flat([
    e.summary,
    (e.body || []).map(b => [b.h, b.p]),
    e.firsts, e.feedback, e.actions,
    e.format, e.retro, e.note, e.venue, e.title,
  ]).filter(s => s.trim());
}

/** 평가 표현 검사는 기록자가 직접 쓴 문장에만 건다.
 *  feedback·retro 는 참석자·운영진이 한 말을 옮긴 것이라 "인상 깊었다" 같은 표현이 있어도
 *  그건 그 사람의 평가지 이 페이지의 평가가 아니다. */
function authored(e) {
  return flat([e.summary, (e.body || []).map(b => [b.h, b.p]), e.firsts, e.note])
    .filter(s => s.trim());
}

/* ───────────────────────── 검사 ───────────────────────── */

function checkNames(e, ctx) {
  const own = new Set((e.speakers || []).map(s => bareName(s.n)));
  for (const [i, q] of (e.quotes || []).entries()) {
    const name = bareName(q.s || '').split(/[·|,(]/)[0].trim();
    if (!name || KEEPNAME.has(name) || ROLE.has(name)) continue;
    if (!/^[가-힣]{2,4}$/.test(name) && !/^[A-Z][a-z]+(\s[A-Z][a-z]+)?$/.test(name)) continue;  // 직군·소속 표기
    if (!own.has(name) && !KNOWN_PEOPLE.has(name))
      fail.push(`${ctx} quotes[${i}].s 의 "${name}" 은 연사·운영진 명단에 없다. 참석자는 직군·소속으로만 적는다`);
  }
  for (const line of prose(e)) {
    const m = line.match(/[가-힣]{2,4}\s*(?:님|씨)(?![가-힣])/g);
    if (m) warn.push(`${ctx} 존칭이 붙은 사람 표기: ${[...new Set(m)].join(', ')}`);
  }
}

function checkEvaluative(e, ctx) {
  for (const line of authored(e)) {
    for (const p of EVALUATIVE) if (line.includes(p)) fail.push(`${ctx} 평가 표현 "${p}": …${line.slice(Math.max(0, line.indexOf(p) - 24), line.indexOf(p) + 24)}…`);
  }
}

function checkAgainstCorpus(e, corpus, ctx) {
  /* 인용은 글자 그대로여야 한다 */
  (e.quotes || []).forEach((q, i) => {
    if (!corpus.includes(norm(q.t))) fail.push(`${ctx} quotes[${i}] 가 원문에 없다: "${String(q.t).slice(0, 46)}…"`);
  });

  /* 숫자는 하나도 새로 생기면 안 된다 — 추정치가 사실로 굳는 경로가 여기다 */
  for (const n of [e.attendees, e.applicants, e.capacity]) {
    if (n === null || n === undefined) continue;
    if (!corpus.includes(String(n)) && !corpus.includes(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')))
      fail.push(`${ctx} 인원 ${n} 이 원문에 없다`);
  }
  for (const line of prose(e)) {
    for (const n of nums(line)) {
      if (n.length < 2) continue;                       // 한 자리 숫자는 순서·항목 번호가 대부분이다
      const commaed = n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (!corpus.includes(n) && !corpus.includes(commaed))
        fail.push(`${ctx} 수치 ${n} 이 원문에 없다: …${line.slice(0, 60)}…`);
    }
  }

  /* 원문에 없던 낱말의 비율. 옮긴 글이면 낮고, 새로 쓴 글이면 올라간다 */
  const all = prose(e).flatMap(words);
  const novel = [...new Set(all.filter(w => !inCorpus(w, corpus)))];
  const ratio = all.length ? novel.length / new Set(all).size : 0;
  /* 낱말 서넛이 안 맞는 것은 어미·표기 차이지 지어낸 것이 아니다. 비율과 개수를 함께 본다 */
  if (novel.length >= 6 && ratio > 0.18)
    fail.push(`${ctx} 원문에 없는 낱말이 ${(ratio * 100).toFixed(0)}% — 옮긴 것이 아니라 쓴 것에 가깝다: ${novel.slice(0, 14).join(', ')}`);
  else if (novel.length) warn.push(`${ctx} 원문에 없는 낱말 ${novel.length}개: ${novel.slice(0, 10).join(', ')}`);
}

/* ───────────────────────── 실행 ───────────────────────── */

if (dataOnly) {
  const ids = new Set();
  for (const e of data.events) {
    const ctx = `data.js ${e.date}`;
    validateEvent(e, 'events').forEach(m => fail.push(m));
    checkNames(e, ctx);
    checkEvaluative(e, ctx);
    if (ids.has(e.id)) fail.push(`${ctx} id 중복: ${e.id}`);
    ids.add(e.id);
  }
  console.log(`검사 대상 ${data.events.length}회차`);
} else {
  const patchPath = arg('--patch', 'bot/out/patch.json');
  const corpusPath = arg('--corpus', 'bot/out/raw.jsonl');
  if (!existsSync(patchPath)) { console.log(`${patchPath} 가 없다 — 검사할 것이 없다`); process.exit(0); }

  const patch = JSON.parse(readFileSync(patchPath, 'utf8'));
  if (!patch.events?.length) { console.log('새 회차 없음 — 통과'); process.exit(0); }

  let corpusText = '';
  if (existsSync(corpusPath)) {
    corpusText = corpusPath.endsWith('.jsonl')
      ? readFileSync(corpusPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).content).join('\n')
      : readFileSync(corpusPath, 'utf8');
  }
  const corpus = norm(corpusText);
  if (!corpus) fail.push(`원문(${corpusPath})이 비었다 — 대조 없이 통과시킬 수 없다`);

  const existing = new Set(data.events.map(e => e.id));
  for (const rawEvent of patch.events) {
    const e = derive(rawEvent);
    const ctx = `${e.date} ${e.id}`;
    validateEvent(e, 'patch').forEach(m => fail.push(m));
    if (existing.has(e.id)) fail.push(`${ctx} 이미 기록에 있는 id 다`);
    if (corpus) checkAgainstCorpus(e, corpus, ctx);
    checkNames(e, ctx);
    checkEvaluative(e, ctx);
  }
  console.log(`검사 대상 ${patch.events.length}건, 원문 ${corpus.length.toLocaleString()}자`);
}

for (const w of warn) console.log(`  경고  ${w}`);
if (fail.length) {
  console.error(`\n${fail.length}건 실패\n` + fail.map(f => '  ✕ ' + f).join('\n'));
  console.error('\n원문에 없는 내용은 반영하지 않는다. 이 검사를 느슨하게 고치는 것으로 통과시키지 말 것.');
  process.exit(1);
}
console.log('원문 대조 통과');
