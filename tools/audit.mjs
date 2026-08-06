import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const w of [390, 768, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(resolve('dist/index.html')).href);
  await p.evaluate(() => document.querySelectorAll('.rowbtn').forEach(x => x.click()));
  await p.waitForTimeout(500);
  const r = await p.evaluate((w) => {
    const bad = [];
    document.querySelectorAll('body *').forEach(n => {
      const b = n.getBoundingClientRect();
      if (b.width === 0) return;
      if (b.right > w + 0.5 || b.left < -0.5) bad.push(`${n.tagName}.${n.className}`.slice(0,60) + ` L${b.left|0} R${b.right|0}`);
    });
    return { bad: [...new Set(bad)].slice(0, 12), sw: document.documentElement.scrollWidth };
  }, w);
  console.log(`--- ${w}px  scrollWidth=${r.sw}`);
  r.bad.forEach(x => console.log('   overflow:', x));
  await ctx.close();
}
await b.close();
