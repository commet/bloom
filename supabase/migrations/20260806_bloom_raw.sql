-- 디스코드 원문 적재소.
--
-- 이 테이블이 파이프라인 전체의 근거다. 봇이 낸 문장이 진짜인지 판정할 수 있는 유일한 기준이라
-- 편집하지 않는다(append-only). 뒤 단계가 여기 없는 말을 쓰면 tools/verify-source.mjs 가 막는다.
--
-- 작성자는 해시만 남긴다. 표시 이름을 저장하지 않으므로 뒤 단계가 참석자 실명을 흘릴 경로가 없다.
-- 페이지의 참여 기능(bloom_marks / bloom_notes)과 달리 anon 은 여기에 손댈 일이 없어
-- RLS 를 켜고 정책도 함수도 두지 않는다 — service_role 로만 접근한다.

create table if not exists public.bloom_raw (
  message_id    text primary key,
  channel_id    text not null,
  channel_name  text,
  author_hash   text not null,
  author_is_bot boolean not null default false,
  content       text not null default '',
  attachments   jsonb not null default '[]'::jsonb,
  posted_at     timestamptz not null,
  ingested_at   timestamptz not null default now()
);

create index if not exists bloom_raw_posted_idx on public.bloom_raw (posted_at desc);
create index if not exists bloom_raw_channel_idx on public.bloom_raw (channel_id, posted_at desc);

alter table public.bloom_raw enable row level security;
revoke all on public.bloom_raw from anon, authenticated;

-- 채널별로 어디까지 읽었는지. 크론이 죽어도 다음 실행이 이어서 따라잡는다.
create table if not exists public.bloom_sync (
  channel_id      text primary key,
  last_message_id text,
  updated_at      timestamptz not null default now()
);

alter table public.bloom_sync enable row level security;
revoke all on public.bloom_sync from anon, authenticated;

-- 실행 기록. 언제 무엇이 걸렸는지 남겨 두지 않으면 조용히 멈춘 것을 알아채지 못한다.
create table if not exists public.bloom_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  stage       text not null,
  ok          boolean not null,
  added       integer not null default 0,
  note        text,
  pr_url      text
);

alter table public.bloom_runs enable row level security;
revoke all on public.bloom_runs from anon, authenticated;
