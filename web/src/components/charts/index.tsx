// Charts.
//
// Colour follows the dataviz method, not taste:
//   income vs expense  -> DIVERGING (polarity): the validated warm/cool pair.
//   category / method  -> CATEGORICAL (identity): fixed slot order, never cycled.
//   budget usage       -> STATUS (state): good/warning/critical + an icon & label.
//
// Every chart ships a hover layer, a legend when there are two or more series, and
// recessive chrome. Two light-mode categorical slots sit below 3:1 contrast, which
// is why the donut and bars carry direct labels — identity is never colour alone.

import { useMemo } from 'react';
import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CHROME, POLARITY, seriesColor, type Mode } from '@/lib/viz';
import { formatMoney } from '@/lib/utils';
import type { CategorySlice, PaymentMethodStat, TrendPoint } from '@/lib/types';

const axisTick = (mode: Mode) => ({ fontSize: 11, fill: CHROME[mode].tickText });

/**
 * Every chart lives inside one of these.
 *
 * Recharts' ResponsiveContainer measures its parent. Inside a CSS grid or flex
 * cell that parent has `min-width: auto` by default, so it refuses to shrink
 * below its content and the first measurement comes out wrong — the chart renders
 * clipped and only corrects itself when a window resize forces a remeasure. That
 * is exactly the "charts show partially until I resize" bug.
 *
 * `min-w-0` overrides that default and gives the container a definite basis, so it
 * measures correctly on first paint and reflows cleanly on a tablet.
 */
const Frame = ({ children }: { children: React.ReactNode }) => (
    <div className="w-full min-w-0">{children}</div>
);

const TooltipShell = ({
    mode,
    title,
    rows,
}: {
    mode: Mode;
    title: string;
    rows: Array<{ label: string; value: string; color?: string; bold?: boolean }>;
}) => {
    const c = CHROME[mode];
    return (
        <div
            className="rounded-xl border px-3 py-2.5 text-xs shadow-lg backdrop-blur"
            style={{ background: c.tooltipBg, borderColor: c.tooltipBorder, color: c.textPrimary }}
        >
            <div className="mb-1.5 font-medium" style={{ color: c.textPrimary }}>{title}</div>
            <div className="space-y-1">
                {rows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-1.5" style={{ color: c.textMuted }}>
                            {r.color && (
                                <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                            )}
                            {r.label}
                        </span>
                        {/* Values wear text tokens, never the series colour. */}
                        <span className={`tabular ${r.bold ? 'font-semibold' : ''}`} style={{ color: c.textPrimary }}>
                            {r.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

/* -------------------------------------------------- Income vs expense trend */

export const TrendChart = ({
    points,
    mode,
    currency,
    grain = 'month',
    height = 260,
}: {
    points: TrendPoint[];
    mode: Mode;
    currency: string;
    grain?: string;
    height?: number;
}) => {
    const c = CHROME[mode];
    const pole = POLARITY[mode];

    const data = useMemo(
        () => points.map((p) => ({
            ...p,
            label: new Date(p.date).toLocaleDateString('en-GB',
                grain === 'day' ? { day: 'numeric', month: 'short' }
                : grain === 'year' ? { year: 'numeric' }
                : { month: 'short', year: '2-digit' }),
        })),
        [points, grain]
    );

    return (
        <Frame>
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id={`inc-${mode}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={pole.income} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={pole.income} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id={`exp-${mode}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={pole.expense} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={pole.expense} stopOpacity={0.02} />
                    </linearGradient>
                </defs>

                <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={axisTick(mode)} axisLine={{ stroke: c.axis }} tickLine={false} />
                <YAxis
                    tick={axisTick(mode)}
                    axisLine={false}
                    tickLine={false}
                    width={54}
                    tickFormatter={(v) => formatMoney(v, currency, { compact: true }).replace(/\.00$/, '')}
                />
                <Tooltip
                    cursor={{ stroke: c.axis, strokeWidth: 1, strokeDasharray: '4 4' }}
                    content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as TrendPoint;
                        return (
                            <TooltipShell
                                mode={mode}
                                title={String(label)}
                                rows={[
                                    { label: 'Income', value: formatMoney(p.income, currency), color: pole.income },
                                    { label: 'Expense', value: formatMoney(p.expense, currency), color: pole.expense },
                                    { label: 'Net', value: formatMoney(p.net, currency, { sign: p.net > 0 }), bold: true },
                                ]}
                            />
                        );
                    }}
                />
                <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, color: c.textMuted, paddingTop: 8 }}
                />
                <Area
                    type="monotone" dataKey="income" name="Income"
                    stroke={pole.income} strokeWidth={2} fill={`url(#inc-${mode})`}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }}
                />
                <Area
                    type="monotone" dataKey="expense" name="Expense"
                    stroke={pole.expense} strokeWidth={2} fill={`url(#exp-${mode})`}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }}
                />
            </AreaChart>
        </ResponsiveContainer>
        </Frame>
    );
};

/* -------------------------------------------------------- Category donut */

export const CategoryDonut = ({
    slices,
    mode,
    currency,
    height = 260,
}: {
    slices: CategorySlice[];
    mode: Mode;
    currency: string;
    height?: number;
}) => {
    const c = CHROME[mode];

    // Eight categorical slots exist and are never cycled — anything past the 8th
    // folds into a single "Other" slice rather than reusing a hue.
    const data = useMemo(() => {
        const top = slices.slice(0, 7);
        const rest = slices.slice(7);
        if (!rest.length) return top;
        return [
            ...top,
            {
                id: '__other',
                name: `Other (${rest.length})`,
                icon: 'other_expenses',
                color: '',
                total: rest.reduce((s, r) => s + r.total, 0),
                count: rest.reduce((s, r) => s + r.count, 0),
                percent: rest.reduce((s, r) => s + r.percent, 0),
            } as CategorySlice,
        ];
    }, [slices]);

    const total = data.reduce((s, d) => s + d.total, 0);

    if (!total) {
        return (
            <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
                No spending in this period
            </div>
        );
    }

    return (
        // The donut and its legend sit side by side on wide screens and stack on
        // narrow ones. `min-w-0` on both children is what makes that safe: a flex
        // item defaults to min-width:auto, which refuses to shrink below its
        // content — that is why the chart used to render clipped until a resize
        // forced a remeasure.
        <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start">
            <div className="w-full min-w-0 max-w-[260px] shrink-0">
                <ResponsiveContainer width="100%" height={height}>
                    <PieChart>
                    <Pie
                        data={data}
                        dataKey="total"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={92}
                        // A 2px surface gap between wedges, so adjacent fills never touch.
                        paddingAngle={2}
                        stroke={c.surface}
                        strokeWidth={2}
                    >
                        {data.map((d, i) => (
                            <Cell key={d.id ?? i} fill={seriesColor(i, mode)} />
                        ))}
                    </Pie>
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload as CategorySlice;
                            const i = data.findIndex((x) => x.name === d.name);
                            return (
                                <TooltipShell
                                    mode={mode}
                                    title={d.name}
                                    rows={[
                                        { label: 'Spent', value: formatMoney(d.total, currency), color: seriesColor(i, mode), bold: true },
                                        { label: 'Share', value: `${d.percent.toFixed(1)}%` },
                                        { label: 'Entries', value: String(d.count) },
                                    ]}
                                />
                            );
                        }}
                    />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* The legend is the relief channel: the two low-contrast slots are safe
                because the name and value are always spelled out beside the swatch. */}
            <ul className="w-full min-w-0 flex-1 space-y-1.5">
                {data.map((d, i) => (
                    <li key={d.id ?? i} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                            <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: seriesColor(i, mode) }}
                            />
                            <span className="truncate text-muted-foreground">{d.name}</span>
                        </span>
                        <span className="tabular shrink-0 font-medium">
                            {formatMoney(d.total, currency, { compact: true })}
                            <span className="ml-1.5 text-xs text-muted-foreground">{d.percent.toFixed(0)}%</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

/* --------------------------------------------------- Payment method bars */

export const PaymentMethodBars = ({
    methods,
    mode,
    currency,
    height = 260,
}: {
    methods: PaymentMethodStat[];
    mode: Mode;
    currency: string;
    height?: number;
}) => {
    const c = CHROME[mode];
    const pole = POLARITY[mode];

    if (!methods.length) {
        return (
            <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
                No activity in this period
            </div>
        );
    }

    return (
        <Frame>
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={methods} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={c.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis
                    type="number"
                    tick={axisTick(mode)}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatMoney(v, currency, { compact: true }).replace(/\.00$/, '')}
                />
                <YAxis
                    type="category"
                    dataKey="name"
                    tick={axisTick(mode)}
                    axisLine={false}
                    tickLine={false}
                    width={78}
                />
                <Tooltip
                    cursor={{ fill: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                    content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const m = payload[0].payload as PaymentMethodStat;
                        return (
                            <TooltipShell
                                mode={mode}
                                title={m.name}
                                rows={[
                                    { label: 'Income', value: formatMoney(m.income, currency), color: pole.income },
                                    { label: 'Expense', value: formatMoney(m.expense, currency), color: pole.expense },
                                    { label: 'Entries', value: String(m.count) },
                                ]}
                            />
                        );
                    }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: c.textMuted, paddingTop: 6 }} />
                {/* Data-ends rounded, anchored to the baseline. */}
                <Bar dataKey="income" name="Income" fill={pole.income} radius={[0, 4, 4, 0]} maxBarSize={14} />
                <Bar dataKey="expense" name="Expense" fill={pole.expense} radius={[0, 4, 4, 0]} maxBarSize={14} />
            </BarChart>
        </ResponsiveContainer>
        </Frame>
    );
};

/* ------------------------------------------------------- Expense-only bars */

export const CategoryBars = ({
    slices,
    mode,
    currency,
    height = 260,
}: {
    slices: CategorySlice[];
    mode: Mode;
    currency: string;
    height?: number;
}) => {
    const c = CHROME[mode];
    const data = slices.slice(0, 8);

    if (!data.length) {
        return (
            <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
                Nothing to chart yet
            </div>
        );
    }

    return (
        <Frame>
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                    dataKey="name"
                    tick={axisTick(mode)}
                    axisLine={{ stroke: c.axis }}
                    tickLine={false}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={62}
                />
                <YAxis
                    tick={axisTick(mode)}
                    axisLine={false}
                    tickLine={false}
                    width={54}
                    tickFormatter={(v) => formatMoney(v, currency, { compact: true }).replace(/\.00$/, '')}
                />
                <Tooltip
                    cursor={{ fill: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                    content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as CategorySlice;
                        const i = data.findIndex((x) => x.name === d.name);
                        return (
                            <TooltipShell
                                mode={mode}
                                title={d.name}
                                rows={[
                                    { label: 'Total', value: formatMoney(d.total, currency), color: seriesColor(i, mode), bold: true },
                                    { label: 'Entries', value: String(d.count) },
                                ]}
                            />
                        );
                    }}
                />
                {/* One series, so no legend box — the card title names it. */}
                <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={44}>
                    {data.map((d, i) => (
                        <Cell key={d.id ?? i} fill={seriesColor(i, mode)} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
        </Frame>
    );
};
