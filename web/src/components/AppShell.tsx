import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    Bell, BellRing, CalendarDays, FolderOpen, LayoutDashboard, LogOut, Menu, Moon,
    PiggyBank, Receipt, Settings as SettingsIcon, Sun, FileBarChart, X, WifiOff, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/ws';
import {
    enableNotifications, notify, permission, pushSupported, registerServiceWorker,
} from '@/lib/notifications';
import { cn, initials, relativeTime } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';
import {
    Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
    Popover, PopoverContent, PopoverTrigger, EmptyState,
} from '@/components/ui';

const NAV = [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/transactions', label: 'Transactions', icon: Receipt },
    { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/drive', label: 'Drive', icon: FolderOpen },
    { to: '/reports', label: 'Reports', icon: FileBarChart },
    { to: '/budgets', label: 'Budgets', icon: PiggyBank },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const Logo = () => (
    <Link to="/app" className="flex items-center gap-2.5 px-1">
        <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg" />
        <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">SISIRBINDU</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tracker</div>
        </div>
    </Link>
);

const NotificationBell = () => {
    const [items, setItems] = useState<AppNotification[]>([]);
    const [unread, setUnread] = useState(0);
    // Drives whether the "turn on notifications" prompt is still worth showing.
    const [pushOn, setPushOn] = useState(() => permission() === 'granted');

    const load = async () => {
        try {
            const res = await api.get<{ notifications: AppNotification[]; unreadCount: number }>(
                '/notifications', { limit: 15 }
            );
            setItems(res.data.notifications);
            setUnread(res.data.unreadCount);
        } catch { /* a failed poll is not worth interrupting the user */ }
    };

    useEffect(() => {
        load();
        // The service worker is what turns a WebSocket event into a real OS
        // notification — a toast is invisible the moment the user switches tabs.
        registerServiceWorker().then(() => {
            if (permission() === 'granted') {
                enableNotifications().catch(() => {});
            }
        });

        // Pushed live from the server — no polling loop.
        return api.on('notification', (n: AppNotification) => {
            setItems((prev) => [n, ...prev].slice(0, 15));
            setUnread((u) => u + 1);
            toast(n.title, { description: n.message });
            notify({
                id: n.id,
                title: n.title,
                message: n.message,
                type: n.type,
            });
        });
    }, []);

    const markAll = async () => {
        await api.put('/notifications/read-all');
        setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
        setUnread(0);
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                    <Bell className="h-[18px] w-[18px]" />
                    {unread > 0 && (
                        <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                            {unread > 9 ? '9+' : unread}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <span className="text-sm font-semibold">Notifications</span>
                    {unread > 0 && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAll}>
                            <Check className="mr-1 h-3 w-3" /> Mark all read
                        </Button>
                    )}
                </div>

                {/* Browsers only grant notification permission from a user gesture,
                    so it has to be an explicit button — never an automatic prompt on
                    page load, which most people reflexively dismiss. */}
                {!pushOn && pushSupported() && permission() === 'default' && (
                    <button
                        onClick={async () => {
                            const res = await enableNotifications();
                            if (res.ok) {
                                setPushOn(true);
                                toast.success('Browser notifications enabled');
                            } else {
                                toast.error(res.reason || 'Could not enable notifications');
                            }
                        }}
                        className="flex w-full items-center gap-2.5 border-b bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10"
                    >
                        <BellRing className="h-4 w-4 shrink-0 text-primary" />
                        <span className="text-xs leading-relaxed">
                            <span className="font-medium">Turn on browser notifications</span>
                            <span className="block text-muted-foreground">
                                Budget alerts and reminders, even when this tab is closed.
                            </span>
                        </span>
                    </button>
                )}
                <div className="max-h-96 overflow-y-auto scrollbar-thin">
                    {items.length === 0 ? (
                        <EmptyState icon={Bell} title="All caught up" description="You have no notifications." />
                    ) : (
                        items.map((n) => (
                            <div
                                key={n.id}
                                className={cn(
                                    'border-b px-4 py-3 last:border-0',
                                    !n.isRead && 'bg-accent/40'
                                )}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                                    {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                                </div>
                                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.message}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</p>
                            </div>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};

const ConnectionDot = () => {
    const [online, setOnline] = useState(true);
    useEffect(() => api.onStatus(setOnline), []);

    // Only surface the disconnected state — a green dot on every screen is noise.
    if (online) return null;
    return (
        <Badge variant="destructive" className="gap-1.5">
            <WifiOff className="h-3 w-3" />
            Reconnecting
        </Badge>
    );
};

export const AppShell = ({ children }: { children: ReactNode }) => {
    const { user, logout } = useAuth();
    const { mode, toggle } = useTheme();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => setMobileOpen(false), [pathname]);

    // A user without a lock never reaches this shell — UserRoute renders LockSetup
    // instead, because the server 403s every data route until one exists.

    const nav = (
        <nav className="space-y-1">
            {NAV.map(({ to, label, icon: Icon }) => {
                const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
                return (
                    <Link
                        key={to}
                        to={to}
                        className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            active
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        )}
                    >
                        <Icon className="h-[18px] w-[18px]" />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );

    return (
        <div className="min-h-screen bg-background">
            {/* Desktop rail */}
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card px-3 py-5 lg:flex">
                <div className="mb-6">
                    <Logo />
                </div>
                {nav}
                <div className="mt-auto rounded-xl border bg-muted/40 p-3">
                    <p className="text-xs font-medium">Income-tax ready</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        Export any period as a PDF statement or Excel workbook from Reports.
                    </p>
                </div>
            </aside>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
                    <aside className="absolute inset-y-0 left-0 w-64 border-r bg-card px-3 py-5 animate-fade-in">
                        <div className="mb-6 flex items-center justify-between">
                            <Logo />
                            <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        {nav}
                    </aside>
                </div>
            )}

            <div className="lg:pl-60">
                <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
                    <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
                        <Menu className="h-5 w-5" />
                    </Button>

                    <div className="lg:hidden">
                        <Logo />
                    </div>

                    <div className="ml-auto flex items-center gap-1.5">
                        <ConnectionDot />
                        <NotificationBell />

                        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                            {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                                    {initials(user?.name || '?')}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>
                                    <div className="text-sm font-medium text-foreground">{user?.name}</div>
                                    <div className="truncate text-xs font-normal text-muted-foreground">
                                        {user?.email || user?.phone}
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => navigate('/settings')}>
                                    <SettingsIcon /> Settings
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => { logout(); navigate('/login'); }}
                                >
                                    <LogOut /> Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
            </div>
        </div>
    );
};
