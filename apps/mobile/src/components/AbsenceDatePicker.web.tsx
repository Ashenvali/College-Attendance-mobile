import { StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme';

/**
 * Browser build of the class-date picker. Uses a native HTML date input so the web
 * bundle does not need @react-native-community/datetimepicker. Native builds keep
 * AbsenceDatePicker.tsx.
 */
export function AbsenceDatePicker({ value, maximum, onChange }: { value: string; maximum?: string; onChange: (next: string) => void }) {
  return <View style={styles.wrap}>
    <Text style={styles.label}>Class date</Text>
    <input
      type="date"
      aria-label="Class date"
      value={value}
      max={maximum}
      onChange={(event) => { if (event.target.value) onChange(event.target.value); }}
      style={{ minHeight: 46, borderRadius: 11, border: `1px solid ${palette.line}`, padding: '0 12px', fontSize: 14, color: palette.ink, background: '#fff', width: '100%' }}
    />
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { color: palette.ink, fontSize: 12, fontWeight: '800', marginBottom: 6 },
});
