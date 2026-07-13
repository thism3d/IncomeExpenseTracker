import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Mode } from '@/lib/viz';

type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeState {
    preference: ThemePreference;
    // The mode actually rendering right now — 'system' resolved against the OS.
    // Charts need this concrete value to pick their validated palette.
    mode: Mode;
    setPreference: (p: ThemePreference) => void;
    toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);
const KEY = 'sb_theme';

const systemMode = (): Mode =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const [preference, setPreferenceState] = useState<ThemePreference>(
        () => (localStorage.getItem(KEY) as ThemePreference) || 'system'
    );
    const [mode, setMode] = useState<Mode>(() =>
        (localStorage.getItem(KEY) as ThemePreference) === 'light' ? 'light'
        : (localStorage.getItem(KEY) as ThemePreference) === 'dark' ? 'dark'
        : systemMode()
    );

    useEffect(() => {
        const resolved: Mode = preference === 'system' ? systemMode() : preference;
        setMode(resolved);
        document.documentElement.classList.toggle('dark', resolved === 'dark');
        document.documentElement.style.colorScheme = resolved;

        if (preference !== 'system') return;

        // Follow the OS while the preference is 'system'.
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => {
            const next = systemMode();
            setMode(next);
            document.documentElement.classList.toggle('dark', next === 'dark');
            document.documentElement.style.colorScheme = next;
        };
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, [preference]);

    const setPreference = (p: ThemePreference) => {
        localStorage.setItem(KEY, p);
        setPreferenceState(p);
    };

    const value = useMemo<ThemeState>(() => ({
        preference,
        mode,
        setPreference,
        toggle: () => setPreference(mode === 'dark' ? 'light' : 'dark'),
    }), [preference, mode]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
    return ctx;
};
