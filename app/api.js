// Supabase 데이터 접근 함수 모음.  모든 함수는 실패 시 throw.
import { supabase } from './supabase.js';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------- 인증 / 내 정보 ----------
export async function getMe(email) {
  if (!email) return null;
  return unwrap(await supabase.from('members').select('*').ilike('email', email).maybeSingle());
}
export async function signInWithGoogle(domainHint) {
  const redirectTo = location.origin + location.pathname;
  return unwrap(await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account', ...(domainHint ? { hd: domainHint } : {}) },
    },
  }));
}
export async function signInWithPassword(email, password) {
  return unwrap(await supabase.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password }));
}
export async function updatePassword(password) {
  return unwrap(await supabase.auth.updateUser({ password }));
}
export async function signOut() {
  await supabase.auth.signOut();
}
/** 공개 인증 설정 (어떤 로그인 방식이 켜져 있는지).  실패하면 null */
export async function getAuthSettings(url, anonKey) {
  if (!url || !anonKey) return null;
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// ---------- 구성원 ----------
export async function listMembers() {
  return unwrap(await supabase.from('members').select('*').order('sort_order').order('name'));
}
export async function saveMember(row) {
  const payload = { ...row };
  if (payload.email !== undefined) payload.email = payload.email ? String(payload.email).trim().toLowerCase() : null;
  if (payload.id) {
    return unwrap(await supabase.from('members').update(payload).eq('id', payload.id).select().single());
  }
  delete payload.id;
  return unwrap(await supabase.from('members').insert(payload).select().single());
}

// ---------- 과제 ----------
export async function listProjects({ includeInactive = true } = {}) {
  let q = supabase.from('projects').select('*, project_years(*)').order('sort_order').order('name')
    .order('year_no', { referencedTable: 'project_years', ascending: true });
  if (!includeInactive) q = q.eq('active', true);
  return unwrap(await q);
}
export async function saveProject(row) {
  const payload = { ...row };
  delete payload.project_years;
  if (payload.id) return unwrap(await supabase.from('projects').update(payload).eq('id', payload.id).select().single());
  delete payload.id;
  return unwrap(await supabase.from('projects').insert(payload).select().single());
}
export async function deleteProject(id) {
  unwrap(await supabase.from('projects').delete().eq('id', id));
}

// ---------- 연차 ----------
export async function getProjectYear(id) {
  return unwrap(await supabase.from('project_years').select('*, projects(*)').eq('id', id).single());
}
export async function listProjectYears() {
  return unwrap(await supabase.from('project_years').select('*, projects(*)'));
}
export async function saveProjectYear(row) {
  const payload = { ...row };
  delete payload.projects;
  for (const k of ['period_start', 'period_end']) if (payload[k] === '') payload[k] = null;
  if (payload.id) return unwrap(await supabase.from('project_years').update(payload).eq('id', payload.id).select().single());
  delete payload.id;
  return unwrap(await supabase.from('project_years').insert(payload).select().single());
}
export async function deleteProjectYear(id) {
  unwrap(await supabase.from('project_years').delete().eq('id', id));
}

// ---------- 집계 뷰 ----------
export async function listYearTotals() {
  return unwrap(await supabase.from('v_project_year_totals').select('*'));
}
export async function listYearStatus(projectYearId) {
  let q = supabase.from('v_project_year_status').select('*').order('sort_order').order('category');
  if (projectYearId) q = q.eq('project_year_id', projectYearId);
  return unwrap(await q);
}
export async function listStudentPayStatus() {
  return unwrap(await supabase.from('v_project_year_status').select('project_year_id, spent').eq('category', '학생인건비'));
}
export async function listAllocationYearTotals(year) {
  return unwrap(await supabase.from('v_allocation_year_totals').select('*').eq('year', year));
}

// ---------- 비목 / 예산 / 원장 ----------
export async function listCategories() {
  return unwrap(await supabase.from('categories').select('*').order('sort_order').order('name'));
}
export async function addCategory(name, parent) {
  return unwrap(await supabase.from('categories').insert({ name, parent: parent || null, sort_order: 800 }).select().single());
}
export async function upsertBudgetLine(projectYearId, category, planned, carryover) {
  return unwrap(await supabase.from('budget_lines')
    .upsert({ project_year_id: projectYearId, category, planned: planned || 0, carryover: carryover || 0 },
      { onConflict: 'project_year_id,category' })
    .select().single());
}
export async function deleteBudgetLine(projectYearId, category) {
  unwrap(await supabase.from('budget_lines').delete().eq('project_year_id', projectYearId).eq('category', category));
}
export async function listLedger(projectYearId) {
  return unwrap(await supabase.from('ledger').select('*').eq('project_year_id', projectYearId)
    .order('spent_on', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }));
}
export async function saveLedger(row) {
  const payload = { ...row };
  if (payload.spent_on === '') payload.spent_on = null;
  if (payload.id) return unwrap(await supabase.from('ledger').update(payload).eq('id', payload.id).select().single());
  delete payload.id;
  return unwrap(await supabase.from('ledger').insert(payload).select().single());
}
export async function deleteLedger(id) {
  unwrap(await supabase.from('ledger').delete().eq('id', id));
}

// ---------- 인건비 배분 ----------
export async function listAllocations({ year, memberId, projectId } = {}) {
  let q = supabase.from('allocations').select('*');
  if (year) q = q.eq('year', year);
  if (memberId) q = q.eq('member_id', memberId);
  if (projectId) q = q.eq('project_id', projectId);
  return unwrap(await q);
}
export async function setAllocation({ member_id, project_id, year, month, amount }) {
  if (!amount) {
    unwrap(await supabase.from('allocations').delete()
      .eq('member_id', member_id).eq('project_id', project_id).eq('year', year).eq('month', month));
    return null;
  }
  return unwrap(await supabase.from('allocations')
    .upsert({ member_id, project_id, year, month, amount }, { onConflict: 'member_id,project_id,year,month' })
    .select().single());
}
export async function listTargets({ year, memberId } = {}) {
  let q = supabase.from('salary_targets').select('*');
  if (year) q = q.eq('year', year);
  if (memberId) q = q.eq('member_id', memberId);
  return unwrap(await q);
}
export async function setTarget({ member_id, year, month, amount }) {
  if (!amount) {
    unwrap(await supabase.from('salary_targets').delete().eq('member_id', member_id).eq('year', year).eq('month', month));
    return null;
  }
  return unwrap(await supabase.from('salary_targets')
    .upsert({ member_id, year, month, amount }, { onConflict: 'member_id,year,month' }).select().single());
}
export async function listMyAllocations(memberId, year) {
  return unwrap(await supabase.from('allocations').select('*, projects(name, pi_name, code)')
    .eq('member_id', memberId).eq('year', year));
}
export async function listAllocationYears(memberId) {
  let q = supabase.from('allocations').select('year');
  if (memberId) q = q.eq('member_id', memberId);
  const rows = unwrap(await q);
  return [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a);
}
