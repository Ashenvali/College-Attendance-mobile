import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { palette } from '../theme';

type Props = TextInputProps & { label: string; error?: string; hint?: string; containerStyle?: object };
export function FormField({ label, error, hint, containerStyle, multiline, ...inputProps }: Props) {
  return <View style={[styles.wrap, containerStyle]}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={palette.subtle} {...inputProps} multiline={multiline} style={[styles.input, multiline && styles.multiline, inputProps.style]} />{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}</View>;
}
const styles = StyleSheet.create({ wrap: { gap: 6, marginBottom: 13 }, label: { color: palette.ink, fontSize: 12, fontWeight: '800' }, input: { minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, color: palette.ink, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 }, multiline: { minHeight: 110, textAlignVertical: 'top' }, hint: { color: palette.muted, fontSize: 10, lineHeight: 15 }, error: { color: palette.danger, fontSize: 10 } });
