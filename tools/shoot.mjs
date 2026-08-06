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
  ['desk-dark', { width: 1440, height: 1000 }, 'dark'],
  ['desk-light', { width: 1440, height: 1000 }, 'light'],
  ['mob-dark', { width: 390, height: 844 }, 'dark'],
]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${name}: ${e.message}`));
  page.on('console', m => m.type() === 'error' && errs.push(`${name}: ${m.text()}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);

  await page.screenshot({ path: `${out}/${name}-top.png` });

  // 행 하나를 펼친 상태
  await page.evaluate(() => document.querySelector('#e0425 .rowbtn').click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('#e0425').scrollIntoView());
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}-open.png` });

  // 섹션들
  for (const id of ['retro', 'themes', 'ops', 'next', 'record']) {
    await page.evaluate(s => document.querySelector(s).scrollIntoView(), '#' + id);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${name}-${id}.png` });
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
