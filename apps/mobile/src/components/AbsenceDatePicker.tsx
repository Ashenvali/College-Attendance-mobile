import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../theme';

/**
 * Native build of the class-date picker (Android/iOS). The web build uses
 * AbsenceDatePicker.web.tsx, which renders an HTML date input instead.
 */
export function AbsenceDatePicker({ value, maximum, onChange }: { value: string; maximum?: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  function handle(event: DateTimePickerEvent, selected?: Date) {
    setOpen(false);
    if (event.type === 'set' && selected) {
      onChange(`${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`);
    }
  }
  return <View style={styles.wrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Class date ${value}`} style={styles.button} onPress={() => setOpen(true)}>
      <Ionicons name="calendar-outline" size={18} color={palette.navy}/>
      <Text style={styles.text}>Class date · {value}</Text>
      <Ionicons name="chevron-down" size={15} color={palette.muted}/>
    </Pressable>
    {open && <DateTimePicker value={new Date(`${value}T12:00:00`)} mode="date" display="default" onChange={handle} maximumDate={maximum ? new Date(`${maximum}T12:00:00`) : new Date()}/>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  button: { minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: palette.line, backgroundColor: '#fff', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  text: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: '700' },
});
