import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { request, setToken } from '../services/api';
import { sessionStore, usesSecureKeychain } from '../services/storage';

export type UserRole = 'STUDENT' | 'FACULTY' | 'HOD' | 'PRINCIPAL' | 'ADMIN' | 'SUPER_ADMIN';
export type MobileUser = { id: string; loginId: string; email?: string; fullName: string; role: UserRole; departmentId: string | null; isDemo: boolean };
type AuthContextValue = {
  user: MobileUser | null;
  profile: Record<string, unknown> | null;
  loading: boolean;
  secureStorage: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  revokeSessions: () => Promise<void>;
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
        const saved = await sessionStore.getItem(TOKEN_KEY);
        if (!saved) return;
        setToken(saved);
        const result = await request<{ user: MobileUser; profile: Record<string, unknown> }>('/auth/me');
        if (mounted) { setUser(result.user); setProfile(result.profile); }
      } catch {
        setToken(null);
        try { await sessionStore.removeItem(TOKEN_KEY); } catch { /* nothing persisted to remove */ }
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
    // The browser build can refuse storage (blocked cookies/third-party storage in an embedded
    // preview). The token is already in memory, so sign-in must still succeed; it just will not
    // survive a page reload.
    try { await sessionStore.setItem(TOKEN_KEY, result.token); } catch { /* in-memory session only */ }
    setUser(result.user);
    setProfile(null);
  }, []);

  const signOut = useCallback(async () => {
    // The API revokes the token server-side; local sign-out always succeeds.
    try { if (user) await request('/auth/logout', { method: 'POST' }); } catch { /* local sign-out always succeeds */ }
    setToken(null);
    try { await sessionStore.removeItem(TOKEN_KEY); } catch { /* nothing persisted to remove */ }
    setUser(null);
    setProfile(null);
  }, [user]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const result = await request<{ token: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    setToken(result.token);
    try { await sessionStore.setItem(TOKEN_KEY, result.token); } catch { /* in-memory session only */ }
  }, []);

  const revokeSessions = useCallback(async () => {
    await request('/auth/revoke-sessions', { method: 'POST' });
    setToken(null);
    try { await sessionStore.removeItem(TOKEN_KEY); } catch { /* nothing persisted to remove */ }
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo(() => ({ user, profile, loading, secureStorage: usesSecureKeychain, signIn, signOut, refreshProfile, changePassword, revokeSessions }), [user, profile, loading, signIn, signOut, refreshProfile, changePassword, revokeSessions]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
