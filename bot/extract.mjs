#!/usr/bin/env node
/**
 * 2단계 — 구조화. bot/out/raw.jsonl 을 읽어 아직 기록에 없는 회차를 찾아
 * src/data.js 의 행사 레코드 모양으로 옮긴다.
 *
 * 하는 일은 "분류와 배치"다. 어느 문장이 인용이고 어느 문장이 진행 방식인지 골라
 * 제자리에 넣는 것까지. 새 문장을 쓰는 일이 아니다 — 이 페이지는 커뮤니티를 평가하지
 * 않는다는 전제 위에 서 있고, 요약은 곧 해석이라 그 전제를 무너뜨린다.
 *
 * 이 단계의 출력은 제안일 뿐이다. 3단계(verify-source)가 원문 대조를 통과시켜야 하고,
 * 통과해도 PR 로만 올라간다. 사람이 머지하지 않으면 아무것도 반영되지 않는다.
 *
 * 출력: bot/out/patch.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { need, MODEL } from './lib/env.mjs';
import { PATCH_SCHEMA } from './lib/schema.mjs';

const raw = readFileSync('bot/out/raw.jsonl', 'utf8').trim();
if (!raw) { console.log('원문이 비었다 — 넘길 것이 없다'); process.exit(0); }
const msgs = raw.split('\n').map(l => JSON.parse(l));

const data = await import('../src/data.js');
const known = data.events.map(e => `${e.date} ${e.id} ${e.short}`).join('\n');
const lastDate = data.events.map(e => e.date).sort().pop();

const corpus = msgs
  .map(m => `[${m.posted_at.slice(0, 16).replace('T', ' ')}] ${m.channel_name} ${m.author_hash}${m.author_is_bot ? ' (봇)' : ''}\n${m.content}`)
  .join('\n\n---\n\n');

const SYSTEM = `당신은 커뮤니티 아카이브의 기록 담당이다. 디스코드 원문을 읽고, 이미 기록된 것 이후에
새로 열린 행사를 찾아 정해진 레코드 형식으로 옮긴다.

## 지켜야 하는 것

1. **원문에 있는 것만 쓴다.** 원문에 없는 사실은 한 글자도 넣지 않는다. 알 수 없는 값은 null 로 둔다.
   참석 인원이 안 적혀 있으면 추정하지 말고 attendees 를 null 로 둔다.
2. **인용(quotes[].t)은 원문 그대로 옮긴다.** 다듬거나 줄이거나 문장부호를 바꾸지 않는다.
   기계 대조를 거치므로 한 글자라도 다르면 이 작업 전체가 실패한다.
3. **평가하지 않는다.** 이 아카이브에는 커뮤니티를 진단하거나 의미를 부여하는 문장이 한 줄도 없다.
   "의미가 크다", "보여준다", "시사한다", "인상적이다", "아쉽다" 같은 표현을 쓰지 않는다.
   무엇이 있었는지만 적는다.
4. **실명 규칙.** 연사와 운영진은 이미 공개 홍보물에 이름이 실린 경우이므로 이름을 그대로 쓴다.
   참석자는 이름을 쓰지 않는다 — quotes[].s 에 "백엔드 엔지니어 · 커머스" 처럼 직군·소속으로만 적는다.
   원문에 참석자 이름이 있어도 옮기지 않는다.
5. **문체.** 기존 기록과 같은 문어체 종결형(-다)을 쓴다. 구어체·번역체를 쓰지 않는다.
6. **근거가 모자라면 만들지 않는다.** 날짜나 장소가 불확실한 건은 events 에 넣지 말고
   skipped 에 무엇을 왜 넘겼는지 적는다. 비워 두는 편이 지어내는 것보다 낫다.

## 무엇을 어디에 넣는가

- summary — 그날 무엇이 열렸는지. 1–2 문단. 원문의 사실만 재배열한다.
- body[].h / .p — 세션·발표 단위. 발표자 순서대로. 표가 있으면 body[].table 로.
- quotes — 원문에 따옴표로 인용된 발언. 없으면 빈 배열.
- firsts — 그 회차에서 처음 도입된 운영 방식(포맷 변경, 유료화, 영어 진행 등). 없으면 빈 배열.
- feedback / actions / retro — 원문에 후기나 개선 사항이 적혀 있을 때만.
- format — 진행 순서를 원문 표현대로. 예: "키노트 20분 → 라운드테이블 2라운드 → 조별 발표".
- kind — talk(강연 중심) / roundtable(토론 중심) / party / walk / network / private.

## 이미 기록된 회차 (중복 금지)

${known}

가장 최근 기록은 ${lastDate} 이다. 그 이후 것만 본다.`;

const body = {
  model: MODEL,
  max_tokens: 16000,
  system: SYSTEM,
  tools: [{
    name: 'emit_patch',
    description: '새 행사 레코드와, 근거가 모자라 넘긴 것들을 낸다.',
    input_schema: PATCH_SCHEMA,
  }],
  tool_choice: { type: 'tool', name: 'emit_patch' },
  messages: [{
    role: 'user',
    content: `아래는 디스코드 원문이다. 이미 기록된 회차 이후의 새 행사를 찾아 레코드로 옮겨라.\n\n<원문>\n${corpus}\n</원문>`,
  }],
};

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': need('ANTHROPIC_API_KEY'),
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});
if (!res.ok) { console.error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 600)}`); process.exit(1); }

const out = await res.json();
const tool = out.content.find(c => c.type === 'tool_use');
if (!tool) { console.error('구조화 결과가 비었다'); process.exit(1); }

const patch = tool.input;
mkdirSync('bot/out', { recursive: true });
writeFileSync('bot/out/patch.json', JSON.stringify(patch, null, 2));

console.log(`새 회차 ${patch.events.length}건, 넘긴 것 ${patch.skipped.length}건`);
for (const e of patch.events) console.log(`  + ${e.date} ${e.id} ${e.short}`);
for (const s of patch.skipped) console.log(`  - ${s.what}: ${s.why}`);
