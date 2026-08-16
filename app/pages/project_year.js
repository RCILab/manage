import { html } from 'htm/preact';
import { useState, useMemo } from 'preact/hooks';
import {
  getProjectYear, saveProjectYear, deleteProjectYear, listYearStatus, listCategories, addCategory,
  upsertBudgetLine, deleteBudgetLine, listLedger, saveLedger, deleteLedger,
} from '../api.js';
import { useAsync, fmtWon, pct, sum, errMsg, toast, today, cls, groupBy } from '../util.js';
import { Spinner, ErrorBox, MoneyCell, TextCell, Select, Confirm } from '../ui.js';

const STUDENT_PAY = '학생인건비';

export function ProjectYearPage({ id, me }) {
  const q = useAsync(async () => {
    const [py, status, cats, ledger] = await Promise.all([getProjectYear(id), listYearStatus(id), listCategories(), listLedger(id)]);
    return { py, status, cats, ledger };
  }, [id]);
  const reloadStatus = q.reload;

  if (q.error) return html`<div class="page"><${ErrorBox} error=${q.error} onRetry=${q.reload} /></div>`;
  if (!q.data) return html`<${Spinner} />`;
  const { py, status, cats, ledger } = q.data;
  const p = py.projects;

  const savePy = async (patch) => {
    try { await saveProjectYear({ id: py.id, ...patch }); reloadStatus(); toast('저장됨'); }
    catch (e) { toast('저장 실패: ' + errMsg(e), 'error'); }
  };
  const removeYear = async () => {
    if (!Confirm(`"${p.name} ${py.label || py.year_no + '차'}" 연차를 삭제할까요?\n이 연차의 비목 예산과 원장이 함께 삭제됩니다. (인건비 배분은 유지)`)) return;
    try { await deleteProjectYear(py.id); toast('삭제됨'); location.hash = '/projects'; }
    catch (e) { toast('삭제 실패: ' + errMsg(e), 'error'); }
  };

  return html`<div class="page">
    <div class="crumbs"><a href="#/projects">과제·집행</a> › ${p.name}</div>
    <div class="page-head">
      <h1>${p.name} <span class="muted">${py.label || py.year_no + '차년도'}</span>
        ${py.is_current && html` <span class="tag cur">현재</span>`}${!p.active && html` <span class="tag">종료</span>`}</h1>
    </div>

    <${YearHeader} py=${py} p=${p} onSave=${savePy} onDelete=${removeYear} />

    <${BudgetTable} py=${py} status=${status} cats=${cats} onChanged=${reloadStatus} />

    <${LedgerTable} py=${py} cats=${cats} ledger=${ledger} me=${me} onChanged=${reloadStatus} />
  </div>`;
}

function YearHeader({ py, p, onSave, onDelete }) {
  return html`<div class="panel">
    <div class="kv-grid">
      <label>책임교수 <span>${p.pi_name || '–'}</span></label>
      <label>담당 선생님 <span>${p.agency_contact || '–'}</span></label>
      <label>표시명 <${TextCell} value=${py.label} onCommit=${(v) => onSave({ label: v || null })} /></label>
      <label>연차 <${TextCell} type="number" value=${py.year_no} onCommit=${(v) => onSave({ year_no: Number(v) || py.year_no })} /></label>
      <label>기간 시작 <${TextCell} type="date" value=${py.period_start} onCommit=${(v) => onSave({ period_start: v || null })} /></label>
      <label>기간 끝 <${TextCell} type="date" value=${py.period_end} onCommit=${(v) => onSave({ period_end: v || null })} /></label>
      <label>현재 연차 <input type="checkbox" checked=${py.is_current} onChange=${(e) => onSave({ is_current: e.target.checked })} /></label>
      <label>계획 직접비 <${MoneyCell} value=${py.plan_direct} onCommit=${(v) => onSave({ plan_direct: v })} /></label>
      <label>계획 간접비 <${MoneyCell} value=${py.plan_indirect} onCommit=${(v) => onSave({ plan_indirect: v })} /></label>
      <label>계획 총액 <${MoneyCell} value=${py.plan_total} onCommit=${(v) => onSave({ plan_total: v })} /></label>
      <label class="wide">메모 <${TextCell} value=${py.note} onCommit=${(v) => onSave({ note: v || null })} placeholder="메모" /></label>
    </div>
    <div class="row-end"><button class="btn tiny danger ghost" onClick=${onDelete}>연차 삭제</button></div>
    <p class="muted small">기간(시작~끝) 안의 달에 배분된 학생 인건비가 아래 '학생인건비' 사용액으로 자동 집계됩니다.</p>
  </div>`;
}

function BudgetTable({ py, status, cats, onChanged }) {
  const [addCat, setAddCat] = useState('');
  const [newCat, setNewCat] = useState({ name: '', parent: '' });
  const catByName = useMemo(() => new Map(cats.map((c) => [c.name, c])), [cats]);
  const present = new Set(status.map((s) => s.category));
  const groups = useMemo(() => {
    const rows = [...status].sort((a, b) => (a.sort_order - b.sort_order) || a.category.localeCompare(b.category));
    return groupBy(rows, (s) => s.parent || s.category);
  }, [status]);
  const parents = useMemo(() => [...new Set(cats.map((c) => c.parent).filter(Boolean))], [cats]);
  const totals = {
    planned: sum(status, (s) => s.planned), carryover: sum(status, (s) => s.carryover),
    spent: sum(status, (s) => s.spent), remaining: sum(status, (s) => s.remaining),
  };

  const setLine = async (s, patch) => {
    try {
      await upsertBudgetLine(py.id, s.category, patch.planned ?? s.planned, patch.carryover ?? s.carryover);
      onChanged(); toast('저장됨');
    } catch (e) { toast('저장 실패: ' + errMsg(e), 'error'); }
  };
  const addLine = async () => {
    if (!addCat) return;
    try { await upsertBudgetLine(py.id, addCat, 0, 0); setAddCat(''); onChanged(); }
    catch (e) { toast('추가 실패: ' + errMsg(e), 'error'); }
  };
  const createCat = async (e) => {
    e.preventDefault();
    if (!newCat.name.trim()) return;
    try {
      await addCategory(newCat.name.trim(), newCat.parent || null);
      await upsertBudgetLine(py.id, newCat.name.trim(), 0, 0);
      setNewCat({ name: '', parent: '' }); onChanged(); toast('비목 추가됨');
    } catch (e2) { toast('비목 추가 실패: ' + errMsg(e2), 'error'); }
  };
  const removeLine = async (s) => {
    if (Number(s.spent) && !Confirm(`"${s.category}" 예산 행을 삭제할까요? (원장 내역은 남고 예산만 0 이 됩니다)`)) return;
    try { await deleteBudgetLine(py.id, s.category); onChanged(); }
    catch (e) { toast('삭제 실패: ' + errMsg(e), 'error'); }
  };

  return html`<h2>비목별 예산 · 집행</h2>
  <div class="table-wrap">
    <table class="grid budget">
      <thead><tr><th class="sticky">비목</th><th>계획</th><th>이월</th><th>사용</th><th>잔액</th><th>사용율</th><th></th></tr></thead>
      <tbody>
        ${[...groups.entries()].map(([g, rows]) => html`
          ${(rows.length > 1 || rows[0].category !== g) && html`<tr class="group"><th class="sticky" colspan="7">${g}</th></tr>`}
          ${rows.map((s) => {
            const isPay = s.category === STUDENT_PAY;
            const budget = Number(s.planned) + Number(s.carryover);
            return html`<tr key=${s.category}>
              <th class=${cls('sticky', rows.length > 1 && 'indent')}>${s.category}${isPay ? html` <span class="muted small">(배분 자동집계)</span>` : ''}</th>
              <td><${MoneyCell} value=${s.planned} onCommit=${(v) => setLine(s, { planned: v || 0 })} /></td>
              <td><${MoneyCell} value=${s.carryover} onCommit=${(v) => setLine(s, { carryover: v || 0 })} /></td>
              <td class="num">${fmtWon(s.spent)}</td>
              <td class=${cls('num', Number(s.remaining) < 0 && 'neg')}>${fmtWon(s.remaining)}</td>
              <td class="num muted">${budget ? pct(s.spent, budget) : ''}</td>
              <td>${!isPay && html`<button class="btn tiny ghost" title="예산 행 삭제" onClick=${() => removeLine(s)}>×</button>`}</td>
            </tr>`;
          })}
        `)}
      </tbody>
      <tfoot><tr>
        <th class="sticky">총계</th>
        <td class="num">${fmtWon(totals.planned)}</td><td class="num">${fmtWon(totals.carryover)}</td>
        <td class="num">${fmtWon(totals.spent)}</td><td class=${cls('num', totals.remaining < 0 && 'neg')}>${fmtWon(totals.remaining)}</td>
        <td class="num">${pct(totals.spent, totals.planned + totals.carryover)}</td><td></td>
      </tr></tfoot>
    </table>
  </div>
  <div class="form-row">
    <${Select} value=${addCat} placeholder="비목 추가…" onChange=${setAddCat}
      options=${cats.filter((c) => !present.has(c.name)).map((c) => ({ value: c.name, label: (c.parent ? c.parent + ' › ' : '') + c.name }))} />
    <button class="btn small" disabled=${!addCat} onClick=${addLine}>추가</button>
    <span class="muted small">| 새 비목 만들기:</span>
    <form class="inline-form" onSubmit=${createCat}>
      <input class="text" placeholder="비목명" value=${newCat.name} onInput=${(e) => setNewCat({ ...newCat, name: e.target.value })} />
      <input class="text" list="parent-list" placeholder="상위 그룹 (선택)" value=${newCat.parent} onInput=${(e) => setNewCat({ ...newCat, parent: e.target.value })} />
      <datalist id="parent-list">${parents.map((x) => html`<option value=${x} />`)}</datalist>
      <button class="btn small">만들기</button>
    </form>
  </div>`;
}

function LedgerTable({ py, cats, ledger, me, onChanged }) {
  const [draft, setDraft] = useState({ spent_on: today(), category: '', amount: null, memo: '' });
  const [filter, setFilter] = useState('');
  const catOptions = useMemo(() => cats.map((c) => ({ value: c.name, label: c.name })), [cats]);
  const rows = ledger.filter((r) => !filter || (r.category || '').includes(filter) || (r.memo || '').includes(filter));
  const total = sum(rows, (r) => r.amount);

  const update = async (r, patch) => {
    try { await saveLedger({ id: r.id, ...patch }); onChanged(); toast('저장됨'); }
    catch (e) { toast('저장 실패: ' + errMsg(e), 'error'); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (!draft.amount) { toast('금액을 입력하세요', 'error'); return; }
    if (!draft.category) { toast('비목을 선택하세요', 'error'); return; }
    try {
      await saveLedger({ project_year_id: py.id, spent_on: draft.spent_on || null, category: draft.category, amount: draft.amount, memo: draft.memo || null, created_by: me?.email || null });
      setDraft({ ...draft, amount: null, memo: '' });
      onChanged(); toast('추가됨');
    } catch (e2) { toast('추가 실패: ' + errMsg(e2), 'error'); }
  };
  const remove = async (r) => {
    if (!Confirm(`${r.spent_on || ''} ${r.category || ''} ${fmtWon(r.amount)} 내역을 삭제할까요?`)) return;
    try { await deleteLedger(r.id); onChanged(); toast('삭제됨'); }
    catch (e) { toast('삭제 실패: ' + errMsg(e), 'error'); }
  };

  return html`<div class="page-head">
    <h2>집행 원장 <span class="muted">${ledger.length}건</span></h2>
    <input class="text" placeholder="비목/비고 검색" value=${filter} onInput=${(e) => setFilter(e.target.value)} />
  </div>
  <div class="table-wrap">
    <table class="grid ledger">
      <thead><tr><th>#</th><th>사용일자</th><th>비목</th><th>사용금액</th><th>비고</th><th></th></tr></thead>
      <tbody>
        ${rows.map((r, i) => html`<tr key=${r.id}>
          <td class="muted">${i + 1}</td>
          <td><${TextCell} type="date" value=${r.spent_on} onCommit=${(v) => update(r, { spent_on: v || null })} /></td>
          <td><${Select} value=${r.category} options=${catOptions} placeholder="(비목)" onChange=${(v) => update(r, { category: v || null })} /></td>
          <td><${MoneyCell} value=${r.amount} onCommit=${(v) => update(r, { amount: v || 0 })} /></td>
          <td><${TextCell} value=${r.memo} onCommit=${(v) => update(r, { memo: v || null })} className="wide" /></td>
          <td><button class="btn tiny ghost danger" onClick=${() => remove(r)}>삭제</button></td>
        </tr>`)}
        <tr class="draft">
          <td class="muted">+</td>
          <td><input class="text" type="date" value=${draft.spent_on} onInput=${(e) => setDraft({ ...draft, spent_on: e.target.value })} /></td>
          <td><${Select} value=${draft.category} options=${catOptions} placeholder="비목 선택" onChange=${(v) => setDraft({ ...draft, category: v })} /></td>
          <td><${MoneyCell} value=${draft.amount} onCommit=${(v) => setDraft({ ...draft, amount: v })} placeholder="금액" /></td>
          <td><input class="text wide" placeholder="비고 (내역, 사용자 등)" value=${draft.memo} onInput=${(e) => setDraft({ ...draft, memo: e.target.value })} onKeyDown=${(e) => { if (e.key === 'Enter') add(e); }} /></td>
          <td><button class="btn small primary" onClick=${add}>추가</button></td>
        </tr>
      </tbody>
      <tfoot><tr><th></th><th>합계</th><td></td><td class="num">${fmtWon(total)}</td><td colspan="2"></td></tr></tfoot>
    </table>
  </div>`;
}
