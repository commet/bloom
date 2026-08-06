#!/usr/bin/env node
/**
 * src/*.html + src/data.js → dist/*.html (자체 완결형 단일 파일들)
 *
 *   dist/index.html   아카이브 26회
 *   dist/line.html    회고 모임용 「당신의 한 줄」 (/line)
 *
 * 1. 데이터를 JSON으로 인라인
 * 2. 두 페이지에 실제 쓰인 글자를 **합집합으로** 모아 웹폰트를 한 번만 서브셋하고
 *    같은 base64 를 양쪽에 넣는다. 페이지마다 따로 자르면 폰트가 두 벌이 된다.
 *
 * 폰트 원본은 기본적으로 저장소에 커밋된 assets/fonts 병합본을 쓴다.
 * FONTS_DIR 로 fontsource woff2 트리를 가리켜도 된다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = dirname(fileURLToPath(import.meta.url));
const p = (...s) => resolve(root, ...s);

const data = await import(p('src/data.js'));
const lineage = await import(p('src/lineage.js'));

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

/* /line 은 인물 마스킹과 예정 일정만 쓴다. 아카이브 전체를 실을 이유가 없다. */
const linePayload = {
  people: data.people,
  events: data.events.map(e => ({ speakers: e.speakers || [] })),
  upcoming: data.upcoming,
};

// 링크 미리보기 메타는 절대 URL 이라야 스크레이퍼가 안전하게 가져간다.
// SITE_URL 이 없으면 루트 상대 경로로 두고, 배포 도메인이 정해지면 넣어서 다시 빌드한다.
const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
if (!site) console.log('SITE_URL 미지정 — og:image 를 루트 상대 경로로 두고 QR 을 굽지 않는다');

// 참여 기능은 Supabase 익명 키로 동작한다. RLS 로 테이블을 직접 열지 않고
// SECURITY DEFINER 함수만 호출하므로 이 키가 공개돼도 되는 값이다.
// 값이 없으면 참여 UI 는 꺼진 상태로 빌드된다.
if (!process.env.SUPABASE_URL) console.log('SUPABASE_URL 미지정 — 참여 기능 비활성 상태로 빌드');

const inlineJson = v => JSON.stringify(v).replace(/<\//g, '<\\/');

/* QR 은 빌드 때 구워 SVG 로 심는다. 런타임 인코더는 검증할 방법이 없다. */
const qr = site
  ? (await QRCode.toString(`${site}/line`, {
      type: 'svg', errorCorrectionLevel: 'M', margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })).replace(/<\?xml[^>]*\?>/, '').trim()
  : '';

function render(srcFile, data) {
  let html = readFileSync(p('src', srcFile), 'utf8');
  html = html.split('__SITE__').join(site);
  html = html
    .split('__SB_URL__').join(process.env.SUPABASE_URL || '')
    .split('__SB_KEY__').join(process.env.SUPABASE_ANON_KEY || '');
  html = html.replace('/*__DATA__*/', inlineJson(data));
  if (html.includes('/*__LINEAGE__*/')) html = html.replace('/*__LINEAGE__*/', inlineJson({ lanes: lineage.lanes }));
  if (html.includes('/*__QR__*/')) html = html.replace('/*__QR__*/', qr);
  return html;
}

const pages = [
  { out: 'index.html', html: render('page.html', payload) },
  { out: 'line.html', html: render('line.html', linePayload) },
];

mkdirSync(p('dist'), { recursive: true });

const fontsDir = process.env.FONTS_DIR || p('assets/fonts');
if (fontsDir && existsSync(fontsDir)) {
  // 두 페이지에 남는 글자를 합쳐 한 번만 자른다
  const chars = [...new Set(pages.map(x => x.html).join('').replace(/\s+/g, ' '))].join('');
  writeFileSync(p('dist/.charset.txt'), chars);
  console.log(`문자 ${chars.length}종 서브셋 (${pages.length}개 페이지 합집합):`);
  execFileSync('python3', [p('tools/subset_fonts.py'), p('dist/.charset.txt'), fontsDir, p('dist/fonts.css')], {
    stdio: 'inherit',
  });
  const css = readFileSync(p('dist/fonts.css'), 'utf8');
  pages.forEach(x => { x.html = x.html.replace('/*__FONTS__*/', css); });
} else {
  console.log('FONTS_DIR 없음 — 시스템 폰트 스택으로 빌드');
  pages.forEach(x => { x.html = x.html.replace('/*__FONTS__*/', ''); });
}

for (const x of pages) {
  writeFileSync(p('dist', x.out), x.html);
  console.log(`dist/${x.out} — ${(Buffer.byteLength(x.html) / 1024).toFixed(1)} KB`);
}
