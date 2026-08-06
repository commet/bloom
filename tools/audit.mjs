import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const w of [360, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(resolve('dist/index.html')).href);
  await p.waitForTimeout(400);
  const r = await p.evaluate((w) => {
    const bad = [];
    document.querySelectorAll('body *').forEach(n => {
      // 내부 스크롤 영역(달력)과 화면 밖 드로어는 의도된 것
      if (n.closest('.plotbox, .drawer, .bar-in')) return;
      const b = n.getBoundingClientRect();
      if (b.width === 0) return;
      const name = typeof n.className === 'string' ? n.className : n.tagName;
      if (b.right > w + 0.5 || b.left < -0.5) bad.push(`${n.tagName}.${name}`.slice(0, 60) + ` L${b.left|0} R${b.right|0}`);
    });
    return { bad: [...new Set(bad)].slice(0, 12), sw: document.documentElement.scrollWidth };
  }, w);
  console.log(`--- ${w}px  scrollWidth=${r.sw}`);
  r.bad.forEach(x => console.log('   overflow:', x));

  // 머리말과 본문 섹션의 좌측선이 어긋나면 안 된다
  const align = await p.evaluate(() => {
    const l = n => Math.round(document.querySelector(n).getBoundingClientRect().left);
    return { h1: l('.mast h1'), sec: l('#plot .shead h2'), foot: l('.foot p') };
  });
  const off = Math.max(Math.abs(align.h1 - align.sec), Math.abs(align.foot - align.sec));
  if (off > 1) console.log(`   좌측 정렬 어긋남: h1 ${align.h1} / 섹션 ${align.sec} / 푸터 ${align.foot}`);
  await ctx.close();
}
await b.close();
