/** 대비(WCAG AA)와 상호작용 점검. 실패만 출력한다. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = pathToFileURL(resolve('dist/index.html')).href;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const out = [];

const lum = c => {
  const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => out.push(`${theme} JS 오류: ${e.message}`));
  page.on('console', m => m.type() === 'error' && out.push(`${theme} 콘솔 오류: ${m.text()}`));
  await page.goto(url);
  await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  await page.evaluate(() => document.querySelector('#more')?.click());
  await page.waitForTimeout(300);

  /* ── 대비 ── 반투명 배경은 아래 레이어와 합성한 뒤 계산한다 */
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
    document.querySelectorAll('p,li,td,th,span,a,b,i,em,cite,dd,dt,h1,h2,h3,h4,h5,button,q,summary,text')
      .forEach(n => {
        if (!n.textContent.trim() || n.children.length) return;
        const r = n.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const cs = getComputedStyle(n);
        const fill = n.namespaceURI.includes('svg') ? cs.fill : cs.color;
        if (!fill || fill === 'none') return;
        const key = `${fill}|${bgOf(n)}|${cs.fontSize}|${cs.fontWeight}`;
        if (!seen.has(key)) seen.set(key, {
          fg: fill, bg: bgOf(n), size: parseFloat(cs.fontSize),
          weight: +cs.fontWeight, sample: n.textContent.trim().slice(0, 26),
        });
      });
    return [...seen.values()];
  });

  for (const x of pairs) {
    if (!/^(rgb|color)/.test(x.fg)) continue;
    const L1 = lum(x.fg), L2 = lum(x.bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const large = x.size >= 24 || (x.size >= 18.66 && x.weight >= 700);
    const min = large ? 3 : 4.5;
    if (ratio < min) out.push(`${theme} 대비 ${ratio.toFixed(2)} (필요 ${min}) ${x.size}px/${x.weight} "${x.sample}" ${x.fg} on ${x.bg}`);
  }

  /* ── 상호작용 ── */
  const cells = await page.locator('#cal .cell').count();
  if (cells !== 26) out.push(`${theme} 달력 칸 ${cells}개 (26 기대)`);

  await page.locator('#cal .cell[data-id="0425"]').click();
  await page.waitForTimeout(500);
  if (!(await page.locator('#drawer.on').count())) out.push(`${theme} 달력 칸 클릭에 드로어가 열리지 않음`);
  if (!(await page.locator('#dtitle').textContent()).includes('AB180')) out.push(`${theme} 드로어 제목이 다름`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  if (await page.locator('#drawer.on').count()) out.push(`${theme} Esc로 드로어가 닫히지 않음`);

  await page.locator('#firstlist button').first().click();
  await page.waitForTimeout(500);
  if (!(await page.locator('#drawer.on').count())) out.push(`${theme} 이정표 클릭에 드로어가 열리지 않음`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);

  const q0 = await page.locator('#wall .card').count();
  await page.locator('#seg button[data-view="table"]').click();
  await page.waitForTimeout(250);
  const t0 = await page.locator('#wall .card').count();
  if (!q0 || !t0) out.push(`${theme} 카드가 비었음 (인용 ${q0}, 조별 ${t0})`);

  await page.locator('#seg button[data-view="quote"]').click();
  await page.waitForTimeout(200);
  const nTerms = await page.locator('#terms button').count();
  if (nTerms < 10) out.push(`${theme} 핵심어 ${nTerms}개 (10개 이상 기대)`);
  await page.locator('#terms button').first().click();
  await page.waitForTimeout(250);
  const filtered = await page.locator('#wall .card').count();
  if (filtered === 0 || filtered > q0) out.push(`${theme} 핵심어 필터 결과 ${filtered}건 (0 < n <= ${q0} 기대)`);
  if (!(await page.locator('#wall mark').count())) out.push(`${theme} 선택한 핵심어가 본문에 표시되지 않음`);
  await page.locator('#clearterm').click();
  await page.waitForTimeout(250);
  if (await page.locator('#wall mark').count()) out.push(`${theme} 핵심어 해제 후에도 표시가 남음`);

  /* 실명 노출 검사 — 데이터의 전체 이름이 화면에 그대로 나오면 안 된다 */
  const leaked = await page.evaluate(() => {
    const KEEP = new Set(['조코딩', '팔로알토', 'KEEPKWAN', 'Kyle', 'junshu', '빌더 조쉬', 'Celina']);
    const names = new Set();
    (window.__D || []).forEach(e => (e.speakers || []).forEach(s => {
      const bare = s.n.replace(/\s*\([^)]*\)\s*/g, '').trim();
      if (!KEEP.has(bare) && /^[가-힣]{3,4}$/.test(bare)) names.add(bare);
    }));
    const text = document.body.innerText;
    return [...names].filter(n => text.includes(n));
  });
  if (leaked.length) out.push(`${theme} 실명 노출: ${leaked.join(', ')}`);

  await ctx.close();
}

await browser.close();
console.log(out.length ? out.join('\n') : '모두 통과');
