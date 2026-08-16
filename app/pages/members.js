import { html } from 'htm/preact';
import { useState, useMemo } from 'preact/hooks';
import { listMembers, saveMember, deleteMember } from '../api.js';
import { useAsync, errMsg, toast, cls, downloadCsv } from '../util.js';
import { Spinner, ErrorBox, Modal, Confirm } from '../ui.js';

export const DEGREES = ['석박통합과정', '박사과정', '석사과정', '학사과정'];
const ROLE_RANK = { pi: 0, admin: 1, student: 2 };
/** 구성원 정렬: 교수 → 행정조교 → 학생, 학위 석박통합과정 → 박사과정 → 석사과정 → 학사과정, 정렬순서, 이름 */
export function memberSort(a, b) {
  const r = (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9);
  if (r) return r;
  const da = DEGREES.indexOf(a.degree), db = DEGREES.indexOf(b.degree);
  const d = (da < 0 ? 9 : da) - (db < 0 ? 9 : db);
  if (d) return d;
  return ((a.sort_order || 0) - (b.sort_order || 0)) || String(a.name).localeCompare(String(b.name), 'ko');
}
const ROLES = [['student', '학생'], ['admin', '행정조교'], ['pi', '교수']];
const roleLabel = (r) => (ROLES.find(([v]) => v === r) || [r, r])[1];

// ---------- 정규화 / 표시 ----------
export function normalizeRrn(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 13) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return String(v).trim();
}
export function isValidRrn(v) {
  return /^\d{6}-\d{7}$/.test(v || '');
}
export function normalizePhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return d.startsWith('02') ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return String(v).trim();
}
/** 주민등록번호 앞자리로 생년월일 유추 (YYYY-MM-DD) */
export function birthFromRrn(rrn) {
  const d = String(rrn || '').replace(/\D/g, '');
  if (d.length < 7) return null;
  const yy = Number(d.slice(0, 2)), mm = d.slice(2, 4), dd = d.slice(4, 6), g = d[6];
  const century = '1256'.includes(g) ? 1900 : '3478'.includes(g) ? 2000 : '90'.includes(g) ? 1800 : null;
  if (!century) return null;
  const y = century + yy;
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  return `${y}-${mm}-${dd}`;
}
export function maskRrn(v) {
  if (!v) return '';
  const m = /^(\d{6})-?(\d)(\d{6})$/.exec(v);
  return m ? `${m[1]}-${m[2]}●●●●●●` : '●●●●●●-●●●●●●●';
}
export function maskAccount(v) {
  if (!v) return '';
  const s = String(v);
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6) return '●●●●';
  // 마지막 4자리만 노출
  let seen = 0;
  const keep = digits.length - 4;
  return s.replace(/\d/g, (c) => (seen++ < keep ? '●' : c));
}

const EMPTY = { name: '', role: 'student', degree: '', student_no: '', admission_term: '', birth_date: '', researcher_no: '', phone: '', bank_account: '', rrn: '', is_bk: false, email: '', active: true, note: '', sort_order: 0 };

export function MembersPage({ me }) {
  const q = useAsync(() => listMembers(), []);
  const [showInactive, setShowInactive] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [editing, setEditing] = useState(null);   // null | {} (새로) | member
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => (q.data || [])
    .filter((m) => showInactive || m.active)
    .filter((m) => !filter || [m.name, m.student_no, m.phone, m.email, m.researcher_no, m.note].some((x) => (x || '').includes(filter)))
    .sort(memberSort),
    [q.data, showInactive, filter]);
  const missingEmail = (q.data || []).filter((m) => m.active && (m.role === 'admin' || m.role === 'pi') && !m.email).length;

  const openNew = () => {
    const maxOrder = Math.max(0, ...(q.data || []).map((m) => m.sort_order || 0));
    setEditing({ ...EMPTY, sort_order: maxOrder + 1 });
  };
  const csv = () => {
    const head = ['이름', '역할', '학위종류', '학번', '입학학기', '생년월일', '연구자번호', '연락처', '계좌번호', '주민등록번호', 'BK', '활성', '이메일', '비고'];
    const body = rows.map((m) => [m.name, roleLabel(m.role), m.degree, m.student_no, m.admission_term, m.birth_date, m.researcher_no, m.phone, m.bank_account, m.rrn, m.is_bk ? 'Y' : '', m.active ? 'Y' : 'N', m.email, m.note]);
    downloadCsv('구성원.csv', [head, ...body]);
  };

  return html`<div class="page">
    <div class="page-head">
      <h1>구성원 <span class="muted">${rows.length}명</span></h1>
      <button class="btn primary" onClick=${openNew}>+ 추가</button>
      <input class="text" placeholder="이름/학번/연락처 검색" value=${filter} onInput=${(e) => setFilter(e.target.value)} />
      <label class="inline small"><input type="checkbox" checked=${showInactive} onChange=${(e) => setShowInactive(e.target.checked)} /> 비활성 포함</label>
      <label class="inline small"><input type="checkbox" checked=${reveal} onChange=${(e) => setReveal(e.target.checked)} /> 민감정보 표시</label>
      <div class="spacer"></div>
      <button class="btn small" onClick=${csv} title="현재 표시된 목록을 CSV 로 (민감정보 포함)">CSV</button>
    </div>
    ${missingEmail > 0 && html`<div class="notice">로그인 이메일이 없는 관리자(교수/행정조교) ${missingEmail}명 — 이메일이 있어야 로그인할 수 있습니다.</div>`}
    <${ErrorBox} error=${q.error} onRetry=${q.reload} />
    ${q.loading && html`<${Spinner} />`}
    ${q.data && html`<div class="table-wrap">
      <table class="grid members">
        <thead><tr>
          <th class="sticky">이름</th><th>학위종류</th><th>학번</th><th>입학학기</th><th>생년월일</th><th>연구자번호</th>
          <th>연락처</th><th>계좌번호</th><th>주민등록번호</th><th>BK</th><th>역할</th><th>활성</th><th>비고</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((m) => html`<tr key=${m.id} class=${cls(!m.active && 'inactive', m.id === me.id && 'me')} onDblClick=${() => setEditing(m)}>
            <th class="sticky">${m.name}</th>
            <td>${m.degree || ''}</td>
            <td class="mono">${m.student_no || ''}</td>
            <td>${m.admission_term || ''}</td>
            <td class="mono">${m.birth_date || ''}</td>
            <td class="mono">${m.researcher_no || ''}</td>
            <td class="mono">${m.phone || ''}</td>
            <td class="sensitive" title=${reveal ? '' : '민감정보 표시를 켜면 보입니다'}>${reveal ? (m.bank_account || '') : maskAccount(m.bank_account)}</td>
            <td class="sensitive" title=${reveal ? '' : '민감정보 표시를 켜면 보입니다'}>${reveal ? (m.rrn || '') : maskRrn(m.rrn)}</td>
            <td>${m.is_bk ? 'BK' : ''}</td>
            <td>${roleLabel(m.role)}</td>
            <td>${m.active ? '' : '비활성'}</td>
            <td class="muted small" title=${m.note || ''}>${m.note || ''}</td>
            <td><button class="btn tiny" onClick=${() => setEditing(m)}>수정</button></td>
          </tr>`)}
          ${rows.length === 0 && html`<tr><td colspan="14" class="muted pad">구성원이 없습니다. 위의 "+ 추가" 를 누르세요.</td></tr>`}
        </tbody>
      </table>
    </div>`}
    <p class="muted small">정렬: 교수 → 행정조교 → 학생, 학위 석박통합과정 → 박사과정 → 석사과정 → 학사과정 (같으면 정렬 순서·이름). 행을 더블클릭하거나 "수정"을 눌러 편집합니다. 주민등록번호·계좌번호는 기본으로 가려져 있으며 교수/행정조교만 볼 수 있습니다.</p>
    ${editing && html`<${MemberForm} initial=${editing} me=${me} onClose=${() => setEditing(null)} onSaved=${() => { setEditing(null); q.reload(); }} />`}
  </div>`;
}

export function MemberForm({ initial, me, onClose, onSaved }) {
  const isNew = !initial.id;
  const [f, setF] = useState({ ...EMPTY, ...initial, birth_date: initial.birth_date || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const isSelf = !isNew && initial.id === me.id;

  const onRrnBlur = (e) => {
    const n = normalizeRrn(e.target.value);
    setF((s) => {
      const patch = { rrn: n || '' };
      if (n && !s.birth_date) { const b = birthFromRrn(n); if (b) patch.birth_date = b; }
      return { ...s, ...patch };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const name = (f.name || '').trim();
    if (!name) { setError('이름을 입력하세요.'); return; }
    const rrn = normalizeRrn(f.rrn);
    if (rrn && !isValidRrn(rrn)) { setError('주민등록번호 형식이 올바르지 않습니다 (000000-0000000).'); return; }
    if (isSelf && (f.role !== me.role || !f.active)) { setError('본인의 역할/활성 상태는 바꿀 수 없습니다.'); return; }
    const payload = {
      id: initial.id, name, role: f.role, degree: f.degree || null,
      student_no: (f.student_no || '').trim() || null,
      admission_term: (f.admission_term || '').trim() || null,
      birth_date: f.birth_date || null,
      researcher_no: (f.researcher_no || '').trim() || null,
      phone: normalizePhone(f.phone), bank_account: (f.bank_account || '').trim() || null, rrn,
      is_bk: !!f.is_bk, email: (f.email || '').trim() || null, active: !!f.active,
      note: (f.note || '').trim() || null, sort_order: Number(f.sort_order) || 0,
    };
    setBusy(true);
    try { await saveMember(payload); toast(isNew ? '추가됨' : '저장됨'); onSaved(); }
    catch (e2) {
      const m = errMsg(e2);
      setError(/members_student_no_idx/.test(m) ? '같은 학번이 이미 있습니다.' : /members_email_key/.test(m) ? '같은 이메일이 이미 있습니다.' : m);
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!Confirm(`"${initial.name}" 을(를) 삭제할까요?\n이 구성원의 인건비 배분·기준 금액도 모두 삭제됩니다. (보통은 '활성' 을 끄는 것을 권장)`)) return;
    setBusy(true);
    try { await deleteMember(initial.id); toast('삭제됨'); onSaved(); }
    catch (e2) { setError(errMsg(e2)); setBusy(false); }
  };

  return html`<${Modal} title=${isNew ? '구성원 추가' : `구성원 수정 — ${initial.name}`} onClose=${onClose} wide=${true}>
    <form class="member-form" onSubmit=${submit}>
      ${error && html`<div class="error-box">${error}</div>`}
      <div class="form-grid">
        <label>이름 *<input class="text" value=${f.name} onInput=${set('name')} required autofocus /></label>
        <label>학위종류
          <select class="select" value=${f.degree || ''} onChange=${set('degree')}>
            <option value="">(선택)</option>
            ${DEGREES.map((d) => html`<option value=${d}>${d}</option>`)}
          </select>
        </label>
        <label>학번<input class="text" value=${f.student_no} onInput=${set('student_no')} placeholder="예: 2026123456" /></label>
        <label>입학학기<input class="text" value=${f.admission_term} onInput=${set('admission_term')} placeholder="예: 2026-1" list="term-list" /></label>
        <datalist id="term-list">${termOptions().map((t) => html`<option value=${t} />`)}</datalist>
        <label>생년월일<input class="text" type="date" value=${f.birth_date} onInput=${set('birth_date')} /></label>
        <label>연구자번호<input class="text" value=${f.researcher_no} onInput=${set('researcher_no')} placeholder="NRF/KRI 연구자번호" /></label>
        <label>연락처<input class="text" value=${f.phone} onInput=${set('phone')} placeholder="010-0000-0000" inputMode="tel" /></label>
        <label>계좌번호<input class="text sensitive" value=${f.bank_account} onInput=${set('bank_account')} placeholder="은행명 000-0000-0000" autocomplete="off" /></label>
        <label>주민등록번호<input class="text sensitive" value=${f.rrn} onInput=${set('rrn')} onBlur=${onRrnBlur} placeholder="000000-0000000" inputMode="numeric" autocomplete="off" /></label>
        <label class="check"><input type="checkbox" checked=${f.is_bk} onChange=${set('is_bk')} /> BK 참여</label>
        <label>역할
          <select class="select" value=${f.role} onChange=${set('role')} disabled=${isSelf}>
            ${ROLES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}
          </select>
        </label>
        <label>로그인 이메일 <span class="muted">(교수/행정조교만 필요)</span><input class="text" type="email" value=${f.email} onInput=${set('email')} placeholder="이름@khu.ac.kr" /></label>
        <label>정렬 순서<input class="text" type="number" value=${f.sort_order} onInput=${set('sort_order')} /></label>
        <label class="check"><input type="checkbox" checked=${f.active} onChange=${set('active')} disabled=${isSelf} /> 활성 (재학/재직 중)</label>
        <label class="wide">비고<input class="text" value=${f.note} onInput=${set('note')} placeholder="메모" /></label>
      </div>
      <div class="form-actions">
        <button class="btn primary" disabled=${busy}>${isNew ? '추가' : '저장'}</button>
        <button type="button" class="btn ghost" onClick=${onClose}>취소</button>
        <div class="spacer"></div>
        ${!isNew && !isSelf && html`<button type="button" class="btn ghost danger" disabled=${busy} onClick=${remove}>삭제</button>`}
      </div>
    </form>
  </${Modal}>`;
}

function termOptions() {
  const y = new Date().getFullYear();
  const out = [];
  for (let yy = y + 1; yy >= y - 8; yy--) { out.push(`${yy}-1`); out.push(`${yy}-2`); }
  return out;
}
