import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, CheckCheck, Search, Save, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import type { ClassChoice, RegisterData, RegisterStudent } from '../types';

const today = () => new Date().toLocaleDateString('en-CA');
const statusLabels = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late' } as const;
export function AttendanceRegister({ onSaved }: { onSaved?: () => void }) {
  const [classes, setClasses] = useState<ClassChoice[]>([]); const [selected, setSelected] = useState<ClassChoice | null>(null); const [date, setDate] = useState(today());
  const [register, setRegister] = useState<RegisterData | null>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('ALL'); const [confirm, setConfirm] = useState(false); const [toast, setToast] = useState('');
  const load = async (subjectId = selected?.subjectId, sectionId = selected?.sectionId, day = date) => {
    if (!subjectId || !sectionId) return;
    setLoading(true);
    try { const data = await api<RegisterData>(`/attendance/register?subjectId=${subjectId}&sectionId=${sectionId}&date=${day}`); setRegister(data); }
    catch (e) { setToast(e instanceof Error ? e.message : 'Could not load register'); }
    finally { setLoading(false); }
  };
  useEffect(() => { api<ClassChoice[]>('/attendance/register/classes').then((items) => { setClasses(items); if (items[0]) setSelected(items[0]); else setLoading(false); }).catch((e) => { setToast(e.message); setLoading(false); }); }, []);
  useEffect(() => { if (selected) void load(selected.subjectId, selected.sectionId, date); }, [selected, date]);
  const students = register?.students ?? [];
  const count = useMemo(() => students.reduce((a, s) => { a[s.status.toLowerCase() as 'present' | 'absent' | 'late']++; return a; }, { present: 0, absent: 0, late: 0 }), [students]);
  const rate = students.length ? Math.round((count.present + count.late) / students.length * 1000) / 10 : 0;
  const visible = students.filter((s) => (filter === 'ALL' || s.status === filter) && `${s.name} ${s.rollNumber}`.toLowerCase().includes(search.toLowerCase()));
  function changeStatus(id: string, status: RegisterStudent['status']) { setRegister((r) => r ? { ...r, students: r.students.map((s) => s.id === id ? { ...s, status } : s) } : r); }
  function markAll(status: RegisterStudent['status']) { setRegister((r) => r ? { ...r, students: r.students.map((s) => ({ ...s, status })) } : r); }
  async function save() {
    if (!selected || !register) return; setBusy(true);
    try { const result = await api<{ percentage: number; lowAttendanceAlerts: number }>('/attendance', { method: 'POST', body: JSON.stringify({ subjectId: selected.subjectId, sectionId: selected.sectionId, date, records: students.map(({ id, status }) => ({ studentId: id, status })) }) });
      setConfirm(false); setToast(`Attendance saved successfully · ${result.percentage}% present${result.lowAttendanceAlerts ? ` · ${result.lowAttendanceAlerts} low-attendance alert${result.lowAttendanceAlerts > 1 ? 's' : ''} created` : ''}`); await load(); onSaved?.();
    } catch (e) { setToast(e instanceof Error ? e.message : 'Could not save attendance'); } finally { setBusy(false); }
  }
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5500); return () => clearTimeout(timer); }, [toast]);
  if (!classes.length && !loading) return <div className="empty-state"><div className="empty-icon"><BookMark /></div><h3>No assigned classes</h3><p>Attendance registers are only available for classes assigned to this faculty account.</p></div>;
  return <div className="page-stack">
    {toast && <div className="toast"><Check size={16} />{toast}<button onClick={() => setToast('')}><X size={16} /></button></div>}
    <section className="panel register-controls"><div className="register-selects"><label>Assigned class<select value={selected?.subjectId ?? ''} onChange={(e) => setSelected(classes.find((x) => x.subjectId === e.target.value) ?? null)}>{classes.map((c) => <option key={`${c.subjectId}-${c.sectionId}`} value={c.subjectId}>{c.subjectCode} · Year {c.year} Section {c.sectionName}</option>)}</select></label><label>Attendance date<div className="input-icon"><CalendarDays size={16} /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></label></div>
      {register && <div className="register-class"><div className="subject-mark">{register.classInfo.subjectCode.slice(0, 2)}</div><div><h2>{register.classInfo.subjectName}</h2><p>{register.classInfo.departmentCode} · {register.classInfo.year}{register.classInfo.year === 1 ? 'st' : register.classInfo.year === 2 ? 'nd' : register.classInfo.year === 3 ? 'rd' : 'th'} Year · Section {register.classInfo.sectionName}<span className="dot-sep">·</span>{register.facultyName}</p></div><span className={`pill ${register.existingSession ? 'pill-blue' : 'pill-neutral'}`}>{register.existingSession ? 'Saved register' : 'New register'}</span></div>}
    </section>
    <div className="stats-row attendance-stats"><div className="mini-stat"><Users size={16} /><span>Total students</span><strong>{students.length}</strong></div><div className="mini-stat success"><Check size={16} /><span>Present</span><strong>{count.present}</strong></div><div className="mini-stat danger"><X size={16} /><span>Absent</span><strong>{count.absent}</strong></div><div className="mini-stat warning"><CalendarDays size={16} /><span>Late</span><strong>{count.late}</strong></div><div className="mini-stat rate"><span>Attendance rate</span><strong>{rate}%</strong></div></div>
    <section className="panel roster-panel"><div className="panel-heading"><div><h3>Class register</h3><p>Mark each student present, absent, or late. Changes are saved to the academic record.</p></div><button className="button button-soft" onClick={() => markAll('PRESENT')} disabled={!students.length}><CheckCheck size={16} />Mark all present</button></div>
      <div className="table-toolbar"><div className="search-field"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student or roll number" /></div><div className="filter-pills">{['ALL','PRESENT','ABSENT','LATE'].map((s) => <button key={s} className={filter === s ? 'selected' : ''} onClick={() => setFilter(s)}>{s === 'ALL' ? 'All' : statusLabels[s as keyof typeof statusLabels]}</button>)}</div></div>
      <div className="table-wrap"><table className="data-table attendance-table"><thead><tr><th>Student</th><th>Roll number</th><th>Subject attendance</th><th>Mark status</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} className="table-message">Loading register…</td></tr> : visible.map((student, index) => <tr key={student.id}><td><div className="student-cell"><span className="student-avatar">{student.name.split(' ').map((p) => p[0]).slice(0,2).join('')}</span><div><strong>{student.name}</strong><small>Student {String(index + 1).padStart(2,'0')}</small></div></div></td><td className="mono">{student.rollNumber}</td><td><div className="attendance-percent"><span>{student.attendancePercentage}%</span><i><b className={student.attendancePercentage < 75 ? 'bar-low' : student.attendancePercentage < 85 ? 'bar-mid' : ''} style={{ width: `${Math.max(0, Math.min(100, student.attendancePercentage))}%` }} /></i></div></td><td><div className="status-buttons">{(['PRESENT','ABSENT','LATE'] as const).map((s) => <button key={s} aria-pressed={student.status === s} onClick={() => changeStatus(student.id, s)} className={`status-choice ${student.status === s ? `is-${s.toLowerCase()}` : ''}`}>{statusLabels[s]}</button>)}</div></td></tr>)}{!loading && visible.length === 0 && <tr><td colSpan={4} className="table-message">No students match this search or filter.</td></tr>}</tbody></table></div>
      <div className="register-footer"><span>{register?.existingSession ? 'This date has saved attendance. Saving again updates the existing register and records an audit entry.' : 'New attendance has not been saved yet.'}</span><button className="button button-primary" onClick={() => setConfirm(true)} disabled={!students.length || loading}><Save size={16} />Save attendance</button></div>
    </section>
    {confirm && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setConfirm(false)} aria-label="Close"><X size={18} /></button><div className="modal-icon"><ClipboardCheckIcon /></div><p className="eyebrow">FINAL CHECK</p><h2>Confirm attendance</h2><p className="modal-copy">You're saving an official class register. Confirm the counts before continuing.</p><div className="confirm-list"><div><span>Total students</span><strong>{students.length}</strong></div><div><span>Present</span><strong className="text-success">{count.present}</strong></div><div><span>Absent</span><strong className="text-danger">{count.absent}</strong></div><div><span>Late</span><strong className="text-warning">{count.late}</strong></div><div><span>Date</span><strong>{date}</strong></div><div><span>Subject</span><strong>{selected?.subjectCode}</strong></div></div><div className="modal-actions"><button className="button button-soft" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button><button className="button button-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Confirm & save'}</button></div></div></div>}
  </div>;
}
function BookMark() { return <Users size={23} />; }
function ClipboardCheckIcon() { return <CheckCheck size={22} />; }
