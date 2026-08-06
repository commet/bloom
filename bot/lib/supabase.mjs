/**
 * Supabase PostgREST 최소 클라이언트. SDK 를 쓰지 않는 이유는 이 저장소가 런타임 의존성
 * 없이 굴러가는 편이 낫기 때문이다 (dist/index.html 도 외부 요청이 0건이다).
 *
 * 여기서 쓰는 키는 service_role 이다. 서버 쪽에서만 쓰고, 빌드 산출물에는 들어가지 않는다.
 */
import { need } from './env.mjs';

const base = () => need('SUPABASE_URL').replace(/\/+$/, '');
const key = () => need('SUPABASE_SERVICE_KEY');

async function call(path, init = {}) {
  const res = await fetch(`${base()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} ${path}: ${(await res.text()).slice(0, 400)}`);
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

export const select = (table, query = '') => call(`${table}?${query}`);

/** 이미 있는 행은 조용히 건너뛴다 — 원문은 덮어쓰지 않는다(append-only). */
export const insertIgnore = (table, rows) =>
  rows.length
    ? call(table, {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      })
    : null;

export const upsert = (table, rows) =>
  call(table, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });

export const rpc = (fn, args = {}) =>
  fetch(`${base()}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  }).then(async r => {
    if (!r.ok) throw new Error(`Supabase rpc ${fn} ${r.status}: ${(await r.text()).slice(0, 400)}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  });
