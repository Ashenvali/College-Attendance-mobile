import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { palette } from '../theme';

export function AppHeader({ subtitle }: { subtitle?: string }) {
  const { user, signOut } = useAuth(); const router = useRouter();
  async function logout() { await signOut(); router.replace('/login'); }
  return <View style={styles.header}><View style={styles.brand}><Image source={require('../../assets/bits-seal.jpg')} style={styles.logo} accessibilityLabel="Brindavan Institute of Technology & Science official seal"/><View style={styles.brandCopy}><Text style={styles.short}>BITS Kurnool</Text><Text style={styles.full} numberOfLines={1}>Brindavan Institute of Technology &amp; Science</Text><Text style={styles.role}>{subtitle || user?.role?.replace('_', ' ') || 'COLLEGE PORTAL'}</Text></View></View><Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={logout} style={styles.logout}><Ionicons name="log-out-outline" size={18} color="#fff"/></Pressable></View>;
}
const styles=StyleSheet.create({header:{backgroundColor:palette.navy,paddingHorizontal:16,paddingVertical:11,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},brand:{flexDirection:'row',alignItems:'center',gap:10,flex:1},logo:{width:42,height:42,borderRadius:21,backgroundColor:'#fff',borderWidth:1,borderColor:'#cbd9ea'},brandCopy:{flex:1},short:{fontSize:16,color:'#fff',fontWeight:'900',letterSpacing:.2},full:{fontSize:8,color:'#d7e4f2',marginTop:2},role:{fontSize:8,color:'#9bb6d7',fontWeight:'800',letterSpacing:1,marginTop:4},logout:{width:38,height:38,borderWidth:1,borderColor:'#7997bd',borderRadius:12,alignItems:'center',justifyContent:'center'}});
