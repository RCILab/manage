import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { listMembers, saveMember } from '../api.js';
import { useAsync, errMsg, toast, cls } from '../util.js';
import { Spinner, ErrorBox, TextCell, Select } from '../ui.js';

const ROLES = [['student', '학생'], ['admin', '행정조교'], ['pi', '교수']];
const ROLE_OPTS = ROLES.map(([value, label]) => ({ value, label }));
const roleLabel = (r) => (ROLES.find(([v]) => v === r) || [r, r])[1];

export function MembersPage({ me }) {
  const q = useAsync(() => listMembers(), []);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', role: 'student', position: '', is_bk: false });

  const update = async (m, patch) => {
    if (m.id === me.id && (patch.role !== undefined && patch.role !== me.role || patch.active === false)) {
      toast('본인의 역할/활성 상태는 바꿀 수 없습니다 (잠김 방지).', 'error'); q.reload(); return;
    }
    try { await saveMember({ id: m.id, ...patch }); q.reload(); toast('저장됨'); }
    catch (e) { toast('저장 실패: ' + errMsg(e), 'error'); q.reload(); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    try {
      const maxOrder = Math.max(0, ...(q.data || []).map((m) => m.sort_order || 0));
      await saveMember({ ...draft, name: draft.name.trim(), email: draft.email || null, position: draft.position || null, sort_order: maxOrder + 1, active: true });
      setDraft({ name: '', email: '', role: 'student', position: '', is_bk: false }); setAdding(false); q.reload(); toast('추가됨');
    } catch (e2) { toast('추가 실패: ' + errMsg(e2), 'error'); }
  };

  const rows = (q.data || []).filter((m) => showInactive || m.active);
  const noEmail = rows.filter((m) => m.active && !m.email).length;

  return html`<div class="page">
    <div class="page-head">
      <h1>구성원</h1>
      <label class="inline"><input type="checkbox" checked=${showInactive} onChange=${(e) => setShowInactive(e.target.checked)} /> 비활성 포함</label>
      <button class="btn" onClick=${() => setAdding((v) => !v)}>+ 구성원 추가</button>
    </div>
    ${adding && html`<form class="form-row" onSubmit=${add}>
      <input class="text" placeholder="이름" value=${draft.name} onInput=${(e) => setDraft({ ...draft, name: e.target.value })} required />
      <input class="text" type="email" placeholder="이메일 (khu.ac.kr)" value=${draft.email} onInput=${(e) => setDraft({ ...draft, email: e.target.value })} />
      <${Select} value=${draft.role} options=${ROLE_OPTS} onChange=${(v) => setDraft({ ...draft, role: v })} />
      <input class="text" placeholder="신분 (석사/박사/…)" value=${draft.position} onInput=${(e) => setDraft({ ...draft, position: e.target.value })} />
      <label class="inline small"><input type="checkbox" checked=${draft.is_bk} onChange=${(e) => setDraft({ ...draft, is_bk: e.target.checked })} /> BK</label>
      <button class="btn primary">추가</button>
      <button type="button" class="btn ghost" onClick=${() => setAdding(false)}>취소</button>
    </form>`}
    ${noEmail > 0 && html`<div class="notice">이메일이 비어 있는 활성 구성원 ${noEmail}명 — 이메일을 넣어야 로그인할 수 있습니다.</div>`}
    <${ErrorBox} error=${q.error} onRetry=${q.reload} />
    ${q.loading && html`<${Spinner} />`}
    ${q.data && html`<div class="table-wrap">
      <table class="grid members">
        <thead><tr><th>순서</th><th>이름</th><th>로그인 이메일</th><th>역할</th><th>신분</th><th>BK</th><th>활성</th><th>비고</th></tr></thead>
        <tbody>
          ${rows.map((m) => html`<tr key=${m.id} class=${cls(!m.active && 'inactive', m.id === me.id && 'me')}>
            <td style="width:4rem"><${TextCell} type="number" value=${m.sort_order} onCommit=${(v) => update(m, { sort_order: Number(v) || 0 })} /></td>
            <td><${TextCell} value=${m.name} onCommit=${(v) => v && update(m, { name: v })} /></td>
            <td><${TextCell} type="email" value=${m.email} placeholder="이름@khu.ac.kr" onCommit=${(v) => update(m, { email: v || null })} className=${cls(!m.email && 'warn')} /></td>
            <td>${m.id === me.id ? html`<span title="본인">${roleLabel(m.role)}</span>` : html`<${Select} value=${m.role} options=${ROLE_OPTS} onChange=${(v) => update(m, { role: v })} />`}</td>
            <td><${TextCell} value=${m.position} onCommit=${(v) => update(m, { position: v || null })} /></td>
            <td><input type="checkbox" checked=${m.is_bk} onChange=${(e) => update(m, { is_bk: e.target.checked })} /></td>
            <td><input type="checkbox" checked=${m.active} disabled=${m.id === me.id} onChange=${(e) => update(m, { active: e.target.checked })} /></td>
            <td><${TextCell} value=${m.note} onCommit=${(v) => update(m, { note: v || null })} className="wide" /></td>
          </tr>`)}
        </tbody>
      </table>
    </div>`}
    <p class="muted small">역할: <b>학생</b>은 자기 인건비만 조회, <b>행정조교</b>·<b>교수</b>는 모든 화면 조회·편집. 로그인 이메일은 구글 계정(khu.ac.kr) 과 정확히 같아야 합니다.</p>
  </div>`;
}
