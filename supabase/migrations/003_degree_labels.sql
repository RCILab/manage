-- =====================================================================
--  003: 학위종류 명칭 변경 (학사→학사과정, 석사→석사과정, 박사→박사과정, 석박통합→석박통합과정)
--  실행: Supabase → SQL Editor → 전체 붙여넣기 → Run (여러 번 실행해도 안전)
-- =====================================================================
alter table public.members drop constraint if exists members_degree_check;

update public.members set degree = case degree
    when '학사' then '학사과정'
    when '석사' then '석사과정'
    when '박사' then '박사과정'
    when '석박통합' then '석박통합과정'
    else degree end
  where degree in ('학사','석사','박사','석박통합');

alter table public.members add constraint members_degree_check
  check (degree is null or degree in ('석박통합과정','박사과정','석사과정','학사과정'));
