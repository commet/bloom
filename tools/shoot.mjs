#!/usr/bin/env node
/** dist/index.html을 데스크톱·모바일 뷰포트로 한 번에 촬영하고 콘솔 오류를 보고한다. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = pathToFileURL(resolve('dist/index.html')).href;
const out = 'dist/shots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const errs = [];

for (const [name, vp, theme] of [
  ['desk', { width: 1440, height: 1000 }, 'light'],
  ['dark', { width: 1440, height: 1000 }, 'dark'],
  ['mob', { width: 390, height: 844 }, 'light'],
]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${name}: ${e.message}`));
  page.on('console', m => m.type() === 'error' && errs.push(`${name}: ${m.text()}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  if (theme === 'dark') { await page.evaluate(() => document.querySelector('#theme').click()); await page.waitForTimeout(200); }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);

  await page.screenshot({ path: `${out}/${name}-top.png` });

  // 섹션들
  for (const id of ['words', 'numbers', 'next']) {
    await page.evaluate(s => document.querySelector(s).scrollIntoView(), '#' + id);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${name}-${id}.png` });
  }

  // 드로어를 연 상태
  if (name !== 'dark') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.querySelector('#cal .cell[data-id="0425"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}-drawer.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  }

  // 가로 스크롤 검사
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      ? `${document.documentElement.scrollWidth} > ${document.documentElement.clientWidth}` : null);
  if (overflow) errs.push(`${name}: 가로 스크롤 ${overflow}`);

  await ctx.close();
}

await browser.close();
console.log(errs.length ? '문제:\n' + errs.join('\n') : '오류 없음');
