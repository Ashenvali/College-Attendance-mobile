import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusPill, Surface } from './Display';
import { request } from '../services/api';
import { palette } from '../theme';

type Item = { studentId: string; name: string; rollNumber: string; maskedPhone: string | null; eligible: boolean; reason: string | null; message: string; previousStatus: string | null };
type Preview = { mode: 'mock' | 'gateway'; absentCount: number; eligibleCount: number; items: Item[]; warning: string; policy: 'off' | 'manual' | 'auto' };
type Row = { id: string; status: string; phone: string; name: string | null; rollNumber: string | null; errorDetail: string | null; attempts: number };
type Outcome = { sent: number; mocked: number; failed: number; attempted: number; alreadyProcessed: number; skipped: unknown[]; warning?: string };

const tone = (s: string): 'good' | 'warning' | 'danger' | 'neutral' => s === 'SENT' || s === 'DELIVERED' ? 'good' : s === 'FAILED' ? 'danger' : s === 'MOCKED' || s === 'SENDING' ? 'warning' : 'neutral';

export function AbsentSmsPanel({ sessionId, absentCount, policy, autoOutcome }: { sessionId: string; absentCount: number; policy: 'off' | 'manual' | 'auto'; autoOutcome?: Outcome | { error: string } | null }) {
  const [preview, setPreview] = useState<Preview | null>(null); const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false); const [error, setError] = useState(''); const [info, setInfo] = useState('');
  const base = `/sms/absent/${encodeURIComponent(sessionId)}`;
  async function run<T>(fn: () => Promise<T>) { setBusy(true); setError(''); try { return await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); return null; } finally { setBusy(false); } }
  const loadPreview = () => run(async () => { setPreview(await request<Preview>(`${base}/preview`)); });
  const loadStatus = () => run(async () => { setRows(await request<Row[]>(`${base}/status`)); });
  const summarize = (o: Outcome) => o.warning || `${o.sent} sent · ${o.mocked} test · ${o.failed} failed${o.alreadyProcessed ? ` · ${o.alreadyProcessed} already notified (skipped)` : ''}.`;
  const send = () => run(async () => { const o = await request<Outcome>(`${base}/send`, { method: 'POST', body: '{}' }); setInfo(summarize(o)); setConfirm(false); await loadPreview(); setRows(await request<Row[]>(`${base}/status`)); });
  const retry = () => run(async () => { const o = await request<Outcome>(`${base}/retry`, { method: 'POST', body: '{}' }); setInfo(summarize(o)); setRows(await request<Row[]>(`${base}/status`)); });
  const failedCount = rows?.filter((r) => r.status === 'FAILED').length ?? 0;
  if (policy === 'off') return <Surface style={styles.card}><Text style={styles.title}>Absent-student SMS</Text><Text style={styles.sub}>Disabled by the administrator.</Text></Surface>;
  const auto = autoOutcome && 'error' in autoOutcome ? autoOutcome.error : autoOutcome ? `Automatic mode: ${summarize(autoOutcome as Outcome)}` : null;
  return <Surface style={styles.card}>
    <View style={styles.head}><Ionicons name="chatbox-ellipses-outline" size={18} color={palette.navy}/><Text style={styles.title}>Absent students: parent SMS</Text></View>
    <Text style={styles.sub}>{absentCount} student(s) marked absent. Messages go only to verified parent numbers with recorded consent. Numbers are masked here.</Text>
    {auto ? <Text style={styles.info}>{auto}</Text> : null}{info ? <Text style={styles.info}>{info}</Text> : null}{error ? <Text style={styles.err}>{error}</Text> : null}
    <AppButton title="Preview SMS" variant="secondary" onPress={() => void loadPreview()} loading={busy && !confirm}/>
    {preview ? <View style={styles.block}>
      <View style={styles.row}><Text style={styles.label}>Mode</Text><StatusPill label={preview.mode === 'mock' ? 'TEST MODE · NO TRANSMISSION' : 'LIVE'} tone={preview.mode === 'mock' ? 'warning' : 'good'}/></View>
      <Text style={styles.sub}>{preview.eligibleCount} of {preview.absentCount} eligible. {preview.warning}</Text>
      {preview.items[0] ? <Text style={styles.sample}>{preview.items[0].message}</Text> : null}
      {preview.items.map((i) => <View key={i.studentId} style={styles.item}><View style={{ flex: 1 }}><Text style={styles.name}>{i.name} · {i.rollNumber}</Text><Text style={styles.meta}>{i.maskedPhone ?? 'No valid number'}{i.reason ? ` · ${i.reason}` : ''}</Text></View><StatusPill label={i.previousStatus ?? (i.eligible ? 'READY' : 'SKIPPED')} tone={i.previousStatus ? tone(i.previousStatus) : i.eligible ? 'neutral' : 'danger'}/></View>)}
      <AppButton title="Send to All Absent Students" onPress={() => setConfirm(true)} disabled={preview.eligibleCount === 0 || busy}/>
    </View> : null}
    <AppButton title="Check Delivery Status" variant="secondary" onPress={() => void loadStatus()} loading={busy && !!rows && !confirm}/>
    {rows ? <View style={styles.block}>{rows.length ? rows.map((r) => <View key={r.id} style={styles.item}><View style={{ flex: 1 }}><Text style={styles.name}>{r.name ?? 'Student'} · {r.rollNumber ?? ''}</Text><Text style={styles.meta}>{r.phone}{r.errorDetail ? ` · ${r.errorDetail}` : ''}{r.attempts > 1 ? ` · ${r.attempts} attempts` : ''}</Text></View><StatusPill label={r.status} tone={tone(r.status)}/></View>) : <Text style={styles.sub}>No SMS has been sent for this session yet.</Text>}
      {failedCount > 0 ? <AppButton title={`Retry Failed SMS (${failedCount})`} onPress={() => void retry()} loading={busy}/> : null}</View> : null}
    <ConfirmDialog visible={confirm} title="Confirm & Send" detail={`Send absence SMS to the parents of ${preview?.eligibleCount ?? 0} student(s)? ${preview?.mode === 'mock' ? 'Test mode: nothing will be transmitted.' : 'Real messages will be sent.'} Parents already notified for this class are skipped.`} confirmLabel="Confirm & Send" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void send()}/>
  </Surface>;
}
const styles = StyleSheet.create({ card: { padding: 14, gap: 9, marginTop: 10 }, head: { flexDirection: 'row', gap: 7, alignItems: 'center' }, title: { fontSize: 14, fontWeight: '900', color: palette.ink }, sub: { fontSize: 11, lineHeight: 16, color: palette.muted },
  info: { fontSize: 11, color: palette.good, backgroundColor: palette.goodBg, padding: 8, borderRadius: 8 }, err: { fontSize: 11, color: palette.danger, backgroundColor: palette.dangerBg, padding: 8, borderRadius: 8 },
  block: { gap: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, label: { fontSize: 11, fontWeight: '800', color: palette.ink },
  sample: { fontSize: 11, lineHeight: 16, color: palette.ink, backgroundColor: palette.infoBg, padding: 10, borderRadius: 10 }, item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#eff2f6' },
  name: { fontSize: 12, fontWeight: '800', color: palette.ink }, meta: { fontSize: 10, color: palette.muted } });
