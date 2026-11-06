import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from './AppButton';
import { palette } from '../theme';

export function ConfirmDialog({ visible, title, detail, confirmLabel = 'Confirm', cancelLabel = 'Cancel', busy = false, onConfirm, onCancel, children }: { visible: boolean; title: string; detail?: string; confirmLabel?: string; cancelLabel?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void; children?: React.ReactNode }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><Pressable style={styles.backdrop} onPress={onCancel}><Pressable style={styles.dialog} onPress={(event) => event.stopPropagation()}><Text style={styles.eyebrow}>BITS KURNOOL · REVIEW</Text><Text style={styles.title}>{title}</Text>{detail ? <Text style={styles.detail}>{detail}</Text> : null}{children}<View style={styles.actions}><AppButton title={cancelLabel} variant="secondary" onPress={onCancel} disabled={busy}/><AppButton title={confirmLabel} onPress={onConfirm} loading={busy}/></View></Pressable></Pressable></Modal>;
}
const styles=StyleSheet.create({backdrop:{flex:1,backgroundColor:'rgba(12,28,48,.54)',justifyContent:'center',padding:20},dialog:{backgroundColor:'#fff',borderRadius:20,padding:20,borderWidth:1,borderColor:palette.line},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.cyan},title:{fontSize:20,fontWeight:'900',color:palette.ink,marginTop:8},detail:{fontSize:12,color:palette.muted,lineHeight:18,marginTop:9},actions:{flexDirection:'row',gap:9,marginTop:18},});
