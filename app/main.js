import { render } from 'preact';
import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';
import { supabase, configured } from './supabase.js';
import { APP_TITLE } from './config.js';
import { useHashRoute, navigate, errMsg, cls } from './util.js';
import { getMe, signOut } from './api.js';
import { Toasts, Spinner } from './ui.js';
import { LoginPage } from './pages/login.js';
import { StudentPage } from './pages/student.js';
import { DashboardPage } from './pages/dashboard.js';
import { ProjectsPage } from './pages/projects.js';
import { ProjectYearPage } from './pages/project_year.js';
import { AllocationsPage } from './pages/allocations.js';
import { MembersPage } from './pages/members.js';
import { AccountPage } from './pages/account.js';

const MANAGER_LINKS = [
  ['/dashboard', '대시보드'],
  ['/projects', '과제·집행'],
  ['/allocations', '인건비 배분'],
  ['/members', '구성원'],
  ['/account', '내 계정'],
];
const STUDENT_LINKS = [['/me', '내 인건비'], ['/account', '내 계정']];

function Nav({ me, session, path }) {
  const links = me && (me.role === 'admin' || me.role === 'pi') ? MANAGER_LINKS : STUDENT_LINKS;
  return html`<header class="nav">
    <a class="brand" href="#/">${APP_TITLE}</a>
    <nav>
      ${me && links.map(([p, label]) => html`<a href=${'#' + p} class=${cls((path === p || path.startsWith(p + '/')) && 'active')}>${label}</a>`)}
    </nav>
    <div class="spacer"></div>
    ${session && html`<span class="user" title=${session.user.email}>${me ? me.name : ''} <span class="muted">${session.user.email}</span></span>
      <button class="btn small ghost" onClick=${() => signOut().then(() => navigate('/'))}>로그아웃</button>`}
  </header>`;
}

function SetupPage() {
  return html`<div class="page narrow">
    <h1>${APP_TITLE}</h1>
    <div class="error-box">아직 Supabase 설정이 없습니다.</div>
    <ol>
      <li>Supabase 프로젝트를 만들고 <code>supabase/schema.sql</code> 을 SQL Editor 에서 실행합니다.</li>
      <li>Project Settings → API 의 <b>Project URL</b>, <b>anon public</b> 키를 <code>app/config.js</code> 에 넣습니다.</li>
      <li>Authentication → URL Configuration 의 Site URL / Redirect URLs 에 이 페이지 주소를 넣고, 구성원 계정을 만듭니다 (scripts/create_users.py).</li>
    </ol>
    <p class="muted">자세한 절차는 저장소의 README.md 를 참고하세요.</p>
  </div>`;
}

function NotRegistered({ session }) {
  return html`<div class="page narrow">
    <h2>등록되지 않은 계정입니다</h2>
    <p><b>${session.user.email}</b> 은(는) 구성원 명단에 없습니다.<br/>교수님 또는 행정조교 선생님께 이메일 등록을 요청해 주세요.</p>
    <button class="btn" onClick=${() => signOut().then(() => navigate('/'))}>다른 계정으로 로그인</button>
  </div>`;
}

export function App() {
  const path = useHashRoute();
  const [session, setSession] = useState(undefined);   // undefined = 확인 중
  const [me, setMe] = useState(undefined);             // undefined = 확인 중, null = 명단에 없음
  const [meError, setMeError] = useState(null);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
      // OAuth 콜백 후 주소창의 ?code=... 정리
      if (s && location.search) history.replaceState(null, '', location.pathname + location.hash);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const email = session?.user?.email;
  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setMe(null); return; }
    setMe(undefined); setMeError(null);
    getMe(email).then((m) => setMe(m ?? null)).catch((e) => { setMeError(e); setMe(null); });
  }, [email, session === undefined]);

  if (!configured) return html`<${SetupPage} />`;
  if (session === undefined) return html`<${Spinner} text="세션 확인 중…" />`;
  if (!session) return html`<${LoginPage} />`;
  if (me === undefined) return html`<${Nav} me=${null} session=${session} path=${path} /><${Spinner} text="구성원 정보 확인 중…" />`;
  if (!me) return html`<${Nav} me=${null} session=${session} path=${path} />
    ${meError ? html`<div class="page narrow"><div class="error-box">구성원 조회 실패: ${errMsg(meError)}</div></div>` : html`<${NotRegistered} session=${session} />`}`;

  const isManager = me.role === 'admin' || me.role === 'pi';
  const seg = path.split('/')[1] || '';           // '#/projects/abc' → 'projects'
  const sub = path.split('/')[2] || '';
  let page;
  if (seg === '') {
    navigate(isManager ? '/dashboard' : '/me');
    page = null;
  } else if (seg === 'account') {
    page = html`<${AccountPage} me=${me} session=${session} />`;
  } else if (seg === 'me') {
    if (isManager) { navigate('/dashboard'); page = null; }   // 관리자는 대시보드로
    else page = html`<${StudentPage} me=${me} />`;
  } else if (!isManager) {
    navigate('/me');
    page = null;
  } else if (seg === 'dashboard') {
    page = html`<${DashboardPage} me=${me} />`;
  } else if (seg === 'projects' && sub) {
    page = html`<${ProjectYearPage} id=${sub} me=${me} />`;
  } else if (seg === 'projects') {
    page = html`<${ProjectsPage} me=${me} />`;
  } else if (seg === 'allocations') {
    page = html`<${AllocationsPage} me=${me} />`;
  } else if (seg === 'members') {
    page = html`<${MembersPage} me=${me} />`;
  } else {
    page = html`<div class="page">페이지를 찾을 수 없습니다. <a href="#/">홈으로</a></div>`;
  }
  return html`<${Nav} me=${me} session=${session} path=${path} />${page}`;
}

function Root() {
  return html`<${App} /><${Toasts} />`;
}

render(html`<${Root} />`, document.getElementById('app'));
