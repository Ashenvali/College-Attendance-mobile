import { useCallback, useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '../src/components/AppButton';
import { FormField } from '../src/components/FormField';
import { ErrorState } from '../src/components/Feedback';
import { useAuth } from '../src/context/AuthContext';
import { request } from '../src/services/api';
import { palette } from '../src/theme';


const SUPPORT_EMAIL = 'support@bitskurnool.edu.in';

export default function LoginScreen() {
  const { signIn } = useAuth(); const router = useRouter();
  const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  // Password recovery is handled by the college administrator; the link opens a pre-filled mail
  // draft so a locked-out student is not left with a dead "contact the administrator" sentence.
  const requestHelp = useCallback(() => {
    const subject = encodeURIComponent('BITS Kurnool portal — password reset request');
    const body = encodeURIComponent(`User ID / roll number: ${identifier.trim() || '(not entered)'}\n\nPlease reset my portal password.`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`)
      .catch(() => setError(`Password reset is handled by the college administrator. Email ${SUPPORT_EMAIL} with your roll number.`));
  }, [identifier]);
  async function submit() {
    if (!identifier.trim() || !password) { setError('Enter your User ID / Roll Number and password.'); return; }
    setBusy(true); setError('');
    try { await signIn(identifier, password); router.replace('/(app)/dashboard' as never); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.brand}><Image source={require('../assets/bits-seal.jpg')} style={styles.seal} accessibilityLabel="Official BITS Kurnool seal"/><Text style={styles.fullName}>Brindavan Institute of Technology &amp; Science</Text><Text style={styles.brandShort}>BITS Kurnool</Text><Text style={styles.subtitle}>College Management &amp; Student Communication</Text></View>
    <View style={styles.form}><Text style={styles.formTitle}>Sign in to your portal</Text><Text style={styles.formSub}>Use your college account credentials.</Text>
      <FormField label="User ID / Roll Number" autoCapitalize="none" autoCorrect={false} value={identifier} onChangeText={setIdentifier} placeholder="Enter your user ID" returnKeyType="next"/>
      <View><FormField label="Password" value={password} onChangeText={setPassword} placeholder="Enter your password" secureTextEntry={!showPassword} onSubmitEditing={submit} returnKeyType="go"/><Text style={styles.visibility} onPress={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide password' : 'Show password'}</Text></View>
      {error ? <ErrorState message={error}/> : null}
      <AppButton title="Sign in" onPress={submit} loading={busy} icon={<Ionicons name="log-in-outline" size={17} color="#fff"/>}/>
      <Text style={styles.forgot}>Forgot password? <Text style={styles.forgotLink} onPress={requestHelp} accessibilityRole="link">Request a reset from the college administrator</Text>.</Text>
    </View>
    <Text style={styles.location}>NH-7, Peddatekur, Kurnool – 518218, Andhra Pradesh, India</Text>
  </ScrollView></KeyboardAvoidingView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:palette.navy},page:{alignItems:'center',paddingHorizontal:20,paddingTop:34,paddingBottom:28},brand:{alignItems:'center',marginBottom:24},seal:{width:88,height:88,borderRadius:44,backgroundColor:'#fff',borderWidth:2,borderColor:'#bfd2e8',marginBottom:12},fullName:{color:'#d8e5f3',fontSize:11,fontWeight:'800',textAlign:'center'},brandShort:{color:'#fff',fontSize:30,fontWeight:'900',letterSpacing:.4,marginTop:5},subtitle:{color:'#bed0e6',fontSize:12,marginTop:5,textAlign:'center'},form:{width:'100%',maxWidth:480,borderRadius:20,backgroundColor:'#fff',padding:19,borderWidth:1,borderColor:'#dfe8f2'},formTitle:{fontSize:20,fontWeight:'900',color:palette.ink},formSub:{fontSize:11,color:palette.muted,marginTop:5,marginBottom:18},visibility:{alignSelf:'flex-end',color:palette.royal,fontSize:10,fontWeight:'800',marginTop:-7,marginBottom:13,padding:5},forgot:{color:palette.muted,fontSize:10,lineHeight:15,textAlign:'center',marginTop:13},forgotLink:{color:palette.royal,fontWeight:'800'},demoBlock:{marginTop:19,paddingTop:14,borderTopWidth:1,borderTopColor:'#edf0f4'},demoLabel:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:palette.royal},demoHelp:{fontSize:9,color:palette.muted,lineHeight:14,marginTop:5,marginBottom:6},demoRow:{paddingVertical:7,borderTopWidth:1,borderTopColor:'#f0f2f5'},demoRole:{color:palette.ink,fontWeight:'900',fontSize:11},demoId:{color:palette.muted,fontSize:10},location:{fontSize:9,color:'#a8bbd3',textAlign:'center',marginTop:18}});
