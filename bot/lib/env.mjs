/**
 * 환경변수 읽기. 없으면 그 자리에서 실패시킨다 — 반쯤 동작하는 파이프라인이 제일 위험하다.
 *
 * 필수
 *   DISCORD_BOT_TOKEN     디스코드 봇 토큰 (Bot 접두사 없이 토큰만)
 *   DISCORD_CHANNEL_IDS   쉼표로 구분한 채널 ID 목록
 *   SUPABASE_URL          https://<project>.supabase.co
 *   SUPABASE_SERVICE_KEY  service_role 키 — 원문 적재용. 절대 페이지에 넣지 않는다
 *   ANTHROPIC_API_KEY     구조화 단계에서만 쓴다
 * 선택
 *   AUTHOR_SALT           작성자 ID 해시 솔트. 없으면 프로젝트 URL을 솔트로 쓴다
 *   ANTHROPIC_MODEL       기본값 claude-sonnet-5
 *   DISCORD_WEBHOOK_URL   반영 알림을 보낼 웹훅. 없으면 알림을 건너뛴다
 *   SYNC_SINCE            최초 백필 시작 시각 (ISO). 없으면 최근 200건만 가져온다
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* 로컬 실행 편의 — .env.bot 이 있으면 읽어 온다. CI 에서는 시크릿이 이미 들어와 있다. */
const local = resolve(process.cwd(), '.env.bot');
if (existsSync(local)) {
  for (const line of readFileSync(local, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

export function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`환경변수 ${name} 가 없다. bot/README 의 시크릿 목록을 확인할 것.`);
    process.exit(2);
  }
  return v;
}

export const opt = (name, fallback = '') => process.env[name] || fallback;

export const channelIds = () =>
  need('DISCORD_CHANNEL_IDS').split(',').map(s => s.trim()).filter(Boolean);

export const MODEL = opt('ANTHROPIC_MODEL', 'claude-sonnet-5');
