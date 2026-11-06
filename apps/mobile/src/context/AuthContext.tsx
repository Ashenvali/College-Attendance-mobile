import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import * as SecureStore from 'expo-secure-store';
import { request, setToken } from '../services/api';

export type UserRole = 'STUDENT' | 'FACULTY' | 'HOD' | 'PRINCIPAL' | 'ADMIN' | 'SUPER_ADMIN';
export type MobileUser = { id: string; loginId: string; email?: string; fullName: string; role: UserRole; departmentId: string | null; isDemo: boolean };
type AuthContextValue = {
  user: MobileUser | null;
  profile: Record<string, unknown> | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
};
const TOKEN_KEY = 'bitsknl.session.jwt';
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const result = await request<{ user: MobileUser; profile: Record<string, unknown> }>('/auth/me');
    setUser(result.user);
    setProfile(result.profile);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!saved) return;
        setToken(saved);
        const result = await request<{ user: MobileUser; profile: Record<string, unknown> }>('/auth/me');
        if (mounted) { setUser(result.user); setProfile(result.profile); }
      } catch {
        setToken(null);
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const result = await request<{ token: string; user: MobileUser }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ identifier: identifier.trim(), password }),
    });
    setToken(result.token);
    await SecureStore.setItemAsync(TOKEN_KEY, result.token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    setUser(result.user);
    setProfile(null);
  }, []);

  const signOut = useCallback(async () => {
    try { if (user) await request('/auth/logout', { method: 'POST' }); } catch { /* local sign-out always succeeds */ }
    setToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
    setUser(null);
    setProfile(null);
  }, [user]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const result = await request<{ token: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    setToken(result.token);
    await SecureStore.setItemAsync(TOKEN_KEY, result.token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  }, []);

  const value = useMemo(() => ({ user, profile, loading, signIn, signOut, refreshProfile, changePassword }), [user, profile, loading, signIn, signOut, refreshProfile, changePassword]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
