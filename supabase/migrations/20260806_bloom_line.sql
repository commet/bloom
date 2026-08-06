-- 회고 모임용 「당신의 한 줄」.
--
-- 아카이브 기록과 섞지 않는다. 이건 그 방에서 나온 말이지 26회 기록이 아니고,
-- 화면에서 둘이 섞이면 이 페이지의 전제가 무너진다. 그래서 테이블도 따로 둔다.
--
-- 접근 방식은 bloom_marks / bloom_notes 와 같다 — RLS 를 켜고 정책을 하나도 두지 않아
-- anon 이 테이블을 직접 읽거나 쓸 수 없고, SECURITY DEFINER 함수 두 개만 열어 준다.

create table if not exists public.bloom_line (
  room       text not null default 'retro-0806' check (char_length(room) between 1 and 32),
  voter      uuid not null,
  line       text not null check (char_length(btrim(line)) between 2 and 80),
  lane       text not null check (char_length(lane) between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room, voter)          -- 한 사람 한 줄. 다시 내면 고쳐 쓴다
);

create index if not exists bloom_line_room_idx on public.bloom_line (room, created_at);

alter table public.bloom_line enable row level security;   -- 정책 없음: anon 직접 접근 차단

-- 한 줄 올리기(또는 고쳐 쓰기). 방 하나에 200줄까지만 받는다.
create or replace function public.bloom_line_put(
  p_room text, p_voter uuid, p_line text, p_lane text
) returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_voter is null then raise exception 'voter required'; end if;
  select count(*) into n from public.bloom_line where room = p_room;
  if n >= 200 and not exists (select 1 from public.bloom_line where room = p_room and voter = p_voter) then
    raise exception 'room full';
  end if;

  insert into public.bloom_line (room, voter, line, lane)
  values (p_room, p_voter, btrim(p_line), p_lane)
  on conflict (room, voter) do update
    set line = excluded.line, lane = excluded.lane, updated_at = now();
end $$;

-- 방의 줄 목록. 누가 썼는지는 내보내지 않는다 — 줄과 갈래만 나간다.
create or replace function public.bloom_line_board(p_room text)
returns table (line text, lane text)
language sql security definer set search_path = public as $$
  select line, lane from public.bloom_line where room = p_room order by created_at;
$$;

revoke all on function public.bloom_line_put(text, uuid, text, text) from public;
revoke all on function public.bloom_line_board(text) from public;
grant execute on function public.bloom_line_put(text, uuid, text, text) to anon, authenticated;
grant execute on function public.bloom_line_board(text) to anon, authenticated;
