// 공용 UI 컴포넌트
import { html } from 'htm/preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { fmtNum, parseNum, errMsg, cls } from './util.js';

export function Spinner({ text = '불러오는 중…' }) {
  return html`<div class="muted pad">${text}</div>`;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return html`<div class="error-box">
    <div>오류: ${errMsg(error)}</div>
    ${onRetry && html`<button class="btn small" onClick=${onRetry}>다시 시도</button>`}
  </div>`;
}

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const f = (e) => {
      const it = e.detail;
      setItems((xs) => [...xs, it]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== it.id)), it.type === 'error' ? 6000 : 2500);
    };
    addEventListener('app-toast', f);
    return () => removeEventListener('app-toast', f);
  }, []);
  return html`<div class="toasts">
    ${items.map((it) => html`<div key=${it.id} class=${cls('toast', it.type)}>${it.message}</div>`)}
  </div>`;
}

/**
 * 금액 셀: 포커스가 없을 때는 1,234,567 형태로 표시, 편집 후 blur/Enter 로 확정.
 * onCommit(number|null) 은 값이 실제로 바뀐 경우에만 호출.
 */
export function MoneyCell({ value, onCommit, disabled, className, placeholder, title }) {
  const [text, setText] = useState(fmtNum(value));
  const focus = useRef(false);
  const cancel = useRef(false);
  useEffect(() => { if (!focus.current) setText(fmtNum(value)); }, [value]);

  const norm = (v) => (v === null || v === undefined || v === '' ? null : Math.round(Number(v)));
  const commit = (raw) => {
    const n = parseNum(raw);
    const cur = norm(value);
    const next = n === 0 ? null : n; // 0 은 삭제로 취급
    if (next !== (cur === 0 ? null : cur)) onCommit(next);
    setText(fmtNum(next));
  };
  return html`<input
    class=${cls('money', className)}
    type="text" inputMode="numeric" autocomplete="off"
    value=${text} disabled=${disabled} placeholder=${placeholder || ''} title=${title || ''}
    onFocus=${(e) => { const el = e.target; focus.current = true; cancel.current = false; const n = norm(value); setText(n === null ? '' : String(n)); requestAnimationFrame(() => { if (el && document.activeElement === el) el.select(); }); }}
    onInput=${(e) => setText(e.target.value)}
    onBlur=${(e) => { focus.current = false; if (cancel.current) { cancel.current = false; setText(fmtNum(value)); } else commit(e.target.value); }}
    onKeyDown=${(e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); moveFocus(e.target, e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { cancel.current = true; e.target.blur(); }
      else if (e.key === 'ArrowDown' && !e.altKey) { e.preventDefault(); e.target.blur(); moveFocus(e.target, 1); }
      else if (e.key === 'ArrowUp' && !e.altKey) { e.preventDefault(); e.target.blur(); moveFocus(e.target, -1); }
    }} />`;
}

// 같은 열의 위/아래 셀로 포커스 이동 (표 안의 input 만)
function moveFocus(el, dir) {
  const td = el.closest('td'); const tr = td && td.closest('tr'); const table = tr && tr.closest('table');
  if (!table) return;
  const idx = Array.from(tr.children).indexOf(td);
  const rows = Array.from(table.querySelectorAll('tr'));
  let i = rows.indexOf(tr) + dir;
  while (i >= 0 && i < rows.length) {
    const cell = rows[i].children[idx];
    const inp = cell && cell.querySelector('input:not([disabled])');
    if (inp) { inp.focus(); return; }
    i += dir;
  }
}

/** 텍스트 셀: blur 시 변경되었으면 onCommit(text) */
export function TextCell({ value, onCommit, type = 'text', disabled, className, placeholder, list }) {
  const [text, setText] = useState(value ?? '');
  const focus = useRef(false);
  useEffect(() => { if (!focus.current) setText(value ?? ''); }, [value]);
  return html`<input class=${cls('text', className)} type=${type} value=${text} disabled=${disabled} placeholder=${placeholder || ''} list=${list}
    onFocus=${() => { focus.current = true; }}
    onInput=${(e) => setText(e.target.value)}
    onBlur=${(e) => { focus.current = false; const v = e.target.value; if ((v ?? '') !== (value ?? '')) onCommit(v); }}
    onKeyDown=${(e) => { if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); e.target.blur(); } }} />`;
}

export function Select({ value, options, onChange, disabled, className, placeholder }) {
  return html`<select class=${cls('select', className)} value=${value ?? ''} disabled=${disabled} onChange=${(e) => onChange(e.target.value)}>
    ${placeholder !== undefined && html`<option value="">${placeholder}</option>`}
    ${options.map((o) => html`<option value=${o.value}>${o.label}</option>`)}
  </select>`;
}

export function YearSelect({ year, years, onChange }) {
  const ys = [...new Set([...(years || []), year])].filter(Boolean).sort((a, b) => b - a);
  return html`<label class="inline">연도
    <select class="select" value=${year} onChange=${(e) => onChange(Number(e.target.value))}>
      ${ys.map((y) => html`<option value=${y}>${y}</option>`)}
      <option value=${Math.max(...ys) + 1}>${Math.max(...ys) + 1} (신규)</option>
    </select>
  </label>`;
}

export function Card({ label, value, sub, tone }) {
  return html`<div class=${cls('card', tone)}>
    <div class="card-label">${label}</div>
    <div class="card-value">${value}</div>
    ${sub && html`<div class="card-sub">${sub}</div>`}
  </div>`;
}

export function Empty({ text = '데이터가 없습니다.' }) {
  return html`<div class="muted pad">${text}</div>`;
}

export function Confirm(message) {
  return window.confirm(message);
}
