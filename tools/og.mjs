#!/usr/bin/env node
/**
 * 링크 미리보기용 1200×630 이미지를 만든다 (카카오톡·슬랙·X 등).
 * 실제 페이지를 열어 달력을 그대로 다시 그리므로, 데이터가 바뀌면 이미지도 따라 바뀐다.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = pathToFileURL(resolve('dist/index.html')).href;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

await page.evaluate(() => {
  const dek = document.querySelector('#dek').textContent;
  const facts = [...document.querySelectorAll('.facts div')].map(d => ({
    v: d.querySelector('b').childNodes[0].textContent,
    u: d.querySelector('b i').textContent,
    k: d.querySelector('span').textContent,
  }));
  const legend = document.querySelector('#legend').innerHTML;
  const plot = document.querySelector('#plotbox');

  document.documentElement.dataset.theme = 'light';
  [...document.body.children].forEach(n => { n.style.display = 'none'; });

  const og = document.createElement('div');
  og.id = 'og';
  og.innerHTML = `
    <div class="og-head">
      <div>
        <h1>Bloom 2026</h1>
        <p class="og-dek">${dek}</p>
      </div>
      <div class="og-facts">${facts.map(f =>
        `<div><b>${f.v}<i>${f.u}</i></b><span>${f.k}</span></div>`).join('')}</div>
    </div>
    <div class="og-plot"></div>
    <div class="og-foot"><div class="og-leg"><div class="legend">${legend}</div></div><span class="og-src">공개 기록 정리 · 비공식</span></div>`;
  document.body.append(og);

  const style = document.createElement('style');
  style.textContent = `
    body { overflow: hidden; }
    #og {
      position: fixed; inset: 0; width: 1200px; height: 630px; display: flex; flex-direction: column;
      padding: 52px 56px 44px; background: var(--surface-1); box-sizing: border-box;
    }
    #og .og-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 40px; }
    #og h1 {
      font-family: var(--disp); font-weight: 800; font-variation-settings: "wdth" 112;
      font-size: 76px; letter-spacing: -.045em; line-height: .9; margin: 0; color: var(--text-primary);
    }
    #og .og-dek {
      font-family: var(--disp); font-weight: 600; font-variation-settings: "wdth" 95;
      font-size: 19px; color: var(--text-secondary); margin: 12px 0 0; font-variant-numeric: tabular-nums;
    }
    #og .og-facts { display: flex; gap: 0; flex: none; }
    #og .og-facts div { padding: 0 0 0 26px; margin-left: 26px; border-left: 1px solid var(--border); }
    #og .og-facts div:first-child { border-left: 0; margin-left: 0; padding-left: 0; }
    #og .og-facts b {
      display: block; font-family: var(--disp); font-weight: 800; font-variation-settings: "wdth" 104;
      font-size: 30px; letter-spacing: -.035em; line-height: 1.1; font-variant-numeric: tabular-nums;
      color: var(--text-primary);
    }
    #og .og-facts b i { font-style: normal; font-size: .5em; font-weight: 600; color: var(--text-muted); margin-left: .28em; }
    #og .og-facts span { display: block; font-size: 12.5px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; }
    #og .og-plot { flex: 1; display: flex; align-items: center; margin: 20px 0 0; }
    #og .og-plot #plotbox { margin: 0; padding: 0; overflow: visible; width: 100%; }
    #og .og-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px;
      border-top: 1px solid var(--border); padding-top: 16px; }
    #og .og-leg .legend { margin: 0; padding: 0; border: 0; gap: 8px 24px; }
    #og .og-leg .legend .hint { display: none; }
    #og .og-leg .legend span { font-size: 14px; }
    #og .og-src { font-family: var(--disp); font-weight: 600; font-size: 13px; color: var(--text-muted); white-space: nowrap; }
  `;
  document.head.append(style);
  og.querySelector('.og-plot').append(plot);
  plot.style.display = '';
  window.drawCalendar();
});

await page.waitForTimeout(400);
await page.locator('#og').screenshot({ path: 'dist/og.png' });
await browser.close();
console.log('dist/og.png 생성');
