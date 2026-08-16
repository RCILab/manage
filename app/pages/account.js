import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { updatePassword } from '../api.js';
import { toast } from '../util.js';
import { mapAuthError } from './login.js';

export function AccountPage({ me, session }) {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (pw1.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (pw1 !== pw2) { setError('두 비밀번호가 다릅니다.'); return; }
    setBusy(true);
    try { await updatePassword(pw1); setPw1(''); setPw2(''); toast('비밀번호가 변경되었습니다.'); }
    catch (e2) { setError(mapAuthError(e2)); }
    finally { setBusy(false); }
  };

  return html`<div class="page narrow">
    <h1>내 계정</h1>
    <div class="panel">
      <div class="kv-grid">
        <label>이름 <span>${me?.name || '–'}</span></label>
        <label>이메일 <span>${session?.user?.email || '–'}</span></label>
        <label>역할 <span>${me?.role === 'pi' ? '교수' : me?.role === 'admin' ? '행정조교' : '학생'}</span></label>
        <label>학위 <span>${me?.degree || '–'}${me?.is_bk ? ' · BK' : ''}</span></label>
      </div>
    </div>
    <h2>비밀번호 변경</h2>
    <form class="panel stack" onSubmit=${submit}>
      ${error && html`<div class="error-box">${error}</div>`}
      <input class="text" type="password" placeholder="새 비밀번호 (8자 이상)" value=${pw1} onInput=${(e) => setPw1(e.target.value)} autocomplete="new-password" required />
      <input class="text" type="password" placeholder="새 비밀번호 확인" value=${pw2} onInput=${(e) => setPw2(e.target.value)} autocomplete="new-password" required />
      <div><button class="btn primary" disabled=${busy}>변경</button></div>
    </form>
    <p class="muted small">비밀번호를 잊어버리면 관리자가 초기화해 줄 수 있습니다.</p>
  </div>`;
}
