/**
 * 디스코드 REST 최소 클라이언트.
 *
 * 게이트웨이(웹소켓)를 쓰지 않는다. 이 봇은 상주하지 않고 GitHub Actions 크론으로 깨어나
 * 마지막으로 읽은 메시지 뒤부터 가져오기만 하면 되므로, 소켓을 붙들 이유가 없다.
 * 호스팅이 필요 없고 죽어도 다음 실행이 이어서 따라잡는다.
 *
 * 필요한 권한: 대상 채널의 View Channel + Read Message History.
 * 봇이 메시지 본문을 받으려면 개발자 포털에서 Message Content Intent 를 켜야 한다.
 */
import { need } from './env.mjs';

const API = 'https://discord.com/api/v10';

async function req(path) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bot ${need('DISCORD_BOT_TOKEN')}` },
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') || 1) * 1000 + 250;
      if (attempt >= 5) throw new Error('디스코드 rate limit 이 계속된다');
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (res.status >= 500 && attempt < 4) {
      await new Promise(r => setTimeout(r, 2 ** attempt * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Discord ${res.status} ${path}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
}

export const me = () => req('/users/@me');
export const channel = id => req(`/channels/${id}`);

/**
 * after 이후 메시지를 오래된 순으로 전부 가져온다.
 * after 가 없으면 최근 limitFirstRun 건만 (최초 백필의 폭주를 막는다).
 */
export async function messagesAfter(channelId, after, limitFirstRun = 200) {
  const out = [];
  let cursor = after;
  for (;;) {
    const q = cursor ? `after=${cursor}` : '';
    const batch = await req(`/channels/${channelId}/messages?limit=100${q ? '&' + q : ''}`);
    if (!batch.length) break;
    /* API 는 항상 최신순으로 준다. after 질의일 때만 오래된 순으로 뒤집어 이어붙인다. */
    const asc = [...batch].reverse();
    out.push(...asc);
    if (!cursor) break;                       // 최초 실행 — 한 배치로 끝낸다
    cursor = asc[asc.length - 1].id;
    if (batch.length < 100) break;
    if (out.length > 5000) break;             // 안전장치
  }
  if (!after) return out.slice(-limitFirstRun);
  return out;
}
