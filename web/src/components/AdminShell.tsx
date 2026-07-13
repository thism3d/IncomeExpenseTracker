import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    Gauge, LogOut, Megaphone, Menu, Moon, Settings2, ShieldCheck, Smartphone, Sun, Users, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';

const NAV = [
    { to: '/admin', label: 'Overview', icon: Gauge, exact: true },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/broadcast', label: 'Broadcast', icon: Megaphone },
    { to: '/admin/app', label: 'App & Maintenance', icon: Smartphone },
    { to: '/admin/settings', label: 'Settings', icon: Settings2 },
];

export const AdminShell = ({ children }: { children: ReactNode }) => {
    const { user, logout } = useAuth();
    const { mode, toggle } = useTheme();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    useEffect(() => setOpen(false), [pathname]);

    const nav = (
        <nav className="space-y-1">
            {NAV.map(({ to, label, icon: Icon, exact }) => {
                const active = exact ? pathname === to : pathname.startsWith(to);
                return (
                    <Link
                        key={to}
                        to={to}
                        className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            active
                                ? 'bg-primary text-primary-foreground'
                                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                        )}
                    >
                        <Icon className="h-[18px] w-[18px]" />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );

    // The admin console is always dark-chrome — it's a distinct surface from the
    // user portal, so an admin never mistakes one for the other.
    const rail = (
        <div className="flex h-full flex-col px-3 py-5">
            <div className="mb-6 flex items-center gap-2.5 px-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                    <ShieldCheck className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="leading-tight">
                    <div className="text-sm font-semibold tracking-tight text-white">Admin Console</div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">SisirBindu</div>
                </div>
            </div>
            {nav}
            <div className="mt-auto space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="truncate text-xs font-medium text-white">{user?.name}</div>
                    <div className="truncate text-[11px] text-zinc-500">{user?.email}</div>
                </div>
                <Button
                    variant="ghost"
                    className="w-full justify-start text-zinc-400 hover:bg-white/5 hover:text-white"
                    onClick={() => { logout(); navigate('/admin/login'); }}
                >
                    <LogOut className="h-[18px] w-[18px]" /> Sign out
                </Button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-background">
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-zinc-950 lg:block">{rail}</aside>

            {open && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
                    <aside className="absolute inset-y-0 left-0 w-64 bg-zinc-950 animate-fade-in">
                        <button
                            className="absolute right-3 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-white/5"
                            onClick={() => setOpen(false)}
                        >
                            <X className="h-4 w-4" />
                        </button>
                        {rail}
                    </aside>
                </div>
            )}

            <div className="lg:pl-64">
                <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
                    <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
                        <Menu className="h-5 w-5" />
                    </Button>
                    <h1 className="text-sm font-semibold text-muted-foreground lg:hidden">Admin Console</h1>
                    <div className="ml-auto">
                        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                            {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                        </Button>
                    </div>
                </header>
                <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
            </div>
        </div>
    );
};
