import { html } from 'htm/preact';
import { useState, useMemo, useEffect } from 'preact/hooks';
import { listMembers, listProjects, listAllocations, setAllocation, listTargets, setTarget, listAllocationYears } from '../api.js';
import { useAsync, fmtWon, fmtNum, sum, thisYear, errMsg, toast, cls, downloadCsv } from '../util.js';
import { Spinner, ErrorBox, MoneyCell, Select, YearSelect } from '../ui.js';
import { memberSort } from './members.js';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const key = (m, p, mo) => `${m}:${p}:${mo}`;

export function AllocationsPage() {
  const [year, setYear] = useState(thisYear());
  const [mode, setMode] = useState('project');      // project | member | summary
  const [projectId, setProjectId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const years = useAsync(() => listAllocationYears(), []);
  const base = useAsync(async () => {
    const [members, projects] = await Promise.all([listMembers(), listProjects()]);
    return { members, projects };
  }, []);
  const yq = useAsync(async () => {
    const [allocs, targets] = await Promise.all([listAllocations({ year }), listTargets({ year })]);
    return { allocs, targets };
  }, [year]);

  // 로컬 상태 (낙관적 갱신)
  const [cells, setCells] = useState(new Map());
  const [tg, setTg] = useState(new Map());
  useEffect(() => {
    if (!yq.data) return;
    setCells(new Map(yq.data.allocs.map((a) => [key(a.member_id, a.project_id, a.month), Number(a.amount)])));
    setTg(new Map(yq.data.targets.map((t) => [`${t.member_id}:${t.month}`, Number(t.amount)])));
  }, [yq.data]);

  const members = useMemo(() => (base.data?.members || []).filter((m) => m.role === 'student' && (showInactive || m.active)).sort(memberSort), [base.data, showInactive]);
  const projects = useMemo(() => (base.data?.projects || []).filter((p) => showInactive || p.active), [base.data, showInactive]);
  const memberById = useMemo(() => new Map((base.data?.members || []).map((m) => [m.id, m])), [base.data]);
  const projectById = useMemo(() => new Map((base.data?.projects || []).map((p) => [p.id, p])), [base.data]);

  useEffect(() => { if (!projectId && projects.length) setProjectId(projects[0].id); }, [projects.length]);
  useEffect(() => { if (!memberId && members.length) setMemberId(members[0].id); }, [members.length]);

  const setCell = async (mId, pId, month, amount) => {
    const k = key(mId, pId, month);
    const prev = cells.get(k);
    setCells((c) => { const n = new Map(c); if (amount) n.set(k, amount); else n.delete(k); return n; });
    try { await setAllocation({ member_id: mId, project_id: pId, year, month, amount }); }
    catch (e) {
      toast('저장 실패: ' + errMsg(e), 'error');
      setCells((c) => { const n = new Map(c); if (prev) n.set(k, prev); else n.delete(k); return n; });
    }
  };
  const setTargetCell = async (mId, month, amount) => {
    const k = `${mId}:${month}`;
    const prev = tg.get(k);
    setTg((c) => { const n = new Map(c); if (amount) n.set(k, amount); else n.delete(k); return n; });
    try { await setTarget({ member_id: mId, year, month, amount }); }
    catch (e) {
      toast('저장 실패: ' + errMsg(e), 'error');
      setTg((c) => { const n = new Map(c); if (prev) n.set(k, prev); else n.delete(k); return n; });
    }
  };

  const loading = base.loading || yq.loading;
  const error = base.error || yq.error;

  return html`<div class="page wide">
    <div class="page-head">
      <h1>학생 인건비 배분</h1>
      <${YearSelect} year=${year} years=${years.data || []} onChange=${setYear} />
      <div class="seg">
        ${[['project', '과제별'], ['member', '학생별'], ['summary', '요약']].map(([v, l]) => html`<button class=${cls('seg-btn', mode === v && 'on')} onClick=${() => setMode(v)}>${l}</button>`)}
      </div>
      <label class="inline small"><input type="checkbox" checked=${showInactive} onChange=${(e) => setShowInactive(e.target.checked)} /> 비활성/종료 포함</label>
    </div>
    <${ErrorBox} error=${error} onRetry=${() => { base.reload(); yq.reload(); }} />
    ${loading && html`<${Spinner} />`}
    ${!loading && !error && base.data && html`
      ${mode === 'project' && html`<${ByProject} year=${year} projects=${projects} projectId=${projectId} setProjectId=${setProjectId}
          members=${members} cells=${cells} setCell=${setCell} tg=${tg} />`}
      ${mode === 'member' && html`<${ByMember} year=${year} members=${members} memberId=${memberId} setMemberId=${setMemberId}
          projects=${projects} cells=${cells} setCell=${setCell} tg=${tg} setTargetCell=${setTargetCell} />`}
      ${mode === 'summary' && html`<${Summary} year=${year} members=${members} projects=${projects} cells=${cells} tg=${tg} projectById=${projectById} memberById=${memberById} />`}
    `}
    <p class="muted small">셀을 클릭해 금액을 입력하고 Enter/Tab/↑↓ 로 이동합니다. 빈 값 또는 0 은 삭제됩니다. 변경은 즉시 저장됩니다.</p>
  </div>`;
}

function ByProject({ year, projects, projectId, setProjectId, members, cells, setCell, tg }) {
  const p = projects.find((x) => x.id === projectId);
  const rowTotal = (m) => sum(MONTHS, (mo) => cells.get(key(m.id, projectId, mo)) || 0);
  const colTotal = (mo) => sum(members, (m) => cells.get(key(m.id, projectId, mo)) || 0);
  const grand = sum(MONTHS, colTotal);
  // 학생 × 월 전체 배분 합 (모든 과제) — 기준 대비 색 표시용
  const mm = useMemo(() => {
    const t = new Map();
    for (const [k, v] of cells) { const [mid, , mo] = k.split(':'); const kk = `${mid}:${mo}`; t.set(kk, (t.get(kk) || 0) + v); }
    return t;
  }, [cells]);
  const memberAll = (m, mo) => mm.get(`${m.id}:${mo}`) || 0;
  return html`
    <div class="toolbar">
      <${Select} value=${projectId} onChange=${setProjectId} options=${projects.map((x) => ({ value: x.id, label: `${x.name}${x.pi_name ? ' (' + x.pi_name + ')' : ''}` }))} />
      ${p && html`<span class="muted">${year}년 합계 <b>${fmtWon(grand)}</b></span>`}
    </div>
    <div class="table-wrap">
      <table class="grid alloc">
        <thead><tr><th class="sticky">학생</th>${MONTHS.map((mo) => html`<th key=${mo}>${mo}월</th>`)}<th class="total-col">합계</th></tr></thead>
        <tbody>
          ${members.map((m) => html`<tr key=${m.id} class=${cls(!m.active && 'inactive')}>
            <th class="sticky">${m.name}${m.is_bk ? html` <span class="tag">BK</span>` : ''}</th>
            ${MONTHS.map((mo) => {
              const v = cells.get(key(m.id, projectId, mo));
              const t = tg.get(`${m.id}:${mo}`);
              const all = memberAll(m, mo);
              const title = `${m.name} ${mo}월 전체 ${fmtNum(all)}${t ? ' / 기준 ' + fmtNum(t) : ''}`;
              return html`<td key=${mo} class=${cls(t && all !== t && (all < t ? 'under' : 'over'))}><${MoneyCell} value=${v} title=${title} onCommit=${(n) => setCell(m.id, projectId, mo, n)} /></td>`;
            })}
            <td class="num total-col">${fmtNum(rowTotal(m))}</td>
          </tr>`)}
        </tbody>
        <tfoot><tr><th class="sticky">합계</th>${MONTHS.map((mo) => html`<td key=${mo} class="num">${fmtNum(colTotal(mo))}</td>`)}<td class="num total-col">${fmtNum(grand)}</td></tr></tfoot>
      </table>
    </div>
    <p class="muted small">셀 색: 그 달 학생의 전체 배분 합이 기준보다 <span class="under-sample">적음</span> / <span class="over-sample">많음</span>. 기준은 '학생별' 탭에서 입력.</p>`;
}

function ByMember({ year, members, memberId, setMemberId, projects, cells, setCell, tg, setTargetCell }) {
  const m = members.find((x) => x.id === memberId);
  const [showAll, setShowAll] = useState(false);
  const used = new Set();
  for (const [k, v] of cells) if (k.startsWith(memberId + ':') && v) used.add(k.split(':')[1]);
  const rows = projects.filter((p) => showAll || used.has(p.id));
  const colTotal = (mo) => sum(projects, (p) => cells.get(key(memberId, p.id, mo)) || 0);
  const rowTotal = (p) => sum(MONTHS, (mo) => cells.get(key(memberId, p.id, mo)) || 0);
  const grand = sum(MONTHS, colTotal);
  const targetTotal = sum(MONTHS, (mo) => tg.get(`${memberId}:${mo}`) || 0);
  return html`
    <div class="toolbar">
      <${Select} value=${memberId} onChange=${setMemberId} options=${members.map((x) => ({ value: x.id, label: x.name + (x.degree ? ' · ' + x.degree : '') + (x.is_bk ? ' · BK' : '') }))} />
      <label class="inline small"><input type="checkbox" checked=${showAll} onChange=${(e) => setShowAll(e.target.checked)} /> 모든 과제 표시</label>
      ${m && html`<span class="muted">${year}년 합계 <b>${fmtWon(grand)}</b>${targetTotal ? html` · 기준 ${fmtWon(targetTotal)} · 차이 <b class=${cls(grand - targetTotal < 0 && 'neg')}>${fmtWon(grand - targetTotal)}</b>` : ''}</span>`}
    </div>
    <div class="table-wrap">
      <table class="grid alloc">
        <thead><tr><th class="sticky">과제</th>${MONTHS.map((mo) => html`<th key=${mo}>${mo}월</th>`)}<th class="total-col">합계</th></tr></thead>
        <tbody>
          ${rows.map((p) => html`<tr key=${p.id} class=${cls(!p.active && 'inactive')}>
            <th class="sticky">${p.name}<span class="muted small"> ${p.pi_name || ''}</span></th>
            ${MONTHS.map((mo) => html`<td key=${mo}><${MoneyCell} value=${cells.get(key(memberId, p.id, mo))} onCommit=${(n) => setCell(memberId, p.id, mo, n)} /></td>`)}
            <td class="num total-col">${fmtNum(rowTotal(p))}</td>
          </tr>`)}
          ${!showAll && html`<tr><td class="muted small" colspan="14">배분이 없는 과제는 숨겨져 있습니다. 새 과제에 배분하려면 '모든 과제 표시'를 켜세요.</td></tr>`}
        </tbody>
        <tfoot>
          <tr><th class="sticky">총합</th>${MONTHS.map((mo) => html`<td key=${mo} class="num">${fmtNum(colTotal(mo))}</td>`)}<td class="num total-col">${fmtNum(grand)}</td></tr>
          <tr class="target"><th class="sticky">기준</th>${MONTHS.map((mo) => html`<td key=${mo}><${MoneyCell} value=${tg.get(`${memberId}:${mo}`)} onCommit=${(n) => setTargetCell(memberId, mo, n)} /></td>`)}<td class="num total-col">${fmtNum(targetTotal)}</td></tr>
          <tr><th class="sticky">차이</th>${MONTHS.map((mo) => { const t = tg.get(`${memberId}:${mo}`); const d = colTotal(mo) - (t || 0); return html`<td key=${mo} class=${cls('num', t && d < 0 && 'neg')}>${t ? fmtNum(d) : ''}</td>`; })}<td class=${cls('num total-col', grand - targetTotal < 0 && 'neg')}>${targetTotal ? fmtNum(grand - targetTotal) : ''}</td></tr>
        </tfoot>
      </table>
    </div>`;
}

function Summary({ year, members, projects, cells, tg, projectById, memberById }) {
  const totals = useMemo(() => {
    const byMP = new Map(); // member:project → total
    const byM = new Map(); const byP = new Map();
    for (const [k, v] of cells) {
      const [m, p] = k.split(':');
      const mp = `${m}:${p}`;
      byMP.set(mp, (byMP.get(mp) || 0) + v);
      byM.set(m, (byM.get(m) || 0) + v);
      byP.set(p, (byP.get(p) || 0) + v);
    }
    const tgByM = new Map();
    for (const [k, v] of tg) { const m = k.split(':')[0]; tgByM.set(m, (tgByM.get(m) || 0) + v); }
    return { byMP, byM, byP, tgByM };
  }, [cells, tg]);
  const cols = projects.filter((p) => totals.byP.get(p.id));
  const grand = sum(members, (m) => totals.byM.get(m.id) || 0);
  const csv = () => {
    const head = ['학생', ...cols.map((p) => p.name), '합계', '기준', '차이'];
    const body = members.map((m) => [m.name, ...cols.map((p) => totals.byMP.get(`${m.id}:${p.id}`) || 0), totals.byM.get(m.id) || 0, totals.tgByM.get(m.id) || 0, (totals.byM.get(m.id) || 0) - (totals.tgByM.get(m.id) || 0)]);
    const foot = ['합계', ...cols.map((p) => totals.byP.get(p.id) || 0), grand, '', ''];
    downloadCsv(`인건비배분_${year}.csv`, [head, ...body, foot]);
  };
  return html`
    <div class="toolbar"><span class="muted">${year}년 전체 <b>${fmtWon(grand)}</b></span><div class="spacer"></div><button class="btn small" onClick=${csv}>CSV 다운로드</button></div>
    <div class="table-wrap">
      <table class="grid alloc summary">
        <thead><tr><th class="sticky">학생</th>${cols.map((p) => html`<th key=${p.id}>${p.name}</th>`)}<th class="total-col">합계</th><th>기준</th><th>차이</th></tr></thead>
        <tbody>
          ${members.map((m) => {
            const t = totals.byM.get(m.id) || 0; const g = totals.tgByM.get(m.id) || 0;
            return html`<tr key=${m.id} class=${cls(!m.active && 'inactive')}>
              <th class="sticky">${m.name}${m.is_bk ? html` <span class="tag">BK</span>` : ''}</th>
              ${cols.map((p) => { const v = totals.byMP.get(`${m.id}:${p.id}`); return html`<td key=${p.id} class="num">${v ? fmtNum(v) : ''}</td>`; })}
              <td class="num total-col">${fmtNum(t)}</td>
              <td class="num muted">${g ? fmtNum(g) : ''}</td>
              <td class=${cls('num', g && t - g < 0 && 'neg')}>${g ? fmtNum(t - g) : ''}</td>
            </tr>`;
          })}
        </tbody>
        <tfoot><tr><th class="sticky">합계</th>${cols.map((p) => html`<td key=${p.id} class="num">${fmtNum(totals.byP.get(p.id) || 0)}</td>`)}<td class="num total-col">${fmtNum(grand)}</td><td></td><td></td></tr></tfoot>
      </table>
    </div>`;
}
