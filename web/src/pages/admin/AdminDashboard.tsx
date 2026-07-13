import { Link } from 'react-router-dom';
import {
    Activity, HardDrive, Paperclip, Receipt, ShieldCheck, TrendingDown, TrendingUp, Users, Wallet,
} from 'lucide-react';
import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { useApi } from '@/hooks/useData';
import { formatBytes, formatDate, formatMoney } from '@/lib/utils';
import { CHROME, POLARITY, seriesColor } from '@/lib/viz';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';

interface Stats {
    users: {
        total: number; active: number; suspended: number;
        new_today: number; new_30d: number; active_7d: number; lock_configured: number;
    };
    activity: {
        transactions: number; income: number; expense: number;
        attachments: number; storageBytes: number; accounts: number;
    };
    topCategories: Array<{ name: string; count: number; total: number }>;
    growth: Array<{ date: string; signups: number; transactions: number }>;
}

const Tile = ({
    label,
    value,
    sub,
    icon: Icon,
}: {
    label: string;
    value: string;
    sub?: string;
    icon: React.ComponentType<{ className?: string }>;
}) => (
    <Card>
        <CardContent className="p-5">
            <div className="flex items-start justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                </span>
            </div>
            <p className="tabular mt-3 text-2xl font-semibold tracking-tight">{value}</p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
    </Card>
);

export default function AdminDashboard() {
    const { mode } = useTheme();
    const c = CHROME[mode];
    const pole = POLARITY[mode];

    const { data, loading } = useApi<Stats>('/admin/stats');

    if (loading || !data) {
        return (
            <div className="mx-auto max-w-7xl space-y-5">
                <Skeleton className="h-9 w-48" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[118px]" />)}
                </div>
            </div>
        );
    }

    const { users, activity, topCategories, growth } = data;
    const chartData = growth.map((g) => ({
        ...g,
        label: new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    }));

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
                <p className="text-sm text-muted-foreground">Everything happening across the platform.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Tile
                    label="Total users"
                    value={String(users.total)}
                    sub={`${users.new_today} new today · ${users.new_30d} this month`}
                    icon={Users}
                />
                <Tile
                    label="Active (7 days)"
                    value={String(users.active_7d)}
                    sub={`${users.suspended} suspended`}
                    icon={Activity}
                />
                <Tile
                    label="App lock enabled"
                    value={String(users.lock_configured)}
                    sub={
                        users.total
                            ? `${Math.round((users.lock_configured / users.total) * 100)}% of users`
                            : '—'
                    }
                    icon={ShieldCheck}
                />
                <Tile
                    label="Transactions"
                    value={activity.transactions.toLocaleString()}
                    sub={`${activity.accounts} accounts`}
                    icon={Receipt}
                />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Income tracked
                            </span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--income))]/10 text-[hsl(var(--income))]">
                                <TrendingUp className="h-4 w-4" />
                            </span>
                        </div>
                        <p className="tabular mt-3 text-2xl font-semibold text-[hsl(var(--income))]">
                            {formatMoney(activity.income, 'BDT', { compact: true })}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Expense tracked
                            </span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--expense))]/10 text-[hsl(var(--expense))]">
                                <TrendingDown className="h-4 w-4" />
                            </span>
                        </div>
                        <p className="tabular mt-3 text-2xl font-semibold text-[hsl(var(--expense))]">
                            {formatMoney(activity.expense, 'BDT', { compact: true })}
                        </p>
                    </CardContent>
                </Card>

                <Tile
                    label="Files stored"
                    value={activity.attachments.toLocaleString()}
                    sub={formatBytes(activity.storageBytes)}
                    icon={Paperclip}
                />
                <Tile
                    label="Storage used"
                    value={formatBytes(activity.storageBytes)}
                    sub="On the server disk"
                    icon={HardDrive}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">Activity · last 30 days</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="adm-tx" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={pole.income} stopOpacity={0.28} />
                                        <stop offset="100%" stopColor={pole.income} stopOpacity={0.02} />
                                    </linearGradient>
                                    <linearGradient id="adm-up" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={seriesColor(1, mode)} stopOpacity={0.28} />
                                        <stop offset="100%" stopColor={seriesColor(1, mode)} stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.tickText }} axisLine={{ stroke: c.axis }} tickLine={false} interval={4} />
                                <YAxis tick={{ fontSize: 11, fill: c.tickText }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                                <Tooltip
                                    cursor={{ stroke: c.axis, strokeWidth: 1, strokeDasharray: '4 4' }}
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        const p = payload[0].payload as (typeof chartData)[number];
                                        return (
                                            <div
                                                className="rounded-xl border px-3 py-2.5 text-xs shadow-lg"
                                                style={{ background: c.tooltipBg, borderColor: c.tooltipBorder, color: c.textPrimary }}
                                            >
                                                <div className="mb-1.5 font-medium">{label}</div>
                                                <div className="flex items-center justify-between gap-6">
                                                    <span style={{ color: c.textMuted }}>Transactions</span>
                                                    <span className="tabular font-semibold">{p.transactions}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-6">
                                                    <span style={{ color: c.textMuted }}>Sign-ups</span>
                                                    <span className="tabular font-semibold">{p.signups}</span>
                                                </div>
                                            </div>
                                        );
                                    }}
                                />
                                <Area
                                    type="monotone" dataKey="transactions" name="Transactions"
                                    stroke={pole.income} strokeWidth={2} fill="url(#adm-tx)"
                                    activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }}
                                />
                                <Area
                                    type="monotone" dataKey="signups" name="Sign-ups"
                                    stroke={seriesColor(1, mode)} strokeWidth={2} fill="url(#adm-up)"
                                    activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                        <div className="mt-2 flex justify-center gap-5 text-xs" style={{ color: c.textMuted }}>
                            <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ background: pole.income }} /> Transactions
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ background: seriesColor(1, mode) }} /> Sign-ups
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Top expense categories</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!topCategories.length ? (
                            <p className="py-16 text-center text-sm text-muted-foreground">No spending recorded yet</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={topCategories} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke={c.grid} strokeDasharray="3 3" horizontal={false} />
                                    <XAxis
                                        type="number"
                                        tick={{ fontSize: 11, fill: c.tickText }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(v) => formatMoney(v, 'BDT', { compact: true }).replace(/\.00$/, '')}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        tick={{ fontSize: 11, fill: c.tickText }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={80}
                                    />
                                    <Tooltip
                                        cursor={{ fill: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const p = payload[0].payload as Stats['topCategories'][number];
                                            return (
                                                <div
                                                    className="rounded-xl border px-3 py-2.5 text-xs shadow-lg"
                                                    style={{ background: c.tooltipBg, borderColor: c.tooltipBorder, color: c.textPrimary }}
                                                >
                                                    <div className="mb-1 font-medium">{p.name}</div>
                                                    <div className="tabular">{formatMoney(p.total, 'BDT')} · {p.count} entries</div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={18}>
                                        {topCategories.map((_, i) => (
                                            <Cell key={i} fill={seriesColor(i, mode)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                {[
                    { to: '/admin/users', label: 'Manage users', icon: Users },
                    { to: '/admin/broadcast', label: 'Send a broadcast', icon: Wallet },
                    { to: '/admin/app', label: 'App & maintenance', icon: ShieldCheck },
                ].map((a) => (
                    <Link
                        key={a.to}
                        to={a.to}
                        className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent"
                    >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <a.icon className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-medium">{a.label}</span>
                    </Link>
                ))}
            </div>

            <p className="pb-4 text-center text-xs text-muted-foreground">
                Data as of {formatDate(new Date(), 'full')}
            </p>
        </div>
    );
}
