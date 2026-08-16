import { useState, useEffect, useCallback } from 'preact/hooks';

// ---------- 숫자 / 날짜 ----------
export function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return '';
  return n.toLocaleString('ko-KR');
}
export function fmtWon(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return '';
  return (n < 0 ? '-' : '') + '₩' + Math.abs(n).toLocaleString('ko-KR');
}
export function parseNum(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).replace(/[^\d.-]/g, '');
  if (t === '' || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : Math.round(n);
}
export function pct(a, b) {
  const x = Number(a), y = Number(b);
  if (!y) return '–';
  return (x / y * 100).toFixed(1) + '%';
}
export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function thisYear() {
  return new Date().getFullYear();
}
export function sum(arr, f = (x) => x) {
  let s = 0;
  for (const x of arr || []) s += Number(f(x)) || 0;
  return s;
}
export function errMsg(e) {
  if (!e) return '';
  if (typeof e === 'string') return e;
  return e.message || e.error_description || e.details || JSON.stringify(e);
}
export function cls(...xs) {
  return xs.filter(Boolean).join(' ');
}
export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr || []) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const BOM = String.fromCharCode(0xfeff); // 엑셀 한글 깨짐 방지
  const csv = BOM + rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

// ---------- 해시 라우터 ----------
export function currentPath() {
  const h = location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/' + h;
}
export function useHashRoute() {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const f = () => setPath(currentPath());
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return path;
}
export function navigate(path) {
  location.hash = path;
}

// ---------- 비동기 로딩 훅 ----------
export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const reload = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((error) => alive && setState({ loading: false, data: null, error }));
    return () => { alive = false; };
  }, deps); // eslint-disable-line
  useEffect(() => reload(), [reload]);
  return { ...state, reload };
}

// ---------- 토스트 ----------
export function toast(message, type = 'info') {
  dispatchEvent(new CustomEvent('app-toast', { detail: { message, type, id: Math.random() } }));
}
