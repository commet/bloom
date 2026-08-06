/** 기능·대비 점검 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const out = [];
for (const scheme of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(resolve('dist/index.html')).href);

  // 대비 검사
  const lum = c => { const [r,g,b]=c.match(/\d+(\.\d+)?/g).map(Number).slice(0,3).map(v=>v/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4); return .2126*r+.7152*g+.0722*b; };
  const pairs = await p.evaluate(() => {
    const seen = new Map();
    /* 반투명 배경은 아래 레이어와 합성해서 실제 픽셀 색을 구한다 */
    const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return m.length > 3 && !c.startsWith('color(') ? m : (c.startsWith('color(') ? [m[0]*255, m[1]*255, m[2]*255, m[3] ?? 1] : [...m, 1]); };
    const bgOf = n => {
      let e = n, stack = [];
      while (e) { const p = parse(getComputedStyle(e).backgroundColor); if (p[3] > 0) { stack.push(p); if (p[3] >= 1) break; } e = e.parentElement; }
      if (!stack.length) return 'rgb(255,255,255)';
      let base = stack.pop();
      while (stack.length) { const top = stack.pop(), a = top[3];
        base = [0,1,2].map(i => top[i]*a + base[i]*(1-a)).concat(1); }
      return `rgb(${base.slice(0,3).map(Math.round).join(', ')})`;
    };
    document.querySelectorAll('p,li,td,th,span,a,b,cite,dd,dt,h1,h2,h3,h4,h5,button').forEach(n => {
      if (!n.textContent.trim() || n.children.length) return;
      const cs = getComputedStyle(n);
      const key = cs.color + '|' + bgOf(n) + '|' + cs.fontSize + '|' + cs.fontWeight;
      if (!seen.has(key)) seen.set(key, { fg: cs.color, bg: bgOf(n), size: parseFloat(cs.fontSize), weight: +cs.fontWeight, sample: n.textContent.trim().slice(0,24) });
    });
    return [...seen.values()];
  });
  for (const x of pairs) {
    const L1 = lum(x.fg), L2 = lum(x.bg);
    const ratio = (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    const large = x.size >= 24 || (x.size >= 18.66 && x.weight >= 700);
    const min = large ? 3 : 4.5;
    if (ratio < min) out.push(`${scheme} 대비 ${ratio.toFixed(2)} (필요 ${min}) ${x.size}px/${x.weight} "${x.sample}" ${x.fg} on ${x.bg}`);
  }

  // 기능
  await p.fill('#q', '팔로알토'); await p.waitForTimeout(250);
  const n1 = await p.locator('.row:not([hidden])').count();
  if (n1 !== 1) out.push(`${scheme} 검색 결과 ${n1}건 (1 기대)`);
  await p.click('#reset'); await p.waitForTimeout(250);
  const n2 = await p.locator('.row:not([hidden])').count();
  if (n2 !== 26) out.push(`${scheme} 초기화 후 ${n2}건 (26 기대)`);
  await p.click('#f-flag button:first-child'); await p.waitForTimeout(200);
  const n3 = await p.locator('.row:not([hidden])').count();
  if (n3 !== 2) out.push(`${scheme} 공개 회고 필터 ${n3}건 (2 기대)`);
  await p.click('#reset'); await p.waitForTimeout(200);
  await p.click('#e0625 .rowbtn'); await p.waitForTimeout(500);
  await p.click('#e0625 button.tag'); await p.waitForTimeout(300);
  const n4 = await p.locator('.row:not([hidden])').count();
  if (n4 < 1) out.push(`${scheme} 태그 클릭 후 ${n4}건`);
  else out.push(`${scheme} 태그 필터 동작 확인 (${n4}건)`);
  await ctx.close();
}
await b.close();
console.log(out.length ? out.join('\n') : '모두 통과');
