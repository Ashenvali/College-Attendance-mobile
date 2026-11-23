import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileWarning, MessageSquare, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { SessionUser } from '../types';

interface Row {
  id: string; status: string; phone: string; message: string | null; campaignMessage: string;
  errorDetail: string | null; attempts: number; sentAt: string | null; createdAt: string;
  studentName: string | null; rollNumber: string | null; department: string | null;
}
interface DashboardResponse {
  stats: { total: number; successful: number; testMode: number; failed: number; pending: number; today: number };
  rows: Row[]; hasMore: boolean; page: number;
}

const statuses = ['', 'SENT', 'DELIVERED', 'MOCKED', 'FAILED', 'PENDING'];

export function SmsDashboardPage({ user }: { user: SessionUser }) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [departments, setDepartments] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [filters, setFilters] = useState({ departmentId: '', date: '', status: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (next = filters) => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams();
      if (next.departmentId) query.set('departmentId', next.departmentId);
      if (next.date) query.set('date', next.date);
      if (next.status) query.set('status', next.status);
      query.set('page', String(next.page));
      setData(await api<DashboardResponse>(`/sms/dashboard?${query.toString()}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the SMS delivery log');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (user.role === 'HOD') return;
    api<Array<{ id: string; code: string; name: string }>>('/modules/departments').then(setDepartments).catch(() => undefined);
  }, [user.role]);

  function update(patch: Partial<typeof filters>) { const next = { ...filters, ...patch, page: patch.page ?? 1 }; setFilters(next); void load(next); }
  const stats = data?.stats;

  return <section className="page-stack">
    <div className="panel notice-toolbar"><div><p className="eyebrow">COMMUNICATION · SMS MONITORING</p><h2>SMS delivery dashboard</h2><p>Attendance-linked absence messages and campaigns. Parent numbers are stored and shown masked; this view never reveals a full number.</p></div><button className="button button-soft" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>Refresh</button></div>
    <div className="sms-safety"><ShieldCheck size={16}/><span><strong>Parent contact privacy.</strong> Only the last four digits are visible. Live delivery is restricted to non-demo students with recorded guardian consent.</span></div>
    {error && <div className="inline-error">{error}</div>}
    <div className="stats-row">
      <div className="mini-stat"><MessageSquare size={16}/><span>Total messages</span><strong>{stats?.total ?? 0}</strong></div>
      <div className="mini-stat success"><CheckCircle2 size={16}/><span>Accepted / delivered</span><strong>{stats?.successful ?? 0}</strong></div>
      <div className="mini-stat warning"><Clock3 size={16}/><span>Test mode (not sent)</span><strong>{stats?.testMode ?? 0}</strong></div>
      <div className="mini-stat danger"><FileWarning size={16}/><span>Failed</span><strong>{stats?.failed ?? 0}</strong></div>
      <div className="mini-stat"><Clock3 size={16}/><span>Pending</span><strong>{stats?.pending ?? 0}</strong></div>
      <div className="mini-stat"><Clock3 size={16}/><span>Today</span><strong>{stats?.today ?? 0}</strong></div>
    </div>
    <section className="panel data-panel">
      <div className="panel-heading"><div><h3>Delivery log</h3><p>Newest first · 25 records per page</p></div></div>
      <div className="table-toolbar">
        {user.role !== 'HOD' && <label className="inline-field">Department<select value={filters.departmentId} onChange={(e) => update({ departmentId: e.target.value })}><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}</select></label>}
        <label className="inline-field">Date<input type="date" value={filters.date} onChange={(e) => update({ date: e.target.value })}/></label>
        <label className="inline-field">Status<select value={filters.status} onChange={(e) => update({ status: e.target.value })}>{statuses.map((s) => <option key={s || 'ALL'} value={s}>{s || 'All statuses'}</option>)}</select></label>
      </div>
      {loading && !data ? <div className="loading-card">Loading the SMS delivery log…</div>
        : data && data.rows.length ? <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Student</th><th>Roll number</th><th>Department</th><th>Parent number</th><th>Status</th><th>Attempts</th><th>Created</th><th>Message</th></tr></thead>
          <tbody>{data.rows.map((row) => <tr key={row.id}>
            <td><strong>{row.studentName ?? '—'}</strong></td>
            <td className="mono">{row.rollNumber ?? '—'}</td>
            <td>{row.department ?? '—'}</td>
            <td className="mono">{row.phone}</td>
            <td><span className={`pill ${row.status === 'FAILED' ? 'pill-danger' : row.status === 'SENT' || row.status === 'DELIVERED' ? 'pill-success' : 'pill-warning'}`}>{row.status}</span>{row.errorDetail ? <small className="row-note">{row.errorDetail}</small> : null}</td>
            <td>{row.attempts}</td>
            <td>{new Date(row.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
            <td className="cell-message">{(row.message ?? row.campaignMessage).slice(0, 90)}{(row.message ?? row.campaignMessage).length > 90 ? '…' : ''}</td>
          </tr>)}</tbody>
        </table></div>
        : <div className="empty-state"><span className="empty-icon"><AlertTriangle size={22}/></span><h3>No SMS records</h3><p>Absence messages appear here after staff use the attendance screen. Mock mode records status without transmitting.</p></div>}
      <div className="register-footer"><span>Page {data?.page ?? filters.page}{data?.hasMore ? ' · more records available' : ''}</span><div className="table-actions"><button className="button button-soft" disabled={filters.page <= 1 || loading} onClick={() => update({ page: filters.page - 1 })}>Previous</button><button className="button button-soft" disabled={!data?.hasMore || loading} onClick={() => update({ page: filters.page + 1 })}>Next</button></div></div>
    </section>
  </section>;
}
