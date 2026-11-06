import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, MessageCircle, RefreshCw, Send, ShieldCheck, Users } from 'lucide-react';
import { api } from '../lib/api';
import type { SessionUser } from '../types';

type Scope = { scopeType: 'SECTION' | 'DEPARTMENT'; departmentId: string; sectionId: string | null; label: string };
type Preview = { scope: string; mode: 'mock' | 'gateway'; counts: { studentsInScope: number; eligibleStudents: number; uniqueRecipients: number; missingParentPhone: number; invalidParentPhone: number; excludedDemo: number; excludedNoConsent: number }; canSend: boolean; warning: string };
type Campaign = { id: string; name: string; message: string; audience: string; status: string; createdAt: string; studentsCovered: number; sent: number; mocked: number; failed: number };

export function ParentSmsPage({ user }: { user: SessionUser }) {
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [scopeKey, setScopeKey] = useState('');
  const [mode, setMode] = useState<'mock' | 'gateway'>('mock');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const selected = scopes.find((scope) => `${scope.scopeType}:${scope.sectionId ?? 'department'}` === scopeKey);

  const loadHistory = useCallback(async () => setHistory(await api<Campaign[]>('/sms/parents/campaigns')), []);
  useEffect(() => {
    api<{ scopes: Scope[]; mode: 'mock' | 'gateway' }>('/sms/parents/scopes').then((result) => {
      setScopes(result.scopes);
      setMode(result.mode);
      if (result.scopes[0]) setScopeKey(`${result.scopes[0].scopeType}:${result.scopes[0].sectionId ?? 'department'}`);
    }).catch((err) => setError(err instanceof Error ? err.message : 'Could not load authorized audiences'));
    void loadHistory().catch((err) => setError(err instanceof Error ? err.message : 'Could not load campaign history'));
  }, [loadHistory]);

  async function makePreview() {
    if (!selected) return;
    setBusy(true); setError(''); setPreview(null);
    try {
      const result = await api<Preview>('/sms/parents/preview', { method: 'POST', body: JSON.stringify({ scopeType: selected.scopeType, ...(selected.sectionId ? { sectionId: selected.sectionId } : {}) }) });
      setPreview(result); setMode(result.mode);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not preview recipients'); }
    finally { setBusy(false); }
  }

  async function sendCampaign() {
    if (!selected || !preview?.canSend) return;
    setBusy(true); setError(''); setToast('');
    try {
      const campaign = await api<{ id: string }>('/sms/parents/campaigns', { method: 'POST', body: JSON.stringify({ name: name.trim(), message: message.trim(), scopeType: selected.scopeType, ...(selected.sectionId ? { sectionId: selected.sectionId } : {}) }) });
      const result = await api<{ mode: string; recipients: number; studentsCovered: number; warning?: string }>(`/sms/parents/campaigns/${campaign.id}/send`, { method: 'POST' });
      setToast(result.warning ?? `Processed ${result.recipients} parent contact(s) for ${result.studentsCovered} student(s).`);
      setName(''); setMessage(''); setPreview(null); setConfirm(false);
      await loadHistory();
    } catch (err) { setError(err instanceof Error ? err.message : 'The parent SMS campaign could not be processed'); }
    finally { setBusy(false); }
  }

  return <div className="page-stack parent-sms-page">
    <section className="panel parent-sms-intro">
      <div><p className="eyebrow">BITS KURNOOL · PARENT COMMUNICATION</p><h2>Parent SMS</h2><p>Send class updates to guardians in an authorized section or department. Parent phone numbers are never shown in this workspace.</p></div>
      <span className="parent-sms-role"><ShieldCheck size={15}/>{user.role === 'HOD' ? 'Department scope' : 'Assigned sections'}</span>
    </section>
    <div className={`sms-safety ${mode === 'mock' ? '' : 'parent-sms-live'}`}><AlertTriangle size={16}/><span><strong>{mode === 'mock' ? 'Mock delivery is active.' : 'Live gateway configured.'}</strong> {mode === 'mock' ? 'This Preview records mock outcomes only; no SMS is transmitted.' : 'Live sends include only non-demo students with valid parent contacts and Admin-recorded guardian consent.'}</span></div>
    {error && <div className="inline-error">{error}</div>}
    {toast && <div className="toast"><CheckCircle2 size={16}/>{toast}<button onClick={() => setToast('')} aria-label="Dismiss message">×</button></div>}
    <div className="parent-sms-layout">
      <section className="panel parent-sms-compose">
        <div className="panel-heading"><div><h3>Compose a message</h3><p>Choose an audience your account is authorized to reach.</p></div><MessageCircle size={19}/></div>
        <label className="parent-sms-field">Audience<select value={scopeKey} onChange={(event) => { setScopeKey(event.target.value); setPreview(null); }}><option value="">Select an authorized audience</option>{scopes.map((scope) => <option key={`${scope.scopeType}:${scope.sectionId ?? 'department'}`} value={`${scope.scopeType}:${scope.sectionId ?? 'department'}`}>{scope.label}</option>)}</select></label>
        <label className="parent-sms-field">Campaign name<input value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={160} placeholder="e.g. Mid-semester examination update" /></label>
        <label className="parent-sms-field">Message<textarea rows={5} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a clear update for parents or guardians…" /></label>
        <div className="parent-sms-compose-footer"><span>{message.length}/1000 characters</span><button className="button button-soft" type="button" onClick={makePreview} disabled={!selected || busy}><Users size={15}/>{busy ? 'Checking…' : 'Preview recipients'}</button></div>
        {preview && <div className="parent-sms-preview"><div className="parent-sms-preview-head"><strong>Audience review</strong><span>{preview.scope}</span></div><div className="parent-sms-counts"><div><strong>{preview.counts.studentsInScope}</strong><small>Students in scope</small></div><div><strong>{preview.counts.eligibleStudents}</strong><small>Eligible students</small></div><div><strong>{preview.counts.uniqueRecipients}</strong><small>Parent contacts</small></div></div><p>{preview.mode === 'mock' ? 'No network message will be sent. Mock mode may include fictional demo contacts.' : `Skipped ${preview.counts.excludedDemo} demo and ${preview.counts.excludedNoConsent} non-consented record(s).`}</p>{preview.mode === 'gateway' && preview.counts.missingParentPhone + preview.counts.invalidParentPhone > 0 && <small className="parent-sms-muted">{preview.counts.missingParentPhone} missing and {preview.counts.invalidParentPhone} invalid contact record(s) excluded.</small>}</div>}
        <button className="button button-primary parent-sms-send" type="button" disabled={!preview?.canSend || name.trim().length < 3 || !message.trim() || busy} onClick={() => setConfirm(true)}><Send size={15}/>Review &amp; send</button>
      </section>
      <section className="panel parent-sms-history">
        <div className="panel-heading"><div><h3>Recent parent messages</h3><p>Campaign history is filtered to your sender or department scope.</p></div><button className="icon-button bordered" type="button" onClick={() => void loadHistory()} aria-label="Refresh history"><RefreshCw size={15}/></button></div>
        {!history.length ? <div className="empty-state"><span className="empty-icon"><MessageCircle size={21}/></span><h3>No parent messages yet</h3><p>Confirmed campaigns will be recorded here.</p></div> : <div className="parent-sms-history-list">{history.map((campaign) => <article key={campaign.id} className="parent-sms-history-item"><div className="parent-sms-history-icon"><MessageCircle size={16}/></div><div className="parent-sms-history-copy"><div className="parent-sms-history-title"><strong>{campaign.name}</strong><span className={`pill ${campaign.status === 'SENT' || campaign.status === 'MOCKED' ? 'pill-success' : campaign.status === 'PARTIAL' ? 'pill-warning' : 'pill-neutral'}`}>{campaign.status}</span></div><p>{campaign.message}</p><small><Clock3 size={12}/>{campaign.studentsCovered} students · {campaign.sent} sent · {campaign.mocked} mocked · {campaign.failed} failed · {new Date(campaign.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small></div></article>)}</div>}
      </section>
    </div>
    {confirm && preview && selected && <div className="modal-backdrop"><div className="modal parent-sms-confirm"><div className="modal-icon"><Send size={20}/></div><p className="eyebrow">CONFIRM PARENT MESSAGE</p><h2>Review before sending</h2><p className="modal-copy">This will process <strong>{preview.counts.uniqueRecipients} parent contact(s)</strong> for {preview.counts.eligibleStudents} eligible student(s) in <strong>{selected.label}</strong>.</p><div className="confirm-list"><div><span>Campaign</span><strong>{name}</strong></div><div><span>Mode</span><strong>{preview.mode === 'mock' ? 'Mock only · no message transmitted' : 'Live SMS gateway'}</strong></div><div><span>Message</span><strong>{message}</strong></div></div>{error && <div className="inline-error">{error}</div>}<div className="modal-actions"><button className="button button-soft" type="button" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button><button className="button button-primary" type="button" onClick={sendCampaign} disabled={busy}>{busy ? 'Processing…' : 'Confirm & send'}</button></div></div></div>}
  </div>;
}
