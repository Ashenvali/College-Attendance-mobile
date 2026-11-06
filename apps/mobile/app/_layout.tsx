import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/context/AuthContext';
import { palette } from '../src/theme';

export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><StatusBar barStyle="light-content" backgroundColor={palette.navy}/><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas }, animation: 'fade' }}/></AuthProvider></SafeAreaProvider>;
}
