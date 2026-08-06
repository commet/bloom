#!/usr/bin/env node
/**
 * /line 점검 — 폰 화면과 발표자 화면, 그리고 갈래 문장의 출처.
 *
 * 회고 모임 당일 한 번 쓰고 끝나는 페이지라 오히려 검사가 필요하다. 현장에서 안 되면
 * 고칠 시간이 없다. 그래서 (1) 지어낸 문장이 섞였는지 (2) 연결이 끊긴 자리에서
 * 어떻게 되는지 (3) 두 화면이 실제로 그려지는지를 본다.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = pathToFileURL(resolve('dist/line.html')).href;
const out = [];

/* ── 1. 갈래 문장이 전부 아카이브 원문에 있는가 ── 지어낸 문장 차단 ── */
{
  const { lanes } = await import('../src/lineage.js');
  const src = readFileSync('src/data.js', 'utf8');
  for (const L of lanes) {
    if (!L.lines.length) out.push(`갈래 "${L.key}" 에 문장이 없다`);
    for (const ln of L.lines) {
      if (!src.includes(ln.t)) out.push(`갈래 "${L.key}" 의 문장이 data.js 원문에 없다: "${ln.t.slice(0, 40)}…"`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ln.d)) out.push(`갈래 "${L.key}" 의 날짜 형식 오류: ${ln.d}`);
    }
  }
}

const ROWS = [
  ['AI가 초안을 내면 그다음이 진짜 일이더라', 'judge'],
  ['최종 판단은 결국 내가 해야 한다', 'judge'],
  ['회사 보안 때문에 아직 못 쓴다', 'permission'],
  ['우리 팀 맥락을 어떻게 남길지가 숙제', 'context'],
  ['오늘 테이블 대화가 제일 좋았다', 'table'],
  ['문제를 내가 직접 정의해봐야겠다', 'problem'],
  ['잘 쉬는 법을 배워야 할 듯', 'new'],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/** RPC 를 흉내 낸다. 이 환경은 supabase.co 로 나갈 수 없다. */
async function mock(page, { board = ROWS, fail = false } = {}) {
  await page.route('**/rest/v1/rpc/**', r =>
    fail ? r.abort() : r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('**/rest/v1/rpc/bloom_line_board', r =>
    fail ? r.abort() : r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(board.map(([line, lane]) => ({ line, lane }))),
    }));
}

function watch(page, tag) {
  page.on('pageerror', e => out.push(`${tag} JS 오류: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_FAILED|supabase\.co/.test(m.text())) return;
    out.push(`${tag} 콘솔 오류: ${m.text()}`);
  });
}

/* ── 2. 폰 화면 ── */
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  watch(page, `폰(${theme})`);
  await mock(page);
  await page.goto(url);
  await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  await page.waitForTimeout(400);

  /* 판정 → 카드 */
  await page.fill('#line', 'AI가 초안을 내면 그다음이 진짜 일이더라');
  await page.click('#send');
  await page.waitForTimeout(400);
  const lane = await page.locator('#card .lane').textContent().catch(() => '');
  if (!lane.includes('판단과 책임')) out.push(`폰(${theme}) 갈래 판정이 다르다: "${lane}"`);
  const nLines = await page.locator('#card ol li').count();
  if (nLines < 3) out.push(`폰(${theme}) 카드에 과거 문장이 ${nLines}개뿐이다`);
  if (!(await page.locator('#card .rank').textContent()).includes('번째')) out.push(`폰(${theme}) 순번 문구가 없다`);

  /* 갈래를 바꾸면 과거 문장 목록도 따라 바뀐다 */
  const before = await page.locator('#card ol li .d').first().textContent();
  await page.locator('#fixchips button[data-lane="context"]').click();
  await page.waitForTimeout(300);
  const after = await page.locator('#card ol li .d').first().textContent();
  if (before === after) out.push(`폰(${theme}) 갈래를 바꿔도 과거 문장이 그대로다`);
  if (!(await page.locator('#card .lane').textContent()).includes('자산화된 맥락')) out.push(`폰(${theme}) 갈래 변경이 카드에 반영되지 않는다`);

  /* 어느 갈래에도 안 걸리는 줄 */
  await page.fill('#line', '오늘 저녁은 뭘 먹을까 계속 생각했다');
  await page.click('#send');
  await page.waitForTimeout(400);
  if (!(await page.locator('#card.isnew').count())) out.push(`폰(${theme}) 걸리는 낱말이 없는데도 새 갈래로 가지 않는다`);
  if (!(await page.locator('#card .verdict').textContent()).includes('없던 말')) out.push(`폰(${theme}) 새 갈래 문구가 다르다`);

  /* 너무 짧은 입력은 막는다 */
  await page.fill('#line', 'ㅇ');
  await page.click('#send');
  await page.waitForTimeout(200);
  if (!(await page.locator('#msg.err').count())) out.push(`폰(${theme}) 한 글자 입력이 막히지 않는다`);

  /* 오늘 이 방 */
  if (await page.locator('#board .lane-row').count() < 4) out.push(`폰(${theme}) 오늘 이 방 목록이 비었다`);
  if (!(await page.locator('#board .lane-row.newlane').count())) out.push(`폰(${theme}) 새 갈래 묶음이 표시되지 않는다`);

  /* 카드 이미지 */
  const blobOk = await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 8;
    return !!(await new Promise(r => cv.toBlob(r, 'image/png')));
  });
  if (!blobOk) out.push(`폰(${theme}) canvas PNG 를 만들지 못한다`);

  /* 대비 — 반투명 배경은 아래 레이어와 합성한 뒤 계산한다 */
  const pairs = await page.evaluate(() => {
    const parse = c => {
      const m = (c.match(/[\d.]+/g) || []).map(Number);
      if (c.startsWith('color(')) return [m[0] * 255, m[1] * 255, m[2] * 255, m[3] ?? 1];
      return [m[0], m[1], m[2], m[3] ?? 1];
    };
    const bgOf = n => {
      let e = n; const stack = [];
      while (e) {
        const p = parse(getComputedStyle(e).backgroundColor);
        if (p[3] > 0) { stack.push(p); if (p[3] >= 1) break; }
        e = e.parentElement;
      }
      if (!stack.length) return 'rgb(255,255,255)';
      let base = stack.pop();
      while (stack.length) {
        const top = stack.pop(), a = top[3];
        base = [0, 1, 2].map(i => top[i] * a + base[i] * (1 - a)).concat(1);
      }
      return `rgb(${base.slice(0, 3).map(Math.round).join(', ')})`;
    };
    const seen = new Map();
    document.querySelectorAll('p,li,span,a,b,i,button,h1,h2,h3,label,textarea,text').forEach(n => {
      if (!n.textContent.trim() || n.children.length) return;
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const cs = getComputedStyle(n);
      const fill = n.namespaceURI.includes('svg') ? cs.fill : cs.color;
      if (!fill || fill === 'none') return;
      const key = `${fill}|${bgOf(n)}|${cs.fontSize}|${cs.fontWeight}`;
      if (!seen.has(key)) seen.set(key, {
        fg: fill, bg: bgOf(n), size: parseFloat(cs.fontSize),
        weight: +cs.fontWeight, sample: n.textContent.trim().slice(0, 24),
      });
    });
    return [...seen.values()];
  });
  const lum = c => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255)
      .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const x of pairs) {
    if (!/^(rgb|color)/.test(x.fg)) continue;
    const L1 = lum(x.fg), L2 = lum(x.bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const large = x.size >= 24 || (x.size >= 18.66 && x.weight >= 700);
    const min = large ? 3 : 4.5;
    if (ratio < min) out.push(`폰(${theme}) 대비 ${ratio.toFixed(2)} (필요 ${min}) ${x.size}px/${x.weight} "${x.sample}"`);
  }

  await ctx.close();
}

/* ── 3. 연결이 끊긴 자리 ── 현장 와이파이가 막혀도 카드는 나와야 한다 ── */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  watch(page, '오프라인');
  await mock(page, { fail: true });
  await page.goto(url);
  await page.waitForTimeout(400);
  await page.fill('#line', '회사 보안 때문에 아직 못 쓴다');
  await page.click('#send');
  await page.waitForTimeout(700);
  if (!(await page.locator('#card').count())) out.push('오프라인에서 카드가 나오지 않는다');
  if (!(await page.locator('#card .lane').textContent()).includes('허가')) out.push('오프라인에서 갈래 판정이 되지 않는다');
  const msg = await page.locator('#msg').textContent();
  if (!/올리지 못했습니다/.test(msg)) out.push(`오프라인 안내가 없다: "${msg}"`);
  if (await page.locator('#send').isDisabled()) out.push('오프라인에서 보내기 버튼이 잠긴 채 남는다');
  await ctx.close();
}

/* ── 4. 발표자 화면 ── */
for (const vp of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  watch(page, `발표자(${vp.width})`);
  await mock(page);
  await page.goto(url + '?screen');
  await page.waitForTimeout(900);

  const tag = `발표자(${vp.width})`;
  if (await page.locator('#cal .trackline').count() !== 6) out.push(`${tag} 트랙이 6개가 아니다`);
  if (await page.locator('#cal .dot-past').count() < 20) out.push(`${tag} 4개월 기록 점이 모자란다`);
  if (await page.locator('#cal .dot-now').count() !== 6) out.push(`${tag} 오늘 점이 6개가 아니다`);
  if (await page.locator('#cal .dot-new').count() !== 1) out.push(`${tag} 새 갈래 점이 1개가 아니다`);
  if (!(await page.locator('#tally').textContent()).includes('7')) out.push(`${tag} 참여 인원 집계가 다르다`);
  if (!(await page.locator('#nextup').textContent()).trim()) out.push(`${tag} 다음 일정 줄이 비었다`);
  if (await page.locator('.stage .legend span').count() !== 3) out.push(`${tag} 범례가 3개가 아니다`);
  if (await page.locator('main').isVisible()) out.push(`${tag} 폰용 본문이 발표 화면에 남아 있다`);

  const over = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    y: document.documentElement.scrollHeight > window.innerHeight + 1,
  }));
  if (over.x) out.push(`${tag} 가로 넘침`);
  if (over.y) out.push(`${tag} 세로 넘침 — 집계 줄이 잘린다`);

  /* 운영진용 한 장 */
  const sheet = await page.evaluate(() => opsSheet());
  for (const must of ['참여 7명', '갈래별', '기록에 없던 말 1건', '잘 쉬는 법을 배워야 할 듯']) {
    if (!sheet.includes(must)) out.push(`${tag} 운영진용 한 장에 "${must}" 가 없다`);
  }
  if (/[0-9a-f]{8}-[0-9a-f]{4}/.test(sheet)) out.push(`${tag} 운영진용 한 장에 식별자가 섞였다`);

  await ctx.close();
}

/* ── 5. 갈래 판정이 양쪽에서 같은가 ── 페이지 안의 사본이 lineage.js 와 어긋나면 안 된다 ── */
{
  const { place } = await import('../src/lineage.js');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await mock(page);
  await page.goto(url);
  const probes = ['AI가 초안을 내면 그다음이 진짜 일이더라', '회사 보안 때문에 아직 못 쓴다',
    '우리 팀 맥락을 어떻게 남길지가 숙제', '오늘 테이블 대화가 제일 좋았다',
    '문제를 내가 직접 정의해봐야겠다', '오늘 저녁은 뭘 먹을까'];
  const inPage = await page.evaluate(ps => ps.map(p => place(p)), probes);
  probes.forEach((p, i) => {
    const node = place(p).key;
    if (node !== inPage[i]) out.push(`갈래 판정이 어긋난다 "${p}": lineage.js=${node}, 페이지=${inPage[i]}`);
  });
  await ctx.close();
}

await browser.close();
console.log(out.length ? out.join('\n') : '/line 모두 통과');
process.exit(out.length ? 1 : 0);
