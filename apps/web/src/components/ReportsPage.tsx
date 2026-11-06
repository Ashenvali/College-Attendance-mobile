import { useState, type FormEvent } from 'react';
import { Download, FileSpreadsheet, KeyRound, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { SessionUser } from '../types';

interface Report {
  range: { from: string; to: string };
  overall: { records: number; attended: number; absent: number; classes: number; percentage: number; belowThresholdStudents: number };
  byDepartment: Array<{ name: string; total: number; attended: number; absent: number; percentage: number }>;
  bySubject: Array<{ name: string; total: number; attended: number; absent: number; percentage: number }>;
  byDate: Array<{ name: string; total: number; attended: number; absent: number; percentage: number }>;
  students: Array<{ rollNumber: string; name: string; department: string; total: number; attended: number; absent: number; percentage: number }>;
  threshold: number;
}

const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage({ user }: { user: SessionUser }) {
  const [range, setRange] = useState({ from: isoDaysAgo(30), to: today() });
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true); setError('');
    try { setReport(await api<Report>(`/admin/reports/attendance?from=${range.from}&to=${range.to}`)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not generate the report'); }
    finally { setLoading(false); }
  }

  return <section className="page-stack">
    <form className="panel notice-toolbar" onSubmit={load}>
      <div><p className="eyebrow">ACADEMIC REPORTING</p><h2>Attendance report</h2><p>Daily, monthly, department, subject, and student-wise totals computed from saved attendance records{user.role === 'HOD' ? ' in your department' : ''}.</p></div>
      <div className="report-controls">
        <label>From<input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} required/></label>
        <label>To<input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} required/></label>
        <button className="button button-primary" disabled={loading}><FileSpreadsheet size={15}/>{loading ? 'Generating…' : 'Generate report'}</button>
      </div>
    </form>
    {error && <div className="inline-error">{error}</div>}
    {!report ? <div className="panel empty-state"><span className="empty-icon"><FileSpreadsheet size={22}/></span><h3>No report generated yet</h3><p>Choose a date range and generate the report. CSV export is available for every section.</p></div> : <div className="page-stack">
      <div className="stats-row">
        <div className="mini-stat"><span>Records</span><strong>{report.overall.records}</strong></div>
        <div className="mini-stat success"><span>Attended</span><strong>{report.overall.attended}</strong></div>
        <div className="mini-stat danger"><span>Absent</span><strong>{report.overall.absent}</strong></div>
        <div className="mini-stat"><span>Class sessions</span><strong>{report.overall.classes}</strong></div>
        <div className="mini-stat"><span>Attendance</span><strong>{report.overall.percentage}%</strong></div>
        <div className="mini-stat warning"><span>Below {report.threshold}%</span><strong>{report.overall.belowThresholdStudents}</strong></div>
      </div>
      {[{ title: 'Student-wise report', key: 'students', rows: report.students }, { title: 'Department-wise report', key: 'byDepartment', rows: report.byDepartment }, { title: 'Subject-wise report', key: 'bySubject', rows: report.bySubject }, { title: 'Daily report', key: 'byDate', rows: report.byDate }].map((section) => <section className="panel data-panel" key={section.key}>
        <div className="panel-heading"><div><h3>{section.title}</h3><p>{section.rows.length} row(s) · {report.range.from} to {report.range.to}</p></div><button className="button button-soft" disabled={!section.rows.length} onClick={() => download(`bits-${section.key}-${report.range.from}-to-${report.range.to}.csv`, toCsv(section.rows as Array<Record<string, unknown>>))}><Download size={15}/>Export CSV</button></div>
        {section.rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr>{Object.keys(section.rows[0] as object).map((column) => <th key={column}>{column.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())}</th>)}</tr></thead>
          <tbody>{(section.rows as Array<Record<string, unknown>>).slice(0, 200).map((row, index) => <tr key={index}>{Object.entries(row).map(([column, value]) => <td key={column} className={column === 'rollNumber' ? 'mono' : undefined}>{column === 'percentage' ? <span className={`attendance-status ${Number(value) < report.threshold ? 'status-critical' : Number(value) < 85 ? 'status-warning' : 'status-good'}`}>{String(value)}%</span> : String(value)}</td>)}</tr>)}</tbody></table></div>
          : <div className="empty-inline">No attendance was recorded in this range.</div>}
        {(section.rows as Array<unknown>).length > 200 && <p className="form-hint">Showing the first 200 rows in the table; the CSV export contains every row.</p>}
      </section>)}
    </div>}
  </section>;
}

export function SecurityPage({ user }: { user: SessionUser }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError(''); setDone('');
    if (next !== confirm) { setError('The new password and confirmation do not match.'); return; }
    setBusy(true);
    try {
      const result = await api<{ token: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      sessionStorage.setItem('bits-token', result.token);
      setCurrent(''); setNext(''); setConfirm('');
      setDone('Password changed. Other sessions were signed out.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not change the password'); }
    finally { setBusy(false); }
  }

  async function revokeSessions() {
    setError(''); setDone(''); setBusy(true);
    try {
      await api('/auth/revoke-sessions', { method: 'POST' });
      sessionStorage.removeItem('bits-token');
      setDone('All sessions were signed out. Reload the page and sign in again.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not revoke sessions'); }
    finally { setBusy(false); }
  }

  return <section className="page-stack">
    <div className="panel"><p className="eyebrow">ACCOUNT SECURITY</p><h2>{user.fullName}</h2><p>{user.loginId} · {user.role.replaceAll('_', ' ')} · {user.isDemo ? 'fictional demo account' : 'college account'}</p></div>
    {error && <div className="inline-error">{error}</div>}
    {done && <div className="toast"><ShieldCheck size={16}/>{done}</div>}
    <div className="dashboard-grid">
      <form className="panel" onSubmit={changePassword}>
        <div className="panel-heading"><div><h3>Change password</h3><p>Sessions issued with the old password stop working immediately.</p></div><KeyRound size={17}/></div>
        <label>Current password<input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}/></label>
        <label>New password (10+ characters)<input type="password" required minLength={10} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)}/></label>
        <label>Confirm new password<input type="password" required minLength={10} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}/></label>
        <div className="modal-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button></div>
      </form>
      <div className="panel">
        <div className="panel-heading"><div><h3>Session control</h3><p>Bearer tokens expire after the configured lifetime (8h by default).</p></div><ShieldCheck size={17}/></div>
        <p className="modal-copy">If a device was lost or a password may have been shared, sign out every session. You will need to sign in again.</p>
        <div className="modal-actions"><button type="button" className="button button-soft" onClick={() => void revokeSessions()} disabled={busy}><RefreshCw size={15}/>Sign out all sessions</button><button type="button" className="button button-soft" onClick={() => { sessionStorage.removeItem('bits-token'); window.location.reload(); }}><LogOut size={15}/>Sign out</button></div>
      </div>
    </div>
  </section>;
}
