import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../theme';

type Props = { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; loading?: boolean; icon?: ReactNode; accessibilityLabel?: string; compact?: boolean };
export function AppButton({ title, onPress, variant = 'primary', disabled = false, loading = false, icon, accessibilityLabel, compact = false }: Props) {
  const inactive = disabled || loading;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} disabled={inactive} onPress={onPress} style={({ pressed }) => [styles.button, styles[variant], compact && styles.compact, inactive && styles.disabled, pressed && !inactive && styles.pressed]}>
    {loading ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : palette.navy} size="small" /> : <View style={styles.content}>{icon}{<Text style={[styles.label, styles[`${variant}Label`], compact && styles.compactLabel]}>{title}</Text>}</View>}
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: 46, paddingHorizontal: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, primary: { backgroundColor: palette.navy }, secondary: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line }, danger: { backgroundColor: palette.danger }, ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'transparent' }, content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, label: { fontSize: 13, fontWeight: '800' }, primaryLabel: { color: '#fff' }, secondaryLabel: { color: palette.navy }, dangerLabel: { color: '#fff' }, ghostLabel: { color: palette.royal }, compact: { minHeight: 36, paddingHorizontal: 11, borderRadius: 10 }, compactLabel: { fontSize: 11 }, disabled: { opacity: .46 }, pressed: { opacity: .82, transform: [{ scale: .99 }] } });
