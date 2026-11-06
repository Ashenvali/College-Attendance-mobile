import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '../components/AppButton';
import { ChoiceField } from '../components/ChoiceField';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SectionHeading, StatusPill, Surface } from '../components/Display';
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback';
import { FormField } from '../components/FormField';
import { useAuth } from '../context/AuthContext';
import { request } from '../services/api';
import { palette } from '../theme';

type Scope = { scopeType: 'SECTION' | 'DEPARTMENT'; departmentId: string; sectionId: string | null; label: string };
type Preview = { scope: string; mode: 'mock' | 'gateway'; counts: { studentsInScope: number; eligibleStudents: number; uniqueRecipients: number; missingParentPhone: number; invalidParentPhone: number; excludedDemo: number; excludedNoConsent: number }; canSend: boolean; warning: string };
type Campaign = { id: string; name: string; message: string; audience: string; status: string; createdAt: string; studentsCovered: number; sent: number; mocked: number; failed: number };

export function ParentSmsScreen() {
  const { user } = useAuth();
  const [scopes, setScopes] = useState<Scope[]>([]); const [selected, setSelected] = useState(''); const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState(''); const [message, setMessage] = useState(''); const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const [scopeData, history] = await Promise.all([request<{ scopes: Scope[]; mode: 'mock' | 'gateway' }>('/sms/parents/scopes'), request<Campaign[]>('/sms/parents/campaigns')]);
      setScopes(scopeData.scopes); setSelected((value) => value || scopeData.scopes[0]?.sectionId || 'department'); setCampaigns(history);
    } catch (e) { setError(e instanceof Error ? e.message : 'Parent SMS is not available for this account'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const current = scopes.find((scope) => scope.sectionId === selected) || scopes.find((scope) => scope.scopeType === 'DEPARTMENT' && selected === 'department');
  const fields = current ? { scopeType: current.scopeType, ...(current.sectionId ? { sectionId: current.sectionId } : {}) } : null;
  async function previewAudience() {
    if (!fields) { setError('Select a scope assigned to your account.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try { setPreview(await request<Preview>('/sms/parents/preview', { method: 'POST', body: JSON.stringify(fields) })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not preview parent audience'); }
    finally { setBusy(false); }
  }
  async function confirmSend() {
    if (!preview?.canSend || !fields) return;
    setBusy(true); setError('');
    try {
      const created = await request<{ id: string }>('/sms/parents/campaigns', { method: 'POST', body: JSON.stringify({ name: name.trim(), message: message.trim(), ...fields }) });
      const result = await request<{ campaign: { status: string }; studentsCovered: number; recipients: number; mode: 'mock' | 'gateway'; sent: number; mocked: number; failed: number; warning?: string }>(`/sms/parents/campaigns/${created.id}/send`, { method: 'POST', body: '{}' });
      setSuccess(result.warning || `Campaign processed · ${result.recipients} recipient(s) · ${result.sent} sent · ${result.mocked} mock · ${result.failed} failed.`);
      setConfirm(false); setName(''); setMessage(''); setPreview(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not process parent SMS campaign'); }
    finally { setBusy(false); }
  }
  if (loading && !scopes.length) return <LoadingState label="Loading your assigned parent-message scopes…"/>;
  return <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={palette.navy}/> }>
    <Surface style={styles.callout}><Ionicons name="shield-checkmark-outline" size={19} color={palette.teal}/><View style={{ flex: 1 }}><Text style={styles.calloutTitle}>Parent contact privacy</Text><Text style={styles.copy}>Guardian numbers stay on the server. Live delivery excludes demo accounts and requires recorded guardian consent.</Text></View></Surface>
    {error ? <ErrorState message={error} onRetry={() => void load()}/> : null}{success ? <Surface style={styles.success}><Text style={styles.successText}>{success}</Text></Surface> : null}
    {!scopes.length ? <EmptyState title="No authorized audience" detail="Faculty need assigned sections. HODs need a department assignment."/> : <>
      <SectionHeading title="Compose parent message" subtitle={user?.role === 'HOD' ? 'Choose your department or one of its sections.' : 'Choose an assigned class section.'}/>
      <ChoiceField label="Audience scope" value={selected} options={scopes.map((scope) => ({ label: scope.label, value: scope.sectionId || 'department' }))} onChange={(value) => { setSelected(value); setPreview(null); }}/>
      <FormField label="Campaign name" value={name} onChangeText={setName} placeholder="Example: DBMS attendance update" maxLength={160}/>
      <FormField label="Message to parents" value={message} onChangeText={setMessage} placeholder="Write a concise, respectful message…" multiline maxLength={1000} hint={`${message.length}/1000 characters`}/>
      <AppButton title="Preview eligible audience" variant="secondary" onPress={() => void previewAudience()} loading={busy} icon={<Ionicons name="people-outline" size={16} color={palette.navy}/>}/>
      {preview ? <Surface style={styles.preview}><View style={styles.row}><Text style={styles.previewTitle}>Server audience preview</Text><StatusPill label={preview.mode === 'mock' ? 'MOCK · NO TRANSMISSION' : 'LIVE GATEWAY'} tone={preview.mode === 'mock' ? 'warning' : 'good'}/></View><Text style={styles.copy}>{preview.scope}</Text><View style={styles.countGrid}>{[['Students in scope', preview.counts.studentsInScope], ['Eligible students', preview.counts.eligibleStudents], ['Unique phone numbers', preview.counts.uniqueRecipients], ['Missing number', preview.counts.missingParentPhone], ['Invalid number', preview.counts.invalidParentPhone], ['Excluded demo', preview.counts.excludedDemo], ['No recorded consent', preview.counts.excludedNoConsent]].map(([label, value]) => <View key={String(label)} style={styles.countCell}><Text style={styles.countValue}>{value}</Text><Text style={styles.countLabel}>{label}</Text></View>)}</View><Text style={styles.warning}>{preview.warning}</Text><AppButton title="Review and send" onPress={() => setConfirm(true)} disabled={!preview.canSend || name.trim().length < 3 || message.trim().length < 1} icon={<Ionicons name="send-outline" size={15} color="#fff"/>}/></Surface> : null}
    </>}
    <SectionHeading title="Parent message history" subtitle="Only campaigns in your authorized scope are listed"/>
    {campaigns.length ? campaigns.map((campaign) => <Surface key={campaign.id} style={styles.history}><View style={styles.row}><Text style={styles.historyName}>{campaign.name}</Text><StatusPill label={campaign.status} tone={campaign.status === 'SENT' ? 'good' : campaign.status === 'FAILED' ? 'danger' : campaign.status === 'MOCKED' ? 'warning' : 'neutral'}/></View><Text style={styles.copy}>{campaign.message}</Text><Text style={styles.historyMeta}>{campaign.audience.replace('PARENT_', '')} · {new Date(campaign.createdAt).toLocaleString('en-IN')}</Text><Text style={styles.historyMeta}>{campaign.studentsCovered} covered · {campaign.sent} sent · {campaign.mocked} mock · {campaign.failed} failed</Text></Surface>) : <EmptyState title="No parent campaigns yet" detail="A campaign appears here after you send or simulate a message."/>}
    <Text style={styles.footer}>Signed in as {user?.role} · {user?.isDemo ? 'Fictional demo identity' : 'BITS Kurnool account'}</Text>
    <ConfirmDialog visible={confirm} title="Confirm parent SMS" detail={`${preview?.scope || ''}\nEligible students: ${preview?.counts.eligibleStudents || 0}\nUnique numbers: ${preview?.counts.uniqueRecipients || 0}\n\n${preview?.warning || ''}`} confirmLabel="Confirm & Send" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void confirmSend()}><Text style={styles.confirmMessage}>{message}</Text></ConfirmDialog>
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { padding: 15, paddingBottom: 32, gap: 10 }, callout: { flexDirection: 'row', gap: 11, backgroundColor: '#f1faf7', borderColor: '#cde7da' }, calloutTitle: { color: palette.ink, fontWeight: '900', fontSize: 12 }, copy: { color: palette.muted, fontSize: 10, lineHeight: 16, marginTop: 4 }, preview: { gap: 10, marginTop: 5 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, previewTitle: { color: palette.ink, fontSize: 13, fontWeight: '900' }, countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, countCell: { width: '31%', padding: 8, borderRadius: 10, backgroundColor: '#f4f7fa' }, countValue: { color: palette.ink, fontSize: 16, fontWeight: '900' }, countLabel: { color: palette.muted, fontSize: 8, marginTop: 3 }, warning: { color: palette.warning, backgroundColor: palette.warningBg, borderRadius: 9, padding: 9, fontSize: 9, lineHeight: 14 }, history: { gap: 6 }, historyName: { color: palette.ink, fontWeight: '900', fontSize: 12, flex: 1 }, historyMeta: { color: palette.subtle, fontSize: 9 }, success: { backgroundColor: palette.goodBg, borderColor: '#cde7da' }, successText: { color: palette.good, fontSize: 10, fontWeight: '800' }, footer: { color: palette.subtle, fontSize: 9, textAlign: 'center', marginTop: 15 }, confirmMessage: { color: palette.ink, fontSize: 12, lineHeight: 18, marginTop: 12, borderLeftWidth: 3, borderLeftColor: palette.cyan, paddingLeft: 10 } });
