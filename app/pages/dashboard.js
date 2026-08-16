import { html } from 'htm/preact';
import { useState, useMemo } from 'preact/hooks';
import { listProjectYears, listYearTotals, listStudentPayStatus, listAllocationYearTotals, listProjects, listAllocationYears } from '../api.js';
import { useAsync, fmtWon, pct, sum, thisYear, cls } from '../util.js';
import { Spinner, ErrorBox, Card, YearSelect } from '../ui.js';

export function DashboardPage() {
  const [onlyCurrent, setOnlyCurrent] = useState(true);
  const [year, setYear] = useState(thisYear());
  const years = useAsync(() => listAllocationYears(), []);
  const q = useAsync(async () => {
    const [pys, totals, pay, projects] = await Promise.all([listProjectYears(), listYearTotals(), listStudentPayStatus(), listProjects()]);
    return { pys, totals, pay, projects };
  }, []);
  const allocQ = useAsync(() => listAllocationYearTotals(year), [year]);

  const rows = useMemo(() => {
    if (!q.data) return [];
    const tot = new Map(q.data.totals.map((t) => [t.project_year_id, t]));
    const pay = new Map(q.data.pay.map((p) => [p.project_year_id, Number(p.spent) || 0]));
    return q.data.pys
      .filter((py) => !onlyCurrent || py.is_current)
      .map((py) => ({ py, p: py.projects, t: tot.get(py.id) || {}, pay: pay.get(py.id) || 0 }))
      .sort((a, b) => (a.p.sort_order - b.p.sort_order) || a.p.name.localeCompare(b.p.name) || (a.py.year_no - b.py.year_no));
  }, [q.data, onlyCurrent]);

  const grand = useMemo(() => ({
    planned: sum(rows, (r) => r.t.planned), carryover: sum(rows, (r) => r.t.carryover),
    spent: sum(rows, (r) => r.t.spent), remaining: sum(rows, (r) => r.t.remaining), pay: sum(rows, (r) => r.pay),
  }), [rows]);

  const allocByProject = useMemo(() => {
    if (!allocQ.data || !q.data) return [];
    const byId = new Map();
    for (const a of allocQ.data) byId.set(a.project_id, (byId.get(a.project_id) || 0) + Number(a.total));
    return q.data.projects
      .map((p) => ({ p, total: byId.get(p.id) || 0 }))
      .filter((x) => x.total)
      .sort((a, b) => a.p.sort_order - b.p.sort_order);
  }, [allocQ.data, q.data]);
  const allocTotal = sum(allocByProject, (x) => x.total);

  return html`<div class="page">
    <div class="page-head">
      <h1>대시보드</h1>
      <label class="inline"><input type="checkbox" checked=${onlyCurrent} onChange=${(e) => setOnlyCurrent(e.target.checked)} /> 현재 연차만</label>
    </div>
    <${ErrorBox} error=${q.error} onRetry=${q.reload} />
    ${q.loading && html`<${Spinner} />`}
    ${q.data && html`
      <div class="cards">
        <${Card} label="예산 (계획+이월)" value=${fmtWon(grand.planned + grand.carryover)} sub=${`과제·연차 ${rows.length}개`} />
        <${Card} label="집행" value=${fmtWon(grand.spent)} sub=${`사용율 ${pct(grand.spent, grand.planned + grand.carryover)}`} />
        <${Card} label="잔액" value=${fmtWon(grand.remaining)} tone=${grand.remaining < 0 ? 'warn' : ''} />
        <${Card} label="학생인건비 (기간 내 배분)" value=${fmtWon(grand.pay)} />
      </div>
      <div class="table-wrap">
        <table class="grid">
          <thead><tr>
            <th class="sticky">과제</th><th>책임</th><th>연차</th><th>기간</th>
            <th>계획</th><th>이월</th><th>집행</th><th>잔액</th><th>사용율</th><th>학생인건비</th>
          </tr></thead>
          <tbody>
            ${rows.map(({ py, p, t, pay }) => html`<tr key=${py.id} class=${cls(!p.active && 'inactive')} onClick=${() => { location.hash = '/projects/' + py.id; }}>
              <td class="sticky link">${p.name}${!p.active ? html` <span class="tag">종료</span>` : ''}</td>
              <td>${p.pi_name || ''}</td>
              <td>${py.label || py.year_no + '차'}${py.is_current ? html` <span class="tag cur">현재</span>` : ''}</td>
              <td class="muted small">${py.period_start || '?'} ~ ${py.period_end || '?'}</td>
              <td class="num">${fmtWon(t.planned)}</td>
              <td class="num">${fmtWon(t.carryover)}</td>
              <td class="num">${fmtWon(t.spent)}</td>
              <td class=${cls('num', Number(t.remaining) < 0 && 'neg')}>${fmtWon(t.remaining)}</td>
              <td class="num">${t.usage_pct != null ? Number(t.usage_pct).toFixed(1) + '%' : '–'}</td>
              <td class="num">${fmtWon(pay)}</td>
            </tr>`)}
          </tbody>
          <tfoot><tr>
            <th class="sticky">합계</th><td></td><td></td><td></td>
            <td class="num">${fmtWon(grand.planned)}</td><td class="num">${fmtWon(grand.carryover)}</td>
            <td class="num">${fmtWon(grand.spent)}</td><td class=${cls('num', grand.remaining < 0 && 'neg')}>${fmtWon(grand.remaining)}</td>
            <td class="num">${pct(grand.spent, grand.planned + grand.carryover)}</td><td class="num">${fmtWon(grand.pay)}</td>
          </tr></tfoot>
        </table>
      </div>

      <div class="page-head">
        <h2>과제별 학생 인건비 배분 합계</h2>
        <${YearSelect} year=${year} years=${years.data || []} onChange=${setYear} />
      </div>
      <${ErrorBox} error=${allocQ.error} onRetry=${allocQ.reload} />
      <div class="table-wrap narrow">
        <table class="grid">
          <thead><tr><th>과제</th><th>책임</th><th>${year}년 배분</th><th>비중</th></tr></thead>
          <tbody>${allocByProject.map(({ p, total }) => html`<tr key=${p.id}><td>${p.name}</td><td>${p.pi_name || ''}</td><td class="num">${fmtWon(total)}</td><td class="num">${pct(total, allocTotal)}</td></tr>`)}</tbody>
          <tfoot><tr><th>합계</th><td></td><td class="num">${fmtWon(allocTotal)}</td><td></td></tr></tfoot>
        </table>
      </div>
    `}
  </div>`;
}
