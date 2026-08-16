import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { listProjects, saveProject, saveProjectYear, deleteProject } from '../api.js';
import { useAsync, errMsg, toast, thisYear, cls } from '../util.js';
import { Spinner, ErrorBox, TextCell, Confirm } from '../ui.js';

export function ProjectsPage() {
  const q = useAsync(() => listProjects(), []);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [np, setNp] = useState({ code: '', name: '', pi_name: '', agency_contact: '' });
  const [addingYearFor, setAddingYearFor] = useState(null);
  const [ny, setNy] = useState({ year_no: 1, label: '', period_start: `${thisYear()}-01-01`, period_end: `${thisYear()}-12-31`, is_current: true });

  const update = async (row, patch) => {
    try { await saveProject({ id: row.id, ...patch }); q.reload(); toast('저장됨'); }
    catch (e) { toast('저장 실패: ' + errMsg(e), 'error'); }
  };
  const addProject = async (e) => {
    e.preventDefault();
    if (!np.code || !np.name) return;
    try {
      const maxOrder = Math.max(0, ...(q.data || []).map((p) => p.sort_order || 0));
      await saveProject({ ...np, code: np.code.trim().toLowerCase(), sort_order: maxOrder + 10, active: true });
      setNp({ code: '', name: '', pi_name: '', agency_contact: '' }); setAdding(false); q.reload(); toast('과제 추가됨');
    } catch (e2) { toast('추가 실패: ' + errMsg(e2), 'error'); }
  };
  const addYear = async (e, project) => {
    e.preventDefault();
    try {
      const py = await saveProjectYear({ project_id: project.id, year_no: Number(ny.year_no), label: ny.label || `${ny.year_no}차년도`,
        period_start: ny.period_start || null, period_end: ny.period_end || null, is_current: !!ny.is_current });
      setAddingYearFor(null); q.reload(); toast('연차 추가됨');
      location.hash = '/projects/' + py.id;
    } catch (e2) { toast('추가 실패: ' + errMsg(e2), 'error'); }
  };
  const remove = async (p) => {
    if (!Confirm(`과제 "${p.name}" 을(를) 삭제할까요?\n연차·예산·원장·인건비 배분이 모두 함께 삭제됩니다.`)) return;
    try { await deleteProject(p.id); q.reload(); toast('삭제됨'); }
    catch (e) { toast('삭제 실패: ' + errMsg(e), 'error'); }
  };

  const projects = (q.data || []).filter((p) => showInactive || p.active);

  return html`<div class="page">
    <div class="page-head">
      <h1>과제 · 집행</h1>
      <label class="inline"><input type="checkbox" checked=${showInactive} onChange=${(e) => setShowInactive(e.target.checked)} /> 종료 과제 포함</label>
      <button class="btn" onClick=${() => setAdding((v) => !v)}>+ 과제 추가</button>
    </div>
    ${adding && html`<form class="form-row" onSubmit=${addProject}>
      <input class="text" placeholder="코드 (영문, 예: kist)" value=${np.code} onInput=${(e) => setNp({ ...np, code: e.target.value })} required />
      <input class="text" placeholder="과제명" value=${np.name} onInput=${(e) => setNp({ ...np, name: e.target.value })} required />
      <input class="text" placeholder="책임교수" value=${np.pi_name} onInput=${(e) => setNp({ ...np, pi_name: e.target.value })} />
      <input class="text" placeholder="담당 선생님" value=${np.agency_contact} onInput=${(e) => setNp({ ...np, agency_contact: e.target.value })} />
      <button class="btn primary">추가</button>
      <button type="button" class="btn ghost" onClick=${() => setAdding(false)}>취소</button>
    </form>`}
    <${ErrorBox} error=${q.error} onRetry=${q.reload} />
    ${q.loading && html`<${Spinner} />`}
    ${q.data && html`<div class="table-wrap">
      <table class="grid projects">
        <thead><tr><th>순서</th><th>코드</th><th>과제명</th><th>책임교수</th><th>담당 선생님</th><th>연차 (클릭하여 예산·원장 편집)</th><th>진행</th><th></th></tr></thead>
        <tbody>
          ${projects.map((p) => html`<tr key=${p.id} class=${cls(!p.active && 'inactive')}>
            <td style="width:4rem"><${TextCell} type="number" value=${p.sort_order} onCommit=${(v) => update(p, { sort_order: Number(v) || 0 })} /></td>
            <td class="mono">${p.code}</td>
            <td><${TextCell} value=${p.name} onCommit=${(v) => update(p, { name: v })} /></td>
            <td><${TextCell} value=${p.pi_name} onCommit=${(v) => update(p, { pi_name: v || null })} /></td>
            <td><${TextCell} value=${p.agency_contact} onCommit=${(v) => update(p, { agency_contact: v || null })} /></td>
            <td class="years">
              ${[...(p.project_years || [])].sort((a, b) => a.year_no - b.year_no).map((y) => html`
                <a key=${y.id} class=${cls('chip', y.is_current && 'cur')} href=${'#/projects/' + y.id} title=${`${y.period_start || '?'} ~ ${y.period_end || '?'}`}>${y.label || y.year_no + '차'}</a>`)}
              <button class="btn tiny ghost" onClick=${() => { setAddingYearFor(addingYearFor === p.id ? null : p.id); setNy({ ...ny, year_no: Math.max(0, ...(p.project_years || []).map((y) => y.year_no)) + 1 }); }}>+ 연차</button>
              ${addingYearFor === p.id && html`<form class="form-row inline-form" onSubmit=${(e) => addYear(e, p)}>
                <input class="text short" type="number" min="1" value=${ny.year_no} onInput=${(e) => setNy({ ...ny, year_no: e.target.value })} title="연차" />
                <input class="text" placeholder="표시명 (예: 2차년도)" value=${ny.label} onInput=${(e) => setNy({ ...ny, label: e.target.value })} />
                <input class="text" type="date" value=${ny.period_start} onInput=${(e) => setNy({ ...ny, period_start: e.target.value })} title="기간 시작" />
                <input class="text" type="date" value=${ny.period_end} onInput=${(e) => setNy({ ...ny, period_end: e.target.value })} title="기간 끝" />
                <label class="inline small"><input type="checkbox" checked=${ny.is_current} onChange=${(e) => setNy({ ...ny, is_current: e.target.checked })} /> 현재</label>
                <button class="btn small primary">추가</button>
                <button type="button" class="btn small ghost" onClick=${() => setAddingYearFor(null)}>취소</button>
              </form>`}
            </td>
            <td><label class="inline small"><input type="checkbox" checked=${p.active} onChange=${(e) => update(p, { active: e.target.checked })} /> ${p.active ? '진행' : '종료'}</label></td>
            <td><button class="btn tiny danger ghost" onClick=${() => remove(p)} title="과제 삭제">삭제</button></td>
          </tr>`)}
        </tbody>
      </table>
    </div>`}
    <p class="muted small">연차의 <b>기간</b>(시작~끝)에 해당하는 달의 학생 인건비 배분이 그 연차의 '학생인건비 사용'으로 자동 집계됩니다. 기간이 비어 있으면 집계되지 않습니다.</p>
  </div>`;
}
