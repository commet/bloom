#!/usr/bin/env node
/**
 * 5단계 — 알림. 디스코드 웹훅으로 결과를 알린다.
 *
 *   node bot/notify.mjs pr   <url>   새 회차 PR 이 열렸다 (검토 요청)
 *   node bot/notify.mjs fail <메모>  검사에서 걸렸다
 *   node bot/notify.mjs live <url>   머지돼 페이지에 반영됐다
 *
 * DISCORD_WEBHOOK_URL 이 없으면 조용히 넘어간다 — 알림이 없다고 파이프라인을 실패시키지 않는다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { opt } from './lib/env.mjs';

const hook = opt('DISCORD_WEBHOOK_URL');
if (!hook) { console.log('DISCORD_WEBHOOK_URL 없음 — 알림 생략'); process.exit(0); }

const [mode, ...rest] = process.argv.slice(2);
const detail = rest.join(' ');
const added = existsSync('bot/out/added.json') ? JSON.parse(readFileSync('bot/out/added.json', 'utf8')) : [];
const list = added.map(e => `• ${e.date} ${e.short}`).join('\n') || '없음';

const body = {
  pr: {
    content: null,
    embeds: [{
      title: '아카이브에 새 회차 초안이 올라왔습니다',
      description: `${list}\n\n원문 대조 검사는 통과했습니다. 확인 후 머지하면 페이지에 반영됩니다.\n${detail}`,
      color: 0x2a78d6,
      footer: { text: '초안은 자동으로 반영되지 않습니다' },
    }],
  },
  fail: {
    embeds: [{
      title: '아카이브 자동 반영이 중단됐습니다',
      description: `원문 대조 검사에서 걸렸습니다.\n\`\`\`\n${detail.slice(0, 1400)}\n\`\`\``,
      color: 0xb34a12,
    }],
  },
  live: {
    embeds: [{
      title: '아카이브에 반영됐습니다',
      description: `${list}\n\n${detail}`,
      color: 0x14805a,
    }],
  },
}[mode];

if (!body) { console.error(`알 수 없는 모드: ${mode}`); process.exit(2); }

const res = await fetch(hook, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
console.log(res.ok ? '알림 전송' : `알림 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
