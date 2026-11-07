import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { LoadingState } from '../../src/components/Feedback';
import { useAuth } from '../../src/context/AuthContext';
import { palette } from '../../src/theme';

export default function AuthenticatedTabs() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace('/login' as never);
  }, [loading, user, router]);
  if (loading || !user) return <LoadingState label="Checking your BITS Kurnool session…"/>;
  const communicationLabel = user.role === 'FACULTY' || user.role === 'HOD' ? 'Parent SMS' : user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? 'Messages' : 'Notices';
  const icon = (name: React.ComponentProps<typeof Ionicons>['name']) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={color}/>;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: palette.navy, tabBarInactiveTintColor: '#8492A5', tabBarStyle: { height: 64, paddingTop: 6, paddingBottom: 8, borderTopColor: palette.line, backgroundColor: '#fff' }, tabBarLabelStyle: { fontSize: 9, fontWeight: '800' } }}>
    <Tabs.Screen name="dashboard" options={{ title: 'Home', tabBarIcon: icon('grid-outline') }}/>
    <Tabs.Screen name="attendance" options={{ title: 'Attendance', tabBarIcon: icon('checkmark-done-outline') }}/>
    <Tabs.Screen name="communication" options={{ title: communicationLabel, tabBarIcon: icon('chatbox-ellipses-outline') }}/>
    <Tabs.Screen name="notifications" options={{ title: 'Alerts', tabBarIcon: icon('notifications-outline') }}/>
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline') }}/>
    <Tabs.Screen name="manage" options={{ href: null }}/>
    {/* Named `data-module`, not `module`: a route called "module" collides with a module tab that is
        opened as `/module/<resource>`, which is the same URL shape Expo Router uses for nested routes. */}
    <Tabs.Screen name="data-module" options={{ href: null }}/>
  </Tabs>;
}
