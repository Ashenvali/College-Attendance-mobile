import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '../../src/components/AppButton';
import { AppHeader } from '../../src/components/AppHeader';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/Feedback';
import { MetricCard, SectionHeading, StatusPill, Surface } from '../../src/components/Display';
import { useAuth } from '../../src/context/AuthContext';
import { request } from '../../src/services/api';
import type { DashboardData } from '../../src/types/api';
import { palette } from '../../src/theme';

const roleTitle: Record<string,string>={STUDENT:'Student dashboard',FACULTY:'Faculty dashboard',HOD:'Department overview',PRINCIPAL:'Institution overview',ADMIN:'Administration',SUPER_ADMIN:'System administration'};
export default function DashboardScreen() {
  const { user } = useAuth(); const router = useRouter();
  const [data,setData]=useState<DashboardData|null>(null); const [loading,setLoading]=useState(true); const [refreshing,setRefreshing]=useState(false); const [error,setError]=useState('');
  const load=useCallback(async()=>{setError('');try{const result=await request<DashboardData>('/dashboard');setData(result)}catch(e){setError(e instanceof Error?e.message:'Could not load dashboard')}finally{setLoading(false);setRefreshing(false)}},[]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  const quick=[{title:'Attendance',icon:'checkmark-done-outline',route:'/(app)/attendance'},{title:user?.role==='FACULTY'||user?.role==='HOD'?'Parent SMS':user?.role==='ADMIN'||user?.role==='SUPER_ADMIN'?'Messages':'Notices',icon:'chatbox-ellipses-outline',route:'/(app)/communication'},{title:'Alerts',icon:'notifications-outline',route:'/(app)/notifications'},{title:'Profile',icon:'person-circle-outline',route:'/(app)/profile'}];
  const modules = user?.role==='STUDENT' ? [['Timetable','timetable'],['Subjects','subjects'],['Examinations','exams'],['Results','results'],['Fees','fees'],['Assignments','assignments'],['Events','events']] : user?.role==='FACULTY' ? [['Timetable','timetable'],['Assignments','assignments'],['Examinations','exams'],['Results','results']] : user?.role==='HOD' ? [['Students','students'],['Faculty','faculty'],['Timetable','timetable'],['Examinations','exams'],['Results','results'],['Events','events']] : [['Students','students'],['Faculty','faculty'],['Examinations','exams'],['Results','results'],['Fees','fees'],['Audit logs','audit-logs'],['Events','events']];
  if(loading&&!data)return <><AppHeader/><LoadingState label="Loading your role-specific dashboard…"/></>;
  return <View style={styles.root}><AppHeader subtitle={roleTitle[user?.role||'']||'COLLEGE PORTAL'}/><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}} tintColor={palette.navy}/> }>
    {error?<ErrorState message={error} onRetry={()=>void load()}/>:null}
    {data?<>
      <Surface style={styles.hero}><Text style={styles.eyebrow}>{user?.isDemo?'FICTIONAL DEVELOPMENT ACCOUNT':'BITS KURNOOL SECURE PORTAL'}</Text><Text style={styles.hello}>Hello, {(data.greeting||user?.fullName||'').split(' ')[0]}</Text><Text style={styles.role}>{roleTitle[data.role]||data.role}</Text>
        {data.profile&&<Text style={styles.profile}>{[data.profile.rollNumber, data.profile.department, data.profile.year?`Year ${data.profile.year}`:null, data.profile.section?`Section ${data.profile.section}`:null].filter(Boolean).join('  ·  ')}</Text>}
        {user?.isDemo?<StatusPill label="DEMO ACCOUNT · FICTIONAL DATA" tone="warning"/>:null}
      </Surface>
      <SectionHeading title="Your overview" subtitle="Live figures from the college database"/>
      <View style={styles.metrics}>{data.stats.map((stat,index)=><MetricCard key={`${stat.label}-${index}`} label={stat.label} value={stat.value} tone={stat.tone||'neutral'} icon={<Ionicons name={stat.label.toLowerCase().includes('attendance')?'stats-chart-outline':'ellipse-outline'} size={17} color={stat.tone==='good'?palette.good:stat.tone==='warning'?palette.warning:palette.cyan}/>}/>)}</View>
      <SectionHeading title="Quick access" subtitle="Open a module for your role"/>
      <View style={styles.quickGrid}>{quick.map(item=><AppButton key={item.title} title={item.title} variant="secondary" onPress={()=>router.push(item.route as never)} icon={<Ionicons name={item.icon as never} size={17} color={palette.navy}/>}/>)}</View>
      <SectionHeading title={user?.role==='STUDENT'?'Learning & campus modules':'Role modules'} subtitle="Read-only records from the authenticated college API"/>
      <View style={styles.quickGrid}>{modules.map(([label,resource])=><AppButton key={resource} title={label} compact variant="secondary" onPress={()=>router.push(`/(app)/module?resource=${resource}` as never)}/>)}</View>
      {(user?.role==='ADMIN'||user?.role==='SUPER_ADMIN'||user?.role==='HOD')&&<Surface style={styles.manage}><View style={{flex:1}}><Text style={styles.manageTitle}>Records &amp; registration</Text><Text style={styles.manageSub}>Create student or faculty accounts using the college API.</Text></View><AppButton title="Manage" compact onPress={()=>router.push('/(app)/manage' as never)} icon={<Ionicons name="people-outline" size={15} color="#fff"/>}/></Surface>}
      {data.todayClasses?.length? <><SectionHeading title="Class timetable" subtitle="Sections and sessions returned by the college system"/>{data.todayClasses.map((item,index)=><Surface key={`${item.code}-${index}`} style={styles.listCard}><View style={styles.listIcon}><Ionicons name="book-outline" size={16} color={palette.royal}/></View><View style={{flex:1}}><Text style={styles.listTitle}>{item.code} · {item.subject}</Text><Text style={styles.listSub}>{[item.startTime,item.room].filter(Boolean).join(' · ')||'Scheduled class'}</Text></View></Surface>)}</>:null}
      {data.upcomingExams?.length?<><SectionHeading title="Upcoming examinations"/><Surface style={styles.examCard}>{data.upcomingExams.map((exam,index)=><View key={`${exam.name}-${index}`} style={styles.examRow}><View style={{flex:1}}><Text style={styles.listTitle}>{exam.name}</Text><Text style={styles.listSub}>{exam.subject||'Department examination'}</Text></View><StatusPill label={String(exam.date).slice(0,10)} tone="neutral"/></View>)}</Surface></>:null}
      {data.notices?.length?<><SectionHeading title="Recent notices"/><Surface>{data.notices.map((notice,index)=><View key={`${notice.title}-${index}`} style={[styles.noticeRow,index>0&&styles.divider]}><Ionicons name="megaphone-outline" size={16} color={palette.cyan}/><View style={{flex:1}}><Text style={styles.listTitle}>{notice.title}</Text><Text style={styles.listSub}>{notice.priority} priority{notice.publishedAt?` · ${new Date(notice.publishedAt).toLocaleDateString('en-IN')}`:''}</Text></View></View>)}</Surface></>:null}
    </>:!error?<EmptyState title="Dashboard unavailable" detail="No dashboard records were returned for this account."/>:null}
    <Text style={styles.footer}>Brindavan Institute of Technology &amp; Science · BITS Kurnool</Text>
  </ScrollView></View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:palette.canvas},content:{padding:16,paddingBottom:35},hero:{padding:18,marginTop:3,marginBottom:2},eyebrow:{fontSize:9,letterSpacing:1,fontWeight:'900',color:palette.cyan},hello:{fontSize:26,fontWeight:'900',color:palette.ink,marginTop:7},role:{color:palette.muted,fontSize:12,fontWeight:'700',marginTop:3},profile:{color:palette.royal,fontSize:10,fontWeight:'800',marginTop:13,lineHeight:17},metrics:{flexDirection:'row',flexWrap:'wrap',gap:9},quickGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},manage:{marginTop:15,flexDirection:'row',alignItems:'center',gap:12,padding:14},manageTitle:{fontSize:12,fontWeight:'900',color:palette.ink},manageSub:{fontSize:10,color:palette.muted,marginTop:4,lineHeight:15},listCard:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:8,padding:12},listIcon:{width:31,height:31,borderRadius:10,backgroundColor:palette.infoBg,alignItems:'center',justifyContent:'center'},listTitle:{fontSize:11,color:palette.ink,fontWeight:'900'},listSub:{fontSize:9,color:palette.muted,marginTop:4},examCard:{paddingVertical:6},examRow:{paddingVertical:10,flexDirection:'row',alignItems:'center',gap:8},noticeRow:{flexDirection:'row',gap:10,alignItems:'center',paddingVertical:11},divider:{borderTopColor:palette.line,borderTopWidth:1},footer:{fontSize:9,color:palette.subtle,textAlign:'center',marginTop:27}});
