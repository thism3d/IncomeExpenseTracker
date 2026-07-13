import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/ws';
import type { User } from '@/lib/types';

interface AuthState {
    user: User | null;
    token: string | null;
    loading: boolean;
    isAuthenticated: boolean;
    isAdmin: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    refresh: () => Promise<void>;
    setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = 'sb_token';
const USER_KEY = 'sb_user';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
    const [user, setUserState] = useState<User | null>(() => {
        const raw = localStorage.getItem(USER_KEY);
        try {
            return raw ? (JSON.parse(raw) as User) : null;
        } catch {
            return null;
        }
    });
    // Start loading only if we have a token to validate — otherwise the login page
    // would flash a spinner for no reason.
    const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));

    const setUser = useCallback((u: User) => {
        setUserState(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
    }, []);

    const login = useCallback((newToken: string, newUser: User) => {
        localStorage.setItem(TOKEN_KEY, newToken);
        localStorage.setItem(USER_KEY, JSON.stringify(newUser));
        setToken(newToken);
        setUserState(newUser);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUserState(null);
    }, []);

    const refresh = useCallback(async () => {
        if (!localStorage.getItem(TOKEN_KEY)) {
            setLoading(false);
            return;
        }
        try {
            const res = await api.get<{ user: User }>('/auth/me');
            setUser(res.data.user);
        } catch (err: any) {
            // A stale or revoked token must not leave a half-logged-in shell behind.
            if (err?.status === 401 || err?.status === 403) logout();
        } finally {
            setLoading(false);
        }
    }, [logout, setUser]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // The admin can suspend an account mid-session; react immediately.
    useEffect(() => {
        return api.on('account:status', (payload: { status: string }) => {
            if (payload.status === 'SUSPENDED') logout();
        });
    }, [logout]);

    const value = useMemo<AuthState>(() => ({
        user,
        token,
        loading,
        isAuthenticated: !!token && !!user,
        isAdmin: !!user?.isAdmin,
        login,
        logout,
        refresh,
        setUser,
    }), [user, token, loading, login, logout, refresh, setUser]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
};
