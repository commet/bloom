#!/usr/bin/env node
/**
 * 참여 기능(공감·제보) 점검.
 * 이 환경은 supabase.co 로 나갈 수 없으므로 RPC 응답을 흉내 내서 클라이언트 로직만 본다.
 * 서버 쪽(RLS·함수)은 Supabase 에서 SQL 로 따로 확인한다.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = pathToFileURL(resolve('dist/index.html')).href;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const out = [];

async function session({ offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => out.push(`JS 오류: ${e.message}`));

  const counts = { '0414q0': 3 };
  const seen = [];
  await page.route('**/rest/v1/rpc/**', async route => {
    if (offline) return route.abort();
    const name = route.request().url().split('/').pop();
    const body = JSON.parse(route.request().postData() || '{}');
    seen.push({ name, body });
    if (name === 'bloom_mark_counts') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(Object.entries(counts).map(([quote_key, n]) => ({ quote_key, n }))) });
    }
    if (name === 'bloom_mark') {
      counts[body.p_quote_key] = (counts[body.p_quote_key] || 0) + (body.p_on ? 1 : -1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: String(counts[body.p_quote_key]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '' });
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  return { ctx, page, seen, counts };
}

/* ── 연결됐을 때 ── */
{
  const { ctx, page, seen, counts } = await session();

  const marks = await page.locator('#wall .mark').count();
  if (!marks) out.push('공감 버튼이 렌더되지 않음');

  const first = page.locator('#wall .mark').first();
  const key = await first.getAttribute('data-key');
  await first.click();
  await page.waitForTimeout(500);
  if ((await first.getAttribute('aria-pressed')) !== 'true') out.push('공감 후 눌림 상태가 아님');
  if (counts[key] !== 1 && counts[key] !== 4) out.push(`서버 반영 이상: ${key}=${counts[key]}`);

  await first.click();
  await page.waitForTimeout(500);
  if ((await first.getAttribute('aria-pressed')) !== 'false') out.push('취소 후에도 눌림 상태');

  /* 기존 공감 수가 화면에 반영되는지 */
  const shown = await page.locator('#wall .mark[data-key="0414q0"] em').first().textContent().catch(() => '');
  if (!shown) out.push('기존 공감 수가 표시되지 않음');

  /* 공감순 정렬 */
  await page.locator('#sortseg button[data-sort="mark"]').click();
  await page.waitForTimeout(300);
  const top = await page.locator('#wall .mark').first().getAttribute('data-key');
  if (top !== '0414q0') out.push(`공감순 정렬이 반영되지 않음 (맨 위 ${top})`);
  await page.locator('#sortseg button[data-sort="time"]').click();
  await page.waitForTimeout(200);

  /* 카드 본문은 여전히 드로어를 연다 */
  await page.locator('#wall .cardbody').first().click();
  await page.waitForTimeout(600);
  if (!(await page.locator('#drawer.on').count())) out.push('카드 본문 클릭에 드로어가 열리지 않음');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  /* 제보 — 짧은 내용은 막고, 정상 제출은 보낸다 */
  await page.fill('#j-body', '짧음');
  await page.locator('#j-send').click();
  await page.waitForTimeout(300);
  if (!(await page.locator('#j-msg.err').count())) out.push('짧은 내용이 걸러지지 않음');

  await page.locator('#kinds .chip[data-k="join"]').click();
  await page.waitForTimeout(150);
  if (!(await page.locator('#fld-event').isHidden())) out.push('함께 만들기에서 회차 선택이 숨겨지지 않음');

  await page.locator('#kinds .chip[data-k="addition"]').click();
  await page.fill('#j-body', '점검용 제출 내용입니다. 충분히 깁니다.');
  await page.fill('#j-contact', 'test@example.com');
  await page.locator('#j-send').click();
  await page.waitForTimeout(700);
  if (!(await page.locator('#j-msg.ok').count())) out.push(`제보 성공 표시가 없음: ${await page.locator('#j-msg').textContent()}`);
  if (await page.locator('#j-body').inputValue()) out.push('제출 후 폼이 비워지지 않음');

  const note = seen.find(x => x.name === 'bloom_note');
  if (!note) out.push('bloom_note 가 호출되지 않음');
  else if (note.body.p_kind !== 'addition' || !note.body.p_voter) out.push(`bloom_note 인자 이상: ${JSON.stringify(note.body)}`);

  await ctx.close();
}

/* ── 연결이 막혔을 때 (아티팩트 미리보기 등) ── */
{
  const { ctx, page } = await session({ offline: true });
  if (!(await page.locator('#joinbox.off').count())) out.push('오프라인에서 폼이 비활성화되지 않음');
  if (!(await page.locator('#joinstate').textContent())) out.push('오프라인 안내 문구가 없음');
  if (await page.locator('#wall .mark').count()) out.push('오프라인인데 공감 버튼이 보임');
  if (!(await page.locator('#wall .card').count())) out.push('오프라인에서 카드가 사라짐');
  await ctx.close();
}

await browser.close();
console.log(out.length ? out.join('\n') : '참여 기능 모두 통과');
