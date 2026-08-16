# RCI Lab 연구비 관리 (manage)

연구실 연구비 집행·학생 인건비 배분을 관리하는 웹앱입니다.
정적 파일(GitHub Pages) + Supabase(Postgres/Auth/RLS) 구조로, 빌드 도구 없이 이 저장소의 파일이 그대로 배포됩니다.

- 주소: https://rcilab.github.io/manage/
- **학생**: 로그인하면 자기 인건비가 어떤 과제에서 얼마씩 나오는지(월별·과제별)만 볼 수 있음
- **교수(pi) / 행정조교(admin)**: 대시보드, 과제별 예산·집행 원장, 학생 인건비 배분, 구성원 관리 전부 편집

데이터는 이 저장소에 없습니다. 모두 Supabase DB에 있고, 로그인한 사용자의 역할에 따라 DB(RLS)가 접근을 제한합니다.

---

## 1. 처음 설정 (한 번만)

### 1-1. Supabase 프로젝트
1. https://supabase.com → New project (리전: Northeast Asia (Seoul) 권장). DB 비밀번호는 따로 보관.
2. **SQL Editor** → New query → `supabase/schema.sql` 내용 전체 붙여넣기 → **Run**.
   - 테이블/뷰/RLS 정책/가입 제한 트리거/기본 비목/첫 관리자(`kim87@khu.ac.kr`, 역할 pi)가 만들어집니다.
   - 첫 관리자 이메일을 바꾸려면 파일 맨 아래 8번 항목을 수정하고 실행하세요.
3. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사해
   `app/config.js` 의 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 에 넣고 커밋/푸시합니다.
   (anon 키는 공개용입니다. 실제 접근 제어는 RLS가 합니다.)

### 1-2. 로그인 (이메일 + 비밀번호, 관리자가 계정 발급)
학생 스스로 가입하는 방식이 아니라, **관리자가 지정한 이메일로 계정을 만들어 주고** 그 이메일/비밀번호로 로그인합니다.

1. **Supabase → Authentication → URL Configuration**
   - Site URL: `https://rcilab.github.io/manage/`
   - Redirect URLs 에 추가: `https://rcilab.github.io/manage/*`
2. **Supabase → Authentication → Sign In / Providers** → *Allow new users to sign up* **OFF** (아무나 가입 못 하게)
3. 첫 관리자 계정: **Authentication → Users → Add user → Create new user** → 이메일 `kim87@khu.ac.kr`, 비밀번호 입력, *Auto Confirm User* 체크 → 생성.
   이 이메일은 schema.sql 8번에서 members(pi) 로 이미 등록되어 있으므로 바로 로그인됩니다.
4. 학생 계정: 웹앱 **구성원** 화면에서 학생 이메일을 채운 뒤, 아래 스크립트로 한 번에 생성 (또는 위 3번처럼 대시보드에서 한 명씩)
   ```bash
   # Project Settings → API → service_role (secret) 키가 필요. 이 키는 절대 git/브라우저에 넣지 말 것.
   set SUPABASE_URL=https://xxxx.supabase.co
   set SUPABASE_SERVICE_ROLE_KEY=...
   python scripts/create_users.py --list                       # 현황
   python scripts/create_users.py --create-missing --out local/accounts.csv   # 이메일 있는 활성 구성원 계정 생성 + 초기 비밀번호 발급
   python scripts/create_users.py --reset 이름@khu.ac.kr        # 비밀번호 초기화
   ```
   발급된 초기 비밀번호를 본인에게 전달하면, 로그인 후 **내 계정** 화면에서 바꿀 수 있습니다.

(선택) Google 로그인도 지원합니다. Supabase Providers 에서 Google 을 켜면 로그인 화면에 버튼이 자동으로 나타납니다 — Google Cloud Console 의 OAuth 클라이언트(리디렉션 URI `https://<ref>.supabase.co/auth/v1/callback`)가 필요합니다.

### 1-3. 초기 데이터 넣기 (구글 시트 → DB)
```bash
pip install openpyxl
# 구글 시트를 「파일 → 다운로드 → Microsoft Excel(.xlsx)」로 받은 뒤:
python scripts/import_xlsx.py "연구비 소요 내역 (2026).xlsx" --year 2026 --out local/seed.sql
```
생성된 `local/seed.sql` 을 Supabase SQL Editor 에 붙여넣고 Run.
(`local/` 폴더와 `*.xlsx`, `seed*.sql` 은 `.gitignore` 되어 있어 커밋되지 않습니다. 급여 정보이므로 절대 올리지 마세요.)

- 여러 번 실행해도 됩니다(같은 키는 갱신, 원장은 `created_by='import'` 행만 교체).
- 학생 이메일은 시트에 없으므로 비어 있습니다 → 웹앱 **구성원** 화면에서 채워 넣으면 그 학생이 로그인할 수 있습니다.
- '행정조교' 계정도 이메일이 비어 있으니 같은 화면에서 넣어 주세요.

### 1-4. GitHub Pages
저장소 Settings → Pages → Source: **Deploy from a branch**, Branch `main` / `/ (root)`.
이후 `main` 에 푸시하면 1~2분 내 반영됩니다.

---

## 2. 화면

| 경로 | 대상 | 내용 |
|---|---|---|
| `#/me` | 모두 | 내 인건비: 월 × 과제 표, 기준 대비 차이, 과제별 연간 합계 |
| `#/account` | 모두 | 내 계정: 비밀번호 변경 |
| `#/dashboard` | 관리자 | 과제·연차별 계획/이월/집행/잔액/사용율, 과제별 학생인건비 배분 합계 |
| `#/projects` | 관리자 | 과제 목록/추가, 연차 추가 → 연차 클릭 |
| `#/projects/<연차id>` | 관리자 | 연차 정보(기간·계획), 비목별 예산(계획/이월 편집, 사용/잔액 자동), 집행 원장 입력·수정·삭제 |
| `#/allocations` | 관리자 | 학생 인건비 배분 그리드 (과제별 / 학생별 / 요약, CSV) + 학생별 월 기준 금액 |
| `#/members` | 관리자 | 구성원 이름·이메일·역할·신분·BK·활성 |

### 집계 규칙
- 각 연차의 **기간(period_start ~ period_end)** 안의 달에 배분된 학생 인건비 합계가 그 연차의 `학생인건비` 사용액으로 자동 집계됩니다. 기간이 비어 있으면 집계되지 않습니다.
- 그 외 비목의 사용액은 원장 합계입니다. 잔액 = 계획 + 이월 − 사용.
- 학생별 `기준` 금액은 참고용(색 표시)이며 지급과 무관합니다.

---

## 3. 구조
```
index.html            진입점 (import map: preact / htm / supabase-js 를 esm.sh CDN 에서 로드)
styles.css
app/
  config.js           ← Supabase URL / anon key
  supabase.js         클라이언트 생성
  api.js              DB 접근 함수
  ui.js               공용 컴포넌트 (금액 셀, 토스트 …)
  util.js             포맷/라우터/훅
  main.js             앱 루트, 라우팅, 로그인 상태
  pages/              login, student, dashboard, projects, project_year, allocations, members
supabase/schema.sql   테이블, 뷰, RLS, 가입 제한 트리거, 기본 비목
scripts/import_xlsx.py  구글 시트(xlsx) → seed.sql
scripts/create_users.py 구성원 로그인 계정 생성 / 비밀번호 초기화 (service_role 키 필요, 로컬 전용)
test/smoke.mjs        헤드리스 스모크 테스트 (happy-dom + 가짜 supabase)
```

### 로컬에서 띄우기
```bash
python -m http.server 8000     # http://localhost:8000/  (Redirect URLs 에 localhost 추가 필요)
```

### 테스트
```bash
npm install --no-save --no-package-lock preact@10 htm@3 happy-dom@15 @supabase/supabase-js@2
node test/smoke.mjs
```

---

## 4. 권한 요약 (RLS)
| 테이블 | 학생 | admin / pi |
|---|---|---|
| members | 자기 행 조회 | 전부 읽기/쓰기 |
| projects, project_years, categories | 조회 | 전부 읽기/쓰기 |
| budget_lines, ledger | 접근 불가 | 전부 읽기/쓰기 |
| allocations, salary_targets | 자기 것 조회 | 전부 읽기/쓰기 |

- 로그인 이메일이 `members.email` 과 일치해야 하며(대소문자 무시), 명단에 없으면 "등록되지 않은 계정" 화면만 보입니다.
- 가입은 꺼 두고(1-2 의 2번) 관리자가 계정을 만들어 줍니다. 추가로 `auth.users` 트리거가 `@khu.ac.kr` 이 아니고 명단에도 없는 이메일의 계정 생성을 막습니다. 해제: `drop trigger if exists check_signup_email on auth.users;`
- 관리자를 추가하려면 구성원 화면에서 역할을 `행정조교` 또는 `교수` 로 바꾸면 됩니다.

## 5. 주의
- Supabase 무료 플랜은 1주일간 요청이 없으면 프로젝트가 일시정지됩니다(대시보드에서 재개 가능). 매달 쓰는 앱이라면 Pro 로 올리거나 주 1회 접속하세요.
- 급여·개인정보가 들어 있으므로 `local/`, xlsx, seed.sql 을 커밋하지 마세요.
