-- =====================================================================
--  RCI Lab 연구비 관리 (https://rcilab.github.io/manage) — Supabase 스키마
--  실행 방법: Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣기 → Run
--  (여러 번 실행해도 안전하도록 작성됨)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. 타입
-- ---------------------------------------------------------------------
do $$ begin
  create type public.member_role as enum ('student', 'admin', 'pi');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

-- 구성원 (학생 / 행정조교(admin) / 교수(pi)).  email 이 로그인 키.
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text unique,                       -- 로그인 이메일. 비어 있으면 로그인 불가
  role        public.member_role not null default 'student',
  position    text,                              -- 학사/석사/박사/연구원 등
  is_bk       boolean not null default false,
  active      boolean not null default true,
  note        text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists members_email_lower_idx on public.members (lower(email));

-- 과제
create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,           -- 짧은 영문 키 (avatar, kist ...)
  name           text not null,                  -- 아바타
  pi_name        text,                           -- 책임교수
  agency_contact text,                           -- 담당 선생님
  active         boolean not null default true,
  sort_order     int not null default 0,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 과제 연차 (시트의 과제 탭 하나 = 연차 하나)
create table if not exists public.project_years (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  year_no       int  not null,                   -- 연차
  label         text,                            -- '2차년도' 등 표시용
  period_start  date,                            -- 이 기간의 학생 인건비 배분이 '학생인건비 사용'으로 집계됨
  period_end    date,
  is_current    boolean not null default false,
  plan_direct   numeric(14,0),                   -- 연차 계획: 직접비 (원)
  plan_indirect numeric(14,0),                   -- 간접비 (원)
  plan_total    numeric(14,0),                   -- 합계 (원)
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, year_no)
);

-- 비목 (연구활동비 하위 항목 포함)
create table if not exists public.categories (
  name        text primary key,                  -- 국내여비, 연구재료 구입비 ...
  parent      text,                              -- 연구활동비 등 상위 그룹 (없으면 자체가 최상위)
  sort_order  int not null default 0
);

-- 연차별 비목 예산 (계획 / 이월)
create table if not exists public.budget_lines (
  id               uuid primary key default gen_random_uuid(),
  project_year_id  uuid not null references public.project_years(id) on delete cascade,
  category         text not null references public.categories(name) on update cascade,
  planned          numeric(14,0) not null default 0,
  carryover        numeric(14,0) not null default 0,
  note             text,
  updated_at       timestamptz not null default now(),
  unique (project_year_id, category)
);

-- 집행 원장 (사용 내역)
create table if not exists public.ledger (
  id               uuid primary key default gen_random_uuid(),
  project_year_id  uuid not null references public.project_years(id) on delete cascade,
  spent_on         date,
  category         text references public.categories(name) on update cascade,
  amount           numeric(14,0) not null default 0,
  memo             text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ledger_py_idx on public.ledger (project_year_id, spent_on);

-- 학생 인건비 배분 (학생 × 과제 × 연 × 월)
create table if not exists public.allocations (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  year        int  not null,
  month       int  not null check (month between 1 and 12),
  amount      numeric(14,0) not null default 0,
  note        text,
  updated_at  timestamptz not null default now(),
  unique (member_id, project_id, year, month)
);
create index if not exists allocations_member_idx on public.allocations (member_id, year);
create index if not exists allocations_project_idx on public.allocations (project_id, year);

-- 학생별 월 기준 금액 (시트의 '기준' 열: 기준대비 증감 확인용)
create table if not exists public.salary_targets (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  year        int  not null,
  month       int  not null check (month between 1 and 12),
  amount      numeric(14,0) not null default 0,
  updated_at  timestamptz not null default now(),
  unique (member_id, year, month)
);

-- ---------------------------------------------------------------------
-- 2. updated_at 자동 갱신
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['members','projects','project_years','budget_lines','ledger','allocations','salary_targets'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. 권한 도우미 (RLS 에서 사용)
-- ---------------------------------------------------------------------
create or replace function public.current_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- 로그인한 사용자의 members.id (명단에 없으면 null)
create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members
  where lower(email) = public.current_email() and active
  limit 1;
$$;

-- 교수(pi) 또는 행정조교(admin) 인가?
create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where lower(email) = public.current_email() and active and role in ('admin', 'pi')
  );
$$;

grant execute on function public.current_email() to authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.is_manager() to authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS 정책
--    학생: 자기 배분/기준 + 과제 목록 + 자기 구성원 정보만 조회
--    admin/pi: 전부 읽기/쓰기
-- ---------------------------------------------------------------------
alter table public.members        enable row level security;
alter table public.projects       enable row level security;
alter table public.project_years  enable row level security;
alter table public.categories     enable row level security;
alter table public.budget_lines   enable row level security;
alter table public.ledger         enable row level security;
alter table public.allocations    enable row level security;
alter table public.salary_targets enable row level security;

-- members
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (public.is_manager() or id = public.current_member_id());
drop policy if exists members_write on public.members;
create policy members_write on public.members for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- projects / project_years / categories : 명단에 있는 사람은 조회, 관리자만 수정
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (public.current_member_id() is not null);
drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

drop policy if exists project_years_select on public.project_years;
create policy project_years_select on public.project_years for select to authenticated
  using (public.current_member_id() is not null);
drop policy if exists project_years_write on public.project_years;
create policy project_years_write on public.project_years for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to authenticated
  using (public.current_member_id() is not null);
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- budget_lines / ledger : 관리자만
drop policy if exists budget_lines_all on public.budget_lines;
create policy budget_lines_all on public.budget_lines for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

drop policy if exists ledger_all on public.ledger;
create policy ledger_all on public.ledger for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- allocations / salary_targets : 학생은 자기 것만 조회, 관리자는 전부
drop policy if exists allocations_select on public.allocations;
create policy allocations_select on public.allocations for select to authenticated
  using (public.is_manager() or member_id = public.current_member_id());
drop policy if exists allocations_write on public.allocations;
create policy allocations_write on public.allocations for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

drop policy if exists salary_targets_select on public.salary_targets;
create policy salary_targets_select on public.salary_targets for select to authenticated
  using (public.is_manager() or member_id = public.current_member_id());
drop policy if exists salary_targets_write on public.salary_targets;
create policy salary_targets_write on public.salary_targets for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- anon(비로그인) 은 아무것도 못 보게
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------
-- 5. 뷰 (security_invoker: 조회자의 RLS 그대로 적용)
-- ---------------------------------------------------------------------

-- 연차 × 비목 집행 현황.  '학생인건비' 사용액 = 원장 + (해당 연차 기간의 학생 인건비 배분 합계)
create or replace view public.v_project_year_status
with (security_invoker = true) as
with py as (
  select id as project_year_id, project_id, period_start, period_end from public.project_years
),
ledger_sum as (
  select project_year_id, category, sum(amount) as spent
  from public.ledger group by 1, 2
),
-- 연차에 기간(period_start~period_end)이 있어야 학생 인건비 배분이 집계됨 (기간 없으면 0)
alloc_sum as (
  select py.project_year_id, sum(a.amount) as spent
  from py
  join public.allocations a on a.project_id = py.project_id
   and py.period_start is not null and py.period_end is not null
   and make_date(a.year, a.month, 1) between py.period_start and py.period_end
  group by 1
),
cats as (
  select project_year_id, category from public.budget_lines
  union select project_year_id, category from public.ledger where category is not null
  union select project_year_id, '학생인건비' from py
)
select
  c.project_year_id,
  c.category,
  cat.parent,
  coalesce(cat.sort_order, 999) as sort_order,
  coalesce(b.planned, 0)   as planned,
  coalesce(b.carryover, 0) as carryover,
  coalesce(l.spent, 0)
    + case when c.category = '학생인건비' then coalesce(al.spent, 0) else 0 end as spent,
  coalesce(b.planned, 0) + coalesce(b.carryover, 0)
    - (coalesce(l.spent, 0)
       + case when c.category = '학생인건비' then coalesce(al.spent, 0) else 0 end) as remaining
from cats c
left join public.categories cat on cat.name = c.category
left join public.budget_lines b on b.project_year_id = c.project_year_id and b.category = c.category
left join ledger_sum l on l.project_year_id = c.project_year_id and l.category = c.category
left join alloc_sum al on al.project_year_id = c.project_year_id;

-- 연차 합계
create or replace view public.v_project_year_totals
with (security_invoker = true) as
select
  s.project_year_id,
  sum(s.planned)   as planned,
  sum(s.carryover) as carryover,
  sum(s.spent)     as spent,
  sum(s.remaining) as remaining,
  case when sum(s.planned + s.carryover) > 0
       then round(sum(s.spent) / sum(s.planned + s.carryover) * 100, 2) else null end as usage_pct
from public.v_project_year_status s
group by s.project_year_id;

-- 학생 × 과제 × 연 합계 (요약 그리드용)
create or replace view public.v_allocation_year_totals
with (security_invoker = true) as
select member_id, project_id, year, sum(amount) as total
from public.allocations group by 1, 2, 3;

grant select on public.v_project_year_status, public.v_project_year_totals, public.v_allocation_year_totals to authenticated;

-- ---------------------------------------------------------------------
-- 6. 가입 제한: khu.ac.kr 계정 또는 명단(members.email)에 있는 이메일만 계정 생성 허용
--    (해제하려면:  drop trigger if exists check_signup_email on auth.users;)
-- ---------------------------------------------------------------------
create or replace function public.check_signup_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null then
    return new;
  end if;
  if lower(new.email) like '%@khu.ac.kr' then
    return new;
  end if;
  if exists (select 1 from public.members m where lower(m.email) = lower(new.email)) then
    return new;
  end if;
  raise exception 'signup not allowed for %', new.email using errcode = 'P0001';
end $$;

drop trigger if exists check_signup_email on auth.users;
create trigger check_signup_email
  before insert on auth.users
  for each row execute function public.check_signup_email();

-- ---------------------------------------------------------------------
-- 7. 기본 비목 (시트의 비목 표 순서)
-- ---------------------------------------------------------------------
insert into public.categories (name, parent, sort_order) values
  ('인건비(교수)',            '내부인건비',   10),
  ('인건비(연구원)',          '내부인건비',   20),
  ('학생인건비',              null,           30),
  ('연구장비 구입 및 설치',   '연구시설·장비비', 40),
  ('연구재료 구입비',         '연구재료비',   50),
  ('연구추진비',              null,           55),
  ('국외여비',                '연구활동비',   60),
  ('국내여비',                '연구활동비',   61),
  ('인쇄비',                  '연구활동비',   62),
  ('택배비',                  '연구활동비',   63),
  ('교육훈련,학회',           '연구활동비',   64),
  ('문헌구입비',              '연구활동비',   65),
  ('논문게재료',              '연구활동비',   66),
  ('강의료',                  '연구활동비',   67),
  ('자문료',                  '연구활동비',   68),
  ('교재개발',                '연구활동비',   69),
  ('회의비',                  '연구활동비',   70),
  ('워크샵개최비',            '연구활동비',   71),
  ('야근(특근)식대',          '연구활동비',   72),
  ('사무용품비',              '연구활동비',   73),
  ('사무용기기 및 SW구입비',  '연구활동비',   74),
  ('연구실운용비',            '연구활동비',   75),
  ('연구환경유지비',          '연구활동비',   76),
  ('부가세',                  '연구활동비',   77),
  ('연구수당',                null,           90),
  ('간접비',                  null,           95)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 8. 첫 관리자 등록 (필요 시 이메일 수정 후 실행)
-- ---------------------------------------------------------------------
insert into public.members (name, email, role, position, sort_order)
values ('김상현', 'kim87@khu.ac.kr', 'pi', '교수', -100)
on conflict (email) do update set role = 'pi', active = true;
