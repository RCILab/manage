import { html } from 'htm/preact';
import { useState, useEffect } from 'preact/hooks';
import { APP_TITLE, LOGIN_DOMAIN_HINT, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { signInWithGoogle, signInWithPassword, getAuthSettings } from '../api.js';
import { errMsg } from '../util.js';

function urlAuthMessage() {
  // OAuth 실패 시 supabase 가 ?error=... 또는 #error=... 로 돌려보냄
  const params = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  const desc = params.get('error_description') || hashParams.get('error_description');
  const code = params.get('error_code') || hashParams.get('error_code') || params.get('error') || hashParams.get('error');
  if (!desc && !code) return null;
  if (/saving new user|signup not allowed/i.test(desc || '')) {
    return '등록된 이메일로만 로그인할 수 있습니다.';
  }
  return `${code || '오류'}: ${desc || ''}`;
}

export function mapAuthError(e) {
  const m = errMsg(e);
  if (/invalid login credentials|invalid_credentials/i.test(m)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (/email not confirmed/i.test(m)) return '아직 확인되지 않은 계정입니다. 관리자에게 문의하세요.';
  if (/provider is not enabled/i.test(m)) return 'Google 로그인이 Supabase에서 켜져 있지 않습니다. 이메일/비밀번호로 로그인하세요.';
  if (/signups not allowed|signup.*disabled/i.test(m)) return '계정이 없습니다. 관리자에게 계정 생성을 요청하세요.';
  if (/rate limit/i.test(m)) return '요청이 너무 많습니다. 잠시 후 다시 시도하세요.';
  return m;
}

export function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(urlAuthMessage());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [googleOn, setGoogleOn] = useState(false);
  const exchanging = /[?&]code=/.test(location.search);

  useEffect(() => {
    if (error && (location.search || /error/.test(location.hash))) {
      history.replaceState(null, '', location.pathname);
    }
    getAuthSettings(SUPABASE_URL, SUPABASE_ANON_KEY).then((s) => setGoogleOn(Boolean(s?.external?.google)));
  }, []);

  const login = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true); setError(null);
    try { await signInWithPassword(email, password); }
    catch (e2) { setError(mapAuthError(e2)); }
    finally { setBusy(false); }
  };
  const google = async () => {
    setBusy(true); setError(null);
    try { await signInWithGoogle(LOGIN_DOMAIN_HINT); }
    catch (e) { setError(mapAuthError(e)); setBusy(false); }
  };

  return html`<div class="login">
    <div class="login-box">
      <h1>${APP_TITLE}</h1>
      <p class="muted">연구실 구성원만 이용할 수 있습니다. 관리자가 만들어 준 계정(이메일/비밀번호)으로 로그인하세요.</p>
      ${exchanging && html`<div class="muted pad">로그인 처리 중…</div>`}
      ${error && html`<div class="error-box">${error}</div>`}
      <form class="login-form" onSubmit=${login}>
        <input type="email" placeholder="이메일 (예: 이름@khu.ac.kr)" value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="username" required />
        <input type="password" placeholder="비밀번호" value=${password} onInput=${(e) => setPassword(e.target.value)} autocomplete="current-password" required />
        <button class="btn primary big" disabled=${busy || exchanging}>로그인</button>
      </form>
      ${googleOn && html`
        <div class="login-alt muted">또는</div>
        <button class="btn big" disabled=${busy || exchanging} onClick=${google}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          Google 계정으로 로그인
        </button>`}
      <p class="muted small">비밀번호를 잊었거나 계정이 없으면 행정조교 선생님 또는 교수님께 문의하세요.</p>
    </div>
  </div>`;
}
