#!/usr/bin/env node
/**
 * src/page.html + src/data.js → dist/index.html (자체 완결형 단일 파일)
 *
 * 1. 데이터를 JSON으로 인라인
 * 2. 페이지에 실제 쓰인 글자만 남긴 웹폰트를 base64로 인라인
 *
 * 폰트 원본 위치는 FONTS_DIR 환경변수로 지정한다 (fontsource woff2 트리).
 *   FONTS_DIR/overpass/overpass-latin-<w>-normal.woff2
 *   FONTS_DIR/gothic/gothic-a1-<i>-<w>-normal.woff2
 * 없으면 폰트 인라인 없이 시스템 스택으로 빌드한다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const p = (...s) => resolve(root, ...s);

const data = await import(p('src/data.js'));
const payload = {
  meta: data.meta,
  numbers: data.numbers,
  discordGrowth: data.discordGrowth,
  identity: data.identity,
  rebrand: data.rebrand,
  people: data.people,
  events: data.events,
  upcoming: data.upcoming,
  businessIdeas: data.businessIdeas,
  contribution: data.contribution,
  issueLog: data.issueLog,
  approvalNote: data.approvalNote,
  themes: data.themes,
  channels: data.channels,
  verification: data.verification,
};

let html = readFileSync(p('src/page.html'), 'utf8');

// 링크 미리보기 메타는 절대 URL 이라야 스크레이퍼가 안전하게 가져간다.
// SITE_URL 이 없으면 루트 상대 경로로 두고, 배포 도메인이 정해지면 넣어서 다시 빌드한다.
const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
html = html.split('__SITE__').join(site);
if (!site) console.log('SITE_URL 미지정 — og:image 를 루트 상대 경로로 둔다');
const json = JSON.stringify(payload).replace(/<\//g, '<\\/');
html = html.replace('/*__DATA__*/', json);

mkdirSync(p('dist'), { recursive: true });

const fontsDir = process.env.FONTS_DIR;
if (fontsDir && existsSync(fontsDir)) {
  // 최종 마크업에 남는 글자만 모은다 (스크립트로 생성되는 문자열 포함)
  const chars = [...new Set(html.replace(/\s+/g, ' '))].join('');
  writeFileSync(p('dist/.charset.txt'), chars);
  console.log(`문자 ${chars.length}종 서브셋:`);
  execFileSync('python3', [p('tools/subset_fonts.py'), p('dist/.charset.txt'), fontsDir, p('dist/fonts.css')], {
    stdio: 'inherit',
  });
  html = html.replace('/*__FONTS__*/', readFileSync(p('dist/fonts.css'), 'utf8'));
} else {
  console.log('FONTS_DIR 없음 — 시스템 폰트 스택으로 빌드');
  html = html.replace('/*__FONTS__*/', '');
}

writeFileSync(p('dist/index.html'), html);
console.log(`dist/index.html — ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
