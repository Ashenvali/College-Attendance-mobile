import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from './AppButton';
import { Surface } from './Display';
import { FormField } from './FormField';
import { useAuth } from '../context/AuthContext';
import { palette } from '../theme';

export function ChangePasswordCard() {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [ok, setOk] = useState('');
  const mismatch = confirm.length > 0 && next !== confirm;
  async function submit() {
    setError(''); setOk(''); setBusy(true);
    try { await changePassword(current, next); setOk('Password changed. Other devices were signed out.'); setCurrent(''); setNext(''); setConfirm(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not change password'); }
    finally { setBusy(false); }
  }
  return <Surface style={styles.card}>
    <Text style={styles.title}>Change password</Text>
    <FormField label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none"/>
    <FormField label="New password (min 10 characters)" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none"/>
    <FormField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" error={mismatch ? 'Passwords do not match' : undefined}/>
    {error ? <Text style={styles.err}>{error}</Text> : null}{ok ? <Text style={styles.ok}>{ok}</Text> : null}
    <AppButton title="Update password" onPress={() => void submit()} loading={busy} disabled={!current || next.length < 10 || next !== confirm}/>
  </Surface>;
}
const styles = StyleSheet.create({ card: { padding: 14, gap: 4 }, title: { fontSize: 14, fontWeight: '900', color: palette.ink, marginBottom: 8 }, err: { color: palette.danger, fontSize: 11, marginBottom: 6 }, ok: { color: palette.good, fontSize: 11, marginBottom: 6 } });
