import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../../src/components/AppButton';
import { AppHeader } from '../../src/components/AppHeader';
import { AdminSmsScreen } from '../../src/screens/AdminSmsScreen';
import { NoticesScreen } from '../../src/screens/NoticesScreen';
import { SmsDashboardScreen } from '../../src/screens/SmsDashboardScreen';
import { ParentSmsScreen } from '../../src/screens/ParentSmsScreen';
import { useAuth } from '../../src/context/AuthContext';
import { palette } from '../../src/theme';

export default function CommunicationScreen(){const{user}=useAuth();const isStaff=user?.role==='FACULTY'||user?.role==='HOD';const isAdmin=user?.role==='ADMIN'||user?.role==='SUPER_ADMIN'||user?.role==='PRINCIPAL';const[view,setView]=useState<'primary'|'notices'|'dashboard'>('primary');const canDash=user?.role==='HOD'||isAdmin;const primaryLabel=isStaff?'Parent SMS':'SMS campaigns';
return <View style={styles.root}><AppHeader subtitle="COLLEGE COMMUNICATION"/>{user?.role!=='STUDENT'&&<View style={styles.switch}><AppButton title={primaryLabel} compact variant={view==='primary'?'primary':'secondary'} onPress={()=>setView('primary')}/><AppButton title="Notices" compact variant={view==='notices'?'primary':'secondary'} onPress={()=>setView('notices')}/>{canDash&&<AppButton title="SMS Dashboard" compact variant={view==='dashboard'?'primary':'secondary'} onPress={()=>setView('dashboard')}/>}</View>}<ScrollView style={{flex:1}} contentContainerStyle={styles.content}>{view==='dashboard'&&canDash?<SmsDashboardScreen/>:view==='notices'?<NoticesScreen/>:isStaff?<ParentSmsScreen/>:isAdmin?<AdminSmsScreen/>:<NoticesScreen/>}</ScrollView><Text style={styles.footer}>Brindavan Institute of Technology &amp; Science · BITS Kurnool</Text></View>}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:palette.canvas},switch:{flexDirection:'row',gap:7,paddingHorizontal:14,paddingTop:11},content:{flexGrow:1},footer:{color:palette.subtle,fontSize:8,textAlign:'center',paddingVertical:8}});
