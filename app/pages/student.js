import { html } from 'htm/preact';
import { useState, useMemo } from 'preact/hooks';
import { listMyAllocations, listTargets, listAllocationYears } from '../api.js';
import { useAsync, fmtWon, thisYear, sum, cls } from '../util.js';
import { Spinner, ErrorBox, YearSelect, Card, Empty } from '../ui.js';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function StudentPage({ me }) {
  const [year, setYear] = useState(thisYear());
  const years = useAsync(() => listAllocationYears(me.id), [me.id]);
  const data = useAsync(async () => {
    const [allocs, targets] = await Promise.all([listMyAllocations(me.id, year), listTargets({ year, memberId: me.id })]);
    return { allocs, targets };
  }, [me.id, year]);

  const view = useMemo(() => {
    if (!data.data) return null;
    const { allocs, targets } = data.data;
    const projMap = new Map();
    for (const a of allocs) {
      if (!projMap.has(a.project_id)) projMap.set(a.project_id, { id: a.project_id, name: a.projects?.name || '?', pi: a.projects?.pi_name || '', total: 0 });
      projMap.get(a.project_id).total += Number(a.amount) || 0;
    }
    const projects = [...projMap.values()].sort((a, b) => b.total - a.total);
    const cell = new Map(allocs.map((a) => [`${a.project_id}:${a.month}`, Number(a.amount) || 0]));
    const target = new Map(targets.map((t) => [t.month, Number(t.amount) || 0]));
    const monthTotal = (m) => sum(projects, (p) => cell.get(`${p.id}:${m}`) || 0);
    const total = sum(MONTHS, monthTotal);
    const targetTotal = sum(MONTHS, (m) => target.get(m) || 0);
    const now = new Date();
    const paidSoFar = sum(MONTHS.filter((m) => year < now.getFullYear() || (year === now.getFullYear() && m <= now.getMonth() + 1)), monthTotal);
    return { projects, cell, target, monthTotal, total, targetTotal, paidSoFar, hasTarget: targets.length > 0 };
  }, [data.data, year]);

  return html`<div class="page">
    <div class="page-head">
      <h1>내 인건비 <span class="muted">${me.name}${me.position ? ` · ${me.position}` : ''}${me.is_bk ? ' · BK' : ''}</span></h1>
      <${YearSelect} year=${year} years=${years.data || []} onChange=${setYear} />
    </div>
    <${ErrorBox} error=${data.error} onRetry=${data.reload} />
    ${data.loading && html`<${Spinner} />`}
    ${view && (view.projects.length === 0 ? html`<${Empty} text=${`${year}년 인건비 배분 내역이 없습니다.`} />` : html`
      <div class="cards">
        <${Card} label=${`${year}년 배분 합계`} value=${fmtWon(view.total)} sub=${`과제 ${view.projects.length}개`} />
        <${Card} label="이번 달까지 누적" value=${fmtWon(view.paidSoFar)} />
        ${view.hasTarget && html`<${Card} label="기준 합계" value=${fmtWon(view.targetTotal)} sub=${`차이 ${fmtWon(view.total - view.targetTotal)}`} tone=${view.total - view.targetTotal < 0 ? 'warn' : ''} />`}
      </div>

      <h2>월별 · 과제별</h2>
      <div class="table-wrap">
        <table class="grid">
          <thead><tr>
            <th class="sticky">월</th>
            ${view.projects.map((p) => html`<th key=${p.id}>${p.name}<div class="muted small">${p.pi}</div></th>`)}
            <th class="total-col">합계</th>
            ${view.hasTarget && html`<th>기준</th><th>차이</th>`}
          </tr></thead>
          <tbody>
            ${MONTHS.map((m) => {
              const t = view.monthTotal(m);
              const tg = view.target.get(m);
              return html`<tr key=${m}>
                <th class="sticky">${m}월</th>
                ${view.projects.map((p) => { const v = view.cell.get(`${p.id}:${m}`); return html`<td class="num">${v ? fmtWon(v) : ''}</td>`; })}
                <td class="num total-col">${t ? fmtWon(t) : ''}</td>
                ${view.hasTarget && html`<td class="num muted">${tg ? fmtWon(tg) : ''}</td>
                  <td class=${cls('num', tg && t - tg < 0 && 'neg')}>${tg ? fmtWon(t - tg) : ''}</td>`}
              </tr>`;
            })}
          </tbody>
          <tfoot><tr>
            <th class="sticky">합계</th>
            ${view.projects.map((p) => html`<td class="num">${fmtWon(p.total)}</td>`)}
            <td class="num total-col">${fmtWon(view.total)}</td>
            ${view.hasTarget && html`<td class="num muted">${fmtWon(view.targetTotal)}</td><td class=${cls('num', view.total - view.targetTotal < 0 && 'neg')}>${fmtWon(view.total - view.targetTotal)}</td>`}
          </tr></tfoot>
        </table>
      </div>

      <h2>과제별 연간 합계</h2>
      <div class="table-wrap narrow">
        <table class="grid">
          <thead><tr><th>과제</th><th>책임교수</th><th>합계</th><th>비중</th></tr></thead>
          <tbody>${view.projects.map((p) => html`<tr key=${p.id}><td>${p.name}</td><td>${p.pi}</td><td class="num">${fmtWon(p.total)}</td><td class="num">${(p.total / view.total * 100).toFixed(1)}%</td></tr>`)}</tbody>
        </table>
      </div>
      <p class="muted small">금액은 과제 배분 계획 기준이며, 실제 지급액·세금 등은 학교 지급 내역을 확인하세요. 문의는 행정조교 선생님께.</p>
    `)}
  </div>`;
}
