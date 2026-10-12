import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { SessionUser } from '../types';

interface AuthContextValue { user: SessionUser | null; loading: boolean; login: (identifier: string, password: string) => Promise<SessionUser>; logout: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    const expire = () => { sessionStorage.removeItem('bits-token'); setUser(null); };
    window.addEventListener('bits-session-expired', expire);
    if (sessionStorage.getItem('bits-token')) api<{ user: SessionUser }>('/auth/me').then((r) => setUser(r.user)).catch(expire).finally(() => setLoading(false)); else setLoading(false);
    return () => window.removeEventListener('bits-session-expired', expire);
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user, loading,
    async login(identifier, password) { const result = await api<{ token: string; user: SessionUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }); sessionStorage.setItem('bits-token', result.token); setUser(result.user); return result.user; },
    async logout() { try { await api('/auth/logout', { method: 'POST' }); } finally { sessionStorage.removeItem('bits-token'); setUser(null); } },
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error('useAuth must be used inside AuthProvider'); return ctx; }
