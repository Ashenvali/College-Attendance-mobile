import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { ChoiceField } from '../components/ChoiceField';
import { MetricCard, SectionHeading, StatusPill, Surface } from '../components/Display';
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback';
import { FormField } from '../components/FormField';
import { useAuth } from '../context/AuthContext';
import { request } from '../services/api';
import { palette } from '../theme';

type Stats = { total: number; successful: number; testMode: number; failed: number; pending: number; today: number };
type Row = { id: string; status: string; phone: string; message: string | null; errorDetail: string | null; sentAt: string | null; createdAt: string; studentName: string | null; rollNumber: string | null; department: string | null };
type Data = { stats: Stats; rows: Row[]; hasMore: boolean; page: number };
const STATUSES = ['ALL', 'PENDING', 'SENT', 'DELIVERED', 'MOCKED', 'FAILED'] as const;
const tone = (s: string): 'good' | 'warning' | 'danger' | 'neutral' => s === 'SENT' || s === 'DELIVERED' ? 'good' : s === 'FAILED' ? 'danger' : s === 'MOCKED' || s === 'SENDING' ? 'warning' : 'neutral';

export function SmsDashboardScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null); const [page, setPage] = useState(1);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('ALL'); const [date, setDate] = useState(''); const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const dateValid = date === '' || /^\d{4}-\d{2}-\d{2}$/.test(date);

  useEffect(() => { if (user?.role === 'HOD') return; request<{ id: string; name: string }[]>('/modules/departments').then((d) => setDepartments([{ label: 'All departments', value: '' }, ...d.map((x) => ({ label: x.name, value: x.id }))])).catch(() => undefined); }, [user?.role]);
  const load = useCallback(async () => {
    if (!dateValid) return;
    setError('');
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (status !== 'ALL') qs.set('status', status); if (date) qs.set('date', date); if (departmentId) qs.set('departmentId', departmentId);
      setData(await request<Data>(`/sms/dashboard?${qs.toString()}`));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load SMS dashboard'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [page, status, date, departmentId, dateValid]);
  useEffect(() => { setLoading(true); void load(); }, [load]);
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={palette.navy}/>}>
    <SectionHeading title="SMS dashboard" subtitle="Parent numbers are always masked"/>
    {error ? <ErrorState message={error} onRetry={() => void load()}/> : null}
    {data ? <View style={styles.grid}>
      <MetricCard label="Total SMS" value={data.stats.total}/><MetricCard label="Successful" value={data.stats.successful} tone="good"/>
      <MetricCard label="Failed" value={data.stats.failed} tone="danger"/><MetricCard label="Pending" value={data.stats.pending} tone="warning"/>
      <MetricCard label="Today" value={data.stats.today}/><MetricCard label="Test mode" value={data.stats.testMode} tone="warning"/>
    </View> : null}
    {user?.role !== 'HOD' && departments.length ? <ChoiceField label="Department" value={departmentId} options={departments} onChange={(v) => reset(() => setDepartmentId(v))}/> : null}
    <FormField label="Date (YYYY-MM-DD, optional)" value={date} onChangeText={(v) => reset(() => setDate(v.trim()))} placeholder="e.g. 2026-11-06" keyboardType="numbers-and-punctuation" error={dateValid ? undefined : 'Use YYYY-MM-DD'}/>
    <View style={styles.chips}>{STATUSES.map((s) => <AppButton key={s} title={s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase()} compact variant={status === s ? 'primary' : 'secondary'} onPress={() => reset(() => setStatus(s))}/>)}</View>
    {loading && !data ? <LoadingState label="Loading SMS records…"/> : data?.rows.length ? data.rows.map((r) => <Surface key={r.id} style={styles.card}>
      <View style={styles.row}><Text style={styles.name}>{r.studentName ?? 'Staff / other'}{r.rollNumber ? ` · ${r.rollNumber}` : ''}</Text><StatusPill label={r.status} tone={tone(r.status)}/></View>
      <Text style={styles.meta}>{r.department ?? '—'} · {r.phone}</Text>
      {r.message ? <Text style={styles.msg} numberOfLines={4}>{r.message}</Text> : null}
      {r.errorDetail ? <Text style={styles.err}>{r.errorDetail}</Text> : null}
      <Text style={styles.meta}>{r.sentAt ? `Delivered to provider: ${new Date(r.sentAt).toLocaleString('en-IN')}` : `Created: ${new Date(r.createdAt).toLocaleString('en-IN')}`}</Text>
    </Surface>) : !error ? <EmptyState title="No SMS records" detail="Nothing matches these filters."/> : null}
    {data ? <View style={styles.row}><AppButton title="Previous" compact variant="secondary" disabled={page <= 1} onPress={() => setPage((p) => p - 1)}/><Text style={styles.meta}>Page {page}</Text><AppButton title="Next" compact variant="secondary" disabled={!data.hasMore} onPress={() => setPage((p) => p + 1)}/></View> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { padding: 14, gap: 10, paddingBottom: 30 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  card: { padding: 12, gap: 5 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, name: { flex: 1, fontSize: 12, fontWeight: '900', color: palette.ink },
  meta: { fontSize: 10, color: palette.muted }, msg: { fontSize: 11, lineHeight: 16, color: palette.ink }, err: { fontSize: 10, color: palette.danger } });
