-- =====================================================================
--  002: 구성원 인사정보 컬럼 추가 (학위종류·학번·입학학기·생년월일·연구자번호·연락처·계좌번호·주민등록번호)
--  실행: Supabase → SQL Editor → 전체 붙여넣기 → Run  (여러 번 실행해도 안전)
--
--  ※ 주민등록번호·계좌번호는 민감정보입니다. RLS 로 관리자(admin/pi)만 읽을 수 있지만
--     DB 자체(대시보드/백업)에는 평문으로 저장됩니다. 필요 시 Vault 암호화를 추가하세요.
-- =====================================================================

alter table public.members
  add column if not exists degree         text,   -- 학위종류: 학사 / 석사 / 박사 / 석박통합
  add column if not exists student_no     text,   -- 학번
  add column if not exists admission_term text,   -- 입학학기 (예: 2026-1)
  add column if not exists birth_date     date,   -- 생년월일
  add column if not exists researcher_no  text,   -- 연구자번호
  add column if not exists phone          text,   -- 연락처
  add column if not exists bank_account   text,   -- 계좌번호 (은행 포함)
  add column if not exists rrn            text;   -- 주민등록번호 (000000-0000000)

-- 기존 position(신분) 값을 degree 로 옮기고 position 은 제거
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'members' and column_name = 'position') then
    update public.members set degree = case
        when position = '학사' then '학사과정'
        when position = '석사' then '석사과정'
        when position = '박사' then '박사과정'
        when position = '석박통합' then '석박통합과정'
        when position = '학부연구생' then '학사과정'
        else degree end
      where degree is null;
    alter table public.members drop column position;
  end if;
end $$;

alter table public.members drop constraint if exists members_degree_check;
alter table public.members add constraint members_degree_check
  check (degree is null or degree in ('석박통합과정','박사과정','석사과정','학사과정'));

create unique index if not exists members_student_no_idx on public.members (student_no) where student_no is not null and student_no <> '';
