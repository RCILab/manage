-- =====================================================================
--  004: 구성원 '직장가입자' 여부 컬럼 추가 + 손재락·조민재 체크
--  실행: Supabase → SQL Editor → 전체 붙여넣기 → Run (여러 번 실행해도 안전)
-- =====================================================================
alter table public.members add column if not exists is_employed boolean not null default false;  -- 직장가입자(4대보험 직장 가입)

update public.members set is_employed = true where name in ('손재락', '조민재');
