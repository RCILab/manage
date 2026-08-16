// 헤드리스 스모크 테스트: happy-dom + 가짜 supabase 클라이언트로 각 페이지를 렌더링/조작해 본다.
// 실행 (저장소 루트에서):
//   npm install --no-save --no-package-lock preact@10 htm@3 happy-dom@15 @supabase/supabase-js@2
//   node test/smoke.mjs
import { Window } from 'happy-dom';
import assert from 'node:assert/strict';

// ---------- DOM 전역 ----------
const win = new Window({ url: 'https://rcilab.github.io/manage/#/me' });
const g = globalThis;
for (const k of ['document', 'location', 'history', 'CustomEvent', 'Event', 'KeyboardEvent', 'FocusEvent', 'HTMLElement', 'Node', 'navigator', 'getComputedStyle', 'Blob', 'URL']) {
  try { if (win[k] !== undefined) g[k] = win[k]; } catch { /* readonly */ }
}
g.window = win;
g.addEventListener = win.addEventListener.bind(win);
g.removeEventListener = win.removeEventListener.bind(win);
g.dispatchEvent = win.dispatchEvent.bind(win);
g.requestAnimationFrame = (cb) => setTimeout(cb, 0);
g.cancelAnimationFrame = (id) => clearTimeout(id);
g.confirm = () => true;
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
async function settle() { for (let i = 0; i < 6; i++) await wait(15); }

// ---------- 가짜 Supabase ----------
const ids = { pi: 'm-pi', stu: 'm-stu', stu2: 'm-stu2', avatar: 'p-avatar', kist: 'p-kist', pyA: 'py-avatar-3', pyK: 'py-kist-1' };
const projects = [
  { id: ids.avatar, code: 'avatar', name: '아바타', pi_name: '김상현', agency_contact: '강민채', active: true, sort_order: 0 },
  { id: ids.kist, code: 'kist', name: 'KIST', pi_name: '김상현', agency_contact: '조해주', active: true, sort_order: 10 },
];
const project_years = [
  { id: ids.pyA, project_id: ids.avatar, year_no: 3, label: '3차년도', period_start: '2026-01-01', period_end: '2026-12-31', is_current: true, plan_direct: 113104000, plan_indirect: 26896000, plan_total: 140000000, note: null },
  { id: ids.pyK, project_id: ids.kist, year_no: 1, label: '1차년도', period_start: '2026-01-01', period_end: '2026-12-31', is_current: true, plan_direct: null, plan_indirect: null, plan_total: 50000000, note: null },
];
const db = {
  members: [
    { id: ids.pi, name: '김상현', email: 'kim87@khu.ac.kr', role: 'pi', degree: null, is_bk: false, active: true, note: null, sort_order: -100 },
    { id: ids.stu, name: '박수환', email: 'psh@khu.ac.kr', role: 'student', degree: '박사', student_no: '2020123456', rrn: '950101-1234567', bank_account: '국민 123456-01-123456', is_bk: true, active: true, note: null, sort_order: 1 },
    { id: ids.stu2, name: '강민형', email: null, role: 'student', degree: null, is_bk: true, active: true, note: null, sort_order: 2 },
  ],
  projects,
  project_years,
  categories: [
    { name: '학생인건비', parent: null, sort_order: 30 }, { name: '국내여비', parent: '연구활동비', sort_order: 61 },
    { name: '회의비', parent: '연구활동비', sort_order: 70 }, { name: '연구수당', parent: null, sort_order: 90 },
  ],
  budget_lines: [
    { id: 'b1', project_year_id: ids.pyA, category: '학생인건비', planned: 39102000, carryover: 0 },
    { id: 'b2', project_year_id: ids.pyA, category: '국내여비', planned: 2000000, carryover: 0 },
  ],
  ledger: [
    { id: 'l1', project_year_id: ids.pyA, spent_on: '2026-03-11', category: '국내여비', amount: 122576, memo: '기계학회', created_by: 'import' },
  ],
  allocations: [
    { id: 'a1', member_id: ids.stu, project_id: ids.avatar, year: 2026, month: 1, amount: 500000 },
    { id: 'a2', member_id: ids.stu, project_id: ids.kist, year: 2026, month: 3, amount: 300000 },
    { id: 'a3', member_id: ids.stu2, project_id: ids.avatar, year: 2026, month: 1, amount: 1000000 },
  ],
  salary_targets: [{ id: 't1', member_id: ids.stu, year: 2026, month: 1, amount: 2000000 }],
  v_project_year_totals: [
    { project_year_id: ids.pyA, planned: 41102000, carryover: 0, spent: 1622576, remaining: 39479424, usage_pct: 3.95 },
    { project_year_id: ids.pyK, planned: 0, carryover: 0, spent: 300000, remaining: -300000, usage_pct: null },
  ],
  v_project_year_status: [
    { project_year_id: ids.pyA, category: '학생인건비', parent: null, sort_order: 30, planned: 39102000, carryover: 0, spent: 1500000, remaining: 37602000 },
    { project_year_id: ids.pyA, category: '국내여비', parent: '연구활동비', sort_order: 61, planned: 2000000, carryover: 0, spent: 122576, remaining: 1877424 },
    { project_year_id: ids.pyK, category: '학생인건비', parent: null, sort_order: 30, planned: 0, carryover: 0, spent: 300000, remaining: -300000 },
  ],
  v_allocation_year_totals: [
    { member_id: ids.stu, project_id: ids.avatar, year: 2026, total: 500000 },
    { member_id: ids.stu, project_id: ids.kist, year: 2026, total: 300000 },
    { member_id: ids.stu2, project_id: ids.avatar, year: 2026, total: 1000000 },
  ],
};
const calls = [];
function relate(table, row) {
  const r = { ...row };
  if (table === 'project_years') r.projects = projects.find((p) => p.id === r.project_id);
  if (table === 'projects') r.project_years = project_years.filter((y) => y.project_id === r.id);
  if (table === 'allocations') r.projects = projects.find((p) => p.id === r.project_id);
  return r;
}
class Q {
  constructor(table) { this.table = table; this.filters = []; this.mode = 'select'; this._single = null; this.payload = null; this.conflict = null; }
  select() { return this; }
  eq(k, v) { this.filters.push((r) => String(r[k]) === String(v)); return this; }
  ilike(k, v) { this.filters.push((r) => String(r[k] || '').toLowerCase() === String(v).toLowerCase()); return this; }
  order() { return this; }
  single() { this._single = 'single'; return this; }
  maybeSingle() { this._single = 'maybe'; return this; }
  insert(p) { this.mode = 'insert'; this.payload = p; return this; }
  update(p) { this.mode = 'update'; this.payload = p; return this; }
  upsert(p, o) { this.mode = 'upsert'; this.payload = p; this.conflict = o?.onConflict; return this; }
  delete() { this.mode = 'delete'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
  exec() {
    calls.push({ table: this.table, mode: this.mode, payload: this.payload });
    const rows = db[this.table] || [];
    const match = (r) => this.filters.every((f) => f(r));
    if (this.mode === 'select') {
      const out = rows.filter(match).map((r) => relate(this.table, r));
      if (this._single === 'single') return out.length ? { data: out[0], error: null } : { data: null, error: { message: 'no rows' } };
      if (this._single === 'maybe') return { data: out[0] || null, error: null };
      return { data: out, error: null };
    }
    if (this.mode === 'insert') { const row = { id: 'new-' + Math.random().toString(36).slice(2, 7), ...this.payload }; rows.push(row); return { data: this._single ? row : [row], error: null }; }
    if (this.mode === 'update') { const tg = rows.filter(match); tg.forEach((r) => Object.assign(r, this.payload)); return { data: this._single ? tg[0] : tg, error: null }; }
    if (this.mode === 'upsert') {
      const keys = (this.conflict || 'id').split(',');
      const ex = rows.find((r) => keys.every((k) => String(r[k]) === String(this.payload[k])));
      if (ex) Object.assign(ex, this.payload); else rows.push({ id: 'up-' + Math.random().toString(36).slice(2, 7), ...this.payload });
      const row = ex || rows[rows.length - 1];
      return { data: this._single ? row : [row], error: null };
    }
    if (this.mode === 'delete') { const keep = rows.filter((r) => !match(r)); db[this.table] = keep; return { data: null, error: null }; }
    return { data: null, error: { message: 'unknown mode' } };
  }
}
const authCalls = [];
const fake = { from: (t) => new Q(t), auth: {
  signOut: async () => ({}),
  signInWithOAuth: async () => ({ data: {}, error: null }),
  signInWithPassword: async (p) => { authCalls.push(['pw', p]); return p.password === 'secret123' ? { data: { session: {} }, error: null } : { data: null, error: { message: 'Invalid login credentials' } }; },
  updateUser: async (p) => { authCalls.push(['update', p]); return { data: {}, error: null }; },
  getSession: async () => ({ data: { session: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} };

// ---------- 앱 모듈 로드 ----------
const sb = await import('../app/supabase.js');
sb.setSupabaseClient(fake);
const { render } = await import('preact');
const { html } = await import('htm/preact');
const { StudentPage } = await import('../app/pages/student.js');
const { DashboardPage } = await import('../app/pages/dashboard.js');
const { ProjectsPage } = await import('../app/pages/projects.js');
const { ProjectYearPage } = await import('../app/pages/project_year.js');
const { AllocationsPage } = await import('../app/pages/allocations.js');
const { MembersPage } = await import('../app/pages/members.js');
const { LoginPage } = await import('../app/pages/login.js');
const { AccountPage } = await import('../app/pages/account.js');
const util = await import('../app/util.js');

const me = db.members[0];
const stu = db.members[1];
let pass = 0;
function ok(cond, msg) { assert.ok(cond, msg); pass++; console.log('  ✓', msg); }
function mount(vnode) { const root = document.createElement('div'); document.body.appendChild(root); render(vnode, root); return root; }
function text(root) { return root.textContent; }
async function unmount(root) { render(null, root); root.remove(); }

// util
console.log('util');
ok(util.fmtWon(1234567) === '₩1,234,567', 'fmtWon');
ok(util.fmtWon(-500) === '-₩500', 'fmtWon negative');
ok(util.parseNum('1,234,000') === 1234000, 'parseNum');
ok(util.parseNum('') === null, 'parseNum empty');
ok(util.pct(50, 200) === '25.0%', 'pct');

// 학생 페이지
console.log('StudentPage');
{
  const root = mount(html`<${StudentPage} me=${stu} />`);
  await settle();
  const t = text(root);
  ok(t.includes('박수환'), '이름 표시');
  ok(t.includes('아바타') && t.includes('KIST'), '과제 열 표시');
  ok(t.includes('₩500,000') && t.includes('₩300,000'), '금액 표시');
  ok(t.includes('₩800,000'), '합계');
  ok(t.includes('기준'), '기준 열 표시');
  await unmount(root);
}

// 대시보드
console.log('DashboardPage');
{
  const root = mount(html`<${DashboardPage} me=${me} />`);
  await settle();
  const t = text(root);
  ok(t.includes('아바타') && t.includes('3차년도'), '연차 행 표시');
  ok(t.includes('₩41,102,000'), '계획 합계 (카드/표)');
  ok(t.includes('₩1,500,000'), '학생인건비 표시');
  ok(t.includes('₩1,800,000'), '과제별 배분 합계');
  await unmount(root);
}

// 과제 목록
console.log('ProjectsPage');
{
  const root = mount(html`<${ProjectsPage} me=${me} />`);
  await settle();
  const names = [...root.querySelectorAll('input.text[type=text]')].map((i) => i.value);
  ok(names.includes('아바타') && root.querySelector('a.chip[href="#/projects/py-avatar-3"]'), '과제/연차 chip 렌더');
  await unmount(root);
}

// 연차 상세: 예산 편집 + 원장 추가
console.log('ProjectYearPage');
{
  const root = mount(html`<${ProjectYearPage} id=${ids.pyA} me=${me} />`);
  await settle();
  let t = text(root);
  ok(t.includes('아바타') && t.includes('3차년도'), '헤더');
  ok(t.includes('학생인건비') && t.includes('국내여비'), '비목 행');
  ok(t.includes('₩122,576'), '원장 금액');
  // 예산 계획 편집: 국내여비 계획 2,000,000 → 2,500,000
  const inputs = [...root.querySelectorAll('table.budget input.money')];
  const planInput = inputs.find((i) => i.value === '2,000,000');
  ok(planInput, '계획 셀 찾음');
  planInput.dispatchEvent(new win.Event('focus'));
  await wait(5);
  planInput.value = '2500000';
  planInput.dispatchEvent(new win.Event('input'));
  planInput.dispatchEvent(new win.Event('blur'));
  await settle();
  const up = calls.find((c) => c.table === 'budget_lines' && c.mode === 'upsert' && c.payload.category === '국내여비');
  ok(up && Number(up.payload.planned) === 2500000, '예산 upsert 호출 (2,500,000)');
  // 원장 추가
  const draftRow = root.querySelector('tr.draft');
  const sel = draftRow.querySelector('select');
  sel.value = '회의비'; sel.dispatchEvent(new win.Event('change'));
  const amt = draftRow.querySelector('input.money');
  amt.dispatchEvent(new win.Event('focus')); await wait(5);
  amt.value = '55000'; amt.dispatchEvent(new win.Event('input')); amt.dispatchEvent(new win.Event('blur'));
  await wait(20);
  const memo = draftRow.querySelector('input.text.wide');
  memo.value = '테스트 회의'; memo.dispatchEvent(new win.Event('input'));
  await wait(10);
  draftRow.querySelector('button').click();
  await settle();
  const ins = calls.find((c) => c.table === 'ledger' && c.mode === 'insert');
  ok(ins && ins.payload.amount === 55000 && ins.payload.category === '회의비', '원장 insert 호출');
  const memos = [...root.querySelectorAll('table.ledger tbody tr:not(.draft) input.text.wide')].map((i) => i.value);
  ok(memos.includes('테스트 회의') && text(root).includes('₩177,576'), '원장 새 행 표시 + 합계 갱신');
  await unmount(root);
}

// 인건비 배분 그리드
console.log('AllocationsPage');
{
  const root = mount(html`<${AllocationsPage} me=${me} />`);
  await settle();
  let t = text(root);
  ok(t.includes('박수환') && t.includes('강민형'), '학생 행');
  ok(t.includes('1,500,000'), '1월 합계 (500,000+1,000,000)');
  // 셀 편집: 박수환 2월 아바타 = 700,000
  const rows = [...root.querySelectorAll('table.alloc tbody tr')];
  const r0 = rows.find((r) => r.textContent.startsWith('박수환'));
  const cell = r0.querySelectorAll('td input.money')[1]; // 2월
  cell.dispatchEvent(new win.Event('focus')); await wait(5);
  cell.value = '700000'; cell.dispatchEvent(new win.Event('input')); cell.dispatchEvent(new win.Event('blur'));
  await settle();
  const up = calls.find((c) => c.table === 'allocations' && c.mode === 'upsert' && c.payload.month === 2);
  ok(up && up.payload.amount === 700000 && up.payload.member_id === ids.stu && up.payload.project_id === ids.avatar, '배분 upsert (2월 700,000)');
  ok(text(root).includes('1,200,000'), '행 합계 갱신 (500,000+700,000)');
  // 삭제: 1월 값 지우기
  const c1 = r0.querySelectorAll('td input.money')[0];
  c1.dispatchEvent(new win.Event('focus')); await wait(5);
  c1.value = ''; c1.dispatchEvent(new win.Event('input')); c1.dispatchEvent(new win.Event('blur'));
  await settle();
  ok(calls.some((c) => c.table === 'allocations' && c.mode === 'delete'), '배분 delete 호출');
  // 학생별 탭
  const segs = [...root.querySelectorAll('.seg-btn')];
  segs[1].click(); await settle();
  t = text(root);
  ok(t.includes('기준') && t.includes('차이'), '학생별 탭: 기준/차이 행');
  segs[2].click(); await settle();
  ok(text(root).includes('CSV'), '요약 탭');
  await unmount(root);
}

// 구성원 (인사정보 표 + 추가/수정 모달)
console.log('MembersPage');
{
  const mm = await import('../app/pages/members.js');
  ok(mm.normalizeRrn('9501011234567') === '950101-1234567', 'RRN 정규화');
  ok(mm.birthFromRrn('950101-1234567') === '1995-01-01' && mm.birthFromRrn('050101-3234567') === '2005-01-01', 'RRN→생년월일');
  ok(mm.normalizePhone('01012345678') === '010-1234-5678', '전화번호 정규화');
  ok(mm.maskRrn('950101-1234567') === '950101-1●●●●●●', 'RRN 마스킹');
  ok(mm.maskAccount('국민 123456-01-123456').endsWith('3456') && mm.maskAccount('국민 123456-01-123456').includes('●'), '계좌 마스킹');

  const root = mount(html`<${MembersPage} me=${me} />`);
  await settle();
  let t = text(root);
  ok(t.includes('박수환') && t.includes('강민형') && t.includes('2020123456'), '구성원 표 (이름/학번)');
  ok(t.includes('950101-1●●●●●●') && !t.includes('950101-1234567'), '주민번호 기본 가림');
  // 민감정보 표시 토글
  const reveal = [...root.querySelectorAll('.page-head input[type=checkbox]')][1];
  reveal.checked = true; reveal.dispatchEvent(new win.Event('change'));
  await settle();
  ok(text(root).includes('950101-1234567'), '민감정보 표시 켜면 보임');
  // 추가 모달
  root.querySelector('button.btn.primary').click();
  await settle();
  const modal = root.querySelector('.modal');
  ok(modal && modal.textContent.includes('구성원 추가'), '추가 모달 열림');
  const setVal = (sel, v) => { const el = modal.querySelector(sel); el.value = v; el.dispatchEvent(new win.Event(el.tagName === 'SELECT' ? 'change' : 'input')); };
  const labels = [...modal.querySelectorAll('label')];
  const inputOf = (labelText) => labels.find((l) => l.textContent.trim().startsWith(labelText)).querySelector('input,select');
  inputOf('이름').value = '홍길동'; inputOf('이름').dispatchEvent(new win.Event('input'));
  inputOf('학위종류').value = '석사'; inputOf('학위종류').dispatchEvent(new win.Event('change'));
  inputOf('학번').value = '2026999999'; inputOf('학번').dispatchEvent(new win.Event('input'));
  inputOf('입학학기').value = '2026-1'; inputOf('입학학기').dispatchEvent(new win.Event('input'));
  inputOf('연구자번호').value = '12345678'; inputOf('연구자번호').dispatchEvent(new win.Event('input'));
  inputOf('연락처').value = '01099998888'; inputOf('연락처').dispatchEvent(new win.Event('input'));
  inputOf('계좌번호').value = '신한 110-123-456789'; inputOf('계좌번호').dispatchEvent(new win.Event('input'));
  const rrnIn = inputOf('주민등록번호'); rrnIn.value = '0003013456789'; rrnIn.dispatchEvent(new win.Event('input')); rrnIn.dispatchEvent(new win.Event('blur'));
  await wait(10);
  ok(inputOf('생년월일').value === '2000-03-01', '주민번호로 생년월일 자동 입력');
  modal.querySelector('form').dispatchEvent(new win.Event('submit'));
  await settle();
  const ins = calls.find((c) => c.table === 'members' && c.mode === 'insert');
  ok(ins && ins.payload.name === '홍길동' && ins.payload.degree === '석사' && ins.payload.student_no === '2026999999'
     && ins.payload.admission_term === '2026-1' && ins.payload.researcher_no === '12345678' && ins.payload.phone === '010-9999-8888'
     && ins.payload.rrn === '000301-3456789' && ins.payload.birth_date === '2000-03-01' && ins.payload.bank_account === '신한 110-123-456789', '구성원 insert 페이로드');
  ok(!root.querySelector('.modal') && text(root).includes('홍길동'), '모달 닫히고 목록 갱신');
  // 수정 모달: 이메일 저장 (소문자 정규화)
  const row = [...root.querySelectorAll('table.members tbody tr')].find((r) => r.textContent.startsWith('강민형'));
  row.querySelector('button').click();
  await settle();
  const m2 = root.querySelector('.modal');
  const emailIn = [...m2.querySelectorAll('label')].find((l) => l.textContent.includes('로그인 이메일')).querySelector('input');
  emailIn.value = 'KMH@khu.ac.kr'; emailIn.dispatchEvent(new win.Event('input'));
  await wait(10);
  m2.querySelector('form').dispatchEvent(new win.Event('submit'));
  await settle();
  const up = calls.find((c) => c.table === 'members' && c.mode === 'update' && c.payload.email);
  ok(up && up.payload.email === 'kmh@khu.ac.kr', '이메일 저장 (소문자 정규화)');
  await unmount(root);
}

// 로그인 화면 (이메일/비밀번호)
console.log('LoginPage');
{
  const root = mount(html`<${LoginPage} />`);
  await settle();
  ok(root.querySelector('input[type=email]') && root.querySelector('input[type=password]'), '이메일/비밀번호 입력');
  ok(!text(root).includes('Google 계정으로 로그인'), 'Google 미설정 시 버튼 숨김');
  const em = root.querySelector('input[type=email]'); em.value = 'KIM87@khu.ac.kr'; em.dispatchEvent(new win.Event('input'));
  const pw = root.querySelector('input[type=password]'); pw.value = 'wrong'; pw.dispatchEvent(new win.Event('input'));
  await wait(5);
  root.querySelector('form.login-form').dispatchEvent(new win.Event('submit'));
  await settle();
  ok(text(root).includes('이메일 또는 비밀번호가 올바르지 않습니다'), '잘못된 비밀번호 안내');
  ok(authCalls.some((c) => c[0] === 'pw' && c[1].email === 'kim87@khu.ac.kr'), '이메일 소문자 정규화 후 로그인 시도');
  await unmount(root);
}

// 내 계정 (비밀번호 변경)
console.log('AccountPage');
{
  const root = mount(html`<${AccountPage} me=${stu} session=${{ user: { email: 'psh@khu.ac.kr' } }} />`);
  await settle();
  ok(text(root).includes('psh@khu.ac.kr') && text(root).includes('박수환'), '계정 정보');
  const [p1, p2] = root.querySelectorAll('input[type=password]');
  p1.value = 'newpass123'; p1.dispatchEvent(new win.Event('input'));
  p2.value = 'newpass123'; p2.dispatchEvent(new win.Event('input'));
  await wait(5);
  root.querySelector('form').dispatchEvent(new win.Event('submit'));
  await settle();
  ok(authCalls.some((c) => c[0] === 'update' && c[1].password === 'newpass123'), '비밀번호 변경 호출');
  await unmount(root);
}

// main.js 부팅 (설정 있음 + 세션 없음 → 로그인 화면 / 설정 없음 → 안내 화면)
console.log('main.js');
{
  const app = document.createElement('div'); app.id = 'app'; document.body.appendChild(app);
  await import('../app/main.js');
  await settle();
  const cfg = await import('../app/config.js');
  if (cfg.SUPABASE_URL) ok(app.querySelector('form.login-form'), '로그인 화면 부팅');
  else ok(app.textContent.includes('Supabase 설정이 없습니다'), '미설정 안내 화면');
}

console.log(`\n모두 통과 (${pass} 검사)`);
process.exit(0);
