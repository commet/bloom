#!/usr/bin/env node
/**
 * 1단계 — 적재. 디스코드 채널의 메시지를 원문 그대로 bloom_raw 에 넣는다.
 *
 * 이 단계는 아무것도 해석하지 않는다. 요약도, 정리도, 판단도 하지 않는다.
 * 뒤 단계가 지어낸 문장을 밀어 넣었을 때 그것을 잡아낼 수 있는 유일한 근거가
 * 이 원문이기 때문이다. 편집하면 검증이 무의미해진다.
 *
 * 작성자는 ID 해시만 남긴다. 표시 이름을 저장하지 않으므로 뒤 단계가 실명을
 * 흘릴 경로 자체가 없다.
 *
 * 출력: bot/out/raw.jsonl (이번 실행에서 새로 들어온 것 + 최근 창)
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { channelIds, need, opt } from './lib/env.mjs';
import * as discord from './lib/discord.mjs';
import { insertIgnore, select, upsert } from './lib/supabase.mjs';

const salt = opt('AUTHOR_SALT', need('SUPABASE_URL'));
const hash = id => createHash('sha256').update(salt + ':' + id).digest('hex').slice(0, 16);

const who = await discord.me();
console.log(`봇 ${who.username}#${who.discriminator ?? ''} (${who.id})`);

const cursors = Object.fromEntries(
  (await select('bloom_sync', 'select=channel_id,last_message_id')).map(r => [r.channel_id, r.last_message_id]),
);

let added = 0;
for (const cid of channelIds()) {
  let name = cid;
  try { name = '#' + (await discord.channel(cid)).name; } catch { /* 이름은 없어도 된다 */ }

  const msgs = await discord.messagesAfter(cid, cursors[cid]);
  const rows = msgs
    .filter(m => (m.content || '').trim() || (m.attachments || []).length)
    .map(m => ({
      message_id: m.id,
      channel_id: cid,
      channel_name: name,
      author_hash: hash(m.author?.id || '0'),
      author_is_bot: !!m.author?.bot,
      content: m.content || '',
      attachments: (m.attachments || []).map(a => ({ name: a.filename, url: a.url, type: a.content_type })),
      posted_at: m.timestamp,
    }));

  await insertIgnore('bloom_raw', rows);
  added += rows.length;

  const last = msgs[msgs.length - 1];
  if (last) await upsert('bloom_sync', [{ channel_id: cid, last_message_id: last.id, updated_at: new Date().toISOString() }]);
  console.log(`${name}: ${rows.length}건 적재${cursors[cid] ? '' : ' (최초 실행 — 최근분만)'}`);
}

/* 다음 단계가 볼 창(window). 커서 뒤 새 메시지가 없어도 최근 기록은 대조 근거로 필요하다. */
const since = opt('EXTRACT_WINDOW_DAYS', '45');
const from = new Date(Date.now() - Number(since) * 864e5).toISOString();
const window = await select(
  'bloom_raw',
  `select=message_id,channel_name,author_hash,author_is_bot,content,posted_at&posted_at=gte.${from}&order=posted_at.asc&limit=4000`,
);

mkdirSync('bot/out', { recursive: true });
writeFileSync('bot/out/raw.jsonl', window.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`새로 ${added}건, 최근 ${since}일 창 ${window.length}건 → bot/out/raw.jsonl`);
